import { describe, expect, it } from "vitest";
import { describeTarget, fromParts, toParts } from "@/lib/sla";

describe("SLA targets as people write them", () => {
  it("picks the largest whole unit", () => {
    expect(toParts(2880)).toEqual({ value: "2", unit: "days" });
    expect(toParts(240)).toEqual({ value: "4", unit: "hours" });
    expect(toParts(90)).toEqual({ value: "90", unit: "minutes" });
    expect(toParts(null)).toEqual({ value: "", unit: "hours" });
  });

  it("reads back to minutes, blank as no target, nonsense as NaN", () => {
    expect(fromParts("3", "days")).toBe(4320);
    expect(fromParts("1.5", "hours")).toBe(90);
    expect(fromParts("  ", "hours")).toBeNull();
    expect(fromParts("0", "hours")).toBeNaN();
    expect(fromParts("abc", "days")).toBeNaN();
    expect(fromParts("0.3", "minutes")).toBeNaN();
  });

  it("round-trips every whole-minute target", () => {
    for (const m of [1, 59, 60, 61, 1439, 1440, 2160, 525600]) {
      const { value, unit } = toParts(m);
      expect(fromParts(value, unit)).toBe(m);
    }
  });

  it("describes a target in words", () => {
    expect(describeTarget(60)).toBe("1 hour");
    expect(describeTarget(4320)).toBe("3 days");
    expect(describeTarget(null)).toBe("No target");
  });
});
