// Choose where data comes from: a Google account (the Google Health API, the richer source), Health Connect (the Google
// Health app writes Fitbit data there) or generated demo data. Set as Apple Health's onboarding: the mark over a large
// centred title and a sentence, then one big card per source (its coloured icon square, the name in bold, what it reads
// in grey, and the way on), the recommended one's arrow filled blue. A card settles and dims under the finger and shows
// a spinner in its square while it connects; the first import's progress shows above them. The blocks fade and rise
// into place one after another as the screen opens.
import { ArrowRight, CircleAlert, Cloud, HeartPulse, Sparkles, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GOOGLE_SOURCE_ENABLED } from "@/google/flags";
import { openHealthConnectSettings } from "@/health/connect";
import { useApp, useSyncProgress } from "@/state/app";
import { Txt } from "@/ui";
import type { SystemColor } from "@/ui/calm";
import { usePress, usePressStyle } from "@/ui/components/press";
import { CalmButton, CalmProgress, Notice, Num, Surface, useCalm } from "@/screens/settings/calmKit";
import { SignInProblem } from "@/screens/settings/google";
import { Appear, PageHead, RowIcon } from "@/screens/settings/list";
import { progressLabel } from "@/screens/home/status";
import type { GoogleSignInError } from "../../modules/pulse-google/errors";

export default function SourceScreen() {
  const app = useApp();
  const syncProgress = useSyncProgress();
  const c = useCalm();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = React.useState<"google" | "health" | "demo" | null>(null);
  const [googleError, setGoogleError] = React.useState<GoogleSignInError | null>(null);
  const hcOk = app.availability === "available";

  const go = async (which: "google" | "health" | "demo") => {
    setBusy(which);
    try {
      if (which === "google") {
        setGoogleError(null);
        setGoogleError(await app.connectGoogle());
      } else if (which === "health") await app.connectHealth();
      else await app.useDemo();
    } finally {
      setBusy(null);
    }
  };

  const syncing = app.status === "syncing";
  let step = 1;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.ground }} contentContainerStyle={{ paddingTop: insets.top + 36, paddingBottom: insets.bottom + 24, paddingHorizontal: 16, gap: 14 }}>
      <Appear index={0} style={{ marginBottom: 12 }}>
        <PageHead title="Your data">
          {GOOGLE_SOURCE_ENABLED
            ? "Halo scores Sleep, Recovery and Strain from your Fitbit’s heart-rate, HRV and sleep data: read from your Google account, or from Health Connect, where the Google Health app writes it."
            : "Halo scores Sleep, Recovery and Strain from the heart-rate, HRV and sleep data your Fitbit writes to Health Connect through the Google Health app."}
        </PageHead>
      </Appear>

      {syncing && (
        <Surface padding={18} gap={12}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <ActivityIndicator color={c.teal} />
            <Txt size={16} lineHeight={21} weight={600} style={{ flex: 1, color: c.ink }}>
              {syncProgress ? progressLabel({ ...syncProgress, total: 0 }) : "Importing"}
            </Txt>
            {syncProgress && syncProgress.total > 0 && <Num value={`${syncProgress.done} / ${syncProgress.total}`} size={16} />}
          </View>
          {syncProgress && syncProgress.total > 0 && <CalmProgress value={syncProgress.done / syncProgress.total} />}
        </Surface>
      )}

      {app.error && !syncing && (
        <Notice tint="rose" icon={CircleAlert} title="Something went wrong" role="alert">
          {app.error}
        </Notice>
      )}

      {GOOGLE_SOURCE_ENABLED && (
        <Appear index={step++}>
          <Option
            icon={Cloud}
            system="blue"
            primary
            title="Google account (Google Health API)"
            body="The richer source: everything Health Connect has, plus blood oxygen, Fitbit’s heart-rate zones and Active Zone Minutes, your resting-HR and HRV ranges, ECG and more. Sign in with the account your Fitbit uses."
            disabled={busy !== null || syncing}
            loading={busy === "google"}
            onPress={() => go("google")}
          />
        </Appear>
      )}
      {googleError && <SignInProblem error={googleError} onRetry={() => void go("google")} busy={busy !== null} />}
      <Appear index={step++}>
        <Option
          icon={HeartPulse}
          system="pink"
          primary={!GOOGLE_SOURCE_ENABLED}
          title="Connect Health Connect"
          body={
            hcOk
              ? "Reads the last 180 nights. Allow every permission on the next screen, including access to older data."
              : app.availability === "update_required"
                ? "Health Connect needs an update. Open it from the Play Store, then come back."
                : "Health Connect is not available on this device."
          }
          disabled={!hcOk || busy !== null || syncing}
          loading={busy === "health"}
          onPress={() => go("health")}
        />
      </Appear>
      {app.availability === "update_required" && (
        <CalmButton variant="quiet" size="md" onPress={() => openHealthConnectSettings()} style={{ alignSelf: "center" }}>
          Open Health Connect
        </CalmButton>
      )}
      <Appear index={step++}>
        <Option
          icon={Sparkles}
          system="purple"
          title="Try with demo data"
          body={`180 days of generated data for a demo person, so every screen has something to show. Switch to ${GOOGLE_SOURCE_ENABLED ? "your own data" : "Health Connect"} later in Settings.`}
          disabled={busy !== null || syncing}
          loading={busy === "demo"}
          onPress={() => go("demo")}
        />
      </Appear>
    </ScrollView>
  );
}

/**
 * One source as a big card, Apple Health's: the coloured icon square (a spinner in it while connecting), the name in
 * bold over what it reads, and the way on, filled blue for the recommended choice.
 */
function Option({ icon, system, primary = false, title, body, disabled, loading, onPress }: { icon: LucideIcon; system: SystemColor; primary?: boolean; title: string; body: string; disabled?: boolean; loading?: boolean; onPress: () => void }) {
  const c = useCalm();
  const press = usePress();
  const pressed = usePressStyle(press, { rest: disabled && !loading ? 0.5 : 1, dim: 0.88 });
  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${title}. ${body}`} accessibilityState={{ disabled: !!disabled, busy: !!loading }}>
      <Animated.View style={[{ borderRadius: 24, backgroundColor: c.card, padding: 20, gap: 14 }, pressed]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <RowIcon icon={loading ? undefined : icon} node={loading ? <ActivityIndicator color="#ffffff" /> : undefined} system={system} size={52} />
          {/* The way on: filled blue for the recommended choice, the quiet fill for the others. */}
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: primary ? c.teal : c.fill, alignItems: "center", justifyContent: "center" }}>
            <ArrowRight size={18} color={primary ? "#ffffff" : c.teal} strokeWidth={2.4} />
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <Txt size={20} lineHeight={25} weight={700} style={{ color: c.ink }}>
            {title}
          </Txt>
          <Txt size={15} lineHeight={20} style={{ color: c.sub }}>
            {body}
          </Txt>
        </View>
      </Animated.View>
    </Pressable>
  );
}
