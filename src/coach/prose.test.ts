// Ported from Pulse's Prose.test.tsx, on the parsed blocks the screen renders.
import { describe, expect, it } from "vitest";
import { parseProse, type Span } from "./prose";

const plain = (spans: Span[]) => spans.map((s) => s.text).join("");

describe("parseProse", () => {
  it("splits a lead-in line from the list that follows it, and keeps bold", () => {
    const blocks = parseProse("Here is the plan:\n- **Today:** easy\n- Rest\n\n1. One\n2. Two\n\nDone.");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "ul", "ol", "p"]);
    expect(blocks.filter((b) => b.kind === "p").map((b) => plain((b as { spans: Span[] }).spans))).toEqual(["Here is the plan:", "Done."]);
    const ul = blocks[1] as { items: Span[][] };
    expect(ul.items.map(plain)).toEqual(["Today: easy", "Rest"]);
    expect(ul.items[0][0]).toEqual({ text: "Today:", bold: true });
    expect((blocks[2] as { items: Span[][] }).items.map(plain)).toEqual(["One", "Two"]);
  });

  it("leaves an unclosed ** (mid-stream) as text", () => {
    expect(parseProse("Take it **eas")).toEqual([{ kind: "p", spans: [{ text: "Take it **eas", bold: false }] }]);
  });

  it("joins a paragraph's wrapped lines and drops blank input", () => {
    expect(parseProse("One line\nand the next")).toEqual([{ kind: "p", spans: [{ text: "One line and the next", bold: false }] }]);
    expect(parseProse("   ")).toEqual([]);
  });
});
