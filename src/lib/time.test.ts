import { describe, expect, it } from "vitest";
import { localDay, localMidnight, localMinutes } from "./time";

const at = (iso: string) => Date.parse(iso) / 1000;

describe("localMinutes", () => {
  it("is the clock's minutes after midnight on an ordinary day", () => {
    expect(localMinutes(at("2026-10-02T07:39:00+05:30"), "Asia/Kolkata")).toBe(459);
    expect(localMinutes(at("2026-10-02T23:30:00+05:30"), "Asia/Kolkata")).toBe(1410);
    expect(localMinutes(localMidnight("2026-10-02", "Asia/Kolkata"), "Asia/Kolkata")).toBe(0);
  });

  it("reads the clock, not the time elapsed, on a fall-back day (25 hours)", () => {
    // New York falls back at 02:00 EDT on 2025-11-02: 07:39 EST is 8 h 39 min after midnight, but the clock says 07:39.
    const wake = at("2025-11-02T07:39:00-05:00");
    expect(localDay(wake, "America/New_York")).toBe("2025-11-02");
    expect(localMinutes(wake, "America/New_York")).toBe(459);
    // The repeated hour reads the same both times.
    expect(localMinutes(at("2025-11-02T01:30:00-04:00"), "America/New_York")).toBe(90);
    expect(localMinutes(at("2025-11-02T01:30:00-05:00"), "America/New_York")).toBe(90);
  });

  it("reads the clock on a spring-forward day (23 hours)", () => {
    // New York springs forward at 02:00 EST on 2026-03-08: 08:54 EDT is 7 h 54 min after midnight.
    expect(localMinutes(at("2026-03-08T08:54:00-04:00"), "America/New_York")).toBe(534);
    expect(localMinutes(at("2026-03-08T17:00:00-04:00"), "America/New_York")).toBe(17 * 60);
  });

  it("reads the clock where the change skips midnight itself (Santiago)", () => {
    // Chile's clocks go from 00:00 to 01:00 on 2026-09-06, so the day opens at 01:00; 07:00 is still 420.
    const tz = "America/Santiago";
    const seven = at("2026-09-06T07:00:00-03:00");
    expect(localDay(seven, tz)).toBe("2026-09-06");
    expect(localMinutes(seven, tz)).toBe(420);
  });
});
