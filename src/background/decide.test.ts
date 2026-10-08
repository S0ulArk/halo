// The notification and task-gate decisions (decide.ts) are pure: no expo module is imported here.
import { describe, expect, it } from "vitest";
import { CANT_SYNC_AFTER_S, DEEP_LINK, EMPTY_MARKERS, decide, formatTime, markSent, parseTime, recoveryBody, sinceWords, taskSkipReason, type DecideInput } from "./decide";
import { lockHolder } from "./lock";

const TZ = "Europe/Amsterdam";
/** 2026-10-07 08:30 Amsterdam (CEST, UTC+2). */
const NOW = Date.UTC(2026, 9, 7, 6, 30) / 1000;
const TODAY = "2026-10-07";

const base: DecideInput = {
  now: NOW,
  timeZone: TZ,
  source: "health_connect",
  settings: { recoveryReady: true, cantSync: true },
  recoveryToday: 78.4,
  lastSyncTs: NOW - 600,
  markers: EMPTY_MARKERS,
};

describe("decide: Recovery ready", () => {
  it("sends once today's Recovery exists, with the web's wording and the recovery deep link", () => {
    const [a] = decide(base);
    expect(a).toMatchObject({ kind: "recovery", title: "Recovery ready", body: "78%: Ready", url: DEEP_LINK.recovery, day: TODAY });
    expect(decide(base)).toHaveLength(1);
  });

  it("bands the rounded value like the dials: 66.9 is yellow, 33.9 is red", () => {
    expect(decide({ ...base, recoveryToday: 66.9 })[0].body).toBe("67%: Ready");
    expect(decide({ ...base, recoveryToday: 66.4 })[0].body).toBe("66%: Steady");
    expect(decide({ ...base, recoveryToday: 33.4 })[0].body).toBe("33%: Recover");
    expect(recoveryBody(100)).toBe("100%: Ready");
  });

  it("waits while today has no Recovery yet", () => {
    expect(decide({ ...base, recoveryToday: null })).toEqual([]);
    expect(decide({ ...base, recoveryToday: Number.NaN })).toEqual([]);
  });

  it("goes out once per local day: a marker for today (or a later day, clock set back) blocks it", () => {
    expect(decide({ ...base, markers: { ...EMPTY_MARKERS, recoveryDay: TODAY } })).toEqual([]);
    expect(decide({ ...base, markers: { ...EMPTY_MARKERS, recoveryDay: "2026-10-08" } })).toEqual([]);
    expect(decide({ ...base, markers: { ...EMPTY_MARKERS, recoveryDay: "2026-10-06" } })).toHaveLength(1);
  });

  it("uses the local day: 00:30 Amsterdam is still 'yesterday' in UTC, but today's marker is Amsterdam's", () => {
    const at0030 = Date.UTC(2026, 9, 6, 22, 30) / 1000; // 2026-10-07 00:30 CEST
    const [a] = decide({ ...base, now: at0030, markers: { ...EMPTY_MARKERS, recoveryDay: "2026-10-06" } });
    expect(a.day).toBe(TODAY);
  });

  it("respects the setting", () => {
    expect(decide({ ...base, settings: { recoveryReady: false, cantSync: false } })).toEqual([]);
  });

  it("never notifies for demo data or with no source", () => {
    expect(decide({ ...base, source: "demo", lastSyncTs: NOW - 3 * 86_400 })).toEqual([]);
    expect(decide({ ...base, source: null, lastSyncTs: NOW - 3 * 86_400 })).toEqual([]);
  });
});

describe("decide: Pulse can't sync", () => {
  const stale = { ...base, recoveryToday: null, lastSyncTs: NOW - CANT_SYNC_AFTER_S - 7200 };

  it("sends when the last sync is 36 h or older, naming the gap, linking to the data source", () => {
    const [a] = decide(stale);
    expect(a).toMatchObject({ kind: "cant_sync", title: "Halo can’t sync", url: DEEP_LINK.source, day: TODAY });
    expect(a.body).toBe("Health Connect hasn’t synced for 38 hours. Open Halo to sync.");
  });

  it("is quiet under 36 h, and when there has never been a sync (that is onboarding)", () => {
    expect(decide({ ...stale, lastSyncTs: NOW - CANT_SYNC_AFTER_S + 60 })).toEqual([]);
    expect(decide({ ...stale, lastSyncTs: null })).toEqual([]);
  });

  it("fires exactly at the threshold", () => {
    expect(decide({ ...stale, lastSyncTs: NOW - CANT_SYNC_AFTER_S })).toHaveLength(1);
  });

  it("goes out once per local day", () => {
    expect(decide({ ...stale, markers: { ...EMPTY_MARKERS, cantSyncDay: TODAY } })).toEqual([]);
    expect(decide({ ...stale, markers: { ...EMPTY_MARKERS, cantSyncDay: "2026-10-06" } })).toHaveLength(1);
  });

  it("respects the setting", () => {
    expect(decide({ ...stale, settings: { recoveryReady: true, cantSync: false } })).toEqual([]);
  });

  it("can go out together with Recovery ready (a score from an old night, no sync since)", () => {
    const both = decide({ ...stale, recoveryToday: 50 });
    expect(both.map((a) => a.kind)).toEqual(["recovery", "cant_sync"]);
  });

  it("words the gap in hours under two days, else days", () => {
    expect(sinceWords(3600)).toBe("1 hour");
    expect(sinceWords(47 * 3600 + 59)).toBe("47 hours");
    expect(sinceWords(48 * 3600)).toBe("2 days");
    expect(sinceWords(10 * 86_400)).toBe("10 days");
  });
});

describe("markSent", () => {
  it("records the day of each alert sent and leaves the rest", () => {
    const sent = decide({ ...base, lastSyncTs: NOW - 3 * 86_400 });
    expect(sent).toHaveLength(2);
    expect(markSent(EMPTY_MARKERS, [sent[0]])).toEqual({ ...EMPTY_MARKERS, recoveryDay: TODAY });
    expect(markSent({ ...EMPTY_MARKERS, recoveryDay: "2026-10-01", cantSyncDay: "2026-10-02", reportPeriod: "2026-W40" }, sent)).toEqual({
      ...EMPTY_MARKERS,
      recoveryDay: TODAY,
      cantSyncDay: TODAY,
      reportPeriod: "2026-W40",
    });
    expect(markSent(EMPTY_MARKERS, [])).toEqual(EMPTY_MARKERS);
  });

  it("marked alerts are not decided again", () => {
    const sent = decide(base);
    expect(decide({ ...base, markers: markSent(EMPTY_MARKERS, sent) })).toEqual([]);
  });
});

describe("parseTime / formatTime", () => {
  it("reads 24-hour HH:mm, with or without the leading zero", () => {
    expect(parseTime("21:00")).toEqual({ hour: 21, minute: 0 });
    expect(parseTime("9:05")).toEqual({ hour: 9, minute: 5 });
    expect(parseTime(" 07:30 ")).toEqual({ hour: 7, minute: 30 });
    expect(parseTime("00:00")).toEqual({ hour: 0, minute: 0 });
  });

  it("rejects what a clock would not show", () => {
    for (const s of ["24:00", "21:60", "9pm", "21", "21:0", "", "a:b", "-1:00"]) expect(parseTime(s), s).toBeNull();
  });

  it("formats back with two digits", () => {
    expect(formatTime({ hour: 7, minute: 5 })).toBe("07:05");
    expect(formatTime(parseTime("21:00")!)).toBe("21:00");
  });
});

describe("taskSkipReason", () => {
  const ok = { enabled: true, hasProfile: true, source: "health_connect" as const, background: true };

  it("runs only with the setting on, a profile, Health Connect as the source and background access", () => {
    expect(taskSkipReason(ok)).toBeNull();
    expect(taskSkipReason({ ...ok, enabled: false })).toBe("background sync is off");
    expect(taskSkipReason({ ...ok, hasProfile: false })).toBe("no profile yet");
    expect(taskSkipReason({ ...ok, source: "demo" })).toBe("demo data");
    expect(taskSkipReason({ ...ok, source: null })).toBe("no data source");
    expect(taskSkipReason({ ...ok, background: false })).toBe("no background access");
  });

  it("checks in that order, so the quietest reason wins", () => {
    expect(taskSkipReason({ enabled: false, hasProfile: false, source: null, background: false })).toBe("background sync is off");
  });
});

describe("lockHolder", () => {
  const now = 1_700_000_000_000;

  it("is free with no lock, held while fresh, free again once stale", () => {
    expect(lockHolder(null, now)).toBeNull();
    expect(lockHolder({ owner: "task", ts: now - 60_000 }, now)).toBe("task");
    expect(lockHolder({ owner: "app", ts: now - 19 * 60_000 }, now)).toBe("app");
    expect(lockHolder({ owner: "app", ts: now - 20 * 60_000 }, now)).toBeNull();
  });

  it("ignores a corrupt lock", () => {
    expect(lockHolder({ owner: "app", ts: Number.NaN }, now)).toBeNull();
  });
});

describe("a Google account as the source", () => {
  it("gets the same alerts as Health Connect, naming Google Health when it can't sync", () => {
    const g = { ...base, source: "google" as const };
    expect(decide(g).map((a) => a.kind)).toEqual(["recovery"]);
    const stale = decide({ ...g, recoveryToday: null, lastSyncTs: NOW - CANT_SYNC_AFTER_S });
    expect(stale.map((a) => [a.kind, a.body])).toEqual([["cant_sync", "Google Health hasn’t synced for 36 hours. Open Halo to sync."]]);
  });

  it("the background task runs with a connected account and needs no Health Connect permission", () => {
    const ok = { enabled: true, hasProfile: true, source: "google" as const, background: true };
    expect(taskSkipReason(ok)).toBeNull();
    expect(taskSkipReason({ ...ok, background: false })).toBe("no Google account connected");
    expect(taskSkipReason({ ...ok, enabled: false })).toBe("background sync is off");
  });
});
