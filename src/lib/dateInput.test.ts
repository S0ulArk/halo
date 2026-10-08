import { describe, expect, it } from "vitest";
import { maskDate } from "./dateInput";

describe("maskDate", () => {
  it("adds the dash after the year and after the month as you type", () => {
    expect(maskDate("199", "1992")).toBe("1992-");
    expect(maskDate("1992-0", "1992-05")).toBe("1992-05-");
    expect(maskDate("1992-05-1", "1992-05-17")).toBe("1992-05-17");
  });
  it("formats pasted or dash-less digits and stops at 8 digits", () => {
    expect(maskDate("", "19920517")).toBe("1992-05-17");
    expect(maskDate("", "1992/05/17")).toBe("1992-05-17");
    expect(maskDate("1992-05-17", "1992-05-179")).toBe("1992-05-17");
  });
  it("lets backspace remove a dash instead of putting it back", () => {
    expect(maskDate("1992-", "1992")).toBe("1992");
    expect(maskDate("1992-05-", "1992-05")).toBe("1992-05");
    expect(maskDate("1992-0", "1992-")).toBe("1992");
  });
});
