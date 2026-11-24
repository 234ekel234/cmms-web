import { describe, expect, it } from "vitest";
import { csvCell, csvRow, parseCsv } from "@/lib/csv";
import { defaultDueHint } from "@/lib/dueDates";
import { formatMinutes } from "@/lib/durations";
import { pmControlNumber } from "@/lib/pmControlNumber";

describe("CSV", () => {
  it("quotes cells and doubles quotes", () => {
    expect(csvRow(["a", 'say "hi"', 3, null])).toBe('"a","say ""hi""",3,""');
  });

  it("defuses cells Excel would run as formulas", () => {
    for (const v of ["=SUM(A1)", "+1", "-1", "@cmd"]) expect(csvCell(v)).toBe(`"'${v}"`);
    expect(csvCell(Number.NaN)).toBe('""');
  });

  it("reads back quoted commas, escaped quotes, CRLF and a byte-order mark", () => {
    const text = '﻿name,notes\r\n"Pump, main","said ""ok"""\r\n\r\nFan,\n';
    expect(parseCsv(text)).toEqual([["name", "notes"], ["Pump, main", 'said "ok"'], ["Fan", ""]]);
  });
});

describe("small formats", () => {
  it("says a span of minutes in two units at most", () => {
    expect(formatMinutes(null)).toBe("—");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(200)).toBe("3h 20m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(3133)).toBe("2d 4h");
  });

  it("numbers a PM round with the year it was started", () => {
    expect(pmControlNumber({ number: 142, createdAt: "2026-03-01T00:00:00Z" })).toBe("PM-2026-00142");
    expect(pmControlNumber({ number: null, createdAt: "2026-03-01T00:00:00Z" })).toBeNull();
  });

  it("explains the due date a blank form gets", () => {
    expect(defaultDueHint("CRITICAL")).toBe("Leave blank and it's due in 1 day (Critical priority).");
    expect(defaultDueHint("LOW")).toBe("Leave blank and it's due in 14 days (Low priority).");
  });
});
