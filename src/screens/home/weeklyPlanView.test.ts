import { describe, expect, it } from "vitest";
import { ageText, planCaption, planTargetText, planValueText } from "./weeklyPlanView";

const S = " ";
const none = { current: 0, longest: 0 };

describe("Weekly Plan card text", () => {
  it("value and target in each target's words", () => {
    expect(planValueText({ value: 7500.4, format: "grouped" })).toBe("7,500");
    expect(planValueText({ value: null, format: "int" })).toBe("--");
    expect(planTargetText({ key: "zone13", target: 150, format: "grouped" })).toBe(`of 150${S}min`);
    expect(planTargetText({ key: "strength", target: 1, format: "int" })).toBe(`of 1${S}session`);
    expect(planTargetText({ key: "strength", target: 2, format: "int" })).toBe(`of 2${S}sessions`);
    expect(planTargetText({ key: "steps", target: 8000, format: "grouped" })).toBe("of 8,000");
    expect(planTargetText({ key: "consistency", target: 80, format: "int" })).toBe("of 80%");
    expect(planTargetText({ key: "sleepNeed", target: 5, format: "int" })).toBe(`of 5${S}nights`);
  });

  it("captions say how a target stands, what is left and the streak", () => {
    const zone = { key: "zone13" as const, target: 150, format: "grouped" as const };
    expect(planCaption({ ...zone, value: 160, status: "done", expected: 64, streak: { current: 3, longest: 3 } })).toBe("Done · 3-week streak");
    expect(planCaption({ ...zone, value: 160, status: "done", expected: 64, streak: { current: 1, longest: 1 } })).toBe("Done this week");
    expect(planCaption({ ...zone, value: 80, status: "on_pace", expected: 42.9, streak: none })).toBe(`On pace · 70${S}min to go`);
    expect(planCaption({ ...zone, value: 80, status: "on_pace", expected: 42.9, streak: { current: 2, longest: 2 } })).toBe(`70${S}min to go · 2-week streak on the line`);
    expect(planCaption({ ...zone, value: 20, status: "behind", expected: 64.3, streak: none })).toBe(`45${S}min behind pace`);
    expect(planCaption({ key: "steps", target: 8000, format: "grouped", value: 7500, status: "behind", expected: null, streak: none })).toBe(`500${S}steps a day short`);
    expect(planCaption({ key: "consistency", target: 80, format: "int", value: 78, status: "behind", expected: null, streak: none })).toBe(`2${S}points short`);
    expect(planCaption({ key: "strength", target: 2, format: "int", value: 0, status: "behind", expected: 1.4, streak: none })).toBe(`2${S}sessions to go`);
    expect(planCaption({ key: "sleepNeed", target: 5, format: "int", value: 1, status: "missed", expected: 4.3, streak: { current: 0, longest: 4 } })).toBe("Missed · best run 4 weeks");
    expect(planCaption({ key: "steps", target: 8000, format: "grouped", value: null, status: "no_data", expected: null, streak: none })).toBe("No data yet");
  });

  it("Pulse Age's years, signed with a real minus", () => {
    expect(ageText(-0.64)).toBe(`−0.6${S}yr`);
    expect(ageText(1.25)).toBe(`+1.3${S}yr`);
    expect(ageText(0.02)).toBe(`0.0${S}yr`);
    expect(ageText(null)).toBeNull();
  });
});
