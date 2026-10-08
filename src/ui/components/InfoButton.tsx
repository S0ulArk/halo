import * as React from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Info, X } from "lucide-react-native";
import type { ChipTone } from "@/lib/bands";
import { alpha } from "@/lib/utils";
import { useCalm } from "@/ui/calm";
import { REASE } from "@/ui/motion/easing";
import { MOTION } from "@/ui/theme";
import { Button } from "./Button";
import { OnCard } from "./calmKit";
import { Overlay, useCoverLayer } from "./Overlay";
import { StatusChip } from "./primitives";
import { Txt } from "./Text";

export type InfoContent = {
  title: string;
  /** A string (rendered as body copy) or any node (use `InfoRows` for swatch lists). */
  body: React.ReactNode;
  /** A 28 px icon above the title. */
  icon?: React.ReactNode;
  /** Status chip beside the title ("Within 24 - 28"). */
  chip?: { tone: ChipTone; text: string };
  /** One outline action, e.g. "Open trend view". */
  action?: { label: string; onPress: () => void };
};

/** A swatch list inside info copy (the web's `Rows` in info.tsx): `swatch` is a colour or null. */
export function InfoRows({ rows }: { rows: [swatch: string | null, text: string][] }) {
  const c = useCalm();
  return (
    <View style={{ gap: 10 }}>
      {rows.map(([swatch, text]) => (
        <View key={text} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          {swatch && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: swatch, marginTop: 6 }} />}
          <Txt size={15} lineHeight={22} color={c.ink} style={{ flex: 1 }}>
            {text}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/**
 * The centred info card (spec §4.8), Calm: a white card with 28 px corners and no outline over a dim in the ground's
 * colour, no blur. Opens 320 ms
 * (fade, scale 0.96), closes 200 ms. It renders in the root overlay (Overlay), in the app's own window, and its
 * motion runs on the UI thread (Reanimated); Android's back closes it.
 */
export function InfoDialog(props: InfoContent & { open: boolean; onClose: () => void }) {
  const [shown, setShown] = React.useState(props.open);
  // Mount on open while rendering (no effect-driven setState); unmount once the fade-out ends.
  if (props.open && !shown) setShown(true);
  const onClosed = React.useCallback(() => setShown(false), []);
  if (!shown) return null;
  return (
    <Overlay>
      <InfoCard {...props} onClosed={onClosed} />
    </Overlay>
  );
}

function InfoCard({ open, onClose, onClosed, title, body, icon, chip, action }: InfoContent & { open: boolean; onClose: () => void; onClosed: () => void }) {
  const c = useCalm();
  const { width } = useWindowDimensions();
  const t = useSharedValue(0);
  React.useEffect(() => {
    if (open) t.set(withTiming(1, { duration: MOTION.overlayIn, easing: REASE.outExpo }));
    else
      t.set(
        withTiming(0, { duration: MOTION.overlayOut, easing: REASE.exit }, (finished) => {
          if (finished) scheduleOnRN(onClosed);
        }),
      );
  }, [open, t, onClosed]);
  useCoverLayer(open);
  const latest = React.useRef(onClose);
  React.useEffect(() => {
    latest.current = onClose;
  });
  React.useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      latest.current();
      return true;
    });
    return () => sub.remove();
  }, [open]);
  const dim = useAnimatedStyle(() => ({ opacity: t.value }));
  const card = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.96 + 0.04 * t.value }] }));
  return (
    <View pointerEvents={open ? "box-none" : "none"} style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(c.ground, 0.9) }, dim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Animated.View accessibilityViewIsModal style={[{ width: Math.min(360, width - 32) }, card]}>
          <View style={{ borderRadius: 32, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.card, maxHeight: 560, overflow: "hidden", ...(c.shadow ? { boxShadow: c.shadow } : null) }}>
            <OnCard>
              <ScrollView contentContainerStyle={{ padding: 24 }} bounces={false}>
                {icon && <View style={{ marginBottom: 16 }}>{icon}</View>}
                <View style={{ marginBottom: 12, gap: 8, paddingRight: 40 }}>
                  <Txt size={18} lineHeight={24} weight={600} style={{ color: c.ink }}>
                    {title}
                  </Txt>
                  {chip && <StatusChip tone={chip.tone}>{chip.text}</StatusChip>}
                </View>
                <View style={{ gap: 16 }}>
                  {typeof body === "string" ? (
                    <Txt size={15} lineHeight={22} color={c.ink}>
                      {body}
                    </Txt>
                  ) : (
                    body
                  )}
                </View>
                {action && (
                  <Button variant="default" onPress={action.onPress} style={{ marginTop: 24, alignSelf: "stretch" }}>
                    {action.label}
                  </Button>
                )}
              </ScrollView>
              <View style={{ position: "absolute", top: 14, right: 14 }}>
                <Button variant="secondary" size="icon-touch" onPress={onClose} accessibilityLabel="Close">
                  <X size={20} color={c.ink} strokeWidth={2} />
                </Button>
              </View>
            </OnCard>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * Info trigger and its centred info card (spec §4.8). `card`: a quiet grey "i", 32 px inside a 44 px hit area (card
 * headers). `header`: a 44 px white round button with the "i" in ink (DetailHeader).
 */
export function InfoButton({ info, label, variant }: { info: InfoContent; label: string; variant: "card" | "header" }) {
  const c = useCalm();
  const [open, setOpen] = React.useState(false);
  const header = variant === "header";
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`About ${label}`}
        hitSlop={header ? 0 : 6}
        style={({ pressed }) =>
          header
            ? { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 }
            : { width: 32, height: 32, borderRadius: 16, marginVertical: -4, marginRight: -6, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? c.line : "transparent" }
        }
      >
        <Info size={header ? 20 : 18} color={header ? c.ink : c.faint} strokeWidth={2} />
      </Pressable>
      <InfoDialog open={open} onClose={() => setOpen(false)} {...info} />
    </>
  );
}
