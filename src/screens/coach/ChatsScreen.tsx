// The coach's chats on the phone `/coach/chats`, ported from Pulse's coach/chats/page.tsx (laptop shows the same list
// beside the conversation). A chat opens back on /coach; New chat opens a fresh one.
import * as React from "react";
import { useRouter, type Href } from "expo-router";
import { useBack } from "@/screens/detail/nav";
import { DetailShell } from "@/ui";
import { ChatList, useNewChat } from "./ChatList";

export default function ChatsScreen() {
  const router = useRouter();
  const onBack = useBack("/coach");
  const onNew = useNewChat();
  const onOpen = React.useCallback((id: string) => router.dismissTo(`/coach?c=${encodeURIComponent(id)}` as Href), [router]);
  return <DetailShell title="Chats" onBack={onBack} primary={<ChatList current={null} onOpen={onOpen} onNew={onNew} />} />;
}
