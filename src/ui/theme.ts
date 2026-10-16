// Theme tokens, in iOS's colours (the 2026-10 iOS pass; the names are the "calm data" kit's, so every caller keeps
// working). Dark is the default. Every colour is a hex or rgba string RN can paint with; `alpha()` in src/lib/utils.ts
// derives the `/8`, `/15`, `/50` variants. Surfaces are iOS's grouped ones, flat solids with no outline and no shadow:
// a grey (light) or black (dark) ground under cards in the card colour. Colour carries meaning, in the system colours:
// Recovery green / yellow / red, Strain orange, Sleep indigo, heart pink, HRV and actions blue, stress purple.


export type Tokens = {
  // Ground: the solid page colour is `background`; top and mid are its old gradient stops
  backgroundTop: string;
  backgroundMid: string;
  background: string;
  groundHealthspan: string;
  foreground: string;
  foregroundSecondary: string;
  // Surfaces
  card: string;
  cardTop: string;
  cardHover: string;
  cardForeground: string;
  popover: string;
  popoverTop: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  /** The primary teal where it paints a glyph or stroke (not a fill): the same teal on dark, a deeper one on light. */
  primaryInk: string;
  /** The primary button's face, left → right: teal into a teal-blue on dark; flat primary on light. */
  ctaFrom: string;
  ctaTo: string;
  /** The primary button's lit top hairline (none on light). */
  ctaSheen: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  inset: string;
  sheet: string;
  sheetBottom: string;
  field: string;
  destructive: string;
  border: string;
  input: string;
  ring: string;
  // Recovery bands
  recoveryGreen: string;
  recoveryYellow: string;
  recoveryRed: string;
  recoveryRedText: string;
  // Strain, sleep
  strain: string;
  strainText: string;
  strainDeep: string;
  sleep: string;
  sleepDeep: string;
  // Metric family accents (src/ui/accents.ts): icons and small marks only, never text.
  /** Heart and vitals: a warm coral. */
  heart: string;
  /** Body measurements and nutrition (and the energy chart): teal. */
  body: string;
  // Status
  optimal: string;
  warning: string;
  recoveryBlue: string;
  stressLow: string;
  stressMedium: string;
  stressHigh: string;
  // Coach / insight language
  coach: string;
  insightFrom: string;
  insightTo: string;
  bannerFrom: string;
  bannerTo: string;
  outlookFrom: string;
  outlookTo: string;
  // Dials and charts
  dialTrack: string;
  dialTarget: string;
  chartGrid: string;
  chartBand: string;
  chartCursor: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  stageAwake: string;
  stageRem: string;
  stageLight: string;
  stageDeep: string;
  energyActive: string;
  energyResting: string;
  /** The hatched track's stripe colour (1.5 px stripes on a 5 px period at −45°). */
  patternHatch: string;
  // Glass (spec §2.6)
  glassTop: string;
  glassBottom: string;
  glassEdge: string;
  glassRim: string;
  glassLens: string;
  glassActionTop: string;
  glassActionBottom: string;
  /** The glass as its sampled solids (no backdrop blur / reduced transparency). */
  glassSolidTop: string;
  glassSolidBottom: string;
  glassActionSolidTop: string;
  glassActionSolidBottom: string;
  actionRimFrom: string;
  actionRimTo: string;
  actionFace: string;
  dim: string;
  dimStrong: string;
  /** The card's 1 px top light (an inner hairline). */
  cardEdge: string;
  /** The card's 1 px outline: what keeps a near-black card readable on the near-black ground (light: its 5 % ring). */
  cardBorder: string;
  sheetEdge: string;
  selection: string;
  onMedia: string;
  mediaGround: string;
  // Pulse Age orb
  orbGreen: string;
  orbTeal: string;
  orbCyan: string;
  orbBlue: string;
  orbBlue2: string;
  orbOlive: string;
  orbOrange: string;
  orbAmber: string;
  orbRust: string;
  orbRed: string;
  orbEmpty: string;
  orbCore: string;
  orbHighlight: string;
  orbDeltaText: string;
  orbText: string;
  orbTextMuted: string;
  // Streak flame
  flameTip: string;
  flameBody: string;
  flameEdge: string;
  flameCoreTop: string;
  flameCoreBottom: string;
};
export type ColorToken = keyof Tokens;

// Dark palette (Oct 2026, the iOS pass): iOS's dark grouped surfaces (a black ground, #1C1C1E cards, #2C2C2E raised
// fills) and its dark system colours for data: green Recovery, indigo Sleep, orange Strain, pink heart, blue actions.
// Every text token reads at 4.5:1 or more on a card, the ground and the inset; the indigo is iOS's brighter one so a
// Sleep number reads on the card.
export const DARK: Tokens = {
  // Ground: black (`background`); the top / mid tones remain, a hair lighter, for callers that still read them.
  backgroundTop: "#0a0a0a",
  backgroundMid: "#050505",
  background: "#000000",
  groundHealthspan: "#000000",
  foreground: "#ffffff",
  // The secondary label, rgba(235,235,245,0.6), composited on the card (5.9:1).
  foregroundSecondary: "#98989f",
  // Surfaces, darkest to lightest: ground < inset < card < sheet < muted < popover < field < secondary < accent.
  card: "#1c1c1e",
  cardTop: "#1f1f21",
  cardHover: "#2c2c2e",
  cardForeground: "#ffffff",
  popover: "#2c2c2e",
  popoverTop: "#2e2e30",
  popoverForeground: "#ffffff",
  primary: "#0a84ff",
  primaryForeground: "#ffffff",
  primaryInk: "#0a84ff",
  ctaFrom: "#0a84ff",
  ctaTo: "#0a84ff",
  ctaSheen: "rgba(255,255,255,0)",
  secondary: "#303032",
  secondaryForeground: "#ffffff",
  muted: "#242426",
  mutedForeground: "#98989f",
  accent: "#3a3a3c",
  accentForeground: "#ffffff",
  inset: "#111112",
  sheet: "#1c1c1e",
  sheetBottom: "#18181a",
  field: "#2a2a2c",
  destructive: "#ff453a",
  // The separator, rgba(84,84,88,0.6).
  border: "rgba(84,84,88,0.6)",
  input: "rgba(255,255,255,0.14)",
  ring: "#ffffff",
  recoveryGreen: "#30d158",
  recoveryYellow: "#ffd60a",
  recoveryRed: "#ff453a",
  // iOS's increased-contrast red and orange, for words in those colours.
  recoveryRedText: "#ff6961",
  strain: "#ff9f0a",
  strainText: "#ffb340",
  strainDeep: "#c76a00",
  sleep: "#7d7aff",
  sleepDeep: "#5e5ce6",
  heart: "#ff375f",
  body: "#40c8e0",
  optimal: "#30d158",
  warning: "#ffd60a",
  recoveryBlue: "#0a84ff",
  stressLow: "#64d2ff",
  stressMedium: "#bf5af2",
  stressHigh: "#ff9f0a",
  coach: "#bf5af2",
  // The insight hairline: indigo into blue.
  insightFrom: "#5e5ce6",
  insightTo: "#0a84ff",
  bannerFrom: "#24233f",
  bannerTo: "#132a40",
  outlookFrom: "#3d2f1a",
  outlookTo: "#132a40",
  // Tracks and grids: visible on the ground and on a card, never louder than the data.
  dialTrack: "#2c2c2e",
  dialTarget: "#636366",
  chartGrid: "rgba(255,255,255,0.08)",
  chartBand: "rgba(255,255,255,0.045)",
  chartCursor: "rgba(255,255,255,0.4)",
  chart1: "#ff9f0a",
  chart2: "#30d158",
  chart3: "#7d7aff",
  chart4: "#ffd60a",
  chart5: "#0a84ff",
  // Apple Health's sleep stages: salmon awake, cyan REM, blue core, indigo deep.
  stageAwake: "#ff9f7a",
  stageRem: "#64d2ff",
  stageLight: "#0a84ff",
  stageDeep: "#5e5ce6",
  energyActive: "#ff9f0a",
  energyResting: "#636366",
  patternHatch: "rgba(255,255,255,0.08)",
  // Glass chrome: a smoked grey with a faint lit edge (the solids stand in where there is no backdrop).
  glassTop: "rgba(40,40,44,0.72)",
  glassBottom: "rgba(30,30,34,0.8)",
  glassEdge: "rgba(255,255,255,0.14)",
  glassRim: "rgba(255,255,255,0.08)",
  glassLens: "rgba(255,255,255,0.07)",
  glassActionTop: "rgba(10,132,255,0.92)",
  glassActionBottom: "rgba(10,132,255,0.96)",
  glassSolidTop: "#1c1c1e",
  glassSolidBottom: "#1c1c1e",
  glassActionSolidTop: "#0a84ff",
  glassActionSolidBottom: "#0a84ff",
  actionRimFrom: "#0a84ff",
  actionRimTo: "#5e5ce6",
  actionFace: "#0a84ff",
  dim: "rgba(0,0,0,0.55)",
  dimStrong: "rgba(0,0,0,0.75)",
  cardEdge: "rgba(255,255,255,0)",
  cardBorder: "rgba(255,255,255,0)",
  sheetEdge: "rgba(255,255,255,0.08)",
  selection: "rgba(10,132,255,0.35)",
  onMedia: "#ffffff",
  mediaGround: "#000000",
  orbGreen: "#4cd48c",
  orbTeal: "#3cc6ae",
  orbCyan: "#7cc4d4",
  orbBlue: "#5888c0",
  orbBlue2: "#5e8cc0",
  orbOlive: "#6a8452",
  orbOrange: "#d4843a",
  orbAmber: "#c8862e",
  orbRust: "#c9622f",
  orbRed: "#d8453a",
  orbEmpty: "#5c6268",
  orbCore: "#000000",
  orbHighlight: "#ffffff",
  orbDeltaText: "#7ec6e4",
  orbText: "#ffffff",
  orbTextMuted: "#999ea3",
  flameTip: "#ff8a52",
  flameBody: "#ff6538",
  flameEdge: "#ee4e33",
  flameCoreTop: "#ffc56e",
  flameCoreBottom: "#ff9862",
};

// Light palette: iOS's grouped surfaces (a #F2F2F7 ground under white cards, no hairline, no shadow) and its light
// system colours. The labels are iOS's: black, and the 60 % grey for secondary text (3.4:1 on white, as on an iPhone);
// words in red, orange and the warning amber take iOS's increased-contrast variants so they stay readable.
export const LIGHT: Tokens = {
  ...DARK,
  backgroundTop: "#f2f2f7",
  backgroundMid: "#f2f2f7",
  background: "#f2f2f7",
  groundHealthspan: "#f2f2f7",
  foreground: "#000000",
  // rgba(60,60,67,0.6) composited on white.
  foregroundSecondary: "#8a8a8e",
  card: "#ffffff",
  cardTop: "#ffffff",
  cardHover: "#ececf0",
  cardForeground: "#000000",
  popover: "#ffffff",
  popoverTop: "#ffffff",
  popoverForeground: "#000000",
  primary: "#007aff",
  primaryForeground: "#ffffff",
  primaryInk: "#007aff",
  ctaFrom: "#007aff",
  ctaTo: "#007aff",
  ctaSheen: "rgba(255,255,255,0)",
  secondary: "#f2f2f7",
  secondaryForeground: "#000000",
  muted: "#f2f2f7",
  mutedForeground: "#8a8a8e",
  accent: "#e5e5ea",
  accentForeground: "#000000",
  inset: "#f2f2f7",
  sheet: "#f2f2f7",
  sheetBottom: "#f2f2f7",
  field: "#f2f2f7",
  destructive: "#ff3b30",
  // The separator, rgba(60,60,67,0.18).
  border: "rgba(60,60,67,0.18)",
  input: "rgba(60,60,67,0.29)",
  ring: "#000000",
  recoveryGreen: "#34c759",
  recoveryYellow: "#ffcc00",
  recoveryRed: "#ff3b30",
  recoveryRedText: "#d70015",
  strain: "#ff9500",
  strainText: "#c93400",
  strainDeep: "#c93400",
  sleep: "#5856d6",
  sleepDeep: "#3634a3",
  heart: "#ff2d55",
  body: "#30b0c7",
  optimal: "#34c759",
  warning: "#b25000",
  recoveryBlue: "#007aff",
  stressLow: "#32ade6",
  stressMedium: "#af52de",
  stressHigh: "#ff9500",
  coach: "#af52de",
  insightFrom: "#e8e7f9",
  insightTo: "#dbecff",
  bannerFrom: "#e8e7f9",
  bannerTo: "#dbecff",
  outlookFrom: "#fff0db",
  outlookTo: "#dbecff",
  dialTrack: "#e5e5ea",
  dialTarget: "#aeaeb2",
  chartGrid: "rgba(60,60,67,0.1)",
  chartBand: "rgba(60,60,67,0.05)",
  chartCursor: "rgba(60,60,67,0.35)",
  chart1: "#ff9500",
  chart2: "#34c759",
  chart3: "#5856d6",
  chart4: "#ffcc00",
  chart5: "#007aff",
  stageAwake: "#ff9f7a",
  stageRem: "#5ac8fa",
  stageLight: "#3478f6",
  stageDeep: "#5e5ce6",
  energyActive: "#ff9500",
  energyResting: "#c7c7cc",
  patternHatch: "rgba(60,60,67,0.1)",
  glassTop: "rgba(255,255,255,0.62)",
  glassBottom: "rgba(255,255,255,0.72)",
  glassEdge: "rgba(255,255,255,0.9)",
  glassRim: "rgba(60,60,67,0.08)",
  glassLens: "rgba(60,60,67,0.05)",
  glassActionTop: "rgba(0,122,255,0.92)",
  glassActionBottom: "rgba(0,122,255,0.96)",
  glassSolidTop: "#ffffff",
  glassSolidBottom: "#ffffff",
  glassActionSolidTop: "#007aff",
  glassActionSolidBottom: "#007aff",
  actionRimFrom: "#007aff",
  actionRimTo: "#5856d6",
  actionFace: "#007aff",
  dim: "rgba(0,0,0,0.3)",
  dimStrong: "rgba(0,0,0,0.45)",
  cardEdge: "rgba(255,255,255,0)",
  cardBorder: "rgba(0,0,0,0)",
  sheetEdge: "rgba(60,60,67,0.06)",
  selection: "rgba(0,122,255,0.25)",
  orbGreen: "#23a865",
  orbTeal: "#1f9e8a",
  orbCyan: "#3d9cb3",
  orbBlue: "#3e6fae",
  orbBlue2: "#4373b0",
  orbOlive: "#5a7a3c",
  orbOrange: "#cc7125",
  orbAmber: "#bb7418",
  orbRust: "#b8521f",
  orbRed: "#c2362a",
  orbEmpty: "#9aa3aa",
  orbCore: "#f8fafb",
  orbHighlight: "#101518",
  orbDeltaText: "#2a7fa6",
  orbText: "#101518",
  orbTextMuted: "#646e75",
};

export type Scheme = "dark" | "light";
export const TOKENS: Record<Scheme, Tokens> = { dark: DARK, light: LIGHT };

/**
 * Gradient pairs (top → bottom unless noted), as `[from, to]` tuples. Kept for callers outside the kit: the kit itself
 * paints flat solids (cards, ground, sheets, chrome), so no repeated surface pays for a gradient draw.
 */
export function gradients(c: Tokens) {
  return {
    /** The opaque card material (spec §2.6): a 2-4 % top light over the card colour. */
    card: [c.cardTop, c.card] as const,
    /** The page ground: top → mid at 270 px → bottom at 740 px (locations are given separately). */
    ground: [c.backgroundTop, c.backgroundMid, c.background] as const,
    groundLocations: [0, 270 / 740, 1] as const,
    /** Glass chrome (tab bar, floating action). */
    glass: [c.glassTop, c.glassBottom] as const,
    glassSolid: [c.glassSolidTop, c.glassSolidBottom] as const,
    glassAction: [c.glassActionTop, c.glassActionBottom] as const,
    glassActionSolid: [c.glassActionSolidTop, c.glassActionSolidBottom] as const,
    /** The round action's indigo-to-blue rim (135°). */
    actionRim: [c.actionRimFrom, c.actionRimTo] as const,
    /** Sheets: opaque dark gradient with a lit top edge. */
    sheet: [c.sheet, c.sheetBottom] as const,
    popover: [c.popoverTop, c.popover] as const,
    /** Horizontal (left → right). */
    insight: [c.insightFrom, c.insightTo] as const,
    banner: [c.bannerFrom, c.bannerTo] as const,
    outlook: [c.outlookFrom, c.outlookTo] as const,
  };
}
export type Gradients = ReturnType<typeof gradients>;

/** Radius scale, iOS's: chips 8, a segmented control 9, buttons 12, grouped lists 16, content cards 20, sheets 38. */
export const RADIUS = { sm: 4, md: 8, lg: 9, xl: 12, "2xl": 16, "3xl": 20, "4xl": 38 } as const;

/**
 * Motion (spec §2.7): fast 150, base 220, overlay 320 / 200. `fill` is the dials' and meters' sweep (and the count-up
 * that runs with it); `stagger` spaces cascading cards. Curves and the helpers built on these live in src/ui/motion.
 */
export const MOTION = { fast: 150, base: 220, overlayIn: 320, overlayOut: 200, fill: 700, stagger: 40 } as const;
