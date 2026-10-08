// Home's shared Calm parts below the top cards (the style reference is calm.tsx): the card every section uses (a
// CalmSurface with its icon tile, title and sentence, and the rows at its foot), the progress pill, a number over its
// caps label, an inline number inside a sentence, the week as rounded pastel columns, the calm pill button at a card's
// foot, the round header buttons, My Day's "+" tile, the sand outlook card and the info trigger that opens an
// InfoDialog.
import * as React from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { Check, ChevronRight, Moon, Pencil, Plus, Sun, type LucideIcon } from "lucide-react-native";
import type { HomeVM } from "@/queries";
import { formatDay } from "@/lib/format";
import { alpha } from "@/lib/utils";
import { InfoDialog, Txt, usePress, type InfoContent } from "@/ui";
import { useCalm, type CalmTint } from "@/ui/calm";
import { Caption, ChevronSlot, Num, OnCard, onBand, useSoftFill, useSurface } from "@/ui/components/calmKit";
import { CalmSurface, PillAction } from "@/ui/components/CalmSurface";
import { TileRow } from "@/ui/components/TileRow";
import { font } from "@/ui/fonts";

/** Owns an InfoDialog's open state for a custom trigger (the web's InfoCardTrigger). */
export function useInfo(info: InfoContent) {
  const [open, setOpen] = React.useState(false);
  return { show: () => setOpen(true), dialog: <InfoDialog open={open} onClose={() => setOpen(false)} {...info} /> };
}

// ── The card ─────────────────────────────────────────────────────────────────

/** The icon tile at a card's or row's top left: a rounded square in a pastel with the icon in its ink. */
export function HeadTile({ icon: Icon, color, bg, size = 44 }: { icon: LucideIcon; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.32), backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon size={Math.round(size / 2)} color={color} strokeWidth={1.75} />
    </View>
  );
}

export type HomeCardProps = {
  /** The family's pastel (a diagonal wash with the icon as a big faint watermark); none for a white card. */
  tint?: CalmTint;
  icon: LucideIcon;
  /** A white card's icon tile pastel; default mint with the teal icon (calm.tsx's white cards). */
  iconTint?: CalmTint;
  /** The tinted card's watermark, when it is not the icon (the outlook's Sun or Moon). */
  watermark?: LucideIcon;
  title: string;
  /** The sentence under the title (a string, or a sentence with inline numbers). Never cut short. */
  subtitle?: React.ReactNode;
  subtitleColor?: string;
  /** Beside the title: a progress pill, a PillAction, the info or expand buttons. */
  right?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Space between the head and each part of the body (default 18). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /**
   * Rows under the body (FootRow), each its own tap target: with a footer the head and body are one target and every
   * row another, side by side rather than nested, so a screen reader reaches them all.
   */
  footer?: React.ReactNode;
};

/**
 * A Home card in the Calm style (calm.tsx's CalmCard): a CalmSurface (white, or the family's pastel with a watermark),
 * the icon tile, the title (17/22 600 ink) with its right-hand part, the sentence under it (14/19 grey), then the body.
 * A white card tells what is inside it that it sits on a card, so quiet fills take the ground's grey.
 */
export function HomeCard({ tint, icon, iconTint, watermark, title, subtitle, subtitleColor, right, onPress, accessibilityLabel, gap = 18, style, children, footer }: HomeCardProps) {
  const c = useCalm();
  const ink = tint ? c.tintInk[tint] : iconTint ? c.tintInk[iconTint] : c.teal;
  const bg = tint ? c.chip : iconTint ? c.tint[iconTint] : c.tint.mint;
  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <HeadTile icon={icon} color={ink} bg={bg} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {/* With no sentence the title centres on the tile; a long title wraps rather than being cut. The part on the
              right (a 30-32 px pill or button) overhangs the title's line rather than growing it, so every card's
              title and sentence sit at the same height, with or without one. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: subtitle ? 26 : 44 }}>
            <Txt size={17} lineHeight={22} weight={600} style={{ color: c.ink, flex: 1, minWidth: 0 }}>
              {title}
            </Txt>
            {right ? <View style={{ marginVertical: -3 }}>{right}</View> : null}
          </View>
          {typeof subtitle === "string" ? <Sentence color={subtitleColor}>{subtitle}</Sentence> : subtitle}
        </View>
      </View>
      {children}
    </>
  );
  if (footer === undefined)
    return (
      <CalmSurface tint={tint} watermark={tint ? (watermark ?? icon) : undefined} onPress={onPress} accessibilityLabel={onPress ? (accessibilityLabel ?? title) : undefined} padding={20} gap={gap} style={style}>
        {tint ? body : <OnCard>{body}</OnCard>}
      </CalmSurface>
    );
  // The rows' hairlines sit 14 px under the body; the last row ends 20 px above the card's edge, as the body would.
  const pad = { padding: 20, paddingBottom: 14, gap };
  const inner = (
    <>
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} style={({ pressed }) => [pad, { opacity: pressed ? 0.94 : 1 }]}>
          {body}
        </Pressable>
      ) : (
        <View style={pad}>{body}</View>
      )}
      <View style={{ paddingBottom: 6 }}>{footer}</View>
    </>
  );
  return (
    <CalmSurface tint={tint} watermark={tint ? (watermark ?? icon) : undefined} padding={0} style={style}>
      {tint ? inner : <OnCard>{inner}</OnCard>}
    </CalmSurface>
  );
}

/** A foot row's band: the title (20) and its first line (2 + 19), the 36 px tile and the chevron centred on it. */
const FOOT_BAND = 41;
const FOOT_TILE = 36;

/**
 * A row at a card's foot, under a hairline (the Goals card's Activity and Weekly plan): a 36 px icon tile in the
 * family's pastel, the title (15/20 600) with its lines under it, and a chevron when it opens something (its column
 * kept when it does not, so the rows' lines wrap at one width). The tile and the chevron sit on the title and its first
 * line; more lines grow the row downward. The card's whole width is the row's tap target.
 */
export function FootRow({ icon, tint, title, onPress, accessibilityLabel, children }: { icon: LucideIcon; tint: CalmTint; title: string; onPress?: () => void; accessibilityLabel?: string; children?: React.ReactNode }) {
  const c = useCalm();
  const band = children ? FOOT_BAND : FOOT_TILE;
  const content = (
    <>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 20, right: 20, height: 1, backgroundColor: c.line }} />
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ marginTop: onBand(band, FOOT_TILE) }}>
          <HeadTile icon={icon} color={c.tintInk[tint]} bg={c.tint[tint]} size={FOOT_TILE} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: onBand(band, children ? FOOT_BAND : 20) }}>
          <Txt size={15} lineHeight={20} weight={600} style={{ color: c.ink }}>
            {title}
          </Txt>
          {children}
        </View>
        <ChevronSlot shown={!!onPress} style={{ marginTop: onBand(band, 18) }} />
      </View>
    </>
  );
  const box = { paddingHorizontal: 20, paddingVertical: 14 };
  if (!onPress) return <View style={box}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} style={({ pressed }) => [box, { opacity: pressed ? 0.6 : 1 }]}>
      {content}
    </Pressable>
  );
}

/**
 * The header pill action ("Details ›"): CalmSurface's PillAction on a tinted card or the ground, where its white chip
 * shows; on a white card the same pill in the mint pastel, so it never melts into the card.
 */
export function ActionPill({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useCalm();
  const onCard = useSurface() === "card";
  if (!onCard) return <PillAction label={label} onPress={onPress} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 2, height: 32, paddingLeft: 12, paddingRight: 8, borderRadius: 16, backgroundColor: c.tint.mint, opacity: pressed ? 0.8 : 1, flexShrink: 0 })}
    >
      <Txt size={13} lineHeight={16} weight={600} style={{ color: c.teal }}>
        {label}
      </Txt>
      <ChevronRight size={16} color={c.teal} strokeWidth={2.25} />
    </Pressable>
  );
}

/** A sentence: 14/19 in the secondary grey (in a colour at 600 when it carries a verdict). Inline numbers go in `NumSpan`. */
export function Sentence({ children, color, size = 14 }: { children: React.ReactNode; color?: string; size?: 13 | 14 }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={size + 5} weight={color ? 600 : 400} style={{ color: color ?? c.sub }}>
      {children}
    </Txt>
  );
}

/** A number inside a sentence: the numeric face in ink (or `color`), so "Started at 85% at 07:10" still reads as numbers. */
export function NumSpan({ children, color, size = 14 }: { children: React.ReactNode; color?: string; size?: number }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={size + 5} style={[font.numberAt(size), { color: color ?? c.ink }]}>
      {children}
    </Txt>
  );
}

/** A number with its unit, then its caps label under it (calm.tsx's MiniStat), for a row of two or three. */
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
 * A sheet's row (Goals, Weekly plan): its band is the name (21) and its caption's first line (2 + 18), with the 40 px
 * tile centred on it; what hangs under the head starts in the name's column.
 */
export const LINE_BAND = 41;
export const LINE_TILE = 40;
export const LINE_INSET = LINE_TILE + 12;

/** A thin rule between rows in a card's list, indented past the rows' icon tiles. */
export function RowRule({ inset = 56, color }: { inset?: number; color?: string }) {
  const c = useCalm();
  return <View style={{ height: 1, marginLeft: inset, backgroundColor: color ?? c.line }} />;
}

/**
 * "3 of 7 done" as a pill beside a card's title: the counts in the numeric face, the words grey. Once every one is
 * done it turns mint with a check.
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
      style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: all ? c.tint.mint : quiet, flexShrink: 0 }}
    >
      {all && <Check size={14} color={ink} strokeWidth={3} />}
      <Txt size={13} lineHeight={18} weight={600} style={{ color: all ? ink : c.sub }}>
        <Txt size={15} lineHeight={18} style={[font.numeric(700), { color: ink }]}>
          {String(done)}
        </Txt>
        {" of "}
        <Txt size={15} lineHeight={18} style={[font.numeric(700), { color: ink }]}>
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

/** The round check on a goal or target that is met: the mint ink with the card's colour for the tick. */
export function CheckBadge({ size = 24 }: { size?: number }) {
  const c = useCalm();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.tintInk.mint, alignItems: "center", justifyContent: "center" }}>
      <Check size={Math.round(size * 0.6)} color={c.card} strokeWidth={3} />
    </View>
  );
}

// ── The week as columns ──────────────────────────────────────────────────────

/** `value`: the day's number, written over its column when given ("45"). */
export type WeekColumn = { day: string; frac: number | null; met: boolean; value?: string | null };

/**
 * A week as seven rounded pastel columns, each filled to its share in the family's ink (full colour on a day that met
 * its goal, lighter on one that did not), with the weekday's letter under it; `current`'s letter is in ink.
 */
export function WeekColumns({ cols, tint, height = 44, current, label }: { cols: WeekColumn[]; tint: CalmTint; height?: number; current: string; label: string }) {
  const c = useCalm();
  const ink = c.tintInk[tint];
  const r = 9;
  return (
    <View accessible accessibilityLabel={label}>
      {cols.some((b) => b.value != null) && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
          {cols.map((b) => (
            <Txt key={b.day} size={11} lineHeight={14} align="center" style={[font.numeric(700), { flex: 1, color: b.met ? ink : c.sub }]}>
              {b.value ?? " "}
            </Txt>
          ))}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8, height, alignItems: "flex-end" }}>
        {cols.map((b) => (
          <View key={b.day} style={{ flex: 1, height, justifyContent: "flex-end", borderRadius: r, backgroundColor: c.tint[tint], overflow: "hidden" }}>
            {b.frac !== null && b.frac > 0 && <View style={{ height: Math.max(r, Math.round(b.frac * height)), borderRadius: r, backgroundColor: b.met ? ink : alpha(ink, 0.42) }} />}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
        {cols.map((b) => (
          <Txt key={b.day} size={11} lineHeight={14} weight={700} align="center" style={{ flex: 1, color: b.day === current ? c.ink : c.faint }}>
            {formatDay(b.day, { weekday: "narrow" })}
          </Txt>
        ))}
      </View>
    </View>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────

/**
 * The calm pill button at a card's foot ("+ Add activity", "Live workout", "Set goals"): a 44 px mint pill with the
 * teal icon and label. It shrinks a touch while pressed (UI thread); the label wraps rather than being cut.
 */
export function CardButton({ icon: Icon, label, onPress, style }: { icon: LucideIcon; label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  const { animatedStyle, onPressIn, onPressOut } = usePress(0.97);
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} accessibilityRole="button" accessibilityLabel={label} style={style}>
      {({ pressed }) => (
        <Animated.View
          style={[
            { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, backgroundColor: c.tint.mint, opacity: pressed ? 0.8 : 1 },
            animatedStyle,
          ]}
        >
          <Icon size={18} color={c.teal} strokeWidth={2.25} />
          <Txt size={14} lineHeight={18} weight={600} style={{ color: c.teal, flexShrink: 1 }}>
            {label}
          </Txt>
        </Animated.View>
      )}
    </Pressable>
  );
}

/** A 40 px round button on the ground (the top bar's): white with the icon in ink. */
function RoundButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: c.card, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
    >
      <Icon size={18} color={c.ink} strokeWidth={2} />
    </Pressable>
  );
}

/** The 40 px slot a RoundButton fills, for skeletons. */
export function IconSlot() {
  const c = useCalm();
  return <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.card }} />;
}

/** My Day's "+": a 40 px teal disc, its hit area grown. */
export function PlusTile({ label, onPress }: { label: string; onPress: () => void }) {
  const calm = useCalm();
  const { animatedStyle, onPressIn, onPressOut } = usePress();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} accessibilityRole="button" accessibilityLabel={label} hitSlop={5}>
      <Animated.View style={[{ width: 40, height: 40, borderRadius: 20, backgroundColor: calm.teal, alignItems: "center", justifyContent: "center" }, animatedStyle]}>
        <Plus size={22} color={calm.card} strokeWidth={2.25} />
      </Animated.View>
    </Pressable>
  );
}

/** My Dashboard's pencil: a round white button on the ground, like the top bar's. */
export function EditButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <RoundButton icon={Pencil} label={label} onPress={onPress} />;
}

/** The skeleton's "+": the teal disc, still. */
export function PlusSlot() {
  const calm = useCalm();
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: calm.teal, alignItems: "center", justifyContent: "center", opacity: 0.85 }}>
      <Plus size={22} color={calm.card} strokeWidth={2.25} />
    </View>
  );
}

// ── The day's outlook ────────────────────────────────────────────────────────

/**
 * "Your daily outlook" before 17:00, "Your day in review" after it and on past days (spec §7.1 7a): a sand card with
 * the Sun (or the Moon) as its watermark, the summary in full, and "Details" for the same words in a dialog.
 */
export function DayBanner({ outlook }: { outlook: NonNullable<HomeVM["outlook"]> }) {
  const c = useCalm();
  const review = outlook.kind === "review";
  const Icon = review ? Moon : Sun;
  const info = useInfo({ title: outlook.title, icon: <Icon size={28} color={c.tintInk.sand} strokeWidth={1.5} />, body: outlook.body });
  return (
    <>
      <HomeCard tint="sand" icon={Icon} title={outlook.title} right={<PillAction label="Details" onPress={info.show} />} onPress={info.show} accessibilityLabel={`${outlook.title}. ${outlook.body}`} gap={14}>
        <Sentence>{outlook.body}</Sentence>
      </HomeCard>
      {info.dialog}
    </>
  );
}
