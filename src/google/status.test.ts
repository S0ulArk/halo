import { describe, expect, it } from "vitest";
import type { JobState, SyncDoc } from "./state";
import { GOOGLE_GROUPS, groupStatus, importProgress, syncErrorText } from "./status";
import { JOBS } from "./sync";

const job = (p: Partial<JobState>): JobState => ({ syncedThrough: 1, backfillDone: 180, backfillTotal: 180, lastAttemptAt: 1, lastSuccessAt: 1, lastError: null, ...p });
const doc = (jobs: Record<string, JobState>): SyncDoc => ({ version: 1, jobs, devices: null });
const NOW = 1_800_000_000_000;

describe("Google sync status", () => {
  it("every job belongs to exactly one group", () => {
    const grouped = GOOGLE_GROUPS.flatMap((g) => g.types);
    expect([...grouped].sort()).toEqual(JOBS.map((j) => j.key).sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("reads an error the way a person would, keeping the code for a bug report", () => {
    expect(syncErrorText("[google] sleep: INVALID_ARGUMENT (HTTP 400)")).toBe("Failed (INVALID_ARGUMENT)");
    expect(syncErrorText("[google] steps: RESOURCE_EXHAUSTED (HTTP 429)")).toBe("Rate limited, retrying");
    expect(syncErrorText("[google] heart-rate: http_503 (HTTP 503)")).toBe("Google is having trouble, retrying");
    expect(syncErrorText("[google] electrocardiogram: PERMISSION_DENIED (HTTP 403)")).toBe("Not allowed");
    expect(syncErrorText("[google] heart-rate: network")).toBe("Couldn’t reach Google, retrying");
  });

  it("a group is ok only when every member has synced, its oldest success counts, and an error wins", () => {
    const t = NOW / 1000 - 60;
    const rows = groupStatus(doc({ steps: job({ lastSuccessAt: t }), "steps-daily": job({ lastSuccessAt: t - 10 }), sleep: job({ lastError: "[google] sleep: INVALID_ARGUMENT (HTTP 400)" }) }), NOW);
    const by = (k: string) => rows.find((r) => r.key === k)!;
    expect(by("steps")).toMatchObject({ status: "ok", lastSuccessAt: (t - 10) * 1000, error: null });
    expect(by("sleep")).toMatchObject({ status: "error", error: "Failed (INVALID_ARGUMENT)" });
    expect(by("heart-rate")).toMatchObject({ status: "never", lastSuccessAt: null });
    expect(groupStatus(doc({ "heart-rate": job({ lastSuccessAt: NOW / 1000 - 3 * 3600 }) }), NOW)[0].status).toBe("stale");
  });

  it("import progress follows the core types only", () => {
    expect(importProgress(doc({ "heart-rate": job({ backfillDone: 40 }), sleep: job({}), electrocardiogram: job({ backfillDone: 0 }) }))).toEqual({ done: 40, total: 180 });
    expect(importProgress(doc({ "heart-rate": job({}), electrocardiogram: job({ backfillDone: 0 }) }))).toBeNull();
  });
});
