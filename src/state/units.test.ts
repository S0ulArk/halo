// The units store (Settings › Units): read once from AsyncStorage "pulse.units", metric until set, a preset or one
// choice saved at once, metric kept as nothing, and readUnits (the coach's reader) answering with what is stored.
import { describe, expect, it, vi } from "vitest";
import { IMPERIAL, METRIC } from "@/lib/units";

const disk = new Map<string, string>([["pulse.units", JSON.stringify({ weight: "lb", distance: "furlongs" })]]);
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => disk.get(k) ?? null,
    setItem: async (k: string, v: string) => void disk.set(k, v),
    removeItem: async (k: string) => void disk.delete(k),
  },
}));
const { currentUnits, readUnits, setUnits, UNITS_KEY, updateUnits } = await import("./units");

describe("the units store", () => {
  it("reads what was stored, keeping only the known choices", async () => {
    expect(await readUnits()).toEqual({ ...METRIC, weight: "lb" });
    expect(currentUnits()).toEqual({ ...METRIC, weight: "lb" });
  });

  it("saves one choice on top of the rest, and a preset at once", async () => {
    await updateUnits({ temperature: "f" });
    expect(await readUnits()).toEqual({ ...METRIC, weight: "lb", temperature: "f" });
    expect(JSON.parse(disk.get(UNITS_KEY)!)).toEqual({ ...METRIC, weight: "lb", temperature: "f" });
    await setUnits(IMPERIAL);
    expect(await readUnits()).toEqual(IMPERIAL);
  });

  it("stores metric as nothing, so nothing changes for anyone who never chose", async () => {
    await setUnits(METRIC);
    expect(disk.has(UNITS_KEY)).toBe(false);
    expect(await readUnits()).toEqual(METRIC);
  });
});
