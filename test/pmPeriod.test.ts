import { describe, expect, it } from "vitest";
import { getPeriodStartUTC, intervalDaysError, isBeforeStart, lastDayOfPeriod, pmSchedule, scheduleLabel, stepPeriod } from "@/lib/pmPeriod";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const key = (d: Date) => d.toISOString().slice(0, 10);

describe("calendar periods", () => {
  it("snap to the calendar, weeks starting on Sunday", () => {
    const wed = day("2026-11-11");
    expect(key(getPeriodStartUTC("DAILY", wed))).toBe("2026-11-11");
    expect(key(getPeriodStartUTC("WEEKLY", wed))).toBe("2026-11-08");
    expect(key(getPeriodStartUTC("MONTHLY", wed))).toBe("2026-11-01");
    expect(key(getPeriodStartUTC("QUARTERLY", wed))).toBe("2026-10-01");
    expect(key(getPeriodStartUTC("SEMI_ANNUALLY", wed))).toBe("2026-07-01");
    expect(key(getPeriodStartUTC("ANNUALLY", wed))).toBe("2026-01-01");
  });

  it("step forward and back, across a year end", () => {
    expect(key(stepPeriod("MONTHLY", day("2026-12-01"), 1))).toBe("2027-01-01");
    expect(key(stepPeriod("QUARTERLY", day("2026-01-01"), -1))).toBe("2025-10-01");
    expect(key(stepPeriod("WEEKLY", day("2026-11-08"), 1))).toBe("2026-11-15");
  });

  it("end on the day before the next one starts", () => {
    expect(key(lastDayOfPeriod("MONTHLY", day("2026-02-01")))).toBe("2026-02-28");
    expect(key(lastDayOfPeriod("WEEKLY", day("2026-11-08")))).toBe("2026-11-14");
  });

  it("never start before anything for a calendar frequency", () => {
    expect(isBeforeStart("MONTHLY", day("1990-01-01"))).toBe(false);
  });
});

describe("every N days", () => {
  const every10 = pmSchedule({ frequency: "CUSTOM_DAYS", intervalDays: 10 }, { startDate: "2026-11-01T00:00:00Z" });

  it("counts whole intervals from the site's start — a fixed cycle", () => {
    expect(key(getPeriodStartUTC(every10, day("2026-11-01")))).toBe("2026-11-01");
    expect(key(getPeriodStartUTC(every10, day("2026-11-10")))).toBe("2026-11-01");
    expect(key(getPeriodStartUTC(every10, day("2026-11-11")))).toBe("2026-11-11");
    expect(key(getPeriodStartUTC(every10, day("2026-12-25")))).toBe("2026-12-21");
  });

  it("steps by N days and knows what came before the start", () => {
    expect(key(stepPeriod(every10, day("2026-11-11"), 1))).toBe("2026-11-21");
    expect(key(lastDayOfPeriod(every10, day("2026-11-11")))).toBe("2026-11-20");
    expect(isBeforeStart(every10, day("2026-10-22"))).toBe(true);
    expect(isBeforeStart(every10, day("2026-11-01"))).toBe(false);
  });

  it("is labelled and validated as the API does", () => {
    expect(scheduleLabel(every10)).toBe("Every 10 days");
    expect(scheduleLabel("SEMI_ANNUALLY")).toBe("Semi-annually");
    expect(intervalDaysError("CUSTOM_DAYS", 1)).toBe("Repeat every 2 to 730 days.");
    expect(intervalDaysError("CUSTOM_DAYS", "45")).toBeNull();
    expect(intervalDaysError("CUSTOM_DAYS", 2.5)).not.toBeNull();
    expect(intervalDaysError("MONTHLY", null)).toBeNull();
  });
});
