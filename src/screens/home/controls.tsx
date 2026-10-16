// Home's shared parts, in the Apple Health look: the card every section uses (a flat card with Health's category head:
// the family's glyph and title in its system colour, a link or pill on the right, a grey sentence under it, then the
// body, and iOS list rows at its foot), the progress pill, a number over its caps label, an inline number inside a
// sentence, a week as rounded bars, the tinted capsule button at a card's foot, the "Edit" link, the outlook card and
// the info trigger that opens an InfoDialog. Every press settles and dims on the UI thread (press.tsx).
import * as React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Check, Moon, Sun, type LucideIcon } from "lucide-react-native";
import type { HomeVM } from "@/queries";
import { formatDay } from "@/lib/format";
import { alpha, mix } from "@/lib/utils";
import { InfoDialog, Txt, type InfoContent } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { Caption, CHEVRON, ChevronSlot, iconRadius, Num, OnCard, onBand, useSoftFill } from "@/ui/components/calmKit";
import { CalmSurface, PillAction } from "@/ui/components/CalmSurface";
import { usePress, usePressStyle } from "@/ui/components/press";
import { TileRow } from "@/ui/components/TileRow";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";

const PressableView = Animated.createAnimatedComponent(Pressable);

/** Owns an InfoDialog's open state for a custom trigger (the web's InfoCardTrigger). */
export function useInfo(info: InfoContent) {
  const [open, setOpen] = React.useState(false);
  return { show: () => setOpen(true), dialog: <InfoDialog open={open} onClose={() => setOpen(false)} {...info} /> };
}

// ── Icons ────────────────────────────────────────────────────────────────────

/**
 * An icon square, iOS's: rounded at a quarter of its size, the glyph about half its size. Callers pass the colours:
 * a solid system colour with a white glyph in lists, a soft fill with the colour's glyph on a card.
 */
export function HeadTile({ icon: Icon, color, bg, size = 44 }: { icon: LucideIcon; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: iconRadius(size), backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon size={Math.round(size * 0.56)} color={color} strokeWidth={2} />
    </View>
  );
}

/** A list row's icon square, iOS Settings' 29 px: the family's system colour with a white glyph. */
export function RowIcon({ icon, tint, size = 29 }: { icon: LucideIcon; tint: CalmTint; size?: number }) {
  const c = useCalm();
  return <HeadTile icon={icon} color="#ffffff" bg={c.tintInk[tint]} size={size} />;
}

// ── The card ─────────────────────────────────────────────────────────────────

/** A tinted card's wash: its family's soft fill at the top left melting into the card colour, as Health's coach cards. */
function TintWash({ tint }: { tint: CalmTint }) {
  const c = useCalm();
  return <LinearGradient pointerEvents="none" colors={[c.tint[tint], c.card]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />;
}

export type HomeCardProps = {
  /** A soft wash of the family's colour behind the card (the outlook, an alert); none for a plain card. */
  tint?: CalmTint;
  icon: LucideIcon;
  /** The head's family on a plain card (default sky, iOS blue). */
  iconTint?: CalmTint;
  /** Kept for API compatibility: iOS cards carry no watermark. */
  watermark?: LucideIcon;
  title: string;
  /** The sentence under the head (a string, or a sentence with inline numbers). Never cut short. */
  subtitle?: React.ReactNode;
  subtitleColor?: string;
  /** Right of the head: a progress pill, a link, the info or expand buttons. */
  right?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Space between the head and each part of the body (default 14). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /**
   * Rows under the body (FootRow), each its own tap target: with a footer the head and body are one target and every
   * row another, side by side rather than nested, so a screen reader reaches them all.
   */
  footer?: React.ReactNode;
};

/** The card's head, Health's category line: the glyph and the title in the family's colour, the right-hand part. */
function CardHead({ icon: Icon, ink, title, subtitle, subtitleColor, right, chevron }: { icon: LucideIcon; ink: string; title: string; subtitle?: React.ReactNode; subtitleColor?: string; right?: React.ReactNode; chevron: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      {/* The part on the right (a 30-32 px pill or link) overhangs the title's line rather than growing it. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, minHeight: 22 }}>
        <Icon size={18} color={ink} strokeWidth={2.2} />
        <Txt size={16} lineHeight={21} weight={600} style={{ color: ink, flex: 1, minWidth: 0 }}>
          {title}
        </Txt>
        {right ? <View style={{ marginVertical: -6 }}>{right}</View> : chevron ? <ChevronSlot shown style={{ marginRight: -4 }} /> : null}
      </View>
      {typeof subtitle === "string" ? <Sentence color={subtitleColor}>{subtitle}</Sentence> : subtitle}
    </View>
  );
}

/**
 * A Home card in the Apple Health look: the flat card (20 px corners), Health's category head (the family's glyph and
 * title in its colour, a chevron when the card opens something, or the part on the right), the grey sentence under it,
 * then the body. A tinted card has its family's soft wash behind it. Everything inside knows it sits on a card.
 */
export function HomeCard({ tint, icon, iconTint, title, subtitle, subtitleColor, right, onPress, accessibilityLabel, gap = 14, style, children, footer }: HomeCardProps) {
  const c = useCalm();
  const ink = c.tintInk[tint ?? iconTint ?? "sky"];
  const head = <CardHead icon={icon} ink={ink} title={title} subtitle={subtitle} subtitleColor={subtitleColor} right={right} chevron={!!onPress} />;
  const wash = tint ? <TintWash tint={tint} /> : null;
  if (footer === undefined)
    return (
      <CalmSurface onPress={onPress} accessibilityLabel={onPress ? (accessibilityLabel ?? title) : undefined} padding={16} gap={gap} style={style}>
        {wash}
        <OnCard>
          {head}
          {children}
        </OnCard>
      </CalmSurface>
    );
  // The rows sit under the body, each its own target; the last ends 6 px above the card's edge.
  return (
    <CalmSurface padding={0} style={style}>
      {wash}
      <OnCard>
        <CardBody onPress={onPress} label={accessibilityLabel ?? title} gap={gap}>
          {head}
          {children}
        </CardBody>
        <View style={{ paddingBottom: 6 }}>{footer}</View>
      </OnCard>
    </CalmSurface>
  );
}

/** A card's head and body as one target over its foot rows: it settles and dims on its own while pressed. */
function CardBody({ onPress, label, gap, children }: { onPress?: () => void; label: string; gap: number; children: React.ReactNode }) {
  const press = usePress(0.985);
  const pressed = usePressStyle(press, { dim: 0.7 });
  const box = { padding: 16, paddingBottom: 12, gap };
  if (!onPress) return <View style={box}>{children}</View>;
  return (
    <PressableView onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={label} style={[box, pressed]}>
      {children}
    </PressableView>
  );
}

/** A foot row's band: its title (21) and its first line (2 + 18), the 29 px square and the chevron centred on it. */
const FOOT_BAND = 41;
const FOOT_ICON = 29;

/**
 * A row at a card's foot, iOS's list row (the Goals card's Activity and Weekly plan): a hairline inset to the text, the
 * family's 29 px icon square, the title with its lines under it, and the thin chevron when it opens something (its
 * column kept when it does not, so the rows' lines wrap at one width). The card's whole width is the row's tap target.
 */
export function FootRow({ icon, tint, title, onPress, accessibilityLabel, children }: { icon: LucideIcon; tint: CalmTint; title: string; onPress?: () => void; accessibilityLabel?: string; children?: React.ReactNode }) {
  const c = useCalm();
  const press = usePress(0.985);
  const pressed = usePressStyle(press, { dim: 0.6 });
  const band = children ? FOOT_BAND : FOOT_ICON;
  const content = (
    <>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 16 + FOOT_ICON + 12, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ marginTop: onBand(band, FOOT_ICON) }}>
          <RowIcon icon={icon} tint={tint} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: onBand(band, children ? FOOT_BAND : 21) }}>
          <Txt size={16} lineHeight={21} style={{ color: c.ink }}>
            {title}
          </Txt>
          {children}
        </View>
        <ChevronSlot shown={!!onPress} style={{ marginTop: onBand(band, CHEVRON.size) }} />
      </View>
    </>
  );
  const box = { paddingHorizontal: 16, paddingVertical: 12 };
  if (!onPress) return <View style={box}>{content}</View>;
  return (
    <PressableView onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} style={[box, pressed]}>
      {content}
    </PressableView>
  );
}

/** A card head's action, iOS's blue link with a chevron ("See all ›"). */
export function ActionPill({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  return <PillAction label={label} onPress={onPress} accessibilityLabel={accessibilityLabel} />;
}

/** "Edit", the blue text button beside a section's title (iOS's), opening its editor. */
export function EditLink({ label = "Edit", accessibilityLabel, onPress }: { label?: string; accessibilityLabel: string; onPress: () => void }) {
  const c = useCalm();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }} style={({ pressed }) => ({ opacity: pressed ? 0.45 : 1 })}>
      <Txt size={17} lineHeight={22} style={{ color: c.teal }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** A sentence: 15/20 in the secondary grey (iOS's subhead; at 600 in a colour when it carries a verdict). Inline numbers go in `NumSpan`. */
export function Sentence({ children, color, size = 15 }: { children: React.ReactNode; color?: string; size?: 13 | 14 | 15 }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={size + 5} weight={color ? 600 : 400} style={{ color: color ?? c.sub }}>
      {children}
    </Txt>
  );
}

/** A number inside a sentence: Inter bold with tabular figures in ink (or `color`), so "Started at 85% at 07:10" still reads as numbers. */
export function NumSpan({ children, color, size = 15 }: { children: React.ReactNode; color?: string; size?: number }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={size + 5} style={[font.numeric(600), { color: color ?? c.ink }]}>
      {children}
    </Txt>
  );
}

/** A number with its unit, then its caps label under it, for a row of two or three. */
export function Stat({ value, unit, label, color, size = 24 }: { value: string; unit?: string; label: string; color?: string; size?: number }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Num value={value} unit={unit} size={size} color={color} />
      <Caption numberOfLines={2} style={{ marginTop: 4 }}>
        {label}
      </Caption>
    </View>
  );
}

/**
 * A sheet's row (Goals, Weekly plan): its band is the name (21) and its caption's first line (2 + 18), with the 32 px
 * icon square centred on it; what hangs under the head starts in the name's column.
 */
export const LINE_BAND = 41;
export const LINE_TILE = 32;
export const LINE_INSET = LINE_TILE + 12;

/** A hairline between rows in a list, iOS's separator, inset past the rows' icon squares. */
export function RowRule({ inset = 56, color }: { inset?: number; color?: string }) {
  const c = useCalm();
  return <View style={{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: color ?? c.line }} />;
}

/**
 * "3 of 7 done" as a capsule beside a card's title: the counts in bold tabular figures, the words grey. Once every one
 * is done it turns green with a check.
 */
export function ProgressPill({ done, total, word }: { done: number; total: number; word: string }) {
  const c = useCalm();
  const quiet = useSoftFill();
  const all = total > 0 && done >= total;
  const ink = all ? c.tintInk.mint : c.ink;
  return (
    <View
      accessible
      accessibilityLabel={`${done} of ${total} ${word}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: all ? alpha(c.tintInk.mint, 0.16) : quiet, flexShrink: 0 }}
    >
      {all && <Check size={14} color={ink} strokeWidth={3} />}
      <Txt size={13} lineHeight={18} weight={600} style={{ color: all ? ink : c.sub }}>
        <Txt size={14} lineHeight={18} style={[font.numeric(700), { color: ink }]}>
          {String(done)}
        </Txt>
        {" of "}
        <Txt size={14} lineHeight={18} style={[font.numeric(700), { color: ink }]}>
          {String(total)}
        </Txt>
        {` ${word}`}
      </Txt>
    </View>
  );
}

/**
 * Two columns of tiles (never more on a phone: words stay whole): paired rows (TileRow), so the two tiles in a row
 * share their height and their names' height (TileLabel), and an odd last tile keeps its half.
 */
export function TwoUp<T>({ items, render, keyOf, gap = 10 }: { items: T[]; render: (it: T) => React.ReactNode; keyOf: (it: T) => string; gap?: number }) {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap }}>
      {rows.map((row) => (
        <TileRow key={keyOf(row[0])} gap={gap}>
          {row.map((it) => (
            <React.Fragment key={keyOf(it)}>{render(it)}</React.Fragment>
          ))}
          {row.length === 1 && <View key="half" />}
        </TileRow>
      ))}
    </View>
  );
}

/** The round check on a goal or target that is met: iOS green with a white tick. */
export function CheckBadge({ size = 24 }: { size?: number }) {
  const c = useCalm();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.tintInk.mint, alignItems: "center", justifyContent: "center" }}>
      <Check size={Math.round(size * 0.6)} color="#ffffff" strokeWidth={3} />
    </View>
  );
}

// ── The week as bars ─────────────────────────────────────────────────────────

/** `value`: the day's number, written over its bar when given ("45"). */
export type WeekColumn = { day: string; frac: number | null; met: boolean; value?: string | null };

/**
 * A week as rounded bars, Apple Health's: each a full capsule filled to its share in the family's colour (the colour
 * itself on a day that met its goal, its soft step on one that did not, a short stub on a day with nothing), the
 * weekday's letter under it; `current`'s letter in ink.
 */
export function WeekColumns({ cols, tint, height = 44, current, label }: { cols: WeekColumn[]; tint: CalmTint; height?: number; current: string; label: string }) {
  const c = useCalm();
  const dark = useTheme().scheme === "dark";
  const ink = c.tintInk[tint];
  const soft = mix(ink, c.card, dark ? 0.42 : 0.32);
  const bar = 12;
  return (
    <View accessible accessibilityLabel={label}>
      {cols.some((b) => b.value != null) && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
          {cols.map((b) => (
            <Txt key={b.day} size={11} lineHeight={14} align="center" style={[font.numeric(600), { flex: 1, color: b.met ? ink : c.sub }]}>
              {b.value ?? " "}
            </Txt>
          ))}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8, height, alignItems: "flex-end" }}>
        {cols.map((b) => (
          <View key={b.day} style={{ flex: 1, height, alignItems: "center", justifyContent: "flex-end" }}>
            <View
              style={{
                width: bar,
                height: b.frac !== null && b.frac > 0 ? Math.max(bar, Math.round(b.frac * height)) : 3,
                borderRadius: bar / 2,
                backgroundColor: b.frac !== null && b.frac > 0 ? (b.met ? ink : soft) : c.fill,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
        {cols.map((b) => (
          <Txt key={b.day} size={11} lineHeight={14} weight={600} align="center" style={{ flex: 1, color: b.day === current ? c.ink : c.sub }}>
            {formatDay(b.day, { weekday: "narrow" })}
          </Txt>
        ))}
      </View>
    </View>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────

/**
 * The tinted capsule button at a card's foot ("+ Add activity", "Live workout", "Set goals"), iOS's: blue at 15 % with
 * the blue icon and label, 44 px tall. It settles and dims while pressed (UI thread); the label wraps rather than cut.
 */
export function CardButton({ icon: Icon, label, onPress, style }: { icon: LucideIcon; label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const press = usePress();
  const pressed = usePressStyle(press, { dim: 0.6 });
  return (
    <PressableView
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, backgroundColor: alpha(c.teal, 0.14) }, style, pressed]}
    >
      <Icon size={18} color={c.teal} strokeWidth={2.2} />
      <Txt size={15} lineHeight={20} weight={600} style={{ color: c.teal, flexShrink: 1 }}>
        {label}
      </Txt>
    </PressableView>
  );
}

// ── The day's outlook ────────────────────────────────────────────────────────

/**
 * "Your daily outlook" before 17:00, "Your day in review" after it and on past days (spec §7.1 7a): a card with the
 * yellow family's soft wash, the Sun (or the Moon) and the title in its colour, the summary in full, and "Details" for
 * the same words in a dialog.
 */
export function DayBanner({ outlook }: { outlook: NonNullable<HomeVM["outlook"]> }) {
  const c = useCalm();
  const review = outlook.kind === "review";
  const Icon = review ? Moon : Sun;
  const info = useInfo({ title: outlook.title, icon: <Icon size={28} color={c.tintInk.sand} strokeWidth={1.75} />, body: outlook.body });
  return (
    <>
      <HomeCard tint="sand" icon={Icon} title={outlook.title} right={<PillAction label="Details" onPress={info.show} />} onPress={info.show} accessibilityLabel={`${outlook.title}. ${outlook.body}`} gap={8}>
        <Txt size={15} lineHeight={21} style={{ color: c.ink }}>
          {outlook.body}
        </Txt>
      </HomeCard>
      {info.dialog}
    </>
  );
}
