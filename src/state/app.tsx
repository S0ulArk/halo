// App-wide state: the store, the profile, where data comes from (Health Connect, a Google account through the Google
// Health API, or the demo generator), the sync + scoring run, and the query context screens read with. One provider at
// the root; screens use the hooks.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { perf } from "@/lib/perf";
import * as React from "react";
import { AppState as RNAppState } from "react-native";
// Background sync and notifications (src/background): the run body shared with the WorkManager task, the task's
// registration at boot, and the tapped-notification → screen hook.
import { useNotificationDeepLinks } from "@/background/links";
import { markUiRuntime, registerAppStore, runSync } from "@/background/runSync";
import { startBackground } from "@/background/startup";
import { openStore } from "@/data/db";
import { seedDemo } from "@/data/seed";
import type { Store } from "@/data/store";
import type { HrSample, Profile, SyncState } from "@/data/types";
import { connectGoogleAccount, disconnectGoogleAccount, forgetGoogleToken, googleConnection, googleToken } from "@/google/auth";
import { pullGoogleHeartRate } from "@/google/live";
import { clearConnection, forgetGoogleSync, type GoogleConnection } from "@/google/state";
import { askPermissions, availability, permissionState, type Availability } from "@/health/connect";
import { refreshRecentHeartRate } from "@/health/live";
import { forgetChanges } from "@/health/sync";
import { toSignInError, type GoogleSignInError } from "../../modules/pulse-google/errors";
import { localDay } from "@/lib/time";
import type { QueryCtx } from "@/queries/ctx";
import { useAfterTransition } from "@/ui/components/AfterTransition";
// Live heart rate over Bluetooth (display-only; never written to the Store), available to every screen.
import { LiveBleProvider } from "./liveBle";

export type Source = "health_connect" | "google" | "demo";
export type Status = "booting" | "needs_profile" | "needs_permissions" | "syncing" | "ready" | "error";
export type Progress = { step: string; done: number; total: number };

/**
 * The "current heart rate": the newest sample Health Connect holds (or the demo wrote), refreshed by the foreground
 * ticker without a scoring run: as live as the Google Health sync. (The band's own beat-by-beat reading, when it
 * shares heart rate over Bluetooth, is LiveBleProvider's, display-only.)
 */
export type LiveHr = {
  /** Unix seconds and bpm of the newest reading; null before the first sync or with no heart rate at all. */
  latest: { ts: number; bpm: number } | null;
  /** The 30 minutes of samples ending at `latest`, ascending (the Home card's sparkline). */
  recent: HrSample[];
  /** Epoch ms of the last completed refresh; null before the first. */
  updatedAt: number | null;
  refreshing: boolean;
  /** Why the last refresh could not read Health Connect (permission, availability, a read error), or null. */
  error: string | null;
};
const EMPTY_LIVE: LiveHr = { latest: null, recent: [], updatedAt: null, refreshing: false, error: null };
/** The ticker's cadence while the app is in the foreground. */
const LIVE_EVERY_MS = 60_000;

type State = {
  status: Status;
  source: Source | null;
  profile: Profile | null;
  sync: SyncState;
  progress: Progress | null;
  error: string | null;
  availability: Availability | null;
  /** Bumped after every scoring run so hooks refetch. */
  dataVersion: number;
  liveHr: LiveHr;
  /** Bumped when a live refresh brings new samples, so a screen reading today's heart rate can refetch (not part of the query ctx: only that screen pays). */
  liveVersion: number;
  /** The last completed sync's hints (e.g. "no_fitbit_records"), so Settings can explain an empty Pulse. */
  syncWarnings: string[];
  /** The connected Google account (the Google Health API source), or null. */
  google: GoogleConnection | null;
};

type Actions = {
  /** Saves the profile; with no source chosen yet the flow moves on to choosing one. */
  saveProfile(p: Profile): Promise<void>;
  /** Generated data for a shared demo person; no Health Connect needed. */
  useDemo(): Promise<void>;
  /** Shows the Health Connect permission sheet, then imports and scores. */
  connectHealth(): Promise<void>;
  /**
   * Google's account picker and consent screen, then the Google Health API import and scoring. Resolves null once
   * connected, or the typed sign-in failure (not configured, cancelled, no Play services, scope not granted…).
   */
  connectGoogle(): Promise<GoogleSignInError | null>;
  /**
   * Revokes Pulse's access to the Google account and forgets it; what was imported stays on the phone. With Google as
   * the source, the source is cleared too (the data-source choice opens). Resolves whether Google confirmed.
   */
  disconnectGoogle(): Promise<{ revoked: boolean }>;
  /** Re-imports recent days and rescores. No-op while a run is in flight. */
  refresh(): Promise<void>;
  /** Re-reads the whole history window from Health Connect (for data an app shared late), then rescores. */
  reimport(): Promise<void>;
  /** Drops every row and setting. */
  reset(): Promise<void>;
  /** Re-reads the last few minutes of heart rate (Health Connect) or the newest stored sample (demo). Cheap; no scoring run. */
  refreshLiveHr(): Promise<void>;
  /**
   * Logged data the screens add up as they read (food, water) changed: every screen reads again, with no sync or
   * scoring run (neither reads them).
   */
  dataChanged(): void;
};

const SOURCE_KEY = "pulse.source";
const OWN_PROFILE_KEY = "pulse.ownProfile";
/** Where the Store's imported rows came from: "health_connect", or "google:<email>" for a Google account. */
const IMPORTED_KEY = "pulse.importedFrom";
const EMPTY_SYNC: SyncState = { lastSyncTs: null, firstDay: null, lastError: null };

/**
 * Before importing from `next` ("health_connect" or "google:<email>"): drops what another source (or another Google
 * account) imported, rows, samples and scores, so the same night never sits there twice, and both importers' cursors,
 * so the new one reads its whole history window. The profile, the journal and Pulse's own logs stay. `current` is
 * where the rows came from on an install from before IMPORTED_KEY.
 */
async function claimImports(st: Store, next: string, current: string | null): Promise<void> {
  const prev = (await AsyncStorage.getItem(IMPORTED_KEY).catch(() => null)) ?? current;
  if (prev !== null && prev !== next) {
    await st.clearImported({ from: "0000-01-01", to: "9999-12-31" }, 0, 2 ** 31);
    await st.setSyncState(EMPTY_SYNC);
    await forgetChanges();
    await forgetGoogleSync();
  }
  await AsyncStorage.setItem(IMPORTED_KEY, next);
}

/** The import identity of a Google account; an account whose email Google didn't give counts as the last one. */
const googleIdentity = (email: string | null, prev: string | null) => (email ? `google:${email}` : prev?.startsWith("google:") ? prev : "google:");

/**
 * Three contexts, so a change reaches only who needs it: the app (status, source, profile, scores' version… plus the
 * actions, stable for the app's life), the live heart rate (a refresh every minute) and the sync's progress (many
 * updates a run). Before, one value carried all three and was rebuilt on every render, so every screen re-rendered
 * on each live tick and progress step, which kept the JS thread busy while a sync ran.
 */
type MainState = Omit<State, "liveHr" | "liveVersion" | "progress">;
type AppValue = MainState & { store: Store | null; timeZone: string; today: string } & Actions;
const Ctx = React.createContext<AppValue | null>(null);
type LiveValue = { liveHr: LiveHr; liveVersion: number; refreshLiveHr(): Promise<void> };
const LiveCtx = React.createContext<LiveValue | null>(null);
const ProgressCtx = React.createContext<Progress | null>(null);

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = React.useState<Store | null>(null);
  const [state, set] = React.useState<State>({
    status: "booting",
    source: null,
    profile: null,
    sync: EMPTY_SYNC,
    progress: null,
    error: null,
    availability: null,
    dataVersion: 0,
    liveHr: EMPTY_LIVE,
    liveVersion: 0,
    syncWarnings: [],
    google: null,
  });
  const running = React.useRef<Promise<void> | null>(null);
  /** A live refresh in flight: the ticker and a tap never stack reads. */
  const liveBusy = React.useRef(false);
  const timeZone = React.useMemo(deviceTimeZone, []);
  const today = localDay(Date.now() / 1000, timeZone);
  // A tapped notification opens its screen once the navigator exists (src/background/links.ts).
  useNotificationDeepLinks();

  const patch = (p: Partial<State>) => set((s) => ({ ...s, ...p }));

  /** Import (when the source is Health Connect) and score. Serialised: a second call joins the first. */
  const run = React.useCallback(
    async (st: Store, profile: Profile, source: Source) => {
      if (running.current) return running.current;
      const job = (async () => {
        patch({ status: "syncing", error: null });
        try {
          // The sync + pipeline body is src/background/runSync.ts, shared with the background task. It takes the
          // cross-runtime run lock and sends the alerts that are due; when the task holds the lock, the app waits for
          // that run to end and then shows its scores.
          const r = await runSync(st, profile, source, {
            timeZone,
            owner: "app",
            waitIfLocked: true,
            onProgress: (step, done, total) => patch({ progress: { step, done, total } }),
          });
          if (r.warnings.length) console.log("[sync]", r.warnings.join("; "));
          if (!r.ran) console.log("[run] skipped:", r.skipped);
          const sync = await st.getSyncState();
          set((s) => ({ ...s, status: "ready", progress: null, sync, dataVersion: s.dataVersion + 1, syncWarnings: r.ran ? r.warnings : s.syncWarnings }));
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.warn("[run]", message);
          const sync = await st.getSyncState().catch(() => EMPTY_SYNC);
          // Scores from the last good run are still on disk, so stay usable and show the error.
          set((s) => ({ ...s, status: s.dataVersion > 0 || sync.lastSyncTs ? "ready" : "error", error: message, progress: null, sync }));
        } finally {
          running.current = null;
        }
      })();
      running.current = job;
      return job;
    },
    [timeZone],
  );

  // Boot: open the store, read what's saved, decide the first screen.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await openStore();
        // The background task reuses this connection when it fires while the app is up; the task registration and
        // the check-in reminder are made to match the saved settings (src/background/startup.ts).
        registerAppStore(st);
        // This runtime has a screen: its syncs slice their work so taps and frames get through (src/lib/yield.ts).
        markUiRuntime();
        void startBackground();
        const [profile, source, sync, avail, google] = await Promise.all([
          st.getProfile(),
          AsyncStorage.getItem(SOURCE_KEY).catch(() => null) as Promise<Source | null>,
          st.getSyncState(),
          availability().catch((): Availability => "unavailable"),
          googleConnection().catch(() => null),
        ]);
        if (cancelled) return;
        setStore(st);
        patch({ profile, source, sync, availability: avail, google });
        if (!profile) return patch({ status: "needs_profile" });
        if (!source) return patch({ status: "needs_permissions" });
        if (source === "health_connect") {
          const perms = await permissionState().catch(() => null);
          if (!perms || perms.granted.length === 0) return patch({ status: "needs_permissions" });
        }
        // Google's grant lives in Play services; with no account saved there is nothing to sync from.
        if (source === "google" && !google) return patch({ status: "needs_permissions" });
        // Show the last scores at once; refresh in the background.
        patch({ status: sync.lastSyncTs || source === "demo" ? "ready" : "syncing" });
        void run(st, profile, source);
      } catch (e) {
        if (!cancelled) patch({ status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [run]);

  // Coming back to the foreground after 10 minutes away re-imports (Health Connect gets new nights while the app sleeps).
  React.useEffect(() => {
    let backgroundAt: number | null = null;
    const sub = RNAppState.addEventListener("change", (next) => {
      if (next !== "active") {
        backgroundAt ??= Date.now();
        return;
      }
      const away = backgroundAt === null ? 0 : Date.now() - backgroundAt;
      backgroundAt = null;
      if (away > 10 * 60_000 && store && state.profile && state.source) void run(store, state.profile, state.source);
    });
    return () => sub.remove();
  }, [store, state.profile, state.source, run]);

  /**
   * The live reading: one short Health Connect read (the Store alone in demo), no scoring run. Skipped while a full
   * run is importing (it reads the same days) or while a previous live read is still in flight. Never throws.
   */
  const refreshLiveHr = React.useCallback(async () => {
    const source = state.source;
    if (!store || !source || running.current || liveBusy.current) return;
    liveBusy.current = true;
    set((s) => ({ ...s, liveHr: { ...s.liveHr, refreshing: true } }));
    try {
      const t0 = Date.now();
      const r = await refreshRecentHeartRate(store, {
        source,
        timeZone,
        pullGoogle: (st, tz) => pullGoogleHeartRate(st, { token: googleToken, timeZone: tz }),
      });
      perf("live-hr", `${Date.now() - t0}ms`, `+${r.added}`);
      set((s) => {
        const moved = r.added > 0 || r.latest?.ts !== s.liveHr.latest?.ts || r.latest?.bpm !== s.liveHr.latest?.bpm;
        return {
          ...s,
          liveHr: { latest: r.latest, recent: r.samples, updatedAt: Date.now(), refreshing: false, error: r.error ?? null },
          liveVersion: moved ? s.liveVersion + 1 : s.liveVersion,
        };
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set((s) => ({ ...s, liveHr: { ...s.liveHr, updatedAt: Date.now(), refreshing: false, error: message } }));
    } finally {
      liveBusy.current = false;
    }
  }, [store, state.source, timeZone]);

  // The foreground ticker: a live refresh at once, then every minute, while the app is active and ready (a full run
  // sets status "syncing", which tears this down until it ends; its "ready" plus the new dataVersion start it again,
  // so every run is followed by a live read). Backgrounded, the interval is cleared and nothing is read.
  React.useEffect(() => {
    if (!store || !state.source || state.status !== "ready") return;
    let id: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (id !== null) clearInterval(id);
      id = null;
    };
    const start = () => {
      stop();
      void refreshLiveHr();
      id = setInterval(() => void refreshLiveHr(), LIVE_EVERY_MS);
    };
    // currentState can still be unknown right after launch; only a known background state holds the ticker back.
    if (RNAppState.currentState !== "background" && RNAppState.currentState !== "inactive") start();
    const sub = RNAppState.addEventListener("change", (next) => (next === "active" ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [store, state.source, state.status, state.dataVersion, refreshLiveHr]);

  const actions: Actions = {
    async saveProfile(p) {
      if (!store) return;
      await store.setProfile(p);
      patch({ profile: p, status: state.source ? "syncing" : "needs_permissions" });
      if (state.source) void run(store, p, state.source);
    },
    async useDemo() {
      if (!store) return;
      patch({ status: "syncing", progress: { step: "Generating demo data", done: 0, total: 1 } });
      // The demo data belongs to a demo person with their own profile; keep the person's own to restore later.
      if (state.profile && state.source !== "demo") await AsyncStorage.setItem(OWN_PROFILE_KEY, JSON.stringify(state.profile));
      await store.clearAll();
      // Nothing imported is left: the next real source reads its whole history window.
      await AsyncStorage.multiRemove([IMPORTED_KEY]).catch(() => {});
      await forgetGoogleSync();
      const profile = await seedDemo(store, { today, timeZone });
      await store.setProfile(profile);
      await AsyncStorage.setItem(SOURCE_KEY, "demo");
      // The demo person's reading replaces the own one once the run ends; until then show none.
      patch({ profile, source: "demo", liveHr: EMPTY_LIVE });
      await run(store, profile, "demo");
    },
    async connectHealth() {
      if (!store || !state.profile) return;
      const perms = await askPermissions();
      if (perms.granted.length === 0) {
        patch({ status: "needs_permissions", error: "Health Connect permissions were not granted." });
        return;
      }
      let profile = state.profile;
      if (state.source === "demo") {
        // Leaving demo: drop the demo person's rows and bring back the person's own profile.
        const own = await AsyncStorage.getItem(OWN_PROFILE_KEY).catch(() => null);
        if (own) profile = { ...(JSON.parse(own) as Profile), timeZone };
        await store.clearAll();
        await store.setProfile(profile);
      } else {
        // Leaving Google: its rows go, or each night would be there twice.
        await claimImports(store, "health_connect", state.source === "google" ? googleIdentity(state.google?.email ?? null, null) : state.source);
      }
      await AsyncStorage.setItem(IMPORTED_KEY, "health_connect");
      await AsyncStorage.setItem(SOURCE_KEY, "health_connect");
      patch({ profile, source: "health_connect", error: null, liveHr: EMPTY_LIVE });
      await run(store, profile, "health_connect");
    },
    async connectGoogle() {
      if (!store || !state.profile) return null;
      let connected: Awaited<ReturnType<typeof connectGoogleAccount>>;
      try {
        connected = await connectGoogleAccount();
      } catch (e) {
        return toSignInError(e);
      }
      let profile = state.profile;
      const prev = state.source === "google" ? googleIdentity(state.google?.email ?? null, null) : state.source === "health_connect" ? "health_connect" : null;
      if (state.source === "demo") {
        const own = await AsyncStorage.getItem(OWN_PROFILE_KEY).catch(() => null);
        if (own) profile = { ...(JSON.parse(own) as Profile), timeZone };
        await store.clearAll();
        await store.setProfile(profile);
        await forgetGoogleSync();
        await AsyncStorage.multiRemove([IMPORTED_KEY]).catch(() => {});
      }
      // Health Connect's rows (or another Google account's) go before Google's arrive.
      const stored = await AsyncStorage.getItem(IMPORTED_KEY).catch(() => null);
      await claimImports(store, googleIdentity(connected.connection.email, stored ?? prev), prev);
      await AsyncStorage.setItem(SOURCE_KEY, "google");
      patch({ profile, source: "google", error: null, liveHr: EMPTY_LIVE, google: connected.connection });
      await run(store, profile, "google");
      return null;
    },
    async disconnectGoogle() {
      const r = await disconnectGoogleAccount();
      if (state.source === "google") {
        // The rows stay (and so do the cursors: the same account connected again carries on where it stopped).
        await AsyncStorage.multiRemove([SOURCE_KEY]).catch(() => {});
        set((s) => ({ ...s, source: null, google: null, status: "needs_permissions", error: null, liveHr: EMPTY_LIVE }));
      } else patch({ google: null });
      return r;
    },
    async refresh() {
      if (!store || !state.profile || !state.source) return;
      await run(store, state.profile, state.source);
    },
    async reimport() {
      if (!store || !state.profile || !state.source) return;
      if (state.source === "health_connect") await forgetChanges();
      // Google: every type backfills its whole history window again (rows are upserted, nothing is cleared first).
      if (state.source === "google") await forgetGoogleSync();
      await run(store, state.profile, state.source);
    },
    async reset() {
      if (!store) return;
      await store.clearAll();
      await AsyncStorage.multiRemove([SOURCE_KEY, OWN_PROFILE_KEY, IMPORTED_KEY]);
      await forgetChanges();
      // The Google grant stays with Google (Disconnect revokes it); Pulse forgets the account and its cursors.
      await forgetGoogleSync();
      await clearConnection();
      forgetGoogleToken();
      set((s) => ({ ...s, status: "needs_profile", profile: null, source: null, sync: EMPTY_SYNC, error: null, dataVersion: s.dataVersion + 1, liveHr: EMPTY_LIVE, google: null }));
    },
    refreshLiveHr,
    dataChanged() {
      set((s) => ({ ...s, dataVersion: s.dataVersion + 1 }));
    },
  };

  // The actions as stable functions calling the latest closures, so the app's value only changes with its state.
  const actionsRef = React.useRef(actions);
  React.useLayoutEffect(() => {
    actionsRef.current = actions;
  });
  const stable = React.useMemo<Actions>(
    () => ({
      saveProfile: (p) => actionsRef.current.saveProfile(p),
      useDemo: () => actionsRef.current.useDemo(),
      connectHealth: () => actionsRef.current.connectHealth(),
      connectGoogle: () => actionsRef.current.connectGoogle(),
      disconnectGoogle: () => actionsRef.current.disconnectGoogle(),
      refresh: () => actionsRef.current.refresh(),
      reimport: () => actionsRef.current.reimport(),
      reset: () => actionsRef.current.reset(),
      refreshLiveHr: () => actionsRef.current.refreshLiveHr(),
      dataChanged: () => actionsRef.current.dataChanged(),
    }),
    [],
  );
  const st = state;
  const value = React.useMemo<AppValue>(
    () => ({
      status: st.status,
      source: st.source,
      profile: st.profile,
      sync: st.sync,
      error: st.error,
      availability: st.availability,
      dataVersion: st.dataVersion,
      syncWarnings: st.syncWarnings,
      google: st.google,
      ...stable,
      store,
      timeZone,
      today,
    }),
    // Only these fields: the live heart rate and the sync's progress have their own contexts.
    [st.status, st.source, st.profile, st.sync, st.error, st.availability, st.dataVersion, st.syncWarnings, st.google, stable, store, timeZone, today],
  );
  const live = React.useMemo<LiveValue>(() => ({ liveHr: state.liveHr, liveVersion: state.liveVersion, refreshLiveHr: stable.refreshLiveHr }), [state.liveHr, state.liveVersion, stable]);

  return (
    <Ctx.Provider value={value}>
      <LiveCtx.Provider value={live}>
        <ProgressCtx.Provider value={state.progress}>
          <LiveBleProvider>{children}</LiveBleProvider>
        </ProgressCtx.Provider>
      </LiveCtx.Provider>
    </Ctx.Provider>
  );
}

export function useApp() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

/** The live heart rate (refreshed every minute while the app is open); only its readers re-render on a tick. */
export function useLiveHr(): LiveValue {
  const v = React.useContext(LiveCtx);
  if (!v) throw new Error("useLiveHr outside AppProvider");
  return v;
}

/** The running sync's step and count, or null; only its readers re-render as it moves. */
export function useSyncProgress(): Progress | null {
  return React.useContext(ProgressCtx);
}

/** The context the ported queries take. null until the store and profile exist. */
export function useQueryCtx(): QueryCtx | null {
  const a = useApp();
  return React.useMemo(() => {
    if (!a.store || !a.profile) return null;
    return { store: a.store, profile: a.profile, timeZone: a.timeZone, today: a.today, now: Math.floor(Date.now() / 1000), sync: a.sync };
    // dataVersion is part of the key so a new scoring run produces a new ctx and every useQuery refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.store, a.profile, a.timeZone, a.today, a.sync, a.dataVersion]);
}

export type QueryResult<T> = { data: T | undefined; error: Error | null; loading: boolean };

// ── The view-model cache ─────────────────────────────────────────────────────
// A keyed view model is worked out once per scoring run and shared: screens showing the same day reuse it (Today,
// Activity and Health all read the day's Home model), a screen opened again has its numbers at once, and Today warms
// the other tabs' models in the background (prefetchQuery). The stamp (scoring run, day, zone) retires an entry.
type CacheEntry = { stamp: string; promise: Promise<unknown> };
const queryCache = new Map<string, CacheEntry>();
const CACHE_MAX = 64;

function runCached<T>(key: string, stamp: string, run: () => Promise<T>): Promise<T> {
  const hit = queryCache.get(key);
  if (hit && hit.stamp === stamp) return hit.promise as Promise<T>;
  const t0 = Date.now();
  const promise = run();
  void promise.then(() => perf("query", key, `${Date.now() - t0}ms`)).catch(() => {});
  queryCache.delete(key);
  queryCache.set(key, { stamp, promise });
  // A failed read isn't kept: the next screen tries again.
  promise.catch(() => {
    if (queryCache.get(key)?.promise === promise) queryCache.delete(key);
  });
  while (queryCache.size > CACHE_MAX) queryCache.delete(queryCache.keys().next().value!);
  return promise;
}

/** The current scoring run's stamp, for prefetchQuery. */
export function useQueryStamp(): string {
  const a = useApp();
  return `${a.dataVersion}|${a.today}|${a.timeZone}`;
}

/** Works out a keyed view model ahead of time (the cache's), so the screen that needs it opens with it ready. */
export function prefetchQuery<T>(key: string, stamp: string, run: () => Promise<T>): Promise<unknown> {
  return runCached(key, stamp, run).catch(() => undefined);
}

/**
 * Runs `fn(ctx, ...)` and re-runs when the ctx (a new scoring run) or `deps` change. The work starts as the screen
 * mounts; the result reaches the screen once its open transition has landed (useAfterTransition), so the slide runs
 * over the light skeleton and the numbers follow straight away. With a `key` (unique to what `fn` reads, e.g.
 * `sleep:2026-10-08`) the result is shared through the cache for the rest of the scoring run.
 */
export function useQuery<T>(fn: (ctx: QueryCtx) => Promise<T>, deps: React.DependencyList = [], key?: string): QueryResult<T> {
  const ctx = useQueryCtx();
  const opened = useAfterTransition();
  const stamp = useQueryStamp();
  const [r, setR] = React.useState<QueryResult<T>>({ data: undefined, error: null, loading: true });
  // The work starts at once (during the screen's slide, on the JS thread, while the slide runs natively); its result is
  // handed over only once the screen has opened, so the slide never carries a heavy re-render, and the numbers are
  // there the moment it lands.
  const openedRef = React.useRef(opened);
  const waiting = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    openedRef.current = opened;
    if (opened && waiting.current) {
      const deliver = waiting.current;
      waiting.current = null;
      deliver();
    }
  }, [opened]);
  React.useEffect(() => {
    if (!ctx) return;
    let live = true;
    // The same object when already loading (a mount), so no render is spent on it.
    setR((s) => (s.loading ? s : { ...s, loading: true }));
    const job = key ? runCached(key, stamp, () => fn(ctx)) : fn(ctx);
    const deliver = () => {
      job.then(
        (data) => live && setR({ data, error: null, loading: false }),
        // Keep the last good data: a failed background refresh shouldn't blank a screen that was already showing.
        (e) => live && setR((s) => ({ data: s.data, error: e instanceof Error ? e : new Error(String(e)), loading: false })),
      );
    };
    if (openedRef.current) deliver();
    else waiting.current = deliver;
    return () => {
      live = false;
      if (waiting.current === deliver) waiting.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, key, stamp, ...deps]);
  return r;
}
