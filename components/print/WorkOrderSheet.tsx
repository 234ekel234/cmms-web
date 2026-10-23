"use client";

import { locationPath, type AssetLocationRef } from "@/lib/assetLocations";
import { workOrderPriorityMeta, workOrderStatusMeta, type WorkOrderStatus } from "@/lib/statuses";
import { needsClientApproval, workOrderRef } from "@/lib/workOrders";
import { Cell, SheetHeader, Sign, printedStamp } from "@/components/print/SheetParts";
import { formatCapacity } from "@/lib/assetCapacity";

/**
 * The printed job sheet: one work order on one sheet of A4, carried to the job
 * by whoever does it and brought back signed. Rendered by the single-order
 * print page and by the batch page, which puts one of these per page.
 *
 * Two things it deliberately leaves out. **Cost** — paper is handed around a
 * site and cannot be recalled, so it shows parts by quantity only, for every
 * role, rather than trusting each reader's entitlement to survive the printer.
 * And **photos** — a thumbnail grid costs a page and prints badly; the record
 * online keeps them.
 *
 * What it adds over the screen: room to write. Blank step rows, ruled lines
 * for findings, time in/out, and signature blocks, because the sheet's job is
 * to come back with more on it than it went out with.
 */

export type SheetOptions = {
  /** Print steps already ticked online as ticked; off for a sheet filled in by hand. */
  showProgress: boolean;
  showNotes: boolean;
  showPauses: boolean;
};

/**
 * The progress notes that may go on paper: never a staff-only note. A sheet is
 * handed around a site and cannot be recalled — the same reason cost stays off
 * it — so an internal note is left out even when staff print it.
 */
export function printableNotes(order: Pick<PrintableWorkOrder, "comments">) {
  return order.comments.filter((c) => !c.isInternal);
}

export const DEFAULT_SHEET_OPTIONS: SheetOptions = { showProgress: true, showNotes: false, showPauses: false };

type Asset = {
  id: string;
  name: string;
  category: string | null;
  assetCode: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  capacity?: number | null;
  capacityUnit?: string | null;
  location: AssetLocationRef | null;
};

export type PrintableWorkOrder = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  type: "INTERNAL" | "EXTERNAL";
  status: WorkOrderStatus;
  priority: string;
  category: string | null;
  remarks: string | null;
  dueDate: string | null;
  completedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  isSpecialProject: boolean;
  isBreakdown: boolean;
  estimatedMinutes: number | null;
  actualSeconds: number;
  createdAt: string;
  account: { id: string; name: string } | null;
  asset: Asset | null;
  assignments: { id: string; employee: { id: string; name: string; position: string | null } }[];
  checklistItems: { id: string; description: string; isDone: boolean; order: number }[];
  comments: { id: string; body: string; authorName: string; createdAt: string; isInternal?: boolean }[];
  plan?: { id: string; title: string; frequency: string } | null;
  parts?: { id: string; description: string; quantity: number; part?: { unit: string | null } | null }[];
  pauses?: { id: string; kind?: "CLOCK" | "HOLD" | "SENT_BACK"; reason: string; pausedByName: string; pausedAt: string; resumedAt: string | null }[];
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function fmtHM(minutes: number | null) {
  if (minutes == null) return "—";
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Steps printed when the job has none, so the technician has somewhere to write them. */
const BLANK_STEP_ROWS = 5;
const FINDINGS_LINES = 5;

export default function WorkOrderSheet({
  order,
  options,
  printedBy,
}: {
  order: PrintableWorkOrder;
  options: SheetOptions;
  printedBy?: string;
}) {
  const { showProgress, showNotes, showPauses } = options;
  const asset = order.asset;
  const location = asset ? locationPath(asset.location) : "";
  const makeModel = asset ? [asset.brand, asset.model].filter(Boolean).join(" ") : "";
  const steps = [...order.checklistItems].sort((a, b) => a.order - b.order);
  const parts = order.parts ?? [];
  const pauses = order.pauses ?? [];
  const clientSigns = needsClientApproval(order);
  const flags = [
    order.type === "EXTERNAL" ? "Client request" : "Internal",
    order.isSpecialProject ? "Special project" : null,
    order.isBreakdown ? "Breakdown" : null,
    order.plan ? `Planned · ${order.plan.title}` : null,
  ].filter(Boolean);

  return (
    <article className="ps-sheet">
      <SheetHeader kicker="Work Order" title={workOrderRef(order.number)} />

      <h1 className="ps-title">{order.title}</h1>
      <div className="ps-flags">{flags.join(" · ")}</div>

      <div className="ps-grid">
        <Cell label="Site" value={order.account?.name ?? "—"} wide />
        <Cell label="Status" value={workOrderStatusMeta(order.status).label} />
        <Cell label="Priority" value={workOrderPriorityMeta(order.priority).label} />
        <Cell label="Raised" value={fmtDate(order.createdAt)} />
        <Cell label="Due" value={fmtDate(order.dueDate)} />
        <Cell label="Category" value={order.category ?? "—"} />
        <Cell label="Estimated time" value={fmtHM(order.estimatedMinutes)} mono />
        <Cell
          label="Assigned to"
          value={
            order.assignments.length > 0
              ? order.assignments.map((a) => a.employee.name + (a.employee.position ? ` (${a.employee.position})` : "")).join(", ")
              : "—"
          }
          full
        />
      </div>

      {asset && (
        <section className="ps-section">
          <h2>Asset</h2>
          <div className="ps-grid" style={{ marginBottom: 0 }}>
            <Cell label="Name" value={asset.name} wide />
            <Cell label="Asset code" value={asset.assetCode ?? "—"} mono />
            <Cell label="Category" value={asset.category ?? "—"} />
            {/* Location gave up its double width to capacity, keeping two full rows of four. */}
            <Cell label="Location" value={location || "—"} />
            <Cell label="Make / model" value={makeModel || "—"} />
            <Cell label="Serial no." value={asset.serialNumber ?? "—"} mono />
            <Cell label="Capacity" value={formatCapacity(asset.capacity, asset.capacityUnit) ?? "—"} />
          </div>
        </section>
      )}

      <section className="ps-section">
        <h2>Description</h2>
        <p className="ps-text">{order.description?.trim() || <span className="ps-muted">No description given.</span>}</p>
        {order.remarks?.trim() && (
          <p className="ps-text" style={{ marginTop: 6 }}><strong>Remarks:</strong> {order.remarks}</p>
        )}
      </section>

      <section className="ps-section">
        <h2>Steps</h2>
        <table className="ps-table">
          <thead>
            <tr>
              <th className="ps-box-col">Done</th>
              <th>Step</th>
              <th style={{ width: "32%" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => (
              <tr key={s.id}>
                <td className="ps-box-col"><span className="ps-box">{showProgress && s.isDone ? "✓" : ""}</span></td>
                <td>{i + 1}. {s.description}</td>
                <td />
              </tr>
            ))}
            {steps.length === 0 &&
              Array.from({ length: BLANK_STEP_ROWS }, (_, i) => (
                <tr key={`blank-${i}`} style={{ height: 24 }}>
                  <td className="ps-box-col"><span className="ps-box" /></td>
                  <td />
                  <td />
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section className="ps-section">
        <h2>Parts used</h2>
        <table className="ps-table">
          <thead>
            <tr>
              <th>Part</th>
              <th className="ps-num">Qty</th>
              <th style={{ width: 80 }}>Unit</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.id}>
                <td>{p.description}</td>
                <td className="ps-num">{p.quantity}</td>
                <td>{p.part?.unit ?? ""}</td>
              </tr>
            ))}
            {/* Room for what gets fitted on the day — always at least two rows. */}
            {Array.from({ length: Math.max(2, 3 - parts.length) }, (_, i) => (
              <tr key={`blank-${i}`} style={{ height: 24 }}>
                <td /><td /><td />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="ps-section">
        <h2>Time</h2>
        <div className="ps-grid" style={{ marginBottom: 0 }}>
          <Cell label="Recorded so far" value={order.actualSeconds > 0 ? fmtHM(order.actualSeconds / 60) : "—"} mono />
          <Cell label="Date" value="" />
          <Cell label="Time in" value="" />
          <Cell label="Time out" value="" />
        </div>
      </section>

      <section className="ps-section">
        <h2>Work done / findings</h2>
        <div className="ps-lines">
          {Array.from({ length: FINDINGS_LINES }, (_, i) => <div key={i} />)}
        </div>
      </section>

      {showNotes && printableNotes(order).length > 0 && (
        <section className="ps-section">
          <h2>Progress notes</h2>
          <table className="ps-table">
            <tbody>
              {printableNotes(order).map((c) => (
                <tr key={c.id}>
                  <td style={{ width: 150 }} className="ps-muted">{c.authorName}<br />{fmtDateTime(c.createdAt)}</td>
                  <td className="ps-text">{c.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {showPauses && pauses.length > 0 && (
        <section className="ps-section">
          <h2>Pauses, holds and send-backs</h2>
          <table className="ps-table">
            <tbody>
              {[...pauses].reverse().map((p) => (
                <tr key={p.id}>
                  <td style={{ width: 150 }} className="ps-muted">{p.pausedByName}<br />{fmtDateTime(p.pausedAt)}</td>
                  <td className="ps-text">
                    {p.kind === "HOLD" && <strong>On hold: </strong>}
                    {p.kind === "SENT_BACK" && <strong>Sent back: </strong>}
                    {p.reason}
                    <span className="ps-muted">{p.resumedAt ? ` — resumed ${fmtDateTime(p.resumedAt)}` : " — still stopped"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className={`ps-signs ${clientSigns ? "ps-cols-3" : "ps-cols-2"}`}>
        <Sign role="Performed by" caption="Name, signature and date" />
        <Sign role="Checked by" caption="Supervisor — name, signature and date" />
        {clientSigns && (
          <Sign
            role="Accepted by client"
            caption="Name, signature and date"
            // Already signed off online: say so rather than leave a blank
            // that invites a second, contradicting signature. A null name is
            // the daily sweep's approval and must not read as a person's.
            filled={
              order.status === "APPROVED" && order.approvedAt
                ? `${order.approvedByName ?? "Auto-approved"} · ${fmtDate(order.approvedAt)}`
                : undefined
            }
          />
        )}
      </div>

      <footer className="ps-foot">
        <span>{workOrderRef(order.number)} · {order.account?.name}</span>
        <span>{printedStamp(printedBy)}</span>
      </footer>
    </article>  );
}
