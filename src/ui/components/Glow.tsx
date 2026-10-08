import * as React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { Scheme, Tokens } from "@/ui/theme";

// Pulse 2 "calm data" retired the soft pools of colour behind the dials: heroes sit on the flat ground, so nothing is
// drawn here any more. The exports stay so existing imports compile; every glow is a no-op.

/** The cap on a glow's centre opacity (kept for callers; nothing draws). */
export const GLOW_MAX = 0.18;
/** Home's row of three dials (kept for callers; nothing draws). */
export const GLOW_FAINT = 0.1;
/** Per theme: no theme glows any more. */
export const GLOW_SCHEME: Record<Scheme, number> = { dark: 0, light: 0 };

export type GlowProps = {
  color: string | null | undefined;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
};

/** No-op: renders nothing (see above). */
export const Glow = React.memo(function Glow(_props: GlowProps): React.ReactElement | null {
  return null;
});

/** No hero glows any more: always null, so DetailShell's hero slot stays unlit. */
export function dialGlow(_c: Tokens, _variant: string, _value: number | null | undefined): string | null {
  return null;
}
