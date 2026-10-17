import { describe, expect, it } from "vitest";
import { FRESH_SYNC_S, syncedRecently } from "./launchSync";

const tz = "Asia/Kolkata";
// 2026-10-17 15:00 in Kolkata (UTC+5:30).
const now = Date.UTC(2026, 9, 17, 9, 30) / 1000;

describe("syncedRecently", () => {
  it("skips the launch sync only within 10 minutes of the last import, on the same day", () => {
    expect(syncedRecently(now - 60, tz, now)).toBe(true);
    expect(syncedRecently(now - FRESH_SYNC_S + 1, tz, now)).toBe(true);
    expect(syncedRecently(now - FRESH_SYNC_S, tz, now)).toBe(false);
    expect(syncedRecently(null, tz, now)).toBe(false);
  });

  it("syncs after midnight even if the last import was minutes ago", () => {
    const justAfterMidnight = Date.UTC(2026, 9, 17, 18, 32) / 1000; // 00:02 on the 18th in Kolkata
    expect(syncedRecently(justAfterMidnight - 5 * 60, tz, justAfterMidnight)).toBe(false);
  });

  it("syncs when the clock went back past the last import", () => {
    expect(syncedRecently(now + 120, tz, now)).toBe(false);
  });
});
