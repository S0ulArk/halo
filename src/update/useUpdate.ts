// The update state for screens: what the last check found (kept in step with check.ts's saved state), a forced check
// for About's button, and the download-and-install with its progress.
import * as React from "react";
import { toast } from "@/screens/settings/toast";
import { checkForUpdate, onUpdateState, updateStatus, type Release, type UpdateStatus } from "./check";
import { installRelease } from "./install";

export function useUpdate() {
  const [status, setStatus] = React.useState<UpdateStatus | null>(null);
  const [checking, setChecking] = React.useState(false);
  /** null while idle; 0..1 while downloading (NaN while the size is unknown). */
  const [progress, setProgress] = React.useState<number | null>(null);

  React.useEffect(() => {
    let live = true;
    const read = () => void updateStatus().then((s) => live && setStatus(s));
    read();
    const off = onUpdateState(read);
    return () => {
      live = false;
      off();
    };
  }, []);

  const check = React.useCallback(async () => {
    setChecking(true);
    try {
      const s = await checkForUpdate({ force: true });
      setStatus(s);
      if (!s.available) toast("Halo is up to date");
    } catch {
      toast("Couldn’t reach GitHub. Check your connection.");
    } finally {
      setChecking(false);
    }
  }, []);

  const install = React.useCallback(async (r: Release): Promise<boolean> => {
    setProgress(0);
    try {
      await installRelease(r, (f) => setProgress(f ?? NaN));
      return true;
    } catch (e) {
      console.warn("[update] install", e instanceof Error ? e.message : String(e));
      toast("The update couldn’t be downloaded. Try again.");
      return false;
    } finally {
      setProgress(null);
    }
  }, []);

  return { status, checking, check, progress, install };
}

/** "Downloading 42%" / "Downloading…" */
export const downloadingLabel = (p: number | null) => (p == null || Number.isNaN(p) ? "Downloading…" : `Downloading ${Math.round(p * 100)}%`);
