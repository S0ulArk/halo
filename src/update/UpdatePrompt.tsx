// "Halo x.y.z is available": checks GitHub every time Halo comes to the front (check.ts), and while a newer version is
// out shows its release notes every time, with Update (download, then Android's installer) and Later (closes it until
// Halo is opened again). The first time, it asks Android for permission to notify, so the background check can say
// so while Halo is closed. Mounted once in the root layout, after onboarding.
import * as React from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { askNotificationPermission, notificationPermission } from "@/background/notify";
import { readSettings } from "@/background/settings";
import { ConfirmDialog } from "@/screens/coach/ConfirmDialog";
import { checkAndNotify, type Release } from "./check";
import { megabytes } from "./install";
import { downloadingLabel, useUpdate } from "./useUpdate";

/** Set once Halo has asked for the notification permission on behalf of updates, so it never asks twice. */
const ASKED_KEY = "pulse.update.askedNotify";

async function askOnce(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return;
    if (!(await readSettings()).updates || (await notificationPermission()) !== "undetermined") return;
    await AsyncStorage.setItem(ASKED_KEY, "1");
    await askNotificationPermission();
  } catch {
    // Not asking is fine: the dialog still shows when Halo is open.
  }
}

export function UpdatePrompt() {
  const { install, progress } = useUpdate();
  const [offer, setOffer] = React.useState<Release | null>(null);

  React.useEffect(() => {
    let live = true;
    const run = () =>
      void checkAndNotify().then((s) => {
        if (live && s.available) setOffer(s.available);
      });
    void askOnce().then(run);
    // Every return to Halo from another app or the home screen counts as opening it.
    let last = AppState.currentState;
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active" && last === "background") run();
      last = st;
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  const r = offer;
  const size = megabytes(r?.apkBytes ?? null);
  const description = r
    ? [r.notes || "A new version of Halo is ready.", r.apkUrl ? `${size ? `${size} download. ` : ""}Your data stays as it is.` : "Opens the release on GitHub."].join("\n\n")
    : "";

  return (
    <ConfirmDialog
      open={!!r}
      title={r ? `Halo ${r.version} is available` : ""}
      description={description}
      confirm={r?.apkUrl ? "Update" : "Open GitHub"}
      cancel="Later"
      danger={false}
      pending={progress != null}
      pendingLabel={downloadingLabel(progress)}
      onConfirm={() => {
        if (!r) return;
        void install(r).then((ok) => ok && setOffer(null));
      }}
      onClose={() => setOffer(null)}
    />
  );
}
