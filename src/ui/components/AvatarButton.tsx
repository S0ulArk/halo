// The avatar at the top left of every tab: the way to More (Settings, Reports, How Halo works, Data, Coach), as in
// Google's apps. A 44 px white round button with the person's monogram.
import * as React from "react";
import { Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useCalm } from "@/ui/calm";
import { UserAvatar } from "./HomeHeader";

export function AvatarButton({ size = 44 }: { size?: number }) {
  const c = useCalm();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.navigate("/more" as Href)}
      accessibilityRole="button"
      accessibilityLabel="More: settings, reports and help"
      hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: c.card, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
    >
      <UserAvatar src={null} size={Math.round(size * 0.66)} />
    </Pressable>
  );
}
