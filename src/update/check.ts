// The update check: Halo's latest GitHub release against the installed version. Asked every time Halo comes to the
// front (UpdatePrompt) and in the background task, while Settings › Notifications › "App updates" is on; About's
// "Check for updates" asks at once. Every request bypasses caches (GitHub's CDN keeps an answer for 60 s), so a release
// is seen as soon as it is published. The request carries nothing but the app's user agent: no health data, no
// account. A newer version shows the in-app dialog every time Halo is opened, and a notification once (when
// notifications are allowed). No React in here, so the background task can import it.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEEP_LINK } from "@/background/decide";
import { notificationPermission, sendNow } from "@/background/notify";
import { readSettings } from "@/background/settings";
import app from "../../app.json";
import { compareVersions, plainNotes } from "./version";

export const REPO = "S0ulArk/halo";
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const STATE_KEY = "pulse.update";

export const INSTALLED_VERSION: string = app.expo.version;

export type Release = {
  /** "1.23.0" */
  version: string;
  tag: string;
  /** The release notes as plain text. */
  notes: string;
  /** The .apk asset; null when the release has none (the button then opens the release page). */
  apkUrl: string | null;
  apkBytes: number | null;
  pageUrl: string;
};

type State = { checkedAt: number; latest: Release | null; notified?: string };

export type UpdateStatus = {
  /** The newer release, or null when Halo is up to date (or the check never succeeded). */
  available: Release | null;
  /** Unix ms of the last successful check; 0 if never. */
  checkedAt: number;
};

async function readState(): Promise<State> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as State) : { checkedAt: 0, latest: null };
  } catch {
    return { checkedAt: 0, latest: null };
  }
}

async function writeState(patch: Partial<State>): Promise<State> {
  const next = { ...(await readState()), ...patch };
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(next)).catch(() => {});
  listeners.forEach((l) => l());
  return next;
}

const listeners = new Set<() => void>();
/** Called whenever the saved state changes (a check), so About and the dialog agree. */
export function onUpdateState(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

type GitHubRelease = {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name: string; browser_download_url: string; size?: number }[];
};

/** The latest published release (drafts and pre-releases excluded by GitHub). Throws on a network or HTTP error. */
export async function fetchLatest(): Promise<Release> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    // A new URL each time, so neither GitHub's CDN nor the phone's HTTP cache can answer with an older release.
    const res = await fetch(`${LATEST_API}?_=${Date.now()}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": `Halo/${INSTALLED_VERSION}`, "Cache-Control": "no-cache" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const r = (await res.json()) as GitHubRelease;
    const apk = r.assets?.find((a) => a.name.toLowerCase().endsWith(".apk"));
    return {
      version: r.tag_name.replace(/^v/i, ""),
      tag: r.tag_name,
      notes: plainNotes(r.body ?? ""),
      apkUrl: apk?.browser_download_url ?? null,
      apkBytes: apk?.size ?? null,
      pageUrl: r.html_url,
    };
  } finally {
    clearTimeout(timer);
  }
}

const newer = (r: Release | null) => (r && compareVersions(r.version, INSTALLED_VERSION) > 0 ? r : null);

const statusOf = (s: State): UpdateStatus => ({ available: newer(s.latest), checkedAt: s.checkedAt });

/** What the last check found, without asking GitHub. */
export async function updateStatus(): Promise<UpdateStatus> {
  return statusOf(await readState());
}

let inflight: Promise<UpdateStatus> | null = null;

/**
 * Asks GitHub every time: About's button (`force`), and every open while the setting is on. GitHub allows 60
 * unauthenticated requests an hour per internet address; when it refuses (or can't be reached) the automatic check
 * keeps the last answer and never throws, while `force` throws. Calls made while one is under way share it.
 */
export function checkForUpdate({ force = false } = {}): Promise<UpdateStatus> {
  if (inflight && !force) return inflight;
  const run = (async () => {
    const s = await readState();
    if (!force && !(await readSettings()).updates) return statusOf(s);
    try {
      const latest = await fetchLatest();
      console.log(`[update] checked: latest ${latest.version}, installed ${INSTALLED_VERSION}${force ? " (manual)" : ""}`);
      return statusOf(await writeState({ checkedAt: Date.now(), latest }));
    } catch (e) {
      if (force) throw e;
      console.warn("[update]", e instanceof Error ? e.message : String(e));
      return statusOf(s);
    }
  })();
  inflight = run;
  void run.catch(() => {}).finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

/** The automatic check plus, once per version, the notification (when notifications are allowed). Never throws. */
export async function checkAndNotify(): Promise<UpdateStatus> {
  const status = await checkForUpdate();
  try {
    const r = status.available;
    if (r && (await readState()).notified !== r.tag && (await notificationPermission()) === "granted") {
      const ok = await sendNow({ title: `Halo ${r.version} is available`, body: "Tap to see what’s new and update.", url: DEEP_LINK.update });
      if (ok) await writeState({ notified: r.tag });
    }
  } catch (e) {
    console.warn("[update] notify", e instanceof Error ? e.message : String(e));
  }
  return status;
}
