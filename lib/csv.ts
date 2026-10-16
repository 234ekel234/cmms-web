/**
 * CSV for people who will open it in Excel — which is everyone who downloads one.
 *
 * Two things a plain quote-and-join gets wrong, both only visible once the file
 * is opened:
 *
 * - **Encoding.** Excel ignores the blob's `charset=utf-8` and decodes a
 *   BOM-less CSV in the system code page, so "Peñaflor" arrives as "PeÃ±aflor".
 *   On a Philippine roster that is not an edge case. The byte-order mark is what
 *   Excel actually reads.
 * - **Formulas.** Quoting does not stop Excel evaluating a cell that starts with
 *   `=`, `+`, `-` or `@`. Names, part descriptions and checklist labels are free
 *   text, and the account report is downloadable by the client — so one
 *   organisation's typing would be evaluated in another's spreadsheet. A leading
 *   apostrophe makes it text; Excel hides the apostrophe.
 *
 * Numbers pass through untouched, so a negative figure stays a number.
 */

export type CsvValue = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(v: CsvValue): string {
  if (v == null) return '""';
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : '""';
  const text = FORMULA_START.test(v) ? `'${v}` : v;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(cells: CsvValue[]): string {
  return cells.map(csvCell).join(",");
}

/** Builds rows as you go, then downloads them. */
export function csvBuilder() {
  const rows: string[] = [];
  return {
    line: (cells: CsvValue[]) => { rows.push(csvRow(cells)); },
    download: (filename: string) => downloadCsv(rows, filename),
  };
}

export function downloadCsv(rows: string[], filename: string) {
  // CRLF is what RFC 4180 and Excel expect; "﻿" is the byte-order mark.
  const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
