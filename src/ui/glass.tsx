// Liquid Glass (modules/halo-glass): chrome that floats over the content and bends it like a lens, Apple's iOS 26
// material on Android. A glass reads its backdrop from a GlassTarget: wrap the scrolling content in one and pass the
// floating chrome (a tab bar, a header's round buttons) as its `overlay`; every LiquidGlass in the overlay then
// refracts what scrolls under it, live, with no copy of the screen. Glass never sits inside the target it reads, so
// glass inside the content (or with no GlassTarget above it) draws the stand-in instead: a translucent fill of the
// tint with the same lit rim, opaque enough for text on it. Nested targets work: a screen can wrap its scroll view
// in its own GlassTarget (its header as the overlay) inside the tabs' one.
//
// Cost (the reason the old glass was removed): on Android 13+ each glass is one small extra layer the RenderThread
// fills with the content under it and runs a blur and one shader pass over, on frames the screen draws anyway (none
// while nothing moves). Keep glass to small chrome: the tab bar, round buttons, pills, a segmented control's thumb.
// Android 12 gets a plain blur; older phones and anything off the GPU get the stand-in.
import * as React from "react";
import { findNodeHandle, processColor, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { NativeGlassTarget, NativeGlassView } from "../../modules/halo-glass";
import { alpha } from "@/lib/utils";
import { useTheme } from "@/ui/ThemeProvider";

/** A preset ("light", "dark", "clear": nearly no frost) or any colour (its own alpha, times `frost`). */
export type GlassTint = "light" | "dark" | "clear" | (string & {});

const PRESETS: Record<"light" | "dark" | "clear", { color: string; frost: number }> = {
  light: { color: "#fafafc", frost: 0.55 },
  dark: { color: "#1e1e22", frost: 0.6 },
  clear: { color: "#ffffff", frost: 0.1 },
};

const isPreset = (t: GlassTint): t is keyof typeof PRESETS => t === "light" || t === "dark" || t === "clear";

/** The soft lift under glass (outside it only: React Native clips a box shadow out of the box). */
const SHADOW = {
  light: "0 6px 22px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)",
  dark: "0 8px 26px rgba(0,0,0,0.5)",
};

/** The stand-in's least opacity when there is no live backdrop (mirrors HaloGlassView's). */
const STAND_IN = 0.88;

/** The react tag of the target glass here refracts; null inside a target's content or outside any target. */
const Backdrop = React.createContext<number | null>(null);

/** The tag of the GlassTarget that glass at this point refracts, or null where glass draws its stand-in. */
export function useGlassBackdrop(): number | null {
  return React.useContext(Backdrop);
}

export type GlassTargetProps = {
  /** The box holding the content and the overlay. Default `{ flex: 1 }`. */
  style?: StyleProp<ViewStyle>;
  /** What scrolls under the glass. */
  children?: React.ReactNode;
  /** The floating chrome drawn over the content, after it: every LiquidGlass in here refracts the content. Position it yourself (absolute). */
  overlay?: React.ReactNode;
};

/**
 * The backdrop for glass: records `children` once per redraw (the capture expo-blur's BlurTargetView uses) and hands
 * it to the LiquidGlass views in `overlay`. Costs nothing extra on its own. The overlay draws after the content, which
 * keeps the GPU's redraw for the shared recording confined to the glass.
 */
export function GlassTarget({ style, children, overlay }: GlassTargetProps) {
  const [id, setId] = React.useState<number | null>(null);
  const ref = React.useCallback((node: unknown) => {
    setId(node ? findNodeHandle(node as React.Component) : null);
  }, []);
  const Target = NativeGlassTarget;
  // collapsable={false}: a real React Native view holds the content, so its z-order and clipping stay React Native's.
  const content = (
    <View style={styles.fill} collapsable={false}>
      {children}
    </View>
  );
  return (
    <View style={style ?? styles.fill}>
      <Backdrop.Provider value={null}>
        {Target ? (
          <Target ref={ref} style={styles.fill}>
            {content}
          </Target>
        ) : (
          content
        )}
      </Backdrop.Provider>
      {overlay != null && <Backdrop.Provider value={id}>{overlay}</Backdrop.Provider>}
    </View>
  );
}

export type LiquidGlassProps = {
  /** Corner radius (dp); omit for a capsule (half the short side). */
  cornerRadius?: number;
  /** Default: "light" or "dark" with the theme. */
  tint?: GlassTint;
  /** The lens: 0 flat, 1 full (the rim pulls the backdrop in by 30 % of the short side). Default 1. */
  refraction?: number;
  /** The blur under the lens, dp (RenderEffect radius). Default 5. */
  blurRadius?: number;
  /** The tint's opacity over the backdrop, 0–1, for legibility. Default: the preset's (0.55 light, 0.6 dark). */
  frost?: number;
  /** Colour saturation of the backdrop. Default 1.8. */
  saturation?: number;
  /** False draws tint and rim only, no live backdrop: for glass on glass (a selection drop). Default true. */
  backdrop?: boolean;
  /** The soft shadow: true (default) for the glass one, false for none, or a boxShadow string. */
  shadow?: boolean | string;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/** A piece of Liquid Glass: the material under `children`, filling the box `style` gives it. */
export function LiquidGlass({
  cornerRadius,
  tint,
  refraction = 1,
  blurRadius = 5,
  frost,
  saturation = 1.8,
  backdrop = true,
  shadow = true,
  pointerEvents,
  style,
  children,
}: LiquidGlassProps) {
  const { scheme } = useTheme();
  const target = React.useContext(Backdrop);
  const t = tint ?? (scheme === "dark" ? "dark" : "light");
  const preset = isPreset(t) ? PRESETS[t] : null;
  const color = preset ? preset.color : t;
  const amount = frost ?? preset?.frost ?? 1;
  const dark = t === "dark" || (t !== "light" && scheme === "dark");
  const tintColor = React.useMemo(() => (processColor(color) as number | null | undefined) ?? 0, [color]);
  const radius = cornerRadius ?? 9999;
  const lift = shadow === true ? SHADOW[dark ? "dark" : "light"] : shadow || undefined;
  const Glass = NativeGlassView;
  return (
    <View pointerEvents={pointerEvents} style={[{ borderRadius: radius }, lift ? { boxShadow: lift } : null, style]}>
      {Glass ? (
        <Glass
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          targetId={backdrop ? target : null}
          cornerRadius={cornerRadius ?? -1}
          tintColor={tintColor}
          frost={amount}
          refraction={refraction}
          blurRadius={blurRadius}
          saturation={saturation}
          dark={dark}
          backdrop={backdrop}
        />
      ) : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: alpha(color, backdrop ? Math.max(amount, STAND_IN) : amount) }]} />
      )}
      {children}
    </View>
  );
}

/**
 * The material, filling its parent (first inside a rounded box, e.g. a round header button). Live glass in a
 * GlassTarget's overlay; elsewhere the stand-in. `strength` scales the lens (0–1); `radius` defaults to a capsule.
 */
export function GlassMaterial({ strength = 1, radius, tint, shadow = true }: { strength?: number; radius?: number; tint?: GlassTint; shadow?: boolean | string }) {
  return <LiquidGlass pointerEvents="none" style={StyleSheet.absoluteFill} cornerRadius={radius} tint={tint} refraction={strength} blurRadius={2} shadow={shadow} />;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
