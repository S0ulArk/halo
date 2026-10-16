// The Cloudflare calls the connector setup makes, against a recorded fake: paths, methods, bodies and errors.
import { describe, expect, it } from "vitest";
import { CloudflareError, cloudflareProblem, ensureNamespace, ensureSubdomain, KV_TITLE, removeWorker, SCRIPT_NAME, TOKEN_URL, uploadWorker, workerUploadBody } from "./cloudflare";

type Call = { method: string; path: string; headers: Record<string, string>; body?: string };
type Reply = { status?: number; result?: unknown; errors?: { code: number; message: string }[] };

function fake(replies: Reply[]) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ method: init.method ?? "GET", path: url.replace("https://api.cloudflare.com/client/v4", ""), headers: init.headers as Record<string, string>, body: init.body as string | undefined });
    const r = replies.shift() ?? {};
    const status = r.status ?? 200;
    return new Response(JSON.stringify({ success: status < 400, errors: r.errors ?? [], result: r.result ?? null }), { status });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

describe("cloudflare", () => {
  it("pre-fills the token form with Workers Scripts and KV, Edit", () => {
    const u = new URL(TOKEN_URL);
    expect(JSON.parse(u.searchParams.get("permissionGroupKeys")!)).toEqual(expect.arrayContaining([{ key: "workers_scripts", type: "edit" }, { key: "workers_kv_storage", type: "edit" }]));
    expect(u.searchParams.get("name")).toBe("Halo connector");
  });

  it("keeps an existing subdomain, or claims one when there is none", async () => {
    const has = fake([{ result: { subdomain: "mine" } }]);
    expect(await ensureSubdomain("t", "acc", has.fetch)).toBe("mine");
    const none = fake([{ status: 404, errors: [{ code: 10007, message: "no subdomain" }] }, { result: { subdomain: "halo-abc" } }]);
    expect(await ensureSubdomain("t", "acc", none.fetch)).toBe("halo-abc");
    expect(none.calls[1]).toMatchObject({ method: "PUT", path: "/accounts/acc/workers/subdomain" });
    expect(JSON.parse(none.calls[1].body!).subdomain).toMatch(/^halo-[a-z0-9]{8}$/);
    const refused = fake([{ status: 403, errors: [{ code: 10000, message: "Authentication error" }] }]);
    await expect(ensureSubdomain("t", "acc", refused.fetch)).rejects.toBeInstanceOf(CloudflareError);
  });

  it("reuses the namespace by title, or makes it", async () => {
    const found = fake([{ result: [{ id: "ns1", title: KV_TITLE }] }]);
    expect(await ensureNamespace("t", "acc", found.fetch)).toBe("ns1");
    const made = fake([{ result: [] }, { result: { id: "ns2" } }]);
    expect(await ensureNamespace("t", "acc", made.fetch)).toBe("ns2");
    expect(made.calls[1]).toMatchObject({ method: "POST", path: "/accounts/acc/storage/kv/namespaces", body: JSON.stringify({ title: KV_TITLE }) });
  });

  it("uploads the module with its bindings as multipart", async () => {
    const f = fake([{ result: {} }]);
    await uploadWorker("tok", "acc", "ns1", { ingestKey: "ik", mcpSecret: "ms" }, f.fetch);
    const c = f.calls[0];
    expect(c).toMatchObject({ method: "PUT", path: `/accounts/acc/workers/scripts/${SCRIPT_NAME}` });
    expect(c.headers.Authorization).toBe("Bearer tok");
    const boundary = c.headers["Content-Type"].match(/boundary=(.+)$/)![1];
    expect(c.body!.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(c.body!.endsWith(`--${boundary}--\r\n`)).toBe(true);
    expect(c.body).toContain("Content-Type: application/javascript+module");
    const meta = JSON.parse(c.body!.split("\r\n")[4]);
    expect(meta).toMatchObject({ main_module: "worker.js" });
    expect(meta.bindings).toEqual([
      { type: "kv_namespace", name: "DATA", namespace_id: "ns1" },
      { type: "secret_text", name: "INGEST_KEY", text: "ik" },
      { type: "secret_text", name: "MCP_SECRET", text: "ms" },
    ]);
    // A real multipart parser reads the same parts back.
    // (Node's FormData; React Native's types lack get.)
    const form = (await new Response(workerUploadBody({ a: 1 }, "export default {}", "B"), { headers: { "content-type": "multipart/form-data; boundary=B" } }).formData()) as unknown as { get: (n: string) => Blob };
    expect(await (form.get("metadata") as Blob).text()).toBe('{"a":1}');
    expect(await (form.get("worker.js") as Blob).text()).toBe("export default {}");
  });

  it("removes the Worker and namespace, ignoring ones already gone", async () => {
    const f = fake([{ status: 404, errors: [{ code: 10007, message: "not found" }] }, { result: null }]);
    await removeWorker("t", "acc", "ns1", f.fetch);
    expect(f.calls.map((c) => `${c.method} ${c.path}`)).toEqual([`DELETE /accounts/acc/workers/scripts/${SCRIPT_NAME}?force=true`, "DELETE /accounts/acc/storage/kv/namespaces/ns1"]);
  });

  it("explains a refused token", () => {
    expect(cloudflareProblem(new CloudflareError("Authentication error", 403, [10000]))).toMatch(/^Cloudflare didn’t accept this token/);
  });
});
