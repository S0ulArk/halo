// The coach's answer text as blocks, ported from Pulse's Prose.tsx: paragraphs, "- " or "1. " lists and **bold**,
// nothing else (the instructions ask for that). A list may follow its lead-in line inside one block ("Here is the
// plan:\n- …"). Plain data, so the screen renders it with Text and tests read it without React Native.

export type Span = { text: string; bold: boolean };
export type Block = { kind: "p"; spans: Span[] } | { kind: "ul" | "ol"; items: Span[][] };

const BULLET = /^\s*[-*•] /;
const NUMBERED = /^\s*\d+[.)] /;

/** `**bold**` spans; an unclosed `**` (mid-stream) stays as text. */
export function inline(s: string): Span[] {
  return s
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part !== "")
    .map((part) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false }));
}

export function parseProse(text: string): Block[] {
  const out: Block[] = [];
  for (const block of text.trim().split(/\n{2,}/)) {
    // Runs of consecutive lines of one kind: a paragraph, a bullet list or a numbered list.
    let run: { kind: "p" | "ul" | "ol"; lines: string[] } | null = null;
    const flush = () => {
      if (!run) return;
      if (run.kind === "p") out.push({ kind: "p", spans: inline(run.lines.join(" ")) });
      else {
        const marker = run.kind === "ul" ? BULLET : NUMBERED;
        out.push({ kind: run.kind, items: run.lines.map((l) => inline(l.replace(marker, ""))) });
      }
      run = null;
    };
    for (const l of block.split("\n").filter((x) => x.trim())) {
      const kind = BULLET.test(l) ? "ul" : NUMBERED.test(l) ? "ol" : "p";
      if (run && (run as { kind: string }).kind !== kind) flush();
      run ??= { kind, lines: [] };
      run.lines.push(l.trim());
    }
    flush();
  }
  return out;
}
