"use client";

import { useRef, useState } from "react";
import api from "@/lib/api";
import { downloadCsv, parseCsv } from "@/lib/csv";

type Row = {
  name: string;
  position: string;
  phone: string;
  skills: string;
  reliever: string;
  error?: string;
};

const COLUMNS = ["name", "position", "phone", "skills", "reliever"] as const;

const RELIEVER_VALUES = ["", "yes", "y", "true", "1", "reliever", "no", "n", "false", "0", "regular"];

// Only what can be told from the sheet alone is checked here. Skills are
// matched by the API (values or labels, any case), and whether a name is
// already on the roster is the API's to say — it answers per row.
function toRows(text: string): Row[] {
  const table = parseCsv(text);
  if (table.length === 0) return [];
  const header = table[0].map((h) => h.trim().toLowerCase());
  return table.slice(1).map((cells) => {
    const get = (key: string) => { const i = header.indexOf(key); return i === -1 ? "" : (cells[i] ?? "").trim(); };
    const row: Row = { name: get("name"), position: get("position"), phone: get("phone"), skills: get("skills"), reliever: get("reliever") };
    if (!row.name) row.error = "Name is required";
    else if (!RELIEVER_VALUES.includes(row.reliever.toLowerCase())) row.error = `Reliever should be yes or no, not "${row.reliever}"`;
    return row;
  });
}

function downloadTemplate() {
  // Through lib/csv for the byte-order mark, so an "ñ" typed into it in Excel
  // survives the round trip.
  downloadCsv([
    COLUMNS.join(","),
    ["Maria Santos", "Electrician", "0917 123 4567", "Electrical; HVAC", "no"].join(","),
    ["Juan dela Cruz", "Reliever technician", "", "Plumbing", "yes"].join(","),
  ], "cmms-employee-import-template.csv");
}

/**
 * A site's roster from a spreadsheet: each row becomes an employee on this
 * site. Mirrors AssetImportModal — parse and preview here, then the API
 * creates the good rows and names the rest. Sending the same sheet twice
 * creates nobody the second time (names already on the roster are refused).
 */
export default function EmployeeImportModal({
  accountId,
  onClose,
  onImported,
}: {
  accountId: string;
  onClose: () => void;
  /** Called after a run that created anyone, so the roster can be refetched. */
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null);
  const [topError, setTopError] = useState("");

  const validRows = rows.filter((r) => !r.error);
  const invalidCount = rows.length - validRows.length;

  async function handleFile(file: File) {
    setTopError("");
    setResult(null);
    setFileName(file.name);
    const parsed = toRows(await file.text());
    if (parsed.length === 0) setTopError("No data rows found in that file.");
    setRows(parsed);
  }

  async function submit() {
    if (validRows.length === 0) return;
    setSubmitting(true);
    setTopError("");
    try {
      const res = await api.post(`/accounts/${accountId}/employees/import`, {
        employees: validRows.map(({ name, position, phone, skills, reliever }) => ({ name, position, phone, skills, reliever })),
      });
      // The API numbers rows in what it was sent — the valid ones only — so
      // its row numbers are mapped back to the sheet's, which is what a person
      // goes and fixes. Row 1 of the sheet is the first line under the header.
      const sheetRow = rows.flatMap((r, i) => (r.error ? [] : [i + 1]));
      const errors = (res.data.errors as { row: number; error: string }[]).map((e) => ({ ...e, row: sheetRow[e.row - 1] ?? e.row }));
      setResult({ created: res.data.created.length, errors });
      if (res.data.created.length > 0) onImported();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setTopError(e?.response?.data?.error ?? "Import failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setFileName(""); setRows([]); setResult(null); setTopError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Import employees">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-2xl bg-[var(--tu-bg-surface)] rounded-xl shadow-2xl border border-[var(--tu-border)] max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[var(--tu-border)] flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)]">Import Employees</h3>
          <button onClick={onClose} className="text-[var(--tu-text-subtle)] hover:text-[var(--tu-text-body)] cursor-pointer text-sm">✕</button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {!result && (
            <>
              <p className="text-xs text-[var(--tu-text-subtle)] mb-3">
                Upload a CSV with columns: <code className="text-[11px] bg-[var(--tu-bg-secondary)] px-1 py-0.5 rounded">{COLUMNS.join(", ")}</code>.
                Only <code className="text-[11px]">name</code> is required. Everyone imported is placed on this site.
              </p>
              <p className="text-xs text-[var(--tu-text-subtle)] mb-3">
                Separate several <code className="text-[11px]">skills</code> with semicolons, as
                {" "}<code className="text-[11px]">Electrical; HVAC</code>. Write
                {" "}<code className="text-[11px]">reliever</code> as yes or no — blank means a regular employee.
                Anyone already on this site&apos;s roster is skipped, so sending a sheet twice adds nobody twice.
              </p>
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 text-sm border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer font-semibold text-[var(--tu-text-body)]"
                >
                  Choose CSV file
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                {fileName && <span className="text-xs text-[var(--tu-text-subtle)]">{fileName}</span>}
                <button onClick={downloadTemplate} className="ml-auto text-xs text-[var(--tu-text-brand)] hover:underline cursor-pointer shrink-0">
                  ↓ Download template
                </button>
              </div>

              {topError && <p className="text-[var(--tu-on-danger)] text-xs mb-3">{topError}</p>}

              {rows.length > 0 && (
                <>
                  <div className="flex items-center gap-3 mb-2 text-xs">
                    <span className="font-semibold text-[var(--tu-text-body)]">{rows.length} row{rows.length === 1 ? "" : "s"} parsed</span>
                    <span className="text-[var(--tu-on-success)]">{validRows.length} valid</span>
                    {invalidCount > 0 && <span className="text-[var(--tu-on-danger)]">{invalidCount} invalid</span>}
                    <button onClick={reset} className="ml-auto text-[var(--tu-text-subtle)] hover:text-[var(--tu-text-body)] cursor-pointer">Clear</button>
                  </div>
                  <div className="border border-[var(--tu-border)] rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[var(--tu-bg-secondary)] text-[var(--tu-text-subtle)] font-semibold uppercase tracking-wide">
                          <th className="px-3 py-2 text-left">Name</th>
                          <th className="px-3 py-2 text-left">Position</th>
                          <th className="px-3 py-2 text-left">Phone</th>
                          <th className="px-3 py-2 text-left">Skills</th>
                          <th className="px-3 py-2 text-left">Reliever</th>
                          <th className="px-3 py-2 text-left">Issue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--tu-border)]">
                        {rows.map((r, i) => (
                          <tr key={i} className={r.error ? "bg-[var(--tu-soft-danger)]" : ""}>
                            <td className="px-3 py-2 text-[var(--tu-text-body)]">{r.name || "—"}</td>
                            <td className="px-3 py-2 text-[var(--tu-text-subtle)]">{r.position || "—"}</td>
                            <td className="px-3 py-2 text-[var(--tu-text-subtle)]">{r.phone || "—"}</td>
                            <td className="px-3 py-2 text-[var(--tu-text-subtle)]">{r.skills || "—"}</td>
                            <td className="px-3 py-2 text-[var(--tu-text-subtle)]">{r.reliever || "no"}</td>
                            <td className="px-3 py-2 text-[var(--tu-on-danger)]">{r.error ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {result && (
            <div>
              <p className="text-sm text-[var(--tu-text-heading)] mb-3">
                <span className="font-semibold text-[var(--tu-on-success)]">{result.created} employee{result.created === 1 ? "" : "s"} imported.</span>
                {result.errors.length > 0 && <span className="text-[var(--tu-on-danger)]"> {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped.</span>}
              </p>
              {result.errors.length > 0 && (
                <div className="border border-[var(--tu-border)] rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[var(--tu-bg-secondary)] text-[var(--tu-text-subtle)] font-semibold uppercase tracking-wide">
                        <th className="px-3 py-2 text-left">Row</th>
                        <th className="px-3 py-2 text-left">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--tu-border)]">
                      {result.errors.map((e, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-[var(--tu-text-subtle)]">{e.row}</td>
                          <td className="px-3 py-2 text-[var(--tu-on-danger)]">{e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--tu-border)] flex justify-end gap-3 shrink-0">
          {result ? (
            <button onClick={onClose} className="px-4 py-2 text-sm text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] cursor-pointer">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={validRows.length === 0 || submitting}
                className="px-4 py-2 text-sm text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Importing…" : `Import ${validRows.length || ""} Employee${validRows.length === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
