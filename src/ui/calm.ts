// The Halo palette, in Apple's system colours (the iOS look the person chose, 2026-10-17). It grew out of "Calm", whose
// names it keeps so every screen follows without a rename: a grouped grey ground (black in the dark), flat cards in the
// card colour with no hairline and no shadow, the system colours for data and actions, and the label greys for
// everything that is only a label. Each old pastel "tint" is now a soft fill of a system colour (about 14 % on white;
// a deep jewel tone on the dark card), its "ink" the system colour itself:
//   mint → green (Recovery, good), peach → orange (Strain), lavender → indigo (Sleep), sky → blue (activity, HRV,
//   actions), sand → yellow (warnings), rose → pink (heart, alerts).
// Every value is an opaque "#rrggbb" (screens blend and suffix them) except the few hairlines and the track fill, which
// are translucent the way iOS's are. Screens read colours from here; the kit's theme tokens carry the same ground and
// card, so older screens sit on the same surfaces.
import { useTheme } from "@/ui/ThemeProvider";

export type CalmTint = "mint" | "peach" | "lavender" | "sky" | "sand" | "rose";

/** iOS's system colours, by name. */
export type SystemColor = "red" | "orange" | "yellow" | "green" | "mint" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "gray";

export type CalmPalette = {
  /** The grouped ground (systemGroupedBackground). */
  ground: string;
  /** A card or an inset grouped list (secondarySystemGroupedBackground). */
  card: string;
  /** A raised chip on a tinted card or a card (icon tiles, buttons): white on light, the raised grey on dark. */
  chip: string;
  /** The label colour. */
  ink: string;
  /** The secondary label: values, sentences, section headers. */
  sub: string;
  /** A quiet grey a step under `sub`, for marks that only frame (empty values, axis ends). */
  faint: string;
  /** The separator between rows, as a solid. */
  line: string;
  /** The action colour (buttons, links, the active tab): iOS blue. The name is historical. */
  teal: string;
  orange: string;
  /** Indigo: deep banners and chart lines. The name is historical. */
  navy: string;
  /** Section headers over a grouped list: the secondary label. */
  label: string;
  /** A faint line round a control where one is needed at all; iOS controls mostly have none. */
  hairline: string;
  tint: Record<CalmTint, string>;
  /** Each family's system colour: icons, coloured numbers and the family's own accents. */
  tintInk: Record<CalmTint, string>;
  /** A card's edge: none (iOS cards are flat). Kept so older screens that draw a border draw nothing. */
  edge: string;
  /** A tinted card's edge: none, as `edge`. */
  tintEdge: Record<CalmTint, string>;
  /** The card's lift: none (iOS cards are flat). Kept for callers that spread it. */
  shadow: string | null;
  /** A tinted card's two stops: the same soft fill twice (flat). Kept for callers that still paint a gradient. */
  tintGrad: Record<CalmTint, readonly [string, string]>;
  /** A family's pair for rings and fills that draw on: the system colour into a lighter step of it. */
  vivid: Record<CalmTint, readonly [string, string]>;
  /** A family's glow colour: its system colour (no screen-level glow is drawn any more). */
  glow: Record<CalmTint, string>;
  /** Every system colour of this scheme: the coloured icon squares in a list, switches, destructive buttons. */
  system: Record<SystemColor, string>;
  /** The tertiary label: chevrons, placeholders, a disabled glyph. */
  tertiary: string;
  /** A track's fill (segmented control, switch when off, slider): iOS's tertiary system fill, translucent. */
  fill: string;
  /** The segmented control's sliding thumb. */
  thumb: string;
  /** A bottom sheet's face: the grouped ground on light, the elevated card grey on dark. */
  sheet: string;
  /** A quiet fill sitting straight on a sheet (fields, chips, rows): the card colour one level up from `sheet`. */
  sheetFill: string;
};

const LIGHT_SYSTEM: Record<SystemColor, string> = {
  red: "#ff3b30",
  orange: "#ff9500",
  yellow: "#ffcc00",
  green: "#34c759",
  mint: "#00c7be",
  teal: "#30b0c7",
  cyan: "#32ade6",
  blue: "#007aff",
  indigo: "#5856d6",
  purple: "#af52de",
  pink: "#ff2d55",
  gray: "#8e8e93",
};
const DARK_SYSTEM: Record<SystemColor, string> = {
  red: "#ff453a",
  orange: "#ff9f0a",
  yellow: "#ffd60a",
  green: "#30d158",
  mint: "#63e6e2",
  teal: "#40c8e0",
  cyan: "#64d2ff",
  blue: "#0a84ff",
  indigo: "#5e5ce6",
  purple: "#bf5af2",
  pink: "#ff375f",
  gray: "#8e8e93",
};

const NONE = "rgba(0,0,0,0)";
const noEdges: Record<CalmTint, string> = { mint: NONE, peach: NONE, lavender: NONE, sky: NONE, sand: NONE, rose: NONE };
const flat = (tint: Record<CalmTint, string>) =>
  Object.fromEntries(Object.entries(tint).map(([k, v]) => [k, [v, v] as const])) as unknown as Record<CalmTint, readonly [string, string]>;

// Yellow is unreadable as text on white, so the light scheme's sand ink is a deeper amber; every other ink is the system
// colour itself, as Apple's own apps colour their numbers. The dark scheme's indigo ink is iOS's brighter indigo, so a
// Sleep number reads on the near-black card.
const LIGHT_INK: Record<CalmTint, string> = { mint: "#34c759", peach: "#ff9500", lavender: "#5856d6", sky: "#007aff", sand: "#c48a00", rose: "#ff2d55" };
const DARK_INK: Record<CalmTint, string> = { mint: "#30d158", peach: "#ff9f0a", lavender: "#7d7aff", sky: "#0a84ff", sand: "#ffd60a", rose: "#ff375f" };

const LIGHT_TINT: Record<CalmTint, string> = { mint: "#e3f7e8", peach: "#fff0db", lavender: "#e8e7f9", sky: "#dbecff", sand: "#fff8db", rose: "#ffe2e7" };
const DARK_TINT: Record<CalmTint, string> = { mint: "#214b2d", peach: "#573e19", lavender: "#2d2d52", sky: "#173758", sand: "#574c19", rose: "#57232f" };

const LIGHT: CalmPalette = {
  ground: "#f2f2f7",
  card: "#ffffff",
  chip: "#ffffff",
  ink: "#000000",
  // rgba(60,60,67,0.6), rgba(60,60,67,0.18) and friends composited on white.
  sub: "#8a8a8e",
  faint: "#aeaeb2",
  line: "#dcdcdd",
  teal: LIGHT_SYSTEM.blue,
  orange: LIGHT_SYSTEM.orange,
  navy: LIGHT_SYSTEM.indigo,
  label: "#8a8a8e",
  hairline: "rgba(60,60,67,0.12)",
  tint: LIGHT_TINT,
  tintInk: LIGHT_INK,
  edge: NONE,
  tintEdge: noEdges,
  shadow: null,
  tintGrad: flat(LIGHT_TINT),
  vivid: {
    mint: ["#34c759", "#71d88b"],
    peach: ["#ff9500", "#ffb54c"],
    lavender: ["#5856d6", "#8a89e2"],
    sky: ["#007aff", "#4ca2ff"],
    sand: ["#ffcc00", "#ffdb4c"],
    rose: ["#ff2d55", "#ff6c88"],
  },
  glow: { mint: LIGHT_SYSTEM.green, peach: LIGHT_SYSTEM.orange, lavender: LIGHT_SYSTEM.indigo, sky: LIGHT_SYSTEM.blue, sand: LIGHT_SYSTEM.yellow, rose: LIGHT_SYSTEM.pink },
  system: LIGHT_SYSTEM,
  tertiary: "#c4c4c7",
  fill: "rgba(118,118,128,0.12)",
  thumb: "#ffffff",
  sheet: "#f2f2f7",
  sheetFill: "#ffffff",
};

const DARK: CalmPalette = {
  ground: "#000000",
  card: "#1c1c1e",
  chip: "#2c2c2e",
  ink: "#ffffff",
  // rgba(235,235,245,0.6), rgba(84,84,88,0.6) and friends composited on the card.
  sub: "#98989f",
  faint: "#636366",
  line: "#3d3d40",
  teal: DARK_SYSTEM.blue,
  orange: DARK_SYSTEM.orange,
  navy: DARK_SYSTEM.indigo,
  label: "#98989f",
  hairline: "rgba(84,84,88,0.45)",
  tint: DARK_TINT,
  tintInk: DARK_INK,
  edge: NONE,
  tintEdge: noEdges,
  shadow: null,
  tintGrad: flat(DARK_TINT),
  vivid: {
    mint: ["#30d158", "#6edf8a"],
    peach: ["#ff9f0a", "#ffbc54"],
    lavender: ["#5e5ce6", "#8e8dee"],
    sky: ["#0a84ff", "#54a9ff"],
    sand: ["#ffd60a", "#ffe254"],
    rose: ["#ff375f", "#ff738f"],
  },
  glow: { mint: DARK_SYSTEM.green, peach: DARK_SYSTEM.orange, lavender: DARK_SYSTEM.indigo, sky: DARK_SYSTEM.blue, sand: DARK_SYSTEM.yellow, rose: DARK_SYSTEM.pink },
  system: DARK_SYSTEM,
  tertiary: "#5a5a5e",
  fill: "rgba(118,118,128,0.24)",
  thumb: "#636366",
  sheet: "#1c1c1e",
  sheetFill: "#2c2c2e",
};

export function useCalm(): CalmPalette {
  const { scheme } = useTheme();
  return scheme === "dark" ? DARK : LIGHT;
}

export const CALM = { light: LIGHT, dark: DARK };

/** The halo: the icon's ring, green → cyan → indigo → orange in the system colours. Used once, small. */
export const HALO = ["#30d158", "#64d2ff", "#7d7aff", "#ff9f0a"] as const;
/** The halo a step deeper, for strokes on a white card (the bright ring washes out on white). */
export const HALO_DEEP = ["#34c759", "#32ade6", "#5856d6", "#ff9500"] as const;
