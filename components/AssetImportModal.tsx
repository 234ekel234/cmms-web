"use client";

import { useRef, useState } from "react";
import api from "@/lib/api";

type Health = "GOOD" | "FAIR" | "POOR" | "OUT_OF_SERVICE";
type Status = "OPERATIONAL" | "UNDER_MAINTENANCE";

type ImportedAsset = { id: string; name: string; category: string; status: Status; health: Health };

type Row = {
  name: string;
  category: string;
  status: string;
  health: string;
  serialNumber: string;
  location: string;
  purchaseDate: string;
  purchaseCost: string;
  warrantyExpiry: string;
  manufacturedDate: string;
  error?: string;
};

const COLUMNS = [
  "name", "category", "status", "health", "serialNumber",
  "location", "purchaseDate", "purchaseCost", "warrantyExpiry", "manufacturedDate",
] as const;

const STATUS_VALUES: Status[] = ["OPERATIONAL", "UNDER_MAINTENANCE"];
const HEALTH_VALUES: Health[] = ["GOOD", "FAIR", "POOR", "OUT_OF_SERVICE"];

// Minimal RFC4180-ish parser: handles quoted fields, embedded commas, "" escapes,
// and both \n and \r\n line endings. Good enough for spreadsheet-exported CSVs.
function parseCSV(text: string): string[][] {
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

function toRows(text: string): Row[] {
  const table = parseCSV(text);
  if (table.length === 0) return [];
  const header = table[0].map((h) => h.trim().toLowerCase());
  const idx = (key: string) => header.indexOf(key.toLowerCase());
  return table.slice(1).map((cells) => {
    const get = (key: string) => { const i = idx(key); return i === -1 ? "" : (cells[i] ?? "").trim(); };
    const row: Row = {
      name: get("name"),
      category: get("category"),
      status: get("status").toUpperCase(),
      health: get("health").toUpperCase(),
      serialNumber: get("serialNumber"),
      location: get("location"),
      purchaseDate: get("purchaseDate"),
      purchaseCost: get("purchaseCost"),
      warrantyExpiry: get("warrantyExpiry"),
      manufacturedDate: get("manufacturedDate"),
    };
    if (!row.name) row.error = "Name is required";
    else if (!row.category) row.error = "Category is required";
    else if (row.status && !STATUS_VALUES.includes(row.status as Status)) row.error = `Invalid status "${row.status}"`;
    else if (row.health && !HEALTH_VALUES.includes(row.health as Health)) row.error = `Invalid health "${row.health}"`;
    return row;
  });
}

function downloadTemplate() {
  const header = COLUMNS.join(",");
  const example = ["Generator A", "Electrical", "OPERATIONAL", "GOOD", "SN-1234", "Rooftop", "2024-01-15", "150000", "2026-01-15", "2023-11-01"].join(",");
  const blob = new Blob([`${header}\n${example}\n`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cmms-asset-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function AssetImportModal({
  accountId,
  onClose,
  onImported,
}: {
  accountId: string;
  onClose: () => void;
  onImported: (created: ImportedAsset[]) => void;
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
    const text = await file.text();
    const parsed = toRows(text);
    if (parsed.length === 0) setTopError("No data rows found in that file.");
    setRows(parsed);
  }

  async function submit() {
    if (validRows.length === 0) return;
    setSubmitting(true);
    setTopError("");
    try {
      const res = await api.post(`/accounts/${accountId}/assets/bulk`, {
        assets: validRows.map((r) => ({
          name: r.name, category: r.category, status: r.status, health: r.health,
          serialNumber: r.serialNumber, location: r.location, purchaseDate: r.purchaseDate,
          purchaseCost: r.purchaseCost, warrantyExpiry: r.warrantyExpiry, manufacturedDate: r.manufacturedDate,
        })),
      });
      setResult({ created: res.data.created.length, errors: res.data.errors });
      if (res.data.created.length > 0) onImported(res.data.created);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Import assets">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-100 max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-gray-800">Bulk Import Assets</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer text-sm">✕</button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {!result && (
            <>
              <p className="text-xs text-gray-500 mb-3">
                Upload a CSV with columns: <code className="text-[11px] bg-gray-50 px-1 py-0.5 rounded">{COLUMNS.join(", ")}</code>.
                Only <code className="text-[11px]">name</code> and <code className="text-[11px]">category</code> are required.
              </p>
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer font-semibold text-gray-700"
                >
                  Choose CSV file
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                {fileName && <span className="text-xs text-gray-500">{fileName}</span>}
                <button onClick={downloadTemplate} className="ml-auto text-xs text-[#2166AC] hover:underline cursor-pointer shrink-0">
                  ↓ Download template
                </button>
              </div>

              {topError && <p className="text-red-500 text-xs mb-3">{topError}</p>}

              {rows.length > 0 && (
                <>
                  <div className="flex items-center gap-3 mb-2 text-xs">
                    <span className="font-semibold text-gray-700">{rows.length} row{rows.length === 1 ? "" : "s"} parsed</span>
                    <span className="text-green-700">{validRows.length} valid</span>
                    {invalidCount > 0 && <span className="text-red-600">{invalidCount} invalid</span>}
                    <button onClick={reset} className="ml-auto text-gray-400 hover:text-gray-600 cursor-pointer">Clear</button>
                  </div>
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-400 font-semibold uppercase tracking-wide">
                          <th className="px-3 py-2 text-left">Name</th>
                          <th className="px-3 py-2 text-left">Category</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-left">Health</th>
                          <th className="px-3 py-2 text-left">Issue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((r, i) => (
                          <tr key={i} className={r.error ? "bg-red-50" : ""}>
                            <td className="px-3 py-2 text-gray-700">{r.name || "—"}</td>
                            <td className="px-3 py-2 text-gray-500">{r.category || "—"}</td>
                            <td className="px-3 py-2 text-gray-500">{r.status || "OPERATIONAL"}</td>
                            <td className="px-3 py-2 text-gray-500">{r.health || "GOOD"}</td>
                            <td className="px-3 py-2 text-red-600">{r.error ?? ""}</td>
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
              <p className="text-sm text-gray-800 mb-3">
                <span className="font-semibold text-green-700">{result.created} asset{result.created === 1 ? "" : "s"} imported.</span>
                {result.errors.length > 0 && <span className="text-red-600"> {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped.</span>}
              </p>
              {result.errors.length > 0 && (
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-400 font-semibold uppercase tracking-wide">
                        <th className="px-3 py-2 text-left">Row</th>
                        <th className="px-3 py-2 text-left">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.errors.map((e, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-gray-500">{e.row}</td>
                          <td className="px-3 py-2 text-red-600">{e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          {result ? (
            <button onClick={onClose} className="px-4 py-2 text-sm text-white bg-[#2166AC] rounded-lg hover:bg-[#1a5490] cursor-pointer">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={validRows.length === 0 || submitting}
                className="px-4 py-2 text-sm text-white bg-[#2166AC] rounded-lg hover:bg-[#1a5490] disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "Importing..." : `Import ${validRows.length || ""} Asset${validRows.length === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
