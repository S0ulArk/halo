// Theme tokens ("Pulse 2: calm data"). Dark is the default. Every colour is a hex or rgba string RN can paint with;
// `alpha()` in src/lib/utils.ts derives the `/8`, `/15`, `/50` variants. Surfaces are flat solids (no gradients, no
// shadows): a card is `card` held by a 1 px `border` hairline. Colour carries meaning: recovery bands emerald / amber /
// rose, strain a warm orange, sleep a violet-indigo; the chrome stays neutral with a calm blue primary.


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
  /** Body measurements and nutrition: amber. */
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

// Dark palette (Oct 2026, "calm data" pass): a near-black ground for AMOLED panels, solid cards (#101419) lifted a few
// percent off it and held by a 1 px hairline, and softer data hues: emerald / amber / rose bands, an orange strain and
// a violet sleep, every text token at 4.5:1 or more on a card and on the inset.
export const DARK: Tokens = {
  // Ground: one solid near-black (`background`); the top / mid tones remain for callers that still read them.
  backgroundTop: "#0a0e12",
  backgroundMid: "#06080b",
  background: "#040609",
  groundHealthspan: "#040609",
  foreground: "#ffffff",
  // Cool greys to sit with the blue-black ground (9.9:1 and 6.6:1 on a card).
  foregroundSecondary: "#b8bec4",
  // Surfaces, darkest to lightest: ground < inset < card < sheet < muted < popover < field < secondary < accent.
  card: "#101419",
  cardTop: "#13181e",
  cardHover: "#192028",
  cardForeground: "#ffffff",
  popover: "#181f26",
  popoverTop: "#1e262e",
  popoverForeground: "#ffffff",
  primary: "#60a5fa",
  primaryForeground: "#05070a",
  primaryInk: "#60a5fa",
  ctaFrom: "#60a5fa",
  ctaTo: "#60a5fa",
  ctaSheen: "rgba(255,255,255,0)",
  secondary: "#232c34",
  secondaryForeground: "#ffffff",
  muted: "#151a20",
  mutedForeground: "#949ba2",
  accent: "#2b343b",
  accentForeground: "#ffffff",
  inset: "#090d10",
  sheet: "#11161b",
  sheetBottom: "#0b0f12",
  field: "#1e252b",
  destructive: "#ff0026",
  border: "rgba(255,255,255,0.08)",
  input: "rgba(255,255,255,0.14)",
  ring: "#ffffff",
  recoveryGreen: "#34d399",
  recoveryYellow: "#fbbf24",
  recoveryRed: "#fb7185",
  recoveryRedText: "#fc8b9b",
  strain: "#ff9a3c",
  strainText: "#ffa552",
  strainDeep: "#c75f12",
  sleep: "#9b8cff",
  sleepDeep: "#5546c4",
  heart: "#ff6b7f",
  body: "#2dd4bf",
  optimal: "#34d399",
  warning: "#f6b93b",
  recoveryBlue: "#67aee6",
  stressLow: "#67aee6",
  stressMedium: "#34d399",
  stressHigh: "#f6b93b",
  coach: "#7095fe",
  // The insight hairline: a luminous indigo into a teal-blue, so 1 px reads on near-black.
  insightFrom: "#6b5cf0",
  insightTo: "#2a86b0",
  bannerFrom: "#29245c",
  bannerTo: "#163246",
  outlookFrom: "#5a4934",
  outlookTo: "#1f3a4e",
  // Tracks and grids: visible on the ground (1.3:1) and on a card (1.2:1), never louder than the data.
  dialTrack: "#1f272d",
  dialTarget: "#4b5359",
  chartGrid: "rgba(255,255,255,0.07)",
  chartBand: "rgba(255,255,255,0.045)",
  chartCursor: "rgba(255,255,255,0.4)",
  chart1: "#ff9a3c",
  chart2: "#34d399",
  chart3: "#9b8cff",
  chart4: "#f6b93b",
  chart5: "#67aee6",
  stageAwake: "#f48fb1",
  stageRem: "#a8dcff",
  stageLight: "#7fa8f5",
  stageDeep: "#9370db",
  energyActive: "#ff9a3c",
  energyResting: "#b9c3cc",
  patternHatch: "rgba(255,255,255,0.08)",
  // Glass chrome: smoked near-black, a lit top edge and a faint rim.
  glassTop: "rgba(18,23,28,0.82)",
  glassBottom: "rgba(11,14,18,0.9)",
  glassEdge: "rgba(255,255,255,0.1)",
  glassRim: "rgba(255,255,255,0.07)",
  glassLens: "rgba(255,255,255,0.07)",
  glassActionTop: "rgba(24,28,44,0.84)",
  glassActionBottom: "rgba(18,22,38,0.92)",
  glassSolidTop: "#101419",
  glassSolidBottom: "#101419",
  glassActionSolidTop: "#161928",
  glassActionSolidBottom: "#101422",
  actionRimFrom: "#8a7dff",
  actionRimTo: "#3fa0ff",
  actionFace: "#151a2b",
  dim: "rgba(0,0,0,0.65)",
  dimStrong: "rgba(0,0,0,0.85)",
  cardEdge: "rgba(255,255,255,0.07)",
  cardBorder: "rgba(255,255,255,0.05)",
  sheetEdge: "rgba(255,255,255,0.12)",
  selection: "rgba(255,255,255,0.25)",
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

export const LIGHT: Tokens = {
  ...DARK,
  backgroundTop: "#f2f2f0",
  backgroundMid: "#f2f2f0",
  background: "#f2f2f0",
  groundHealthspan: "#f2f2f0",
  foreground: "#101518",
  foregroundSecondary: "#49535a",
  card: "#ffffff",
  cardTop: "#ffffff",
  cardHover: "#f1f3f6",
  cardForeground: "#101518",
  popover: "#ffffff",
  popoverTop: "#ffffff",
  popoverForeground: "#101518",
  primary: "#2563eb",
  primaryForeground: "#ffffff",
  // 5.2:1 on white: the same blue paints glyphs and fills.
  primaryInk: "#215cda",
  // Flat primary, as on dark.
  ctaFrom: "#2563eb",
  ctaTo: "#2563eb",
  ctaSheen: "rgba(255,255,255,0)",
  secondary: "#e4e8eb",
  secondaryForeground: "#101518",
  muted: "#eef1f4",
  mutedForeground: "#5d656c",
  accent: "#dde2e6",
  accentForeground: "#101518",
  inset: "#f3f5f8",
  sheet: "#ffffff",
  sheetBottom: "#f6f8f9",
  field: "#edf0f2",
  border: "rgba(16,21,24,0.1)",
  input: "rgba(16,21,24,0.16)",
  ring: "#101518",
  recoveryGreen: "#027051",
  recoveryYellow: "#865800",
  recoveryRed: "#e11d48",
  recoveryRedText: "#be123c",
  strain: "#e2741a",
  strainText: "#a5460a",
  strainDeep: "#b5520c",
  sleep: "#5b4bd6",
  sleepDeep: "#4436a8",
  // Accents at least 3:1 on a white card (non-text contrast); data text tokens 4.5:1 on the card, the ground and the inset.
  heart: "#e0566a",
  body: "#0d9488",
  optimal: "#027051",
  warning: "#865800",
  recoveryBlue: "#3f92d3",
  stressLow: "#3f92d3",
  stressMedium: "#047857",
  stressHigh: "#986400",
  coach: "#3e5ac8",
  insightFrom: "#e6e2fb",
  insightTo: "#dceef7",
  bannerFrom: "#e9e8f7",
  bannerTo: "#e3ecf3",
  outlookFrom: "#f3ebdf",
  outlookTo: "#e2ebf2",
  dialTrack: "#e2e6e9",
  dialTarget: "#b3bbc1",
  chartGrid: "rgba(16,21,24,0.08)",
  chartBand: "rgba(16,21,24,0.04)",
  chartCursor: "rgba(16,21,24,0.35)",
  chart1: "#e2741a",
  chart2: "#059669",
  chart3: "#5b4bd6",
  chart4: "#986400",
  chart5: "#3f92d3",
  stageAwake: "#d9577f",
  stageRem: "#3a9fd8",
  stageLight: "#4f7fe0",
  stageDeep: "#6a48b8",
  energyActive: "#e2741a",
  energyResting: "#c9d1d8",
  patternHatch: "rgba(16,21,24,0.08)",
  glassTop: "rgba(255,255,255,0.82)",
  glassBottom: "rgba(246,248,249,0.9)",
  glassEdge: "rgba(255,255,255,0.9)",
  glassRim: "rgba(16,21,24,0.06)",
  glassLens: "rgba(16,21,24,0.05)",
  glassActionTop: "rgba(240,241,252,0.9)",
  glassActionBottom: "rgba(230,233,248,0.94)",
  glassSolidTop: "#ffffff",
  glassSolidBottom: "#ffffff",
  glassActionSolidTop: "#f0f1fc",
  glassActionSolidBottom: "#e6e9f8",
  actionRimFrom: "#7778dd",
  actionRimTo: "#4c94db",
  actionFace: "#eef0fb",
  dim: "rgba(16,21,24,0.45)",
  dimStrong: "rgba(16,21,24,0.7)",
  cardEdge: "rgba(255,255,255,0)",
  cardBorder: "rgba(16,21,24,0.05)",
  sheetEdge: "rgba(16,21,24,0.06)",
  selection: "rgba(16,21,24,0.16)",
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

/** Radius scale (spec §2.4): chips 8, rows 10, buttons 12, cards 16, info card 24, sheets 28. */
export const RADIUS = { sm: 4, md: 8, lg: 10, xl: 12, "2xl": 16, "3xl": 24, "4xl": 28 } as const;

/**
 * Motion (spec §2.7): fast 150, base 220, overlay 320 / 200. `fill` is the dials' and meters' sweep (and the count-up
 * that runs with it); `stagger` spaces cascading cards. Curves and the helpers built on these live in src/ui/motion.
 */
export const MOTION = { fast: 150, base: 220, overlayIn: 320, overlayOut: 200, fill: 700, stagger: 40 } as const;
