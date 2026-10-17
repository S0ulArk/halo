// Coach `/coach` (spec §7.21), ported from Pulse's coach/page.tsx: consent, then a provider and key (BYOK), then the
// chat. `?c=` opens a saved chat, `?q=` fills the composer without sending, `?brief=1` asks for today's brief at once,
// `?n=` starts a fresh chat. On the web only people an admin let in see it; on the phone it is the person's own. The
// setup pages are iOS settings pages (DetailShell); the chat is a full-screen Messages-style page with its own floating
// bar (Coach.tsx), which also frames the few message-shaped bars shown while a saved chat loads.
import * as React from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { generateId, type UIMessage } from "ai";
import { CHAT_ID } from "@/coach/chats";
import { providerLabel } from "@/coach/providers";
import { useChatCount, useCoachSetup } from "@/coach/session";
import { loadChat } from "@/coach/storage";
import { coachSuggestions } from "@/coach/suggestions";
import { useBack } from "@/screens/detail/nav";
import { useQuery } from "@/state/app";
import { DetailShell, Skeleton } from "@/ui";
import { useBarInset } from "@/ui/components/DetailHeader";
import { GlassTarget } from "@/ui/glass";
import { useCalm } from "@/ui/calm";
import { ChatBar, Coach, type ChatBarProps } from "./Coach";
import { ConnectProvider, Consent } from "./CoachSetup";

/** A few message-shaped bars while the chat loads (the web's loading.tsx): a question on the right, answers on the left. */
function ChatSkeleton({ top = 16 }: { top?: number }) {
  return (
    <View style={{ gap: 14, paddingHorizontal: 16, paddingTop: top }}>
      <Skeleton radius={20} style={{ height: 44, width: "60%", alignSelf: "flex-end" }} />
      <Skeleton radius={10} style={{ height: 18, width: "92%" }} />
      <Skeleton radius={10} style={{ height: 18, width: "80%" }} />
      <Skeleton radius={20} style={{ height: 96, width: "100%" }} />
    </View>
  );
}

/** The chat's frame while a saved chat loads: its floating bar over the skeleton. */
function ChatLoading(bar: ChatBarProps) {
  const top = useBarInset();
  return (
    <GlassTarget style={{ flex: 1 }} overlay={<ChatBar {...bar} />}>
      <ChatSkeleton top={top + 12} />
    </GlassTarget>
  );
}

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default function CoachScreen() {
  const colors = useCalm();
  const router = useRouter();
  const onBack = useBack("/");
  const setup = useCoachSetup();
  const chatCount = useChatCount();
  const params = useLocalSearchParams<{ c?: string; q?: string; brief?: string; n?: string }>();
  const c = param(params.c) && CHAT_ID.test(param(params.c)!) ? param(params.c)! : null;
  const brief = param(params.brief) === "1";
  const n = param(params.n);
  const fresh = React.useMemo(() => generateId(), [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggestions = useQuery(coachSuggestions);
  // The chat on screen. No `?c=`: a fresh one (a new one per `?n=`). `?c=` naming the chat on screen keeps it running
  // (a new chat records its id after its first answer); naming another loads it from coach.db first. An id with no
  // saved chat opens an empty chat under that id.
  const [shown, setShown] = React.useState<{ id: string; messages: UIMessage[] } | undefined>(c ? undefined : { id: fresh, messages: [] });
  if (!c && shown?.id !== fresh) setShown({ id: fresh, messages: [] });
  const loading = !!c && shown?.id !== c;
  React.useEffect(() => {
    if (!loading || !c) return;
    let live = true;
    loadChat(c).then(
      (messages) => live && setShown({ id: c, messages: messages ?? [] }),
      () => live && setShown({ id: c, messages: [] }),
    );
    return () => {
      live = false;
    };
  }, [loading, c]);
  const chat = loading ? undefined : shown;

  if (setup === undefined) return <DetailShell title="Coach" onBack={onBack} primary={<ChatSkeleton />} contentStyle={{ paddingHorizontal: 0 }} />;

  if (!setup.consent || !setup.provider)
    // A focused key or model field keeps "Test and save" (under the field's note) above the keyboard.
    return <DetailShell title="Coach" onBack={onBack} bottomInset={40} keyboardOffset={128} primary={<View style={{ paddingBottom: 40 }}>{!setup.consent ? <Consent /> : <ConnectProvider current={setup} />}</View>} />;

  const newChat = () => router.setParams({ c: undefined, q: undefined, brief: undefined, n: generateId() });
  const bar: ChatBarProps = { onBack, chatCount: chatCount ?? 0, chatOpen: !!c, onNew: newChat, providerLabel: providerLabel(setup.provider) };
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      {chat ? (
        <Coach
          key={chat.id}
          {...bar}
          id={chat.id}
          initial={chat.messages}
          prefill={brief && !c ? "Today's brief" : (param(params.q) ?? "").slice(0, 500)}
          auto={brief && !c}
          suggestions={suggestions.data ?? []}
          onSaved={(id) => router.setParams({ c: id, q: undefined, brief: undefined })}
        />
      ) : (
        <ChatLoading {...bar} />
      )}
    </View>
  );
}
