import { afterEach, describe, expect, it, vi } from "vitest";
import { finish, setForeground, slice, SLICE_MS, sliced, type Steps } from "./yield";

/** Holds the thread, as a long loop does. */
const busy = (ms: number) => {
  const until = Date.now() + ms;
  while (Date.now() < until);
};

afterEach(() => {
  setForeground(false);
  vi.useRealTimers();
});

describe("slice", () => {
  it("never yields until the app says it is on screen", () => {
    busy(SLICE_MS + 2);
    expect(slice()).toBeUndefined();
  });

  it("yields a macrotask once the slice is used up, then not again until the next one is", async () => {
    setForeground(true);
    busy(SLICE_MS + 2);
    let timerRan = false;
    setTimeout(() => (timerRan = true), 0);
    const p = slice();
    expect(p).toBeInstanceOf(Promise);
    await p;
    // A timer queued before the yield ran during it: the thread was given back.
    expect(timerRan).toBe(true);
    expect(slice()).toBeUndefined();
  });

  it("lets a waiting yield go when the app leaves the screen, whose timers Android stops", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    setForeground(true);
    busy(SLICE_MS + 2);
    const p = slice();
    let done = false;
    void p?.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    setForeground(false);
    await p;
    expect(done).toBe(true);
  });
});

describe("steps", () => {
  function* count(n: number): Steps<number> {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += i;
      yield;
    }
    return sum;
  }

  it("run to the same result at once or sliced", async () => {
    setForeground(true);
    expect(finish(count(1000))).toBe(499_500);
    expect(await sliced(count(1000))).toBe(499_500);
  });
});
