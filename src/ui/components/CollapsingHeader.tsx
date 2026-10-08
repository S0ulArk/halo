import * as React from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { useCalm } from "@/ui/calm";
import { font } from "@/ui/fonts";
import { useTheme } from "@/ui/ThemeProvider";
import { HeaderRow } from "./DetailHeader";
import { InfoButton, type InfoContent } from "./InfoButton";
import { Txt } from "./Text";

export type HeaderStat = {
  /** Formatted already: "3.4", "1.1x". */
  value: string;
  /** Caps label, written in sentence case: "Years younger". */
  label: string;
  /** Value colour; default foreground. */
  tone?: "optimal" | "warning";
};
export type HeaderStats = { left?: HeaderStat; right?: HeaderStat };

export type CollapsingHeaderProps = {
  title: string;
  subtitle?: string;
  info?: InfoContent;
  onBack: () => void;
  ground?: "default" | "healthspan";
  /** The hero has scrolled under the header's first row. */
  collapsed: boolean;
  /** The hero's compact form, centred in the collapsed row: at most COMPACT_SIZE px tall (Healthspan's orb). */
  compact: React.ReactNode;
  stats?: HeaderStats;
};

/**
 * Row 2's height: the band grows by it, so nothing under it reflows. The web hangs a 108 px orb 30 px past a 62 px band
 * ([latest-healthspan-collapsed-2]), over the content; here the band is opaque and holds the whole compact hero.
 */
const ROW2 = 84;
/** The compact hero's box: it rises 12 px into the bar above (its title has faded) and ends at the band's edge. */
export const COMPACT_SIZE = 96;
const COMPACT_RISE = (COMPACT_SIZE - ROW2) / 2;

function Stat({ stat, t }: { stat?: HeaderStat; t: Animated.Value }) {
  const c = useCalm();
  if (!stat) return <View style={{ flex: 1 }} />;
  return (
    <Animated.View
      style={{
        flex: 1,
        minWidth: 0,
        alignItems: "center",
        gap: 2,
        // Follows the orb by a beat (the web's 40 ms delay): it starts once the band is a fifth of the way in.
        opacity: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0, 1] }),
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
      }}
    >
      <Txt size={22} lineHeight={26} color={stat.tone === "optimal" ? c.tintInk.mint : stat.tone === "warning" ? c.tintInk.sand : c.ink} style={font.numeric(700)}>
        {stat.value}
      </Txt>
      {/* The Calm caption under the number. One line: "Pace of aging" fits a 330 px phone at 0.85 of its size rather than wrapping out of the band. */}
      <Txt size={11} lineHeight={15} weight={600} uppercase color={c.faint} align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ letterSpacing: 1.4 }}>
        {stat.label}
      </Txt>
    </Animated.View>
  );
}

/**
 * The detail header with a sticky hero (spec §4.3a, docs/design/sticky.md B3-B5), the web's CollapsingHeader. At rest
 * it is the plain Calm detail bar (the white round back button, the centred title, on the solid ground, no hairline).
 * Once `collapsed`, the title fades, back and info stay, and a band of the ground grows over the content with the left
 * stat, the hero's compact form and the right stat. The header's height in the layout never changes: row 2 hangs below
 * it, over the scroll view. Place it above the ScrollView, as DetailHeader.
 */
export function CollapsingHeader({ title, subtitle, info, onBack, ground, collapsed, compact, stats }: CollapsingHeaderProps) {
  const { c } = useTheme();
  const calm = useCalm();
  const insets = useSafeAreaInsets();
  const fill = ground === "healthspan" ? c.groundHealthspan : c.background;
  const t = React.useState(() => new Animated.Value(0))[0];
  // The compact hero mounts on the first collapse: nothing to draw for a screen that is never scrolled.
  const [mounted, setMounted] = React.useState(collapsed);
  if (collapsed && !mounted) setMounted(true);
  React.useEffect(() => {
    Animated.timing(t, {
      toValue: collapsed ? 1 : 0,
      // Out-expo in 220 ms; back to rest in 150 ms, in-quick.
      duration: collapsed ? 220 : 150,
      easing: collapsed ? Easing.bezier(0.16, 1, 0.3, 1) : Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start();
  }, [collapsed, t]);

  const sub = !!subtitle;
  return (
    <View style={{ zIndex: 20 }}>
      <View style={{ backgroundColor: fill, paddingTop: insets.top }}>
        <HeaderRow
          style={sub ? { alignItems: "flex-start", paddingBottom: 4 } : undefined}
          left={
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: calm.card, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
            >
              <ChevronLeft size={24} color={calm.ink} strokeWidth={2} />
            </Pressable>
          }
          center={
            <Animated.View pointerEvents={collapsed ? "none" : "auto"} style={{ alignItems: "center", paddingTop: sub ? 10 : 0, opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
              <Txt size={18} lineHeight={24} weight={600} color={calm.ink} align="center" numberOfLines={2}>
                {title}
              </Txt>
              {sub && (
                <Txt size={13} lineHeight={18} color={calm.sub} align="center" numberOfLines={2}>
                  {subtitle}
                </Txt>
              )}
            </Animated.View>
          }
          right={info && <InfoButton info={info} label={title} variant="header" />}
        />
      </View>
      {/* Collapsed: the opaque ground band slides down to cover row 2 (no hairline: the ground is solid). */}
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: "100%", height: ROW2, overflow: "hidden" }}>
        <Animated.View style={{ height: ROW2, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-ROW2, 0] }) }] }}>
          <View style={{ height: ROW2, backgroundColor: fill }} />
        </Animated.View>
      </View>
      {/* Row 2's content, unclipped so the compact hero can rise into the bar above. */}
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={{ position: "absolute", left: 0, right: 0, top: "100%", height: ROW2, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 }}
      >
        <Stat stat={stats?.left} t={t} />
        {/* Centred a little high, so it fills the band without passing its edge. */}
        <Animated.View style={{ zIndex: 1, alignItems: "center", opacity: t, transform: [{ translateY: -COMPACT_RISE }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
          {mounted ? compact : null}
        </Animated.View>
        <Stat stat={stats?.right} t={t} />
      </View>
    </View>
  );
}
