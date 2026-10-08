// The chrome material ("Pulse 2: calm data"): a flat solid, the card colour. The glass it replaced (sampled solids, a
// specular sheen, a lit top edge: three gradient layers per surface, and a live blur before that) cost draw time on
// every frame of a 120 Hz scroll; a solid fill costs nothing extra.
import * as React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/ui/ThemeProvider";

/** The material, filling its parent (first inside a rounded box). `strength` is kept for API compatibility. */
export function GlassMaterial(_props: { strength?: number }) {
  const { c } = useTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.card }]} />;
}
