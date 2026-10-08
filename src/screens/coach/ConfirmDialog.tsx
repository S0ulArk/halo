// The confirm dialog ChatList and CoachSettings use, in the Calm style: a white 28 px card over the dim, the title and
// a grey sentence, then the actions stacked full width as pills (the confirm, rose when it removes something, above
// Cancel). Fades and scales in over 320 ms, out over 200 ms.
import * as React from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { OverlayModal } from "@/ui/components/Overlay";
import { MOTION, Txt, useTheme } from "@/ui";
import { useCalm } from "@/ui/calm";

function DialogButton({ label, onPress, variant, disabled, busy }: { label: string; onPress: () => void; variant: "confirm" | "danger" | "cancel"; disabled?: boolean; busy?: boolean }) {
  const c = useCalm();
  const bg = variant === "confirm" ? c.teal : variant === "danger" ? c.tint.rose : c.ground;
  const ink = variant === "confirm" ? c.card : variant === "danger" ? c.tintInk.rose : c.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => ({ minHeight: 52, borderRadius: 26, paddingHorizontal: 20, paddingVertical: 6, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: bg, opacity: disabled && !busy ? 0.45 : pressed ? 0.8 : 1 })}
    >
      {busy && <ActivityIndicator size="small" color={ink} />}
      <Txt size={15} lineHeight={20} weight={600} align="center" style={{ color: ink, flexShrink: 1 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirm,
  pendingLabel,
  danger = true,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirm: string;
  pendingLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const calm = useCalm();
  const { width } = useWindowDimensions();
  const [t] = React.useState(() => new Animated.Value(0));
  const [shown, setShown] = React.useState(open);
  // Mount on open (during render, so the first frame already has the dialog); unmount after the close animation.
  if (open && !shown) setShown(true);
  React.useEffect(() => {
    if (open) {
      Animated.timing(t, { toValue: 1, duration: MOTION.overlayIn, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start();
    } else {
      Animated.timing(t, { toValue: 0, duration: MOTION.overlayOut, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: true }).start(() => setShown(false));
    }
  }, [open, t]);
  if (!shown) return null;
  const close = () => !pending && onClose();
  return (
    <OverlayModal onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.dimStrong, opacity: t }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Animated.View
          accessibilityViewIsModal
          style={{ width: Math.min(384, width - 32), borderRadius: 28, overflow: "hidden", backgroundColor: calm.card, padding: 20, gap: 20, opacity: t, transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }}
        >
          <View style={{ gap: 6 }}>
            <Txt size={17} lineHeight={22} weight={600} accessibilityRole="header" style={{ color: calm.ink }}>
              {title}
            </Txt>
            <Txt size={14} lineHeight={19} style={{ color: calm.sub }}>
              {description}
            </Txt>
          </View>
          <View style={{ gap: 8 }}>
            <DialogButton label={pending && pendingLabel ? pendingLabel : confirm} variant={danger ? "danger" : "confirm"} onPress={onConfirm} disabled={pending} busy={pending} />
            <DialogButton label="Cancel" variant="cancel" onPress={close} disabled={pending} />
          </View>
        </Animated.View>
      </View>
    </OverlayModal>
  );
}
