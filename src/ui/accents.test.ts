import { describe, expect, it } from "vitest";
import { ACCENT_TOKEN, accentColor, accentFamily, accentToken, METRIC_FAMILY, type AccentFamily } from "./accents";
import { DARK, LIGHT } from "./theme";

describe("accentFamily", () => {
  it("maps metric keys to their family", () => {
    expect(accentFamily("hrv")).toBe("heart");
    expect(accentFamily("restingHr")).toBe("heart");
    expect(accentFamily("spo2")).toBe("heart");
    expect(accentFamily("sleep")).toBe("sleep");
    expect(accentFamily("consistency")).toBe("sleep");
    expect(accentFamily("zones45")).toBe("strain");
    expect(accentFamily("steps")).toBe("activity");
    expect(accentFamily("azm")).toBe("activity");
    expect(accentFamily("weight")).toBe("body");
    expect(accentFamily("protein")).toBe("body");
    expect(accentFamily("recovery")).toBe("recovery");
    expect(accentFamily("stress")).toBe("stress");
  });

  it("finds the family from the label a screen shows, ignoring case", () => {
    expect(accentFamily("Heart rate variability")).toBe("heart");
    expect(accentFamily("RHR")).toBe("heart");
    expect(accentFamily("Skin temp (from baseline)")).toBe("heart");
    expect(accentFamily("HOURS VS. NEEDED")).toBe("sleep");
    expect(accentFamily("Strain Target")).toBe("strain");
    expect(accentFamily("Heart rate zones 1-3")).toBe("strain");
    expect(accentFamily("Active Zone Minutes")).toBe("activity");
    expect(accentFamily("Daily steps")).toBe("activity");
    expect(accentFamily("Lean body mass")).toBe("body");
    expect(accentFamily("  Blood oxygen ")).toBe("heart");
  });

  it("leaves generic and unknown labels uncoloured", () => {
    for (const label of ["Total", "Highest", "Lowest", "Daily average", "Days with data", "Current streak", "REM", "Deep", "", "Something new"]) {
      expect(accentFamily(label)).toBeNull();
    }
    expect(accentFamily(null)).toBeNull();
    expect(accentFamily(undefined)).toBeNull();
  });
});

describe("accentToken", () => {
  it("gives each family its token", () => {
    const families: AccentFamily[] = ["sleep", "recovery", "strain", "heart", "activity", "body", "stress"];
    for (const f of families) expect(accentToken(f)).toBe(ACCENT_TOKEN[f]);
    expect(new Set(Object.values(METRIC_FAMILY)).size).toBe(families.length);
  });

  it("follows the recovery band and stress level when given a score", () => {
    expect(accentToken("recovery", 85)).toBe("recoveryGreen");
    expect(accentToken("recovery", 49)).toBe("recoveryYellow");
    expect(accentToken("recovery", 12)).toBe("recoveryRed");
    expect(accentToken("stress", 0.6)).toBe("stressLow");
    expect(accentToken("stress", 1.4)).toBe("stressMedium");
    expect(accentToken("stress", 2.5)).toBe("stressHigh");
    // Not a score of theirs (or none): the family colour.
    expect(accentToken("recovery", null)).toBe("recoveryGreen");
    expect(accentToken("stress", 12)).toBe("stressMedium");
    // Other families never change with the value.
    expect(accentToken("heart", 12)).toBe("heart");
  });

  it("resolves to a colour in both themes", () => {
    expect(accentColor(DARK, "heart")).toBe("#ff6b7f");
    expect(accentColor(LIGHT, "heart")).toBe("#e0566a");
    expect(accentColor(DARK, "activity")).toBe(DARK.primary);
    expect(accentColor(LIGHT, "body")).toBe("#0d9488");
  });
});

// WCAG relative luminance and contrast ratio, for "#rrggbb".
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("accent contrast", () => {
  // Accents paint icons and small marks only (non-text: 3:1). Recovery and stress keep their established band colours.
  const families: AccentFamily[] = ["sleep", "strain", "heart", "activity", "body"];
  it.each(families)("%s icons reach 3:1 on a card in both themes", (f) => {
    expect(contrast(accentColor(DARK, f), DARK.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(accentColor(LIGHT, f), LIGHT.card)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the tab bar's active icon visible on the bar", () => {
    expect(contrast(DARK.primaryInk, DARK.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(LIGHT.primaryInk, LIGHT.card)).toBeGreaterThanOrEqual(3);
  });
});
