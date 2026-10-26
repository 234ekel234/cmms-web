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

/**
 * Reading a CSV someone saved from Excel, for the import dialogs (assets,
 * employees). Minimal RFC 4180: quoted fields, embedded commas, "" escapes,
 * and both \n and \r\n line endings; blank lines dropped. A leading byte-order
 * mark (our own templates carry one, see above) is dropped too: `File.text()`
 * already does, but text that reached here another way would otherwise glue
 * it to the first header, and that column would never be found.
 */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}
