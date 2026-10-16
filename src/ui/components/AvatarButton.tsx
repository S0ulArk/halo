// The avatar at the top left of every tab: the way to More (Settings, Reports, How Halo works, Data, Coach), as in
// Google's apps. A 38 px glass bar button with the person's outline.
import * as React from "react";
import { useRouter, type Href } from "expo-router";
import { BAR_BUTTON, GlassButton } from "./GlassButton";
import { UserAvatar } from "./HomeHeader";

/** `size` is kept for API compatibility: the avatar is a bar button, the bar's size. */
export function AvatarButton(_props: { size?: number }) {
  const router = useRouter();
  return (
    <GlassButton onPress={() => router.navigate("/more" as Href)} accessibilityLabel="More: settings, reports and help">
      <UserAvatar src={null} size={Math.round(BAR_BUTTON * 0.62)} />
    </GlassButton>
  );
}
