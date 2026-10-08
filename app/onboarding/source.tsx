// Choose where data comes from: a Google account (the Google Health API, the richer source), Health Connect (the Google
// Health app writes Fitbit data there) or generated demo data. Calm: the warm ground, white option cards with a pastel
// icon tile each, the first one's arrow in solid teal.
import { ArrowRight, CircleAlert, Cloud, HeartPulse, Sparkles, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GOOGLE_SOURCE_ENABLED } from "@/google/flags";
import { openHealthConnectSettings } from "@/health/connect";
import { useApp, useSyncProgress } from "@/state/app";
import { Txt } from "@/ui";
import { Wordmark } from "@/ui/components/Wordmark";
import { CalmButton, CalmProgress, IconTile, Notice, Num, Sentence, Surface, Title, useCalm, type CalmTint } from "@/screens/settings/calmKit";
import { SignInProblem } from "@/screens/settings/google";
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.ground }} contentContainerStyle={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24, paddingHorizontal: 16, gap: 16 }}>
      <View style={{ alignItems: "center", marginBottom: 8 }}>
        <Wordmark height={22} color={c.sub} />
      </View>
      <View style={{ gap: 8, paddingHorizontal: 4 }}>
        <Txt size={28} lineHeight={34} weight={700} accessibilityRole="header" style={{ color: c.ink }}>
          Your data
        </Txt>
        <Sentence size={15}>
          {GOOGLE_SOURCE_ENABLED
            ? "Halo scores Sleep, Recovery and Strain from your Fitbit’s heart-rate, HRV and sleep data: read from your Google account, or from Health Connect, where the Google Health app writes it."
            : "Halo scores Sleep, Recovery and Strain from the heart-rate, HRV and sleep data your Fitbit writes to Health Connect through the Google Health app."}
        </Sentence>
      </View>

      {syncing && (
        <Surface padding={18} gap={12}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <ActivityIndicator color={c.teal} />
            <Title style={{ flex: 1 }} size={16}>
              {syncProgress ? progressLabel({ ...syncProgress, total: 0 }) : "Importing"}
            </Title>
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
        <Option
          icon={Cloud}
          tint="sky"
          primary
          title="Google account (Google Health API)"
          body="The richer source: everything Health Connect has, plus blood oxygen, Fitbit’s heart-rate zones and Active Zone Minutes, your resting-HR and HRV ranges, ECG and more. Sign in with the account your Fitbit uses."
          disabled={busy !== null || syncing}
          loading={busy === "google"}
          onPress={() => go("google")}
        />
      )}
      {googleError && <SignInProblem error={googleError} onRetry={() => void go("google")} busy={busy !== null} />}
      <Option
        icon={HeartPulse}
        tint="rose"
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
      {app.availability === "update_required" && (
        <CalmButton variant="quiet" size="md" onPress={() => openHealthConnectSettings()} style={{ alignSelf: "center" }}>
          Open Health Connect
        </CalmButton>
      )}
      <Option
        icon={Sparkles}
        tint="lavender"
        title="Try with demo data"
        body={`180 days of generated data for a demo person, so every screen has something to show. Switch to ${GOOGLE_SOURCE_ENABLED ? "your own data" : "Health Connect"} later in Settings.`}
        disabled={busy !== null || syncing}
        loading={busy === "demo"}
        onPress={() => go("demo")}
      />
    </ScrollView>
  );
}

function Option({ icon, tint, primary = false, title, body, disabled, loading, onPress }: { icon: LucideIcon; tint: CalmTint; primary?: boolean; title: string; body: string; disabled?: boolean; loading?: boolean; onPress: () => void }) {
  const c = useCalm();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => ({ flexDirection: "row", gap: 14, padding: 18, borderRadius: 28, backgroundColor: c.card, alignItems: "center", opacity: disabled && !loading ? 0.5 : pressed ? 0.9 : 1 })}
    >
      <IconTile icon={icon} tint={tint} node={loading ? <ActivityIndicator color={c.tintInk[tint]} /> : undefined} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Title>{title}</Title>
        <Sentence>{body}</Sentence>
      </View>
      {/* The way on: solid teal for the first choice, the ground's grey for the others. */}
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: primary ? c.teal : c.ground, alignItems: "center", justifyContent: "center" }}>
        <ArrowRight size={18} color={primary ? c.card : c.teal} strokeWidth={2.25} />
      </View>
    </Pressable>
  );
}
