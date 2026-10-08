// Ported from Pulse's src/server/coach/history.test.ts: older turns are summarised once, the full archive is kept, a
// verified checkpoint is reused, and an edit or a shorter (regenerated) chat invalidates it.
import type { UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { expect, it } from "vitest";
import { coachHistory, fingerprint } from "./history";
import { defaultTexts } from "./texts";

const messages = (n: number): UIMessage[] =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}`, role: i % 2 ? "assistant" : "user", parts: [{ type: "text", text: i === 0 ? "I have 30 minutes and prefer cycling." : `Earlier turn ${i}` }] }));
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 10, text: 10, reasoning: undefined } };

it("summarizes older turns, retains the full archive and reuses a verified checkpoint", async () => {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      calls++;
      expect(JSON.stringify(prompt)).toContain("prefer cycling");
      return { content: [{ type: "text", text: "The user prefers cycling and has 30 minutes." }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
    },
  });
  const first = await coachHistory(messages(41), model, defaultTexts);
  expect(first.saved).toHaveLength(41);
  expect(first.saved[0].parts).toEqual(messages(1)[0].parts);
  expect(first.modelMessages).toHaveLength(21);
  expect(JSON.stringify(first.modelMessages[0])).toContain("not current measurements");
  expect(JSON.stringify(first.modelMessages[0])).toContain("prefers cycling");
  await coachHistory([...first.saved, ...messages(2).map((m) => ({ ...m, id: `new-${m.id}` }))], model, defaultTexts);
  expect(calls).toBe(1);
  const edited = first.saved.map((m, i) => (i === 8 ? { ...m, parts: [{ type: "text" as const, text: "A changed preference" }] } : m));
  await coachHistory(edited, model, defaultTexts);
  expect(calls).toBe(2);
});

it("summary failures still allow a bounded fresh reply", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error("provider unavailable");
    },
  });
  const result = await coachHistory(messages(41), model, defaultTexts);
  expect(result.saved).toHaveLength(41);
  expect(result.modelMessages).toHaveLength(30);
  expect(JSON.stringify(result.modelMessages)).not.toContain("Historical conversation summary");
});

it("a regenerated shorter chat cannot reuse a checkpoint past its end", async () => {
  const model = new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: "text", text: "Earlier discussion" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }) });
  const first = await coachHistory(messages(41), model, defaultTexts);
  const result = await coachHistory(first.saved.slice(0, 5), model, defaultTexts);
  expect(result.modelMessages).toHaveLength(5);
  expect((result.saved[0].metadata as { coachSummary?: unknown }).coachSummary).toBeUndefined();
});

it("the fingerprint is stable for the same messages and changes with any id, role or part", () => {
  const a = messages(6);
  expect(fingerprint(a)).toBe(fingerprint(messages(6)));
  expect(fingerprint(a)).not.toBe(fingerprint(messages(5)));
  expect(fingerprint(a)).not.toBe(fingerprint(a.map((m, i) => (i === 3 ? { ...m, id: "other" } : m))));
  expect(fingerprint(a)).not.toBe(fingerprint(a.map((m, i) => (i === 2 ? { ...m, parts: [{ type: "text" as const, text: "Earlier turn 2." }] } : m))));
  // Metadata (where the checkpoint itself lives) is not part of it.
  expect(fingerprint(a)).toBe(fingerprint(a.map((m) => ({ ...m, metadata: { x: 1 } }))));
});
