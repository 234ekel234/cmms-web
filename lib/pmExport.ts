/**
 * The PM checklist analytics workbook.
 *
 * The API (backend/helpers/pmExport.js) computes every figure; this file only
 * lays it out. That split matters for the same reason the dashboard model
 * exists: a compliance rate computed twice is a compliance rate that will one
 * day disagree with itself.
 *
 * Each data sheet is a real Excel *table* — filter buttons, banded rows, and a
 * named range a pivot table or Power BI can point at and keep pointing at when
 * next month's export replaces this one. Ids ride along in each table so the
 * sheets join to each other (`roundId`, `assignmentId`, `itemId`).
 *
 * `exceljs` is imported on demand: it is a megabyte nobody should download to
 * look at a report they are not exporting.
 */

import type { Workbook, Worksheet } from "exceljs";

type PeriodStatus = "ON_TIME" | "LATE" | "DRAFT" | "MISSED" | "DUE";
type AnswerResult = "OK" | "FINDING" | "NA" | "OTHER";

type Base = {
  assignmentId: string;
  accountId: string;
  site: string;
  checklistId: string;
  checklist: string;
  frequency: string;
  assetId: string | null;
  asset: string | null;
  assetCode: string | null;
  location: string | null;
};

export type PmExport = {
  range: { from: string; to: string };
  generatedAt: string;
  totals: {
    checklists: number;
    periodsDue: number;
    submitted: number;
    onTime: number;
    late: number;
    missed: number;
    answers: number;
    findings: number;
    compliancePct: number | null;
    onTimePct: number | null;
    findingRatePct: number | null;
  };
  summary: (Base & {
    active: boolean;
    periodsDue: number;
    submitted: number;
    onTime: number;
    late: number;
    missed: number;
    draftsUnfinished: number;
    compliancePct: number | null;
    onTimePct: number | null;
    answers: number;
    ok: number;
    findings: number;
    na: number;
    findingRatePct: number | null;
  })[];
  schedule: (Base & {
    roundId: string | null;
    /** "PM-2026-00142"; null for a period nobody started. */
    controlNo: string | null;
    period: string;
    periodEnd: string;
    status: PeriodStatus;
    submittedAt: string | null;
    lastSavedAt: string | null;
    performedBy: string | null;
    daysLate: number | null;
    itemsTotal: number;
    itemsAnswered: number;
    findings: number;
    findingItems: string | null;
  })[];
  items: (Base & {
    section: string;
    itemNo: number;
    itemId: string;
    item: string;
    answered: number;
    ok: number;
    findings: number;
    na: number;
    other: number;
    findingRatePct: number | null;
    lastFindingPeriod: string | null;
    lastFindingAnswer: string | null;
    lastFindingRemarks: string | null;
  })[];
  answers: (Base & {
    roundId: string;
    controlNo: string | null;
    period: string;
    periodStatus: PeriodStatus;
    section: string | null;
    itemNo: number | null;
    itemId: string;
    item: string | null;
    answer: string;
    result: AnswerResult;
    remarks: string | null;
    answeredAt: string;
    /** Absent for clients — the API withholds per-answer authors from them. */
    answeredBy?: string | null;
  })[];
};

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  ON_TIME: "On time",
  LATE: "Late",
  DRAFT: "Draft (not submitted)",
  MISSED: "Missed",
  DUE: "Due (current period)",
};

const RESULT_LABEL: Record<AnswerResult, string> = { OK: "OK", FINDING: "Finding", NA: "N/A", OTHER: "Other" };

// ── Cell values ─────────────────────────────────────────────

/** "2026-08-02" → a Date Excel shows as that calendar day. */
const day = (key: string | null) => (key ? new Date(key + "T00:00:00Z") : null);

/**
 * A timestamp as the wall-clock time the user saw. Excel cells have no zone,
 * and exceljs writes a Date's UTC fields, so a 9 am Manila submission would
 * read 1 am without this shift.
 */
const local = (iso: string | null) => {
  if (!iso) return null;
  const t = new Date(iso);
  return new Date(t.getTime() - t.getTimezoneOffset() * 60_000);
};

/** The API sends 0–100; Excel's percent format wants 0–1. */
const frac = (pct: number | null) => (pct == null ? null : pct / 100);

// ── Layout helpers ──────────────────────────────────────────

type Col = { header: string; width: number; fmt?: string };

const FMT = {
  date: "yyyy-mm-dd",
  dateTime: "yyyy-mm-dd hh:mm",
  pct: "0.0%",
  int: "0",
};

function addTable(ws: Worksheet, name: string, top: number, cols: Col[], rows: unknown[][]) {
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(col.width ?? 0, c.width);
  });
  ws.addTable({
    name,
    ref: `A${top}`,
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: cols.map((c) => ({ name: c.header, filterButton: true })),
    // An Excel table cannot be empty; one blank row keeps the sheet valid and
    // the table's name stable for anything pointing at it.
    rows: rows.length > 0 ? rows : [cols.map(() => null)],
  });
  cols.forEach((c, i) => {
    if (!c.fmt) return;
    for (let r = top + 1; r <= top + Math.max(rows.length, 1); r++) ws.getCell(r, i + 1).numFmt = c.fmt;
  });
  // Freeze the header on the data sheets; the summary sheet has its KPIs above the table.
  if (top === 1) ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
}

const BASE_COLS: Col[] = [
  { header: "Site", width: 22 },
  { header: "Checklist", width: 30 },
  { header: "Frequency", width: 12 },
  { header: "Asset", width: 22 },
  { header: "Asset code", width: 13 },
  { header: "Location", width: 22 },
];
const baseCells = (r: Base) => [r.site, r.checklist, r.frequency, r.asset, r.assetCode, r.location];
const ID_COLS: Col[] = [{ header: "Assignment ID", width: 14 }];

// ── Sheets ──────────────────────────────────────────────────

function summarySheet(wb: Workbook, data: PmExport, scope: string) {
  const ws = wb.addWorksheet("Summary");
  ws.getCell("A1").value = "PM checklist analytics";
  ws.getCell("A1").font = { size: 16, bold: true };
  ws.getCell("A2").value = `${scope} · periods starting ${data.range.from} to ${data.range.to}`;
  ws.getCell("A3").value = `Generated ${new Date(data.generatedAt).toLocaleString("en-US")}`;
  ws.getCell("A2").font = ws.getCell("A3").font = { color: { argb: "FF555555" } };

  const t = data.totals;
  const kpis: [string, number | null, string?][] = [
    ["Checklists", t.checklists],
    ["Periods due", t.periodsDue],
    ["Submitted", t.submitted],
    ["On time", t.onTime],
    ["Late", t.late],
    ["Missed", t.missed],
    ["Compliance", frac(t.compliancePct), FMT.pct],
    ["On-time rate", frac(t.onTimePct), FMT.pct],
    ["Answers", t.answers],
    ["Findings", t.findings],
    ["Finding rate", frac(t.findingRatePct), FMT.pct],
  ];
  kpis.forEach(([label, value, fmt], i) => {
    const row = 5 + i;
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true };
    const c = ws.getCell(row, 2);
    c.value = value;
    if (fmt) c.numFmt = fmt;
  });

  const top = 5 + kpis.length + 2;
  ws.getCell(top - 1, 1).value = "By checklist";
  ws.getCell(top - 1, 1).font = { bold: true, size: 12 };
  addTable(ws, "ChecklistSummary", top, [
    ...BASE_COLS,
    { header: "Active", width: 8 },
    { header: "Periods due", width: 12, fmt: FMT.int },
    { header: "Submitted", width: 11, fmt: FMT.int },
    { header: "On time", width: 9, fmt: FMT.int },
    { header: "Late", width: 7, fmt: FMT.int },
    { header: "Missed", width: 8, fmt: FMT.int },
    { header: "Unfinished drafts", width: 11, fmt: FMT.int },
    { header: "Compliance", width: 12, fmt: FMT.pct },
    { header: "On-time rate", width: 12, fmt: FMT.pct },
    { header: "Answers", width: 9, fmt: FMT.int },
    { header: "OK", width: 7, fmt: FMT.int },
    { header: "Findings", width: 9, fmt: FMT.int },
    { header: "N/A", width: 7, fmt: FMT.int },
    { header: "Finding rate", width: 12, fmt: FMT.pct },
    ...ID_COLS,
  ], data.summary.map((r) => [
    ...baseCells(r), r.active ? "Yes" : "No",
    r.periodsDue, r.submitted, r.onTime, r.late, r.missed, r.draftsUnfinished,
    frac(r.compliancePct), frac(r.onTimePct),
    r.answers, r.ok, r.findings, r.na, frac(r.findingRatePct),
    r.assignmentId,
  ]));
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width ?? 0, 22);
}

function scheduleSheet(wb: Workbook, data: PmExport) {
  const ws = wb.addWorksheet("Rounds by period");
  addTable(ws, "Rounds", 1, [
    ...BASE_COLS,
    { header: "Period start", width: 12, fmt: FMT.date },
    { header: "Period end", width: 12, fmt: FMT.date },
    { header: "Control no.", width: 15 },
    { header: "Status", width: 20 },
    { header: "Submitted at", width: 17, fmt: FMT.dateTime },
    { header: "Days late", width: 9, fmt: FMT.int },
    { header: "Performed by", width: 20 },
    { header: "Items answered", width: 10, fmt: FMT.int },
    { header: "Items total", width: 10, fmt: FMT.int },
    { header: "Findings", width: 9, fmt: FMT.int },
    { header: "Finding items", width: 40 },
    { header: "Round ID", width: 14 },
    ...ID_COLS,
  ], data.schedule.map((r) => [
    ...baseCells(r), day(r.period), day(r.periodEnd), r.controlNo, PERIOD_STATUS_LABEL[r.status],
    local(r.submittedAt), r.daysLate, r.performedBy, r.itemsAnswered, r.itemsTotal, r.findings, r.findingItems,
    r.roundId, r.assignmentId,
  ]));
}

function itemsSheet(wb: Workbook, data: PmExport) {
  const ws = wb.addWorksheet("Findings by item");
  addTable(ws, "ItemStats", 1, [
    ...BASE_COLS,
    { header: "Section", width: 22 },
    { header: "#", width: 5, fmt: FMT.int },
    { header: "Item", width: 40 },
    { header: "Answered", width: 10, fmt: FMT.int },
    { header: "OK", width: 7, fmt: FMT.int },
    { header: "Findings", width: 9, fmt: FMT.int },
    { header: "N/A", width: 7, fmt: FMT.int },
    { header: "Other", width: 7, fmt: FMT.int },
    { header: "Finding rate", width: 12, fmt: FMT.pct },
    { header: "Last finding (period)", width: 14, fmt: FMT.date },
    { header: "Last finding answer", width: 16 },
    { header: "Last finding remarks", width: 36 },
    { header: "Item ID", width: 14 },
    ...ID_COLS,
  ], data.items.map((r) => [
    ...baseCells(r), r.section, r.itemNo, r.item, r.answered, r.ok, r.findings, r.na, r.other,
    frac(r.findingRatePct), day(r.lastFindingPeriod), r.lastFindingAnswer, r.lastFindingRemarks,
    r.itemId, r.assignmentId,
  ]));
}

function answersSheet(wb: Workbook, data: PmExport) {
  const ws = wb.addWorksheet("Answers");
  const withAuthor = data.answers.some((a) => "answeredBy" in a);
  addTable(ws, "Answers", 1, [
    ...BASE_COLS,
    { header: "Period start", width: 12, fmt: FMT.date },
    { header: "Control no.", width: 15 },
    { header: "Round status", width: 20 },
    { header: "Section", width: 22 },
    { header: "#", width: 5, fmt: FMT.int },
    { header: "Item", width: 40 },
    { header: "Answer", width: 14 },
    { header: "Result", width: 9 },
    { header: "Remarks", width: 36 },
    { header: "Answered at", width: 17, fmt: FMT.dateTime },
    ...(withAuthor ? [{ header: "Answered by", width: 20 }] : []),
    { header: "Round ID", width: 14 },
    { header: "Item ID", width: 14 },
    ...ID_COLS,
  ], data.answers.map((r) => [
    ...baseCells(r), day(r.period), r.controlNo, PERIOD_STATUS_LABEL[r.periodStatus], r.section, r.itemNo, r.item,
    r.answer, RESULT_LABEL[r.result], r.remarks, local(r.answeredAt),
    ...(withAuthor ? [r.answeredBy ?? null] : []),
    r.roundId, r.itemId, r.assignmentId,
  ]));
}

function aboutSheet(wb: Workbook) {
  const ws = wb.addWorksheet("How to read this");
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 100;
  const rows: [string, string][] = [
    ["Range", "Periods are selected by when they start, not by when they were filled in. A round filed late still belongs to the period it was for."],
    ["On time / Late", "Submitted; lateness is fixed at first submission and never recomputed by later edits."],
    ["Draft", "Started but not submitted. Its answers are listed but are not counted in any statistic."],
    ["Missed", "The period has ended and nothing was submitted. Only counted for checklists still active — a removed checklist's gaps are not invented."],
    ["Due", "The current period, not yet submitted. Not counted against compliance until it ends."],
    ["Periods due", "Periods that have ended, plus any current period already submitted."],
    ["Compliance", "Submitted ÷ periods due."],
    ["On-time rate", "On time ÷ submitted."],
    ["Finding", "Any answer other than the first option of its section — the first option is the satisfactory one (Good, Pass, Yes, OK, Done, Within Range, None). In Good / Fair / Poor, Fair counts as a finding."],
    ["N/A", "Not applicable. Excluded from the finding rate."],
    ["Other", "An answer the section no longer lists (the checklist was re-worded since). Neither OK nor a finding."],
    ["Finding rate", "Findings ÷ (OK + findings), over submitted rounds."],
    ["Joining sheets", "Round ID, Item ID and Assignment ID are stable, so the sheets can be related in a pivot or in Power BI."],
  ];
  ws.addRow(["Term", "Meaning"]).font = { bold: true };
  for (const r of rows) {
    const row = ws.addRow(r);
    row.alignment = { wrapText: true, vertical: "top" };
  }
}

/** The workbook itself — separate from the download so it can be built outside a browser. */
export async function buildPmWorkbook(data: PmExport, scope: string): Promise<Workbook> {
  // exceljs is CommonJS: depending on the bundler its exports arrive as named
  // exports or wrapped in `default`. Accept either rather than trust one.
  const mod = (await import("exceljs")) as typeof import("exceljs") & { default?: typeof import("exceljs") };
  const { Workbook } = mod.default ?? mod;
  const wb = new Workbook();
  wb.creator = "FMI CMMS";
  wb.created = new Date(data.generatedAt);
  summarySheet(wb, data, scope);
  scheduleSheet(wb, data);
  itemsSheet(wb, data);
  answersSheet(wb, data);
  aboutSheet(wb);
  return wb;
}

/** Builds the workbook and downloads it. */
export async function downloadPmWorkbook(data: PmExport, opts: { scope: string; filename: string }) {
  const wb = await buildPmWorkbook(data, opts.scope);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Safe for a filename: "Makati Tower" → "makati-tower". */
export function fileSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
}
