import { describe, expect, it } from "vitest";
import { isDeadConnection } from "./deadConnection";

describe("isDeadConnection", () => {
  it("recognises the dead-handle errors seen on the phone, and nothing else", () => {
    expect(isDeadConnection(new Error("Call to function 'NativeDatabase.prepareAsync' has been rejected.\n→ Caused by: java.lang.NullPointerException: java.lang.NullPointerException"))).toBe(true);
    expect(isDeadConnection(new Error("Call to function 'NativeStatement.runAsync' has been rejected. AccessClosedResourceException"))).toBe(true);
    expect(isDeadConnection(new Error("UNIQUE constraint failed: daily_metrics.day"))).toBe(false);
    expect(isDeadConnection(new Error("Health Connect is not available"))).toBe(false);
    expect(isDeadConnection("NativeDatabase closed")).toBe(true);
  });
});
