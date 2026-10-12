// Version arithmetic for the update check: GitHub release tags ("v1.23.0") against app.json's version ("1.22.8").

/** "v1.23.0" / "1.23" / "Halo 1.23.0" → [1, 23, 0]; null when there is no number. */
export function parseVersion(s: string): number[] | null {
  const m = /(\d+(?:\.\d+)*)/.exec(s);
  return m ? m[1].split(".").map(Number) : null;
}

/** Positive when `a` is newer than `b`, negative when older, 0 when the same (missing parts count as 0). */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a) ?? [];
  const pb = parseVersion(b) ?? [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Release notes as plain text for the dialog: markdown headings, emphasis, links and list marks dropped. */
export function plainNotes(md: string): string {
  return md
    .replace(/\r/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
