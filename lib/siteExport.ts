/**
 * The site data export workbook (a site's More → Export data).
 *
 * The API (backend/helpers/siteExport.js) decides what each table holds; this
 * file only lays the tables out — one sheet per dataset, each a real Excel
 * table with filters, plus a first sheet saying what the file is. Same split
 * and same table helpers as the PM export (lib/pmExport.ts).
 */

import type { Workbook } from "exceljs";
import { addTable, FMT, local, type Col } from "@/lib/pmExport";

export type ColumnType = "text" | "number" | "date" | "datetime" | "bool";

export type Dataset = {
  key: string;
  label: string;
  group: string;
  dated: boolean;
  hint: string;
};

export type ExportTable = {
  key: string;
  label: string;
  dated: boolean;
  columns: { key: string; label: string; type: ColumnType }[];
  rows: Record<string, unknown>[];
};

export type SiteExport = {
  generatedAt: string;
  range: { from: string | null; to: string | null };
  tables: ExportTable[];
};

/**
 * Columns holding an enum value ("IN_PROGRESS"), shown as words ("In progress").
 * Not `category`: an asset's or a job's category is free text, and "HVAC" must
 * stay "HVAC" (the API words the one enum category, problem reports, itself).
 */
const ENUM_KEYS = new Set(["status", "priority", "type", "health", "frequency"]);
const humanise = (v: string) => (/^[A-Z][A-Z0-9_]+$/.test(v) ? (v.charAt(0) + v.slice(1).toLowerCase()).replace(/_/g, " ") : v);

function cell(value: unknown, type: ColumnType, key: string): unknown {
  if (value == null || value === "") return null;
  switch (type) {
    case "bool": return value ? "Yes" : "No";
    // Date-only fields arrive as UTC midnight and are written as that day.
    case "date": return new Date(String(value));
    case "datetime": return local(String(value));
    case "number": return typeof value === "number" ? value : Number(value);
    default: return ENUM_KEYS.has(key) && typeof value === "string" ? humanise(value) : value;
  }
}

const FMT_FOR: Partial<Record<ColumnType, string>> = { date: FMT.date, datetime: FMT.dateTime };

/** Wide enough for the header and the longest of the first rows, within reason. */
function widthFor(label: string, type: ColumnType, values: unknown[]): number {
  if (type === "date") return Math.max(12, label.length + 2);
  if (type === "datetime") return Math.max(17, label.length + 2);
  if (type === "bool" || type === "number") return Math.max(9, label.length + 2);
  const longest = values.slice(0, 200).reduce<number>((n, v) => Math.max(n, String(v ?? "").length), 0);
  return Math.min(50, Math.max(10, label.length + 2, longest + 2));
}

/** Excel sheet names: 31 characters, none of []:*?/\ — and unique in the book. */
const sheetName = (label: string) => label.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);

const dayText = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

export function rangeText(range: SiteExport["range"]): string {
  const from = dayText(range.from);
  const to = dayText(range.to);
  if (!from && !to) return "All time";
  return `${from ?? "the start"} to ${to ?? "today"}`;
}

export async function buildSiteWorkbook(data: SiteExport, siteName: string): Promise<Workbook> {
  // exceljs is CommonJS; accept named or default exports (see buildPmWorkbook).
  const mod = (await import("exceljs")) as typeof import("exceljs") & { default?: typeof import("exceljs") };
  const { Workbook } = mod.default ?? mod;
  const wb = new Workbook();
  wb.creator = "FMI CMMS";
  wb.created = new Date(data.generatedAt);

  const about = wb.addWorksheet("About");
  about.getColumn(1).width = 26;
  about.getColumn(2).width = 14;
  about.getColumn(3).width = 70;
  about.addRow([siteName]).font = { bold: true, size: 14 };
  about.addRow(["Exported", local(data.generatedAt)]).getCell(2).numFmt = FMT.dateTime;
  about.addRow(["Date range", rangeText(data.range)]);
  about.addRow([]);
  about.addRow(["Sheet", "Rows", "Covers"]).font = { bold: true };
  for (const t of data.tables) {
    about.addRow([t.label, t.rows.length, t.dated ? `Rows dated within the range` : "The site as it stands now (the date range does not apply)"]);
  }
  about.addRow([]);
  about.addRow(["Internal record: contains costs, internal notes and staff phone numbers. Do not send to clients."]).font = { italic: true };

  for (const t of data.tables) {
    const ws = wb.addWorksheet(sheetName(t.label));
    const cols: Col[] = t.columns.map((c) => ({
      header: c.label,
      width: widthFor(c.label, c.type, t.rows.map((r) => r[c.key])),
      fmt: FMT_FOR[c.type],
    }));
    const rows = t.rows.map((r) => t.columns.map((c) => cell(r[c.key], c.type, c.key)));
    addTable(ws, `T_${t.key}`, 1, cols, rows);
  }
  return wb;
}

export async function downloadSiteWorkbook(data: SiteExport, siteName: string, filename: string) {
  const wb = await buildSiteWorkbook(data, siteName);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
