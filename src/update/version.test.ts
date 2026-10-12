import { describe, expect, it } from "vitest";
import { compareVersions, parseVersion, plainNotes } from "./version";

describe("parseVersion", () => {
  it("reads tags and bare versions", () => {
    expect(parseVersion("v1.23.0")).toEqual([1, 23, 0]);
    expect(parseVersion("Halo 1.22.8")).toEqual([1, 22, 8]);
    expect(parseVersion("latest")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders by number, not text", () => {
    expect(compareVersions("v1.22.10", "1.22.8")).toBeGreaterThan(0);
    expect(compareVersions("v1.3.0", "1.22.8")).toBeLessThan(0);
    expect(compareVersions("v1.22.8", "1.22.8")).toBe(0);
    expect(compareVersions("v1.23", "1.23.0")).toBe(0);
    expect(compareVersions("v2.0.0", "1.99.99")).toBeGreaterThan(0);
  });
});

describe("plainNotes", () => {
  it("drops markdown marks", () => {
    expect(plainNotes("## What's new\r\n\r\n- **Faster** sync\n- See [the README](https://x.y)\n\n\n\nDone")).toBe("What's new\n\n• Faster sync\n• See the README\n\nDone");
  });
});
