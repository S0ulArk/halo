// The Worker text Halo uploads must be the reviewed worker.js: regenerate with `node scripts/build-mcp-worker.mjs`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORKER_SOURCE } from "./workerSource";

describe("workerSource", () => {
  it("matches src/mcp/worker/worker.js", () => {
    expect(WORKER_SOURCE).toBe(readFileSync(new URL("./worker/worker.js", import.meta.url), "utf8"));
  });
});
