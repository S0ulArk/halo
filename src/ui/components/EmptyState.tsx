import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useCalm } from "@/ui/calm";
import { Button } from "./Button";
import { IconTile } from "./calmKit";
import { Txt } from "./Text";

export type EmptyStateProps = {
  icon?: LucideIcon;
  /** One line, final copy from the spec. */
  body: string;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
};

/** Shared empty state for metrics and lists (spec §4.8), Calm: a quiet icon tile, the line in 15/21 grey, a quiet button. */
export function EmptyState({ icon: Icon, body, action, style }: EmptyStateProps) {
  const c = useCalm();
  return (
    <View style={[{ alignItems: "center", gap: 12, paddingVertical: 28 }, style]}>
      {Icon && <IconTile icon={<Icon size={22} color={c.sub} strokeWidth={1.75} />} tint={null} />}
      <Txt size={15} lineHeight={21} align="center" style={{ color: c.sub, maxWidth: 300 }}>
        {body}
      </Txt>
      {action && (
        <Button variant="secondary" size="touch" onPress={action.onPress} style={{ marginTop: 4 }}>
          {action.label}
        </Button>
      )}
    </View>
  );
}
