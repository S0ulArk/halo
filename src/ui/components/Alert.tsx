import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useCalm, type CalmTint } from "@/ui/calm";
import { IconTile } from "./calmKit";
import { Txt } from "./Text";

export type AlertProps = {
  variant?: "default" | "destructive";
  icon?: LucideIcon;
  title?: string;
  description?: string | React.ReactNode;
  /** Top-right action (the web's AlertAction). */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * The Calm alert: a soft pastel card (rose for `destructive`, sky otherwise) with 20 px corners and no border, the icon
 * in a white tile, the title in the tint's ink and the description as a grey sentence. The action sits top right.
 */
export function Alert({ variant = "default", icon: Icon, title, description, action, style, children }: AlertProps) {
  const c = useCalm();
  const tint: CalmTint = variant === "destructive" ? "rose" : "sky";
  const ink = c.tintInk[tint];
  return (
    <View accessibilityRole="alert" style={[{ flexDirection: "row", gap: 12, borderRadius: 20, backgroundColor: c.tint[tint], padding: 14, paddingRight: action ? 72 : 14 }, style]}>
      {Icon && <IconTile icon={<Icon size={18} color={ink} strokeWidth={2} />} tint={tint} size={36} radius={12} iconSize={18} bg={c.chip} />}
      <View style={{ flex: 1, minWidth: 0, gap: 2, justifyContent: "center" }}>
        {title && (
          <Txt size={15} lineHeight={20} weight={600} color={variant === "destructive" ? ink : c.ink}>
            {title}
          </Txt>
        )}
        {typeof description === "string" ? (
          <Txt size={14} lineHeight={19} color={c.sub}>
            {description}
          </Txt>
        ) : (
          description
        )}
        {children}
      </View>
      {action && <View style={{ position: "absolute", top: 8, right: 8 }}>{action}</View>}
    </View>
  );
}
