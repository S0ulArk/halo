// The Heart Rate Measurement parser and the live RMSSD on real byte layouts (Bluetooth SIG GATT spec 0x2A37).
import { describe, expect, it } from "vitest";
import {
  backoffMs,
  base64ToBytes,
  cleanRr,
  liveTrace,
  looksLikeFitbit,
  parseHrMeasurement,
  parseHrMeasurementBase64,
  rankDevices,
  rmssd,
  sameUuid,
  signalWord,
  since,
  stampRr,
} from "./bleHr";

/** The base64 react-native-ble-plx hands over for these bytes. */
const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");

describe("base64ToBytes", () => {
  it("decodes what Buffer encodes, with and without padding", () => {
    for (const bytes of [[], [0x00], [0x16, 0x4b], [0x10, 0x48, 0x00, 0x04], [0xff, 0x00, 0x7f, 0x80, 0x01], Array.from({ length: 20 }, (_, i) => (i * 37) & 0xff)]) {
      expect([...base64ToBytes(b64(bytes))]).toEqual(bytes);
      expect([...base64ToBytes(b64(bytes).replace(/=+$/, ""))]).toEqual(bytes);
    }
  });

  it("skips whitespace and reads the URL-safe alphabet", () => {
    expect([...base64ToBytes("AE g=\n")]).toEqual([0x00, 0x48]);
    expect([...base64ToBytes("-_8")]).toEqual([...base64ToBytes("+/8")]);
  });
});

describe("parseHrMeasurement", () => {
  it("reads a uint8 bpm with no contact support", () => {
    // Flags 0x00: uint8 bpm, sensor contact not supported, nothing else. 72 bpm.
    expect(parseHrMeasurementBase64("AEg=")).toEqual({ bpm: 72, rrMs: [], contact: null });
  });

  it("reads a uint16 bpm", () => {
    // Flags 0x01: uint16 little-endian. 0x00B4 = 180, and 0x012C = 300 (above what a byte holds).
    expect(parseHrMeasurement([0x01, 0xb4, 0x00])).toEqual({ bpm: 180, rrMs: [], contact: null });
    expect(parseHrMeasurementBase64(b64([0x01, 0x2c, 0x01]))?.bpm).toBe(300);
  });

  it("reads sensor contact", () => {
    // Bits 1-2: 3 = contact detected, 2 = supported but no contact, 1 = not supported.
    expect(parseHrMeasurement([0x06, 0x3c])?.contact).toBe(true);
    expect(parseHrMeasurement([0x04, 0x3c])?.contact).toBe(false);
    expect(parseHrMeasurement([0x02, 0x3c])?.contact).toBeNull();
  });

  it("reads RR intervals in 1/1024 s as ms", () => {
    // A chest-strap style frame: flags 0x16 (contact + RR), 75 bpm, RR 0x0333 = 819/1024 s and 0x0340 = 832/1024 s.
    expect(parseHrMeasurementBase64(b64([0x16, 0x4b, 0x33, 0x03, 0x40, 0x03]))).toEqual({ bpm: 75, rrMs: [800, 813], contact: true });
    // 0x0400 = 1024/1024 s = exactly 1000 ms.
    expect(parseHrMeasurement([0x10, 0x3c, 0x00, 0x04])?.rrMs).toEqual([1000]);
  });

  it("skips energy expended before the RR intervals", () => {
    // Flags 0x18: energy (0x0123 kJ, skipped) then RR 0x0300 = 768/1024 s = 750 ms; 80 bpm.
    expect(parseHrMeasurement([0x18, 0x50, 0x23, 0x01, 0x00, 0x03])).toEqual({ bpm: 80, rrMs: [750], contact: null });
    // Everything at once: uint16 bpm 90, contact, energy, two RR.
    expect(parseHrMeasurementBase64(b64([0x1f, 0x5a, 0x00, 0x10, 0x00, 0x00, 0x04, 0x9a, 0x02]))).toEqual({ bpm: 90, rrMs: [1000, 650], contact: true });
    // Energy flagged with nothing after it: just the bpm.
    expect(parseHrMeasurement([0x08, 0x50])).toEqual({ bpm: 80, rrMs: [], contact: null });
  });

  it("ignores a dangling byte and rejects values too short for a bpm", () => {
    expect(parseHrMeasurement([0x10, 0x48, 0x00, 0x04, 0x07])?.rrMs).toEqual([1000]);
    expect(parseHrMeasurement([0x00])).toBeNull();
    expect(parseHrMeasurement([0x01, 0x48])).toBeNull();
    expect(parseHrMeasurementBase64("")).toBeNull();
  });
});

describe("rmssd", () => {
  /** n intervals alternating 800 / 810 ms: every successive difference is 10 ms. */
  const alternating = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 ? 810 : 800));

  it("is the RMS of successive differences", () => {
    expect(rmssd(alternating(21))).toBeCloseTo(10, 10);
    // 800, 820, 800, 840: differences 20, -20, 40 → sqrt((400 + 400 + 1600) / 3).
    expect(rmssd([800, 820, 800, 840], 3)).toBeCloseTo(Math.sqrt(800), 10);
  });

  it("needs enough clean pairs", () => {
    expect(rmssd(alternating(10))).toBeNull(); // 9 pairs
    expect(rmssd(alternating(11))).not.toBeNull();
    expect(rmssd([])).toBeNull();
  });

  it("drops out-of-range beats and jumps over 20 % without bridging them", () => {
    const clean = alternating(30);
    // A missed beat (1610 ms, a 100 % jump), an extra one (400 ms), one out of range (2500 ms) and a 250 ms spike.
    const dirty = [...clean.slice(0, 8), 1610, ...clean.slice(8, 16), 400, ...clean.slice(16, 22), 2500, ...clean.slice(22, 26), 250, ...clean.slice(26)];
    const marks = cleanRr(dirty);
    expect(marks.filter((v) => v === null)).toHaveLength(4);
    // Every surviving adjacent pair still differs by 10 ms: the artifacts were not averaged in or bridged.
    expect(rmssd(dirty)).toBeCloseTo(10, 10);
    // Unfiltered, the 1610 ms beat alone would dominate.
    const raw = Math.sqrt(dirty.slice(1).reduce((s, v, k) => s + (v - dirty[k]) ** 2, 0) / (dirty.length - 1));
    expect(raw).toBeGreaterThan(100);
  });

  it("follows a real change of rate after three rejections", () => {
    // 800 ms then 1000 ms (25 % slower): the first three 1000s are rejected, then the reference moves.
    const marks = cleanRr([800, 800, 800, 800, 800, ...Array(10).fill(1000)]);
    expect(marks).toEqual([800, 800, 800, 800, 800, null, null, null, 1000, 1000, 1000, 1000, 1000, 1000, 1000]);
    expect(rmssd([800, 800, 800, 800, 800, ...Array(10).fill(1000)])).toBe(0);
  });
});

describe("rolling windows", () => {
  it("stamps each interval with when it ended", () => {
    expect(stampRr([800, 1000], 10_000)).toEqual([
      { t: 9_000, rr: 800 },
      { t: 10_000, rr: 1000 },
    ]);
    expect(stampRr([], 5)).toEqual([]);
  });

  it("keeps the tail from a time on", () => {
    const xs = [{ t: 1 }, { t: 5 }, { t: 9 }];
    expect(since(xs, 5)).toEqual([{ t: 5 }, { t: 9 }]);
    expect(since(xs, 0)).toBe(xs);
    expect(since(xs, 10)).toEqual([]);
  });
});

describe("liveTrace", () => {
  it("averages bpm into fixed 2 s slots ending now, with gaps as null", () => {
    const now = 1_000_000;
    const history = [
      { t: now - 119_500, bpm: 60 }, // first slot
      { t: now - 1_500, bpm: 70 }, // last slot
      { t: now - 500, bpm: 80 }, // last slot
      { t: now - 200_000, bpm: 99 }, // too old
      { t: now + 10, bpm: 99 }, // in the future
      { t: now - 10_000, bpm: 0 }, // no reading
    ];
    const trace = liveTrace(history, now);
    expect(trace).toHaveLength(60);
    expect(trace[0]).toBe(60);
    expect(trace[59]).toBe(75);
    expect(trace.filter((v) => v !== null)).toHaveLength(2);
  });
});

describe("devices and reconnects", () => {
  it("puts the band first, then the strongest signal", () => {
    const ranked = rankDevices([
      { id: "a", name: "Polar H10", rssi: -40 },
      { id: "b", name: "Fitbit Air", rssi: -80 },
      { id: "c", name: null, rssi: -50 },
      { id: "d", name: "Treadmill HR", rssi: -45 },
      { id: "e", name: "Air 5F2A", rssi: -60 },
    ]);
    expect(ranked.map((d) => d.id)).toEqual(["e", "b", "a", "d", "c"]);
    expect(looksLikeFitbit("FITBIT")).toBe(true);
    expect(looksLikeFitbit(null)).toBe(false);
  });

  it("words the signal", () => {
    expect(signalWord(-55)).toBe("Strong");
    expect(signalWord(-70)).toBe("Good");
    expect(signalWord(-90)).toBe("Weak");
    expect(signalWord(null)).toBeNull();
  });

  it("backs off exponentially to a cap", () => {
    expect([1, 2, 3, 4, 5, 6, 50].map((n) => backoffMs(n))).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
    expect(backoffMs(0)).toBe(2_000);
  });

  it("matches 16-bit and 128-bit UUIDs", () => {
    expect(sameUuid("2A37", "00002a37-0000-1000-8000-00805f9b34fb")).toBe(true);
    expect(sameUuid("180d", "2a37")).toBe(false);
  });
});
