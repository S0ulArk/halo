import { describe, expect, it } from "vitest";
import { isDeadConnection } from "./deadConnection";

describe("isDeadConnection", () => {
  it("recognises the dead-handle errors seen on the phone, and nothing else", () => {
    expect(isDeadConnection(new Error("Call to function 'NativeDatabase.prepareAsync' has been rejected.\n→ Caused by: java.lang.NullPointerException: java.lang.NullPointerException"))).toBe(true);
    expect(isDeadConnection(new Error("Call to function 'NativeStatement.runAsync' has been rejected. AccessClosedResourceException"))).toBe(true);
    expect(isDeadConnection(new Error("Call to function 'NativeStatement.getAllAsync' has been rejected.\n→ Caused by: Access to closed resource"))).toBe(true);
    expect(isDeadConnection(new Error("UNIQUE constraint failed: daily_metrics.day"))).toBe(false);
    expect(isDeadConnection(new Error("Health Connect is not available"))).toBe(false);
    expect(isDeadConnection("NativeDatabase closed")).toBe(true);
  });

  it("leaves ordinary SQLite errors alone, though expo-sqlite reports them as rejected native calls", () => {
    expect(isDeadConnection(new Error("Call to function 'NativeDatabase.execAsync' has been rejected.\n→ Caused by: Error code 5: database is locked"))).toBe(false);
    expect(isDeadConnection(new Error("Call to function 'NativeStatement.runAsync' has been rejected.\n→ Caused by: Error code 19: UNIQUE constraint failed: daily_metrics.day"))).toBe(false);
    expect(isDeadConnection(new Error("Call to function 'NativeStatement.runAsync' has been rejected.\n→ Caused by: ERR_INTERNAL_SQLITE_ERROR"))).toBe(false);
    expect(isDeadConnection(new Error("Call to function 'NativeStatement.getAllAsync' has been rejected."))).toBe(false);
  });
});
