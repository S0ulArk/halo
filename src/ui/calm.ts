// The Halo palette (it grew out of "Calm", whose names it keeps so every screen follows without a rename): minimal and
// easy on the eyes. A soft neutral off-white ground, white cards held by a faint neutral hairline and a soft two-layer
// shadow, one quiet pastel per metric family, one deep action colour, and grey for everything that is only a label.
// Colour is for data and actions; the chrome stays neutral. The dark scheme keeps the same structure in deep tones.
// Screens read colours from here; the kit's theme tokens carry the ground and card so older screens sit on the same
// surfaces.
import { useTheme } from "@/ui/ThemeProvider";

export type CalmTint = "mint" | "peach" | "lavender" | "sky" | "sand" | "rose";

export type CalmPalette = {
  ground: string;
  card: string;
  /** A white (or raised) chip on a tinted card: icon tiles, buttons on the ground. */
  chip: string;
  ink: string;
  sub: string;
  faint: string;
  line: string;
  /** The action colour (buttons, links, the active tab). The name is historical: a deep blue-teal on light. */
  teal: string;
  orange: string;
  navy: string;
  /** Small caps section labels and chevrons: a quiet grey a step stronger than `faint`. Never a data colour. */
  label: string;
  /** The hairline round a control (chips, pills, segmented tracks, sheets): barely there, so shapes stay crisp. */
  hairline: string;
  tint: Record<CalmTint, string>;
  /** Readable ink on each tint: icons and the tint's own accents. */
  tintInk: Record<CalmTint, string>;
  /** A white card's hairline edge: keeps it crisp against the ground. */
  edge: string;
  /** A tinted card's edge: its own ink, faint, so a pastel never melts into the ground. */
  tintEdge: Record<CalmTint, string>;
  /** The card's lift: a tight contact shadow under a wide soft one (light); none in the dark, where the edge does it. */
  shadow: string | null;
  /** A tinted card's diagonal gradient, top left → bottom right: the family's colour, fresh and luminous, never grey. */
  tintGrad: Record<CalmTint, readonly [string, string]>;
  /** A family's vivid pair for rings and fills that draw on (a gradient stroke): the colour at full strength. */
  vivid: Record<CalmTint, readonly [string, string]>;
  /** The coloured glow under a tinted card, so it floats in its own light. */
  glow: Record<CalmTint, string>;
};

const edges = (ink: Record<CalmTint, string>, a: number) =>
  Object.fromEntries(Object.entries(ink).map(([k, v]) => [k, `${v}${Math.round(a * 255).toString(16).padStart(2, "0")}`])) as Record<CalmTint, string>;

// "Vivid pastel" (the look the person chose, 2026-10-09): the old tints were so pale they read as grey and the app looked
// dull. Each family now has a fresh pastel, a gradient on its cards, a coloured glow under them, and a vivid pair for
// the rings, while text stays ink and the chrome stays neutral.
const LIGHT_INK: Record<CalmTint, string> = { mint: "#0b7a55", peach: "#c2491f", lavender: "#5b3fd6", sky: "#0b6fa8", sand: "#94640a", rose: "#c0284f" };
const DARK_INK: Record<CalmTint, string> = { mint: "#7ff0c8", peach: "#ffb28a", lavender: "#c3b1ff", sky: "#8fd6ff", sand: "#ffd27a", rose: "#ff9ab6" };
const VIVID_LIGHT: Record<CalmTint, readonly [string, string]> = {
  mint: ["#0fae76", "#22d39a"],
  peach: ["#ff6a3d", "#ffa24c"],
  lavender: ["#6a4dff", "#9b7bff"],
  sky: ["#1499e6", "#3ccfff"],
  sand: ["#e29a12", "#ffc844"],
  rose: ["#f0386b", "#ff7a9c"],
};
const VIVID_DARK: Record<CalmTint, readonly [string, string]> = {
  mint: ["#22d39a", "#7ff0c8"],
  peach: ["#ff7a4d", "#ffb35c"],
  lavender: ["#8a6dff", "#b9a2ff"],
  sky: ["#2ab0ff", "#6fdcff"],
  sand: ["#f0b43c", "#ffd77a"],
  rose: ["#ff4f7f", "#ff92ae"],
};
const GLOW: Record<CalmTint, string> = { mint: "#22c98b", peach: "#ff8a5c", lavender: "#8a6dff", sky: "#38b6ff", sand: "#f0b43c", rose: "#ff6f93" };

const LIGHT: CalmPalette = {
  // A soft neutral off-white: lighter than the old warm grey, never yellow.
  ground: "#f4f5f7",
  card: "#ffffff",
  chip: "#ffffff",
  ink: "#15171a",
  sub: "#5f646a",
  faint: "#9a9fa4",
  line: "#ebebe8",
  teal: "#1e5157",
  orange: "#f2992e",
  navy: "#1f2a5c",
  label: "#7d8288",
  hairline: "rgba(21,23,26,0.08)",
  tint: { mint: "#d3f5e5", peach: "#ffe1d4", lavender: "#e6deff", sky: "#d6effc", sand: "#fbeccd", rose: "#ffdbe4" },
  tintInk: LIGHT_INK,
  edge: "rgba(21,23,26,0.06)",
  tintEdge: edges(LIGHT_INK, 0.1),
  shadow: "0 1px 2px rgba(17,24,39,0.04), 0 10px 28px rgba(17,24,39,0.06)",
  tintGrad: {
    mint: ["#bff0d8", "#e6fbf1"],
    peach: ["#ffd6c4", "#fff1ea"],
    lavender: ["#dcd2ff", "#f2eeff"],
    sky: ["#c9e9fb", "#ecf7fe"],
    sand: ["#f8e2b6", "#fdf5e6"],
    rose: ["#ffd0dc", "#fff0f3"],
  },
  vivid: VIVID_LIGHT,
  glow: GLOW,
};

const DARK: CalmPalette = {
  // The darker ground the person asked for; cards one step up.
  ground: "#090b0f",
  card: "#14171d",
  chip: "#1c2027",
  ink: "#f2f3f4",
  sub: "#a3a9ae",
  faint: "#6e757b",
  line: "#25292d",
  teal: "#79c7cc",
  orange: "#f5a54a",
  navy: "#97a6ff",
  label: "#8b9298",
  hairline: "rgba(255,255,255,0.09)",
  tint: { mint: "#123d2e", peach: "#3d2016", lavender: "#271f55", sky: "#10314a", sand: "#3a2c10", rose: "#3d1624" },
  tintInk: DARK_INK,
  edge: "rgba(255,255,255,0.08)",
  tintEdge: edges(DARK_INK, 0.16),
  shadow: null,
  tintGrad: {
    mint: ["#0f4a36", "#0d2a22"],
    peach: ["#4a2416", "#2a1710"],
    lavender: ["#2f2466", "#1c1838"],
    sky: ["#0f3a5a", "#0c2234"],
    sand: ["#4a3712", "#2a1f0c"],
    rose: ["#4d1a2c", "#2b1019"],
  },
  vivid: VIVID_DARK,
  glow: GLOW,
};

export function useCalm(): CalmPalette {
  const { scheme } = useTheme();
  return scheme === "dark" ? DARK : LIGHT;
}

export const CALM = { light: LIGHT, dark: DARK };

/** The halo: the icon's ring, mint → sky → lavender → peach. Used once, small: the active tab's line. */
export const HALO = ["#5ef2c0", "#6cc7ff", "#b9a6ff", "#ffb38a"] as const;
/** The halo a step deeper, for strokes on a white card (the bright ring washes out on white). */
export const HALO_DEEP = ["#22b98a", "#3c9fe0", "#8a74f0", "#ee8a5a"] as const;
