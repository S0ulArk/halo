// Measurement units (Settings › Units): what the person chose for each kind of measurement, the two presets, and every
// conversion between what Halo keeps (always metric: the Store, the pipeline and every score) and what it shows or takes
// in. Pure TypeScript, so the tests run in node; the choice itself is kept on the phone by src/state/units.ts.
//
// Every conversion here is linear, shown = metric × factor + offset, so a view model converts a value, its average and
// its range with one map, and a spread (a standard deviation, a difference, a change since a date) with the factor
// alone. The only offset is temperature's: a reading converts with ×9/5 + 32, but a deviation (skin temperature's
// "+0.3 °C from your baseline", a baseline's ± range) converts with ×9/5 only. Energy stays in kcal for everyone.

export type WeightUnit = "kg" | "lb";
/** Height and body lengths (waist): centimetres, or feet and inches (a waist in inches). */
export type HeightUnit = "cm" | "ftin";
/** Distance, and what goes with it: pace per km or per mile, speed in km/h or mph, elevation in metres or feet. */
export type DistanceUnit = "km" | "mi";
export type TemperatureUnit = "c" | "f";
/** Water and other drinks: millilitres or US fluid ounces. */
export type FluidUnit = "ml" | "floz";

export type Units = { weight: WeightUnit; height: HeightUnit; distance: DistanceUnit; temperature: TemperatureUnit; fluid: FluidUnit };
export type UnitKind = keyof Units;
export const UNIT_KINDS: readonly UnitKind[] = ["weight", "height", "distance", "temperature", "fluid"];

/** The default, and what Halo stores: nothing changes for anyone until they choose. */
export const METRIC: Units = { weight: "kg", height: "cm", distance: "km", temperature: "c", fluid: "ml" };
/** United States customary units. */
export const IMPERIAL: Units = { weight: "lb", height: "ftin", distance: "mi", temperature: "f", fluid: "floz" };

export type Preset = "metric" | "imperial";
export const PRESETS: Record<Preset, Units> = { metric: METRIC, imperial: IMPERIAL };

const OPTIONS: { [K in UnitKind]: readonly Units[K][] } = {
  weight: ["kg", "lb"],
  height: ["cm", "ftin"],
  distance: ["km", "mi"],
  temperature: ["c", "f"],
  fluid: ["ml", "floz"],
};

/** Which preset `u` is, or null for a mix (lb with km, say). */
export function presetOf(u: Units): Preset | null {
  if (UNIT_KINDS.every((k) => u[k] === METRIC[k])) return "metric";
  if (UNIT_KINDS.every((k) => u[k] === IMPERIAL[k])) return "imperial";
  return null;
}

export const sameUnits = (a: Units, b: Units) => UNIT_KINDS.every((k) => a[k] === b[k]);

/** A short key for `u` ("kg.cm.km.c.ml"), for cache stamps. */
export const unitsKey = (u: Units) => UNIT_KINDS.map((k) => u[k]).join(".");

/** The stored JSON → units; a missing or unknown field keeps the metric default. */
export function parseUnits(raw: string | null | undefined): Units {
  let v: unknown = null;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    v = null;
  }
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out = { ...METRIC } as Record<UnitKind, string>;
  for (const k of UNIT_KINDS) {
    const x = o[k];
    if (typeof x === "string" && (OPTIONS[k] as readonly string[]).includes(x)) out[k] = x;
  }
  return out as Units;
}

// ── Exact factors (international yard and pound, US fluid ounce) ────────────

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const IN_PER_FT = 12;
export const KM_PER_MI = 1.609344;
export const M_PER_FT = 0.3048;
export const ML_PER_FL_OZ = 29.5735295625;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inches: number) => inches * CM_PER_IN;
export const kmToMi = (km: number) => km / KM_PER_MI;
export const miToKm = (mi: number) => mi * KM_PER_MI;
export const mToFt = (m: number) => m / M_PER_FT;
export const ftToM = (ft: number) => ft * M_PER_FT;
/** A temperature reading: ×9/5 + 32. */
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const fToC = (f: number) => ((f - 32) * 5) / 9;
/** A temperature difference (a change from a baseline, a spread, a ± range): ×9/5, never + 32. */
export const cDeltaToF = (d: number) => (d * 9) / 5;
export const fDeltaToC = (d: number) => (d * 5) / 9;
export const mlToFlOz = (ml: number) => ml / ML_PER_FL_OZ;
export const flOzToMl = (oz: number) => oz * ML_PER_FL_OZ;
/** Pace: seconds per km → seconds per mile (a mile takes longer). */
export const pacePerKmToPerMi = (s: number) => s * KM_PER_MI;
export const pacePerMiToPerKm = (s: number) => s / KM_PER_MI;
export const kmhToMph = (v: number) => v / KM_PER_MI;
export const mphToKmh = (v: number) => v * KM_PER_MI;

/** Centimetres → whole feet and inches, the inches rounded to `inchDecimals` and 12 of them carried into a foot (175 → 5 ft 9 in). */
export function cmToFtIn(cm: number, inchDecimals = 0): { ft: number; in: number } {
  const k = 10 ** inchDecimals;
  const total = Math.round(cmToIn(cm) * k) / k;
  const ft = Math.floor((total + 1e-9) / IN_PER_FT);
  return { ft, in: Math.max(0, Math.round((total - ft * IN_PER_FT) * k) / k) };
}
export const ftInToCm = (ft: number, inches: number) => inToCm(ft * IN_PER_FT + inches);

// ── A metric unit as shown ───────────────────────────────────────────────────

/** How a metric value is shown: the unit's label and the linear map `metric × factor + offset`. */
export type Conversion = { unit: string; factor: number; offset: number };

/**
 * How a value in the metric `unit` (as the view models label it: "kg", "km", "m", "/km", "km/h", "°C", "ml", "cm") is
 * shown in `units`. Null when it shows as it is: metric chosen, or a unit no choice touches (kcal, bpm, g, ml/kg/min,
 * kg/m², which are standard everywhere). `delta`: the value is a difference, so a temperature converts without the +32.
 */
export function conversionFor(unit: string | undefined, units: Units, opts: { delta?: boolean } = {}): Conversion | null {
  switch (unit) {
    case "kg":
      return units.weight === "lb" ? { unit: "lb", factor: 1 / KG_PER_LB, offset: 0 } : null;
    case "km":
      return units.distance === "mi" ? { unit: "mi", factor: 1 / KM_PER_MI, offset: 0 } : null;
    case "m":
      // Elevation follows the distance choice: miles go with feet.
      return units.distance === "mi" ? { unit: "ft", factor: 1 / M_PER_FT, offset: 0 } : null;
    case "/km":
      return units.distance === "mi" ? { unit: "/mi", factor: KM_PER_MI, offset: 0 } : null;
    case "km/h":
      return units.distance === "mi" ? { unit: "mph", factor: 1 / KM_PER_MI, offset: 0 } : null;
    case "°C":
      return units.temperature === "f" ? { unit: "°F", factor: 9 / 5, offset: opts.delta ? 0 : 32 } : null;
    case "ml":
      return units.fluid === "floz" ? { unit: "fl oz", factor: 1 / ML_PER_FL_OZ, offset: 0 } : null;
    case "cm":
      // A body length (waist) in inches when height is in feet and inches.
      return units.height === "ftin" ? { unit: "in", factor: 1 / CM_PER_IN, offset: 0 } : null;
    default:
      return null;
  }
}

/** A metric value as shown (as it is with no conversion). */
export const shown = (v: number, c: Conversion | null) => (c ? v * c.factor + c.offset : v);
/** A difference or a spread (a standard deviation, a change, a ± range) as shown: the factor alone. */
export const shownSpread = (v: number, c: Conversion | null) => (c ? v * c.factor : v);
/** A value typed in the shown unit, back to metric. */
export const fromShown = (v: number, c: Conversion | null) => (c ? (v - c.offset) / c.factor : v);
/** `v` through `f` when it is a finite number; null, undefined and NaN pass through. */
export const mapFinite = <T extends number | null | undefined>(v: T, f: (x: number) => number): T =>
  (typeof v === "number" && Number.isFinite(v) ? f(v) : v) as T;

/** The unit each choice shows ("kg", "lb", "fl oz"…); height in feet and inches is written out as "ft, in". */
export const UNIT_SYMBOL: { [K in UnitKind]: Record<Units[K], string> } = {
  weight: { kg: "kg", lb: "lb" },
  height: { cm: "cm", ftin: "ft, in" },
  distance: { km: "km", mi: "mi" },
  temperature: { c: "°C", f: "°F" },
  fluid: { ml: "ml", floz: "fl oz" },
};

/** Each choice's name in words, for Settings › Units and the coach. */
export const UNIT_NAME: { [K in UnitKind]: Record<Units[K], string> } = {
  weight: { kg: "Kilograms", lb: "Pounds" },
  height: { cm: "Centimetres", ftin: "Feet and inches" },
  distance: { km: "Kilometres", mi: "Miles" },
  temperature: { c: "Celsius", f: "Fahrenheit" },
  fluid: { ml: "Millilitres", floz: "US fluid ounces" },
};

// ── Text ─────────────────────────────────────────────────────────────────────

const NBSP = "\u00a0";
const fmts = new Map<number, Intl.NumberFormat>();
/** `v` with up to `decimals` decimals and no trailing zeros, grouped: 1,892.7, 64, 5.5. */
export function amount(v: number, decimals = 1): string {
  let f = fmts.get(decimals);
  if (!f) fmts.set(decimals, (f = new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals })));
  return f.format(v).replace("-", "−");
}

/** A height: "175 cm", or "5 ft 9 in". */
export function heightText(cm: number, units: Units): string {
  if (units.height === "cm") return `${amount(cm, 1)}${NBSP}cm`;
  const { ft, in: inches } = cmToFtIn(cm);
  return `${ft}${NBSP}ft ${inches}${NBSP}in`;
}

/** A body length (waist): "81 cm", or "32 in". */
export function lengthText(cm: number, units: Units): string {
  return units.height === "cm" ? `${amount(cm, 1)}${NBSP}cm` : `${amount(cmToIn(cm), 1)}${NBSP}in`;
}

/** A weight: "77.2 kg", or "170.2 lb". */
export function weightText(kg: number, units: Units, decimals = 1): string {
  return units.weight === "kg" ? `${amount(kg, decimals)}${NBSP}kg` : `${amount(kgToLb(kg), decimals)}${NBSP}lb`;
}

/** An amount of water: "330 ml", or "11.2 fl oz". */
export function fluidText(ml: number, units: Units): string {
  return units.fluid === "ml" ? `${amount(ml, 0)}${NBSP}ml` : `${amount(mlToFlOz(ml), 1)}${NBSP}fl oz`;
}

// ── Input ────────────────────────────────────────────────────────────────────

const NUMBER = /^\d+([.,]\d+)?$/;
/** A typed number: null when blank, NaN when not a plain non-negative number ("1,5" reads 1.5). */
export function parseAmount(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  return NUMBER.test(t) ? Number(t.replace(",", ".")) : NaN;
}

/** `v` rounded to `decimals`. */
export const roundTo = (v: number, decimals: number) => {
  const k = 10 ** decimals;
  return Math.round(v * k) / k;
};

/** A typed weight in the chosen unit → kg (unrounded); null blank, NaN not a number. */
export function weightFromInput(text: string, units: Units): number | null {
  const v = parseAmount(text);
  return v === null || Number.isNaN(v) || units.weight === "kg" ? v : lbToKg(v);
}

/** A typed amount of water in the chosen unit → whole ml; null blank, NaN not a number. */
export function fluidFromInput(text: string, units: Units): number | null {
  const v = parseAmount(text);
  return v === null || Number.isNaN(v) || units.fluid === "ml" ? v : Math.round(flOzToMl(v));
}

/** A typed body length (waist) in the chosen unit → cm to 0.1; null blank, NaN not a number. */
export function lengthFromInput(text: string, units: Units): number | null {
  const v = parseAmount(text);
  return v === null || Number.isNaN(v) || units.height === "cm" ? v : roundTo(inToCm(v), 1);
}

/** A typed distance in the chosen unit → km (unrounded); null blank, NaN not a number. */
export function distanceFromInput(text: string, units: Units): number | null {
  const v = parseAmount(text);
  return v === null || Number.isNaN(v) || units.distance === "km" ? v : miToKm(v);
}

/** A typed temperature reading in the chosen unit → °C (unrounded); null blank, NaN not a number. */
export function temperatureFromInput(text: string, units: Units): number | null {
  const t = text.trim();
  const neg = t.startsWith("-") || t.startsWith("−");
  const v = parseAmount(neg ? t.slice(1) : t);
  if (v === null || Number.isNaN(v)) return v;
  const signed = neg ? -v : v;
  return units.temperature === "c" ? signed : fToC(signed);
}

/** A height as typed: centimetres in `cm`, or feet and inches in `ft` and `in` (whichever the person's unit uses). */
export type HeightDraft = { cm: string; ft: string; in: string };

/** A stored height (cm) as the fields show it in `units`; blank with none. */
export function heightDraftOf(cm: number | null | undefined, units: Units): HeightDraft {
  if (cm == null || !Number.isFinite(cm) || cm <= 0) return { cm: "", ft: "", in: "" };
  if (units.height === "cm") return { cm: String(roundTo(cm, 1)), ft: "", in: "" };
  const f = cmToFtIn(cm);
  return { cm: "", ft: String(f.ft), in: String(f.in) };
}

/**
 * The height typed in `units` → cm to 0.1: null when blank, NaN when a field is not a number or the inches are 12 or
 * more. Feet alone read as whole feet (6 → 6 ft 0 in); inches alone as inches (69 → 5 ft 9 in).
 */
export function heightFromDraft(d: HeightDraft, units: Units): number | null {
  if (units.height === "cm") return parseAmount(d.cm);
  const ft = parseAmount(d.ft);
  const inches = parseAmount(d.in);
  if (ft === null && inches === null) return null;
  if (Number.isNaN(ft) || Number.isNaN(inches)) return NaN;
  if (ft !== null && inches !== null && inches >= IN_PER_FT) return NaN;
  return roundTo(ftInToCm(ft ?? 0, inches ?? 0), 1);
}

/** A metric value as the text a field starts with in `units` (`decimals` at most): 77.25 kg → "170.3" lb. */
export function inputText(v: number | null | undefined, conv: Conversion | null, decimals: number): string {
  return v == null || !Number.isFinite(v) ? "" : String(roundTo(shown(v, conv), decimals));
}
