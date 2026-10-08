import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useTheme } from "@/ui/ThemeProvider";
import type { Tokens } from "@/ui/theme";
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher";
import { DetailHeader, type DetailHeaderProps } from "./DetailHeader";
import type { InfoContent } from "./InfoButton";
import { useAfterTransition } from "./AfterTransition";
import { dialGlow, Glow, GLOW_SCHEME } from "./Glow";
import { useBottomClearance } from "./PageShell";
import { ScoreDial, type ScoreDialProps } from "./ScoreDial";

export type DetailShellProps = {
  title: string;
  subtitle?: string;
  info?: InfoContent;
  /** Back; a tab root (Sleep, Activity) has none and shows `lead` (the avatar) in its place. */
  onBack?: () => void;
  lead?: React.ReactNode;
  /** `placement: "header"` makes the date the header title (Recovery, Strain, Sleep); else the bare row sits under the header. */
  dateSwitcher?: DateSwitcherProps;
  dismiss?: DetailHeaderProps["dismiss"];
  /** Left-aligned header with an icon before the title (Activity, spec §7.4). */
  align?: DetailHeaderProps["align"];
  titleIcon?: React.ReactNode;
  /** The header's right side in place of the info button. */
  action?: React.ReactNode;
  /** Page ground (spec §2.1): Healthspan is the darker flat ground. */
  ground?: "default" | "healthspan";
  hero?: React.ReactNode;
  /**
   * The soft glow behind the hero, in this colour (dark theme only). Default: a Sleep, Recovery or Strain `ScoreDial`
   * hero with a score glows in the score's colour; anything else has none. `null` turns it off.
   */
  heroGlow?: string | null;
  summary?: React.ReactNode;
  /** The speech-bubble pointer on the summary card, aimed at the dial above it. Recovery, Strain and Sleep. */
  notch?: boolean;
  insight?: React.ReactNode;
  primary?: React.ReactNode;
  secondary?: React.ReactNode[];
  footer?: React.ReactNode;
  /** A banner above the content (ConnectionBanner). */
  banner?: React.ReactNode;
  /** Bottom padding under the content (default: useBottomClearance("detail")). */
  bottomInset?: number;
  contentStyle?: StyleProp<ViewStyle>;
  /** With the keyboard open, the room kept under the focused field's caret (KEYBOARD_GAP); more shows a button under it. */
  keyboardOffset?: number;
};

/** Under a focused field, above the keyboard: room for a line or two of hint or error under it, and some air. */
export const KEYBOARD_GAP = 64;

/** How far the hero's glow reaches above and below the hero (its box grows by this, its layout does not). */
const HERO_BLEED = 24;

/** A hero's default glow: the colour of a Sleep, Recovery or Strain `ScoreDial` hero with a score, else null. */
export function heroGlow(c: Tokens, hero: React.ReactNode): string | null {
  if (!React.isValidElement(hero) || hero.type !== ScoreDial) return null;
  const p = hero.props as ScoreDialProps;
  return p.loading ? null : dialGlow(c, p.variant, p.value);
}

/**
 * The hero row: full-bleed and clipped to the screen's width, the hero centred. A lit hero sits on a soft pool of its
 * colour (Glow), whose box reaches HERO_BLEED past the hero above and below so the pool fades out before the clip.
 */
export function HeroSlot({ hero, glow }: { hero: React.ReactNode; glow?: string | null }) {
  const { c, scheme } = useTheme();
  const color = glow === undefined ? heroGlow(c, hero) : glow;
  const lit = !!color && GLOW_SCHEME[scheme] > 0;
  return (
    <View style={[{ alignItems: "center", marginHorizontal: -16, paddingHorizontal: 16, overflow: "hidden" }, lit && { marginVertical: -HERO_BLEED, paddingVertical: HERO_BLEED }]}>
      {lit && <Glow color={color} />}
      {hero}
    </View>
  );
}

/** Detail screens (spec §4.6): one dial, one number, then everything that explains it. */
export function DetailShell({ title, subtitle, info, onBack, dateSwitcher, dismiss, align, titleIcon, action, ground, hero, heroGlow: glow, summary, notch, insight, primary, secondary, footer, banner, bottomInset, contentStyle, keyboardOffset = KEYBOARD_GAP }: DetailShellProps) {
  const { c } = useTheme();
  const side = summary ?? (hero ? insight : null);
  const inHeader = dateSwitcher?.placement === "header";
  // The slide runs over the hero and its summary alone; everything under them mounts once the screen has opened.
  const opened = useAfterTransition();
  const below = opened || !hero;
  const clearance = useBottomClearance("detail");
  return (
    // The root's own fill is the ground (solid): no second full-screen layer.
    <View style={{ flex: 1, backgroundColor: ground === "healthspan" ? c.groundHealthspan : c.background }}>
      <DetailHeader title={title} subtitle={subtitle} info={info} onBack={onBack} dismiss={dismiss} align={align} titleIcon={titleIcon} action={action} ground={ground} dateTitle={inHeader ? dateSwitcher : undefined} />
      {/* Keyboard-aware (react-native-keyboard-controller): a focused field scrolls clear of the keyboard, with room under
          it to scroll the rest of the page past; a tap outside a field and its buttons closes the keyboard. */}
      <KeyboardAwareScrollView
        bottomOffset={keyboardOffset}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset ?? clearance }, contentStyle]}
        contentInsetAdjustmentBehavior="never"
      >
        {banner && <View style={{ marginBottom: 16 }}>{banner}</View>}
        {dateSwitcher && !inHeader && (
          // The Calm white date pill, centred over the page (spec §11 F15).
          <View style={{ marginBottom: 24, alignItems: "center" }}>
            <DateSwitcher {...dateSwitcher} placement="header" />
          </View>
        )}
        <View style={{ gap: 32 }}>
          {(hero || side) && (
            <View style={{ gap: 24 }}>
              {hero && <HeroSlot hero={hero} glow={glow} />}
              {side && (
                <View>
                  {/* Calm: no notch; the hero is a card of its own. */}
                  {side}
                </View>
              )}
            </View>
          )}
          {below && (summary || !hero) && insight}
          {below && primary}
          {opened && secondary && secondary.length > 0 && (
            <View style={{ gap: 12 }}>
              {secondary.map((s, i) => (
                <React.Fragment key={i}>{s}</React.Fragment>
              ))}
            </View>
          )}
          {opened && footer}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
