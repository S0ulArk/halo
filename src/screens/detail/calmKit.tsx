// Building blocks for the detail and Health screens (Halo Luxe), after Home's (src/screens/home/calm.tsx). Numbers and
// words never look alike: a number is the display serif (28 px and up) or Barlow (tabular) in its metric's ink with
// its unit small and grey beside it; the label under a number is small widely spaced capitals; titles are 17/22
// semibold; sentences 14/19 in the secondary grey, on a line of their own. Lead cards wear their family's pastel sheen,
// sections are white cards with the champagne hairline, and rows sit in one grouped list per card with hairlines
// between them.
import * as React from "react";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import type { ChipTone, Tone } from "@/lib/bands";
import { Txt } from "@/ui";
import { CalmSurface } from "@/ui/components/CalmSurface";
import { useCalm, type CalmPalette, type CalmTint } from "@/ui/calm";
import { font } from "@/ui/fonts";

/** A tone's ink: good in mint, bad in rose, neutral in the secondary grey. */
export function toneInk(c: CalmPalette, tone: Tone | ChipTone | null | undefined): string {
  switch (tone) {
    case "good":
    case "optimal":
      return c.tintInk.mint;
    case "bad":
    case "alert":
      return c.tintInk.rose;
    case "warning":
      return c.tintInk.sand;
    default:
      return c.sub;
  }
}

/**
 * A number with its unit beside it on the same baseline: the numeric face in `color` (default ink), the unit small and
 * grey in the text face, so "43 ms" reads as a value with a unit, never as a phrase.
 */
export function Num({ value, unit, size, color, unitColor }: { value: string; unit?: string; size: number; color?: string; unitColor?: string }) {
  const c = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", flexShrink: 1 }}>
      <Txt size={size} lineHeight={Math.round(size * 1.12)} style={[font.numberAt(size), { color: color ?? c.ink }]} numberOfLines={1}>
        {value}
      </Txt>
      {unit ? (
        <Txt size={Math.max(12, Math.round(size * 0.42))} lineHeight={Math.round(Math.max(12, size * 0.42) * 1.3)} weight={500} style={{ color: unitColor ?? c.sub, marginLeft: 4, flexShrink: 1 }}>
          {unit}
        </Txt>
      ) : null}
    </View>
  );
}

/** The small label under a number: 11 px spaced capitals in the faint grey, never mistaken for the value. Wraps, never clips. */
export function Caption({ children, color, align, style }: { children: string; color?: string; align?: "left" | "center" | "right"; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  return (
    <View style={style}>
      <Txt size={11} lineHeight={15} weight={600} align={align} style={{ color: color ?? c.faint, letterSpacing: 1.4 }}>
        {children.toUpperCase()}
      </Txt>
    </View>
  );
}

/** A card or row title: 17/22 semibold ink (`size` 15 for a row inside a list). */
export function Title({ children, size = 17, color, lines }: { children: React.ReactNode; size?: 15 | 16 | 17; color?: string; lines?: number }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={size + 5} weight={600} numberOfLines={lines} style={{ color: color ?? c.ink, flexShrink: 1 }}>
      {children}
    </Txt>
  );
}

/** A sentence: 14/19 in the secondary grey (a warning in its tint's ink at 600), on a line of its own. */
export function Sentence({ children, color, weight, align, size = 14 }: { children: React.ReactNode; color?: string; weight?: 400 | 500 | 600; align?: "left" | "center" | "right"; size?: 13 | 14 }) {
  const c = useCalm();
  return (
    <Txt size={size} lineHeight={size + 5} weight={weight ?? (color ? 600 : 400)} align={align} style={{ color: color ?? c.sub }}>
      {children}
    </Txt>
  );
}

/** The icon tile at a card's or row's top left. */
export function IconTile({ icon: Icon, color, bg, size = 44 }: { icon: LucideIcon; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.32), backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon size={Math.round(size / 2)} color={color} strokeWidth={1.75} />
    </View>
  );
}

export type CalmCardProps = {
  /** The family's pastel; none for a white card. */
  tint?: CalmTint;
  /** A white card's icon family (default mint with the action colour). */
  iconTint?: CalmTint;
  icon?: LucideIcon;
  title?: string;
  /** The sentence under the title, across the card's whole width. */
  subtitle?: string | null;
  subtitleColor?: string;
  /** Beside the title (a headline number, a chevron). */
  right?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Space between the head and the body (default 18). */
  gap?: number;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/** A Calm card: pastel (or white), 30 px corners, no border or shadow; icon tile, title row and subtitle, then its body. */
export function CalmCard({ tint, iconTint, icon, title, subtitle, subtitleColor, right, onPress, accessibilityLabel, gap = 18, padding = 20, style, children }: CalmCardProps) {
  const c = useCalm();
  const ink = tint ? c.tintInk[tint] : iconTint ? c.tintInk[iconTint] : c.teal;
  const head =
    title || icon ? (
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        {icon && <IconTile icon={icon} color={ink} bg={tint ? c.chip : c.tint[iconTint ?? "mint"]} />}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {title ? (
            // With no sentence the title centres on the tile (Home's cards do the same); a long title wraps.
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: icon ? (subtitle ? 26 : 44) : 22 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Title>{title}</Title>
              </View>
              {right}
            </View>
          ) : null}
          {/* The whole width under the title row: a sentence is never cut short by the number beside the title. */}
          {subtitle ? <Sentence color={subtitleColor}>{subtitle}</Sentence> : null}
        </View>
      </View>
    ) : null;
  return (
    <CalmSurface tint={tint} watermark={tint ? icon : undefined} onPress={onPress} accessibilityLabel={onPress ? (accessibilityLabel ?? [title, subtitle].filter(Boolean).join(". ")) : undefined} padding={padding} gap={gap} style={style}>
      {head}
      {children}
    </CalmSurface>
  );
}

/** A number with its small capitals label under it (and an optional sentence), for a row of two or three. */
export function MiniStat({ value, unit, label, color, size = 24, note, noteColor, align }: { value: string; unit?: string; label: string; color?: string; size?: number; note?: string | null; noteColor?: string; align?: "center" }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: align === "center" ? "center" : "flex-start" }}>
      <Num value={value} unit={unit} size={size} color={color} />
      <Caption align={align} style={{ marginTop: 4 }}>
        {label}
      </Caption>
      {note ? (
        <View style={{ marginTop: 2 }}>
          <Sentence size={13} color={noteColor} align={align}>
            {note}
          </Sentence>
        </View>
      ) : null}
    </View>
  );
}

/** The hairline between rows of a grouped list. */
function Hairline({ inset = 0, color }: { inset?: number; color?: string }) {
  const c = useCalm();
  return <View style={{ height: 1, marginLeft: inset, backgroundColor: color ?? c.line }} />;
}

/** Rows grouped in one list, a hairline between each (inset past the rows' icons with `inset`). */
export function Grouped({ children, inset = 0, lineColor }: { children: React.ReactNode; inset?: number; lineColor?: string }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Hairline inset={inset} color={lineColor} />}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

/** A choice pill: teal when chosen, white on the ground otherwise. */
export function ChoicePill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ height: 38, borderRadius: 19, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.teal : c.card, borderWidth: 1, borderColor: on ? c.teal : c.hairline, opacity: pressed ? 0.8 : 1 })}
    >
      <Txt size={14} lineHeight={18} weight={600} style={{ color: on ? c.card : c.ink }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** A quiet action in the accent teal on a white pill ("Show older"); a spinner while `loading`. */
export function TealButton({ label, onPress, loading, style }: { label: string; onPress: () => void; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ busy: !!loading }}
      style={({ pressed }) => [{ alignSelf: "center", height: 44, minWidth: 132, borderRadius: 22, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.hairline, opacity: pressed ? 0.8 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={c.teal} />
      ) : (
        <Txt size={15} lineHeight={20} weight={600} style={{ color: c.teal }}>
          {label}
        </Txt>
      )}
    </Pressable>
  );
}

/** A group's heading over its cards on the ground ("Today", "Last 30 days"): 15/20 semibold, the aside on the right. */
export function GroupHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <View accessibilityRole="header" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: 12, rowGap: 2, paddingHorizontal: 4 }}>
      <Title size={16}>{title}</Title>
      {aside}
    </View>
  );
}
