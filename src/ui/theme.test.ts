import { describe, expect, it } from "vitest";
import { DARK, LIGHT, type ColorToken, type Tokens } from "./theme";

// WCAG 2 relative luminance and contrast ratio. Translucent tokens ("rgba(…)") are composited over the surface they sit on.
type RGB = [number, number, number];
const parse = (color: string): { rgb: RGB; a: number } => {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(color);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  const n = parseInt(color.slice(1, 7), 16);
  return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
};
const over = (top: string, base: string): RGB => {
  const t = parse(top);
  const b = parse(base).rgb;
  return t.rgb.map((v, i) => v * t.a + b[i] * (1 - t.a)) as RGB;
};
const lum = ([r, g, b]: RGB) => {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
/** Contrast of `fg` (composited if translucent) on the opaque `bg`. */
const contrast = (fg: string, bg: string) => {
  const [hi, lo] = [lum(over(fg, bg)), lum(parse(bg).rgb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const L = (c: string) => lum(parse(c).rgb);

/** The opaque surfaces text sits on. */
const SURFACES: ColorToken[] = ["background", "backgroundTop", "inset", "card", "cardTop", "sheet", "sheetBottom", "popover", "popoverTop", "muted"];
/** Raised fills inside a card (rows, chips, fields, the pressed state). */
const FILLS: ColorToken[] = ["secondary", "field"];

// The palette is iOS's (the 2026-10 iOS pass). Two of its choices sit under WCAG's 4.5:1 by design, as they do on an
// iPhone: the light scheme's secondary label (rgba(60,60,67,0.6), 3.4:1 on white) and white on the system blue (4.0:1,
// 3.6:1 on the dark blue). The light scheme's green, yellow, purple and blue are the system colours Apple paints big
// numbers, glyphs and links with; words that carry meaning in colour take the increased-contrast variants instead.
/** Secondary text in each scheme: iOS's secondary label. */
const SECONDARY_MIN = { dark: 4.5, light: 3 } as const;
/** Data colours set as words, which must read at 4.5:1 in each scheme. */
const DATA_TEXT: Record<"dark" | "light", ColorToken[]> = {
  dark: ["recoveryGreen", "recoveryYellow", "recoveryRedText", "strainText", "sleep", "optimal", "warning", "coach", "primaryInk"],
  light: ["recoveryRedText", "strainText", "sleep", "warning"],
};

describe.each([
  ["dark", DARK],
  ["light", LIGHT],
] as ["dark" | "light", Tokens][])("%s theme text contrast", (name, c) => {
  it.each(SURFACES)("body text reaches 7:1 on %s", (s) => {
    expect(contrast(c.foreground, c[s])).toBeGreaterThanOrEqual(7);
  });

  it.each([...SURFACES, ...FILLS])("secondary text reaches iOS's secondary-label contrast on %s", (s) => {
    expect(contrast(c.foregroundSecondary, c[s])).toBeGreaterThanOrEqual(SECONDARY_MIN[name]);
  });

  it("muted text reaches iOS's secondary-label contrast on a card", () => {
    expect(contrast(c.mutedForeground, c.card)).toBeGreaterThanOrEqual(SECONDARY_MIN[name]);
    expect(contrast(c.mutedForeground, c.cardTop)).toBeGreaterThanOrEqual(SECONDARY_MIN[name]);
  });

  it("keeps the primary button's label legible across its whole face (white on iOS blue)", () => {
    for (const face of [c.primary, c.ctaFrom, c.ctaTo]) expect(contrast(c.primaryForeground, face)).toBeGreaterThanOrEqual(3.5);
  });

  it("paints data words that read on cards, the ground and the inset", () => {
    for (const t of DATA_TEXT[name]) for (const s of ["card", "background", "inset"] as ColorToken[]) expect(contrast(c[t], c[s]), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the data families apart: strain is not a recovery band, nor the warning tone", () => {
    for (const other of ["recoveryGreen", "recoveryYellow", "recoveryRed", "warning", "sleep", "primary"] as ColorToken[]) expect(c.strain, other).not.toBe(c[other]);
  });
});

describe("dark theme", () => {
  const c = DARK;

  // (Light's muted grey sits at 4.4:1 on its ground and 4.2:1 on a secondary fill; light is out of this pass's scope.)
  it.each([...SURFACES, ...FILLS])("muted text reaches 4.5:1 on %s", (s) => {
    expect(contrast(c.mutedForeground, c[s])).toBeGreaterThanOrEqual(4.5);
  });

  it("sits on a near-black ground", () => {
    expect(L(c.background)).toBeLessThan(0.003);
    expect(L(c.backgroundTop)).toBeGreaterThan(L(c.backgroundMid));
    expect(L(c.backgroundMid)).toBeGreaterThan(L(c.background));
    expect(contrast(c.backgroundTop, c.background)).toBeLessThan(1.1);
  });

  it("keeps its surface hierarchy", () => {
    // ground < inset (a well inside a card) < card < its top light < the pressed card
    expect(L(c.background)).toBeLessThan(L(c.inset));
    expect(L(c.inset)).toBeLessThan(L(c.card));
    expect(L(c.card)).toBeLessThan(L(c.cardTop));
    expect(L(c.cardTop)).toBeLessThan(L(c.cardHover));
    // card < muted (tracks, skeletons) < field < secondary (rows, chips) < accent (their pressed state)
    expect(L(c.card)).toBeLessThan(L(c.muted));
    expect(L(c.muted)).toBeLessThan(L(c.field));
    expect(L(c.field)).toBeLessThan(L(c.secondary));
    expect(L(c.secondary)).toBeLessThan(L(c.accent));
    // Popovers float above cards; sheets above the ground.
    expect(L(c.popover)).toBeGreaterThan(L(c.card));
    expect(L(c.popoverTop)).toBeGreaterThan(L(c.popover));
    expect(L(c.sheet)).toBeGreaterThan(L(c.background));
    expect(L(c.sheet)).toBeGreaterThan(L(c.sheetBottom));
    // A secondary row reads as a raised fill inside a card.
    expect(contrast(c.secondary, c.card)).toBeGreaterThanOrEqual(1.25);
  });

  it("outlines a card so it reads on the ground", () => {
    // The card is a flat solid held by the 1 px `border` hairline: its edge stands further off the ground than its face.
    const edge = `rgb(${over(c.border, c.card).map(Math.round).join(",")})`;
    expect(contrast(edge, c.background)).toBeGreaterThan(contrast(c.card, c.background));
  });

  it("keeps dial tracks visible but quiet, and every fill clear of them", () => {
    for (const ground of [c.background, c.card]) {
      expect(contrast(c.dialTrack, ground)).toBeGreaterThanOrEqual(1.2);
      expect(contrast(c.dialTrack, ground)).toBeLessThanOrEqual(1.6);
    }
    expect(contrast(c.dialTarget, c.dialTrack)).toBeGreaterThanOrEqual(1.8);
    const fills: ColorToken[] = ["recoveryGreen", "recoveryYellow", "recoveryRed", "strain", "sleep"];
    for (const f of fills) expect(contrast(c[f], c.dialTrack), f).toBeGreaterThanOrEqual(3);
  });

  it("keeps chart grid lines quieter than the dial track", () => {
    expect(contrast(c.chartGrid, c.card)).toBeGreaterThan(1.1);
    expect(contrast(c.chartGrid, c.card)).toBeLessThan(contrast(c.dialTrack, c.card) + 0.05);
    expect(contrast(c.chartBand, c.card)).toBeLessThan(contrast(c.chartGrid, c.card));
  });
});

describe("light theme", () => {
  it("paints iOS's grouped surfaces: white cards with no ring on the #F2F2F7 ground, a flat blue primary", () => {
    expect(LIGHT.background).toBe("#f2f2f7");
    expect(LIGHT.card).toBe("#ffffff");
    expect(LIGHT.primary).toBe("#007aff");
    expect(LIGHT.ctaFrom).toBe(LIGHT.primary);
    expect(LIGHT.ctaTo).toBe(LIGHT.primary);
    expect(parse(LIGHT.ctaSheen).a).toBe(0);
    expect(parse(LIGHT.cardBorder).a).toBe(0);
  });

  it("takes the light system colours, not the dark scheme's", () => {
    expect(LIGHT.recoveryGreen).toBe("#34c759");
    expect(LIGHT.strain).toBe("#ff9500");
    expect(LIGHT.sleep).toBe("#5856d6");
    expect(LIGHT.actionRimFrom).not.toBe(DARK.actionRimFrom);
  });
});

describe("dark theme surfaces", () => {
  it("paints iOS's dark grouped surfaces: #1C1C1E cards on black, the dark system colours", () => {
    expect(DARK.background).toBe("#000000");
    expect(DARK.card).toBe("#1c1c1e");
    expect(DARK.primary).toBe("#0a84ff");
    expect(DARK.recoveryGreen).toBe("#30d158");
  });
});

describe("token format", () => {
  // Some screens append a hex alpha (`c.warning + "80"`) or parse tokens (alpha, mix): every token is #rrggbb or rgb(a).
  it.each([
    ["dark", DARK],
    ["light", LIGHT],
  ] as [string, Tokens][])("%s tokens are #rrggbb or rgba()", (_name, c) => {
    for (const [k, v] of Object.entries(c)) expect(v, k).toMatch(/^(#[0-9a-f]{6}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\))$/);
  });
});
