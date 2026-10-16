// Settings › Units' conversions and parsing: exact factors, temperature readings against differences, feet and inches
// both ways, pace, the stored choice's parsing, and what a typed field becomes in metric.
import { describe, expect, it } from "vitest";
import { FORMATS } from "./format";
import {
  amount,
  cDeltaToF,
  cmToFtIn,
  cToF,
  conversionFor,
  distanceFromInput,
  fluidFromInput,
  fluidText,
  fromShown,
  ftInToCm,
  fToC,
  heightDraftOf,
  heightFromDraft,
  heightText,
  IMPERIAL,
  inputText,
  kgToLb,
  kmhToMph,
  kmToMi,
  lbToKg,
  lengthFromInput,
  lengthText,
  METRIC,
  mlToFlOz,
  mToFt,
  pacePerKmToPerMi,
  pacePerMiToPerKm,
  parseAmount,
  parseUnits,
  presetOf,
  shown,
  shownSpread,
  temperatureFromInput,
  unitsKey,
  weightFromInput,
  weightText,
  type Units,
} from "./units";

const NB = " ";

describe("presets and the stored choice", () => {
  it("metric is the default; a preset is named, a mix is not", () => {
    expect(parseUnits(null)).toEqual(METRIC);
    expect(presetOf(METRIC)).toBe("metric");
    expect(presetOf(IMPERIAL)).toBe("imperial");
    expect(presetOf({ ...METRIC, weight: "lb" })).toBeNull();
  });

  it("keeps the known fields of what was stored and falls back to metric for the rest", () => {
    expect(parseUnits(JSON.stringify(IMPERIAL))).toEqual(IMPERIAL);
    expect(parseUnits('{"weight":"lb","distance":"leagues","fluid":7}')).toEqual({ ...METRIC, weight: "lb" });
    expect(parseUnits("not json")).toEqual(METRIC);
    expect(unitsKey(IMPERIAL)).toBe("lb.ftin.mi.f.floz");
  });
});

describe("conversions", () => {
  it("uses the exact international factors", () => {
    expect(lbToKg(1)).toBe(0.45359237);
    expect(kgToLb(100)).toBeCloseTo(220.462262, 6);
    expect(kmToMi(1.609344)).toBeCloseTo(1, 12);
    expect(mToFt(0.3048)).toBeCloseTo(1, 12);
    expect(mlToFlOz(29.5735295625)).toBeCloseTo(1, 12);
    expect(kmhToMph(10)).toBeCloseTo(6.2137, 4);
  });

  it("converts a temperature reading with +32 and a difference without it", () => {
    expect(cToF(0)).toBe(32);
    expect(cToF(37)).toBeCloseTo(98.6, 10);
    expect(fToC(98.6)).toBeCloseTo(37, 10);
    // Skin temperature 0.5 °C above its baseline is 0.9 °F above it, never 32.9.
    expect(cDeltaToF(0.5)).toBeCloseTo(0.9, 10);
    const reading = conversionFor("°C", IMPERIAL)!;
    const change = conversionFor("°C", IMPERIAL, { delta: true })!;
    expect(reading).toEqual({ unit: "°F", factor: 9 / 5, offset: 32 });
    expect(change).toEqual({ unit: "°F", factor: 9 / 5, offset: 0 });
    expect(shown(36.6, reading)).toBeCloseTo(97.88, 10);
    expect(shown(-0.3, change)).toBeCloseTo(-0.54, 10);
    // A baseline's spread (an SD, a ± range) is a difference even for a reading.
    expect(shownSpread(0.5, reading)).toBeCloseTo(0.9, 10);
    expect(fromShown(shown(36.6, reading), reading)).toBeCloseTo(36.6, 10);
  });

  it("maps every metric unit to its US one, and leaves the rest alone", () => {
    const unitOf = (u: string) => conversionFor(u, IMPERIAL)?.unit;
    expect(["kg", "km", "m", "/km", "km/h", "ml", "cm"].map(unitOf)).toEqual(["lb", "mi", "ft", "/mi", "mph", "fl oz", "in"]);
    for (const u of ["kcal", "bpm", "%", "ms", "g", "ml/kg/min", "kg/m²", "min", undefined]) expect(conversionFor(u, IMPERIAL)).toBeNull();
    for (const u of ["kg", "km", "m", "/km", "km/h", "°C", "ml", "cm"]) expect(conversionFor(u, METRIC)).toBeNull();
  });

  it("follows each choice on its own: pounds with kilometres", () => {
    const mixed: Units = { ...METRIC, weight: "lb" };
    expect(conversionFor("kg", mixed)?.unit).toBe("lb");
    expect(conversionFor("km", mixed)).toBeNull();
    expect(conversionFor("m", { ...METRIC, distance: "mi" })?.unit).toBe("ft");
  });

  it("converts pace both ways: 5:00 a km is 8:03 a mile", () => {
    const perMi = pacePerKmToPerMi(300);
    expect(perMi).toBeCloseTo(482.8, 1);
    expect(FORMATS.pace(perMi)).toBe("8:03");
    expect(pacePerMiToPerKm(perMi)).toBeCloseTo(300, 10);
    // The same through a view model's unit label.
    expect(FORMATS.pace(shown(300, conversionFor("/km", IMPERIAL)))).toBe("8:03");
  });
});

describe("feet and inches", () => {
  it("splits centimetres into whole feet and rounded inches, carrying 12 inches into a foot", () => {
    expect(cmToFtIn(175)).toEqual({ ft: 5, in: 9 });
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, in: 0 });
    // 182.5 cm is 71.85 in: 72 inches is 6 ft 0 in, never 5 ft 12 in.
    expect(cmToFtIn(182.5)).toEqual({ ft: 6, in: 0 });
    expect(cmToFtIn(152.4)).toEqual({ ft: 5, in: 0 });
    expect(ftInToCm(5, 9)).toBeCloseTo(175.26, 10);
    expect(heightText(175, IMPERIAL)).toBe(`5${NB}ft 9${NB}in`);
    expect(heightText(175, METRIC)).toBe(`175${NB}cm`);
  });

  it("round-trips a height through the fields: typed once in feet and inches, it then stays put", () => {
    for (let cm = 100; cm <= 250; cm += 0.7) {
      const once = heightFromDraft(heightDraftOf(cm, IMPERIAL), IMPERIAL)!;
      // Within half an inch of where it started, and stable from then on.
      expect(Math.abs(once - cm)).toBeLessThanOrEqual(1.27 + 0.05);
      expect(heightFromDraft(heightDraftOf(once, IMPERIAL), IMPERIAL)).toBe(once);
      expect(heightDraftOf(once, IMPERIAL)).toEqual(heightDraftOf(cm, IMPERIAL));
    }
    // In cm the draft is the number itself.
    expect(heightDraftOf(175, METRIC)).toEqual({ cm: "175", ft: "", in: "" });
    expect(heightFromDraft({ cm: "175", ft: "", in: "" }, METRIC)).toBe(175);
  });

  it("reads feet alone, inches alone, and rejects 12 inches or more", () => {
    expect(heightFromDraft({ cm: "", ft: "5", in: "9" }, IMPERIAL)).toBe(175.3);
    expect(heightFromDraft({ cm: "", ft: "6", in: "" }, IMPERIAL)).toBe(182.9);
    expect(heightFromDraft({ cm: "", ft: "", in: "69" }, IMPERIAL)).toBe(175.3);
    expect(heightFromDraft({ cm: "", ft: "5", in: "12" }, IMPERIAL)).toBeNaN();
    expect(heightFromDraft({ cm: "", ft: "five", in: "9" }, IMPERIAL)).toBeNaN();
    expect(heightFromDraft({ cm: "", ft: "", in: "" }, IMPERIAL)).toBeNull();
    expect(heightDraftOf(null, IMPERIAL)).toEqual({ cm: "", ft: "", in: "" });
  });
});

describe("typed input", () => {
  it("reads a plain number, a comma decimal, and nothing else", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("  ")).toBeNull();
    expect(parseAmount("72,4")).toBe(72.4);
    expect(parseAmount("abc")).toBeNaN();
    expect(parseAmount("-3")).toBeNaN();
  });

  it("turns each typed unit into what is stored", () => {
    expect(weightFromInput("72.4", METRIC)).toBe(72.4);
    expect(weightFromInput("170.5", IMPERIAL)).toBeCloseTo(77.3375, 4);
    expect(weightFromInput("", IMPERIAL)).toBeNull();
    expect(weightFromInput("x", IMPERIAL)).toBeNaN();
    // Water is stored in whole ml: a cup (8 fl oz) is 237 ml.
    expect(fluidFromInput("8", IMPERIAL)).toBe(237);
    expect(fluidFromInput("12.5", IMPERIAL)).toBe(370);
    expect(fluidFromInput("330", METRIC)).toBe(330);
    expect(lengthFromInput("32", IMPERIAL)).toBe(81.3);
    expect(lengthFromInput("81", METRIC)).toBe(81);
    expect(distanceFromInput("5", IMPERIAL)).toBeCloseTo(8.04672, 10);
    expect(temperatureFromInput("98.6", IMPERIAL)).toBeCloseTo(37, 10);
    expect(temperatureFromInput("−2", METRIC)).toBe(-2);
    expect(temperatureFromInput("-4", IMPERIAL)).toBeCloseTo(-20, 10);
  });

  it("reads a weight typed in pounds back as typed once stored to 0.01 kg", () => {
    for (let lb = 90; lb <= 400; lb += 0.1) {
      const stored = Math.round(weightFromInput(lb.toFixed(1), IMPERIAL)! * 100) / 100;
      expect(kgToLb(stored).toFixed(1)).toBe(lb.toFixed(1));
    }
  });

  it("starts a field from a stored value in the shown unit", () => {
    expect(inputText(77.25, conversionFor("kg", IMPERIAL), 1)).toBe("170.3");
    expect(inputText(81.3, conversionFor("cm", IMPERIAL), 1)).toBe("32");
    expect(inputText(null, conversionFor("cm", IMPERIAL), 1)).toBe("");
    expect(inputText(81, null, 1)).toBe("81");
  });
});

describe("text", () => {
  it("writes weights, lengths and water in the chosen unit", () => {
    expect(weightText(72.5, METRIC)).toBe(`72.5${NB}kg`);
    expect(weightText(72.5, IMPERIAL)).toBe(`159.8${NB}lb`);
    expect(lengthText(81.3, IMPERIAL)).toBe(`32${NB}in`);
    expect(fluidText(330, METRIC)).toBe(`330${NB}ml`);
    expect(fluidText(330, IMPERIAL)).toBe(`11.2${NB}fl oz`);
    expect(amount(1892.7, 0)).toBe("1,893");
  });
});
