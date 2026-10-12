// "Halo x.y.z is available": checks when Halo comes to the front (at most every 6 hours, check.ts), and shows the
// release notes once per version with Update (download, then Android's installer) and Later. Mounted once in the
// root layout, after onboarding.
import * as React from "react";
import { AppState } from "react-native";
import { ConfirmDialog } from "@/screens/coach/ConfirmDialog";
import { checkAndNotify, dismissUpdate, type Release } from "./check";
import { megabytes } from "./install";
import { downloadingLabel, useUpdate } from "./useUpdate";

export function UpdatePrompt() {
  const { install, progress } = useUpdate();
  const [offer, setOffer] = React.useState<Release | null>(null);

  React.useEffect(() => {
    let live = true;
    const run = () =>
      void checkAndNotify().then((s) => {
        if (live && s.available && !s.dismissed) setOffer(s.available);
      });
    run();
    const sub = AppState.addEventListener("change", (st) => st === "active" && run());
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
      onClose={() => {
        if (r) void dismissUpdate(r.tag);
        setOffer(null);
      }}
    />
  );
}
