"use client";

import Link from "next/link";
import { workOrderStatusFor } from "@/lib/statuses";
import type { WorkOrderStatus } from "@/lib/statuses";
import { isDone, workOrderRef } from "@/lib/workOrders";
import { followUpDraft, hasLinks, raiseWorkOrderHref, type LinkedOrder, type WorkOrderLinks as Links } from "@/lib/linkedWorkOrders";

/**
 * Where a job came from and what came after it: the checklist finding it was
 * raised from, the job it follows, its follow-ups — and, on finished work,
 * "Raise follow-up". Shared by the full record and the queue's pane.
 *
 * `links` is whatever GET /work-orders/:id sent; the API already left out the
 * job-to-job links for a technician, so this draws what it is given.
 */
type Props = {
  accountId: string;
  order: {
    id: string; number: number; title: string; status: WorkOrderStatus;
    priority?: string; category?: string | null; asset?: { id: string } | null;
  };
  links: Links | null;
  /** Label column on the full page; the pane uses its own section label. */
  heading?: boolean;
};

function OrderLink({ accountId, o }: { accountId: string; o: LinkedOrder }) {
  return (
    <>
      <Link href={`/accounts/${accountId}/work-orders/${o.id}`}>{workOrderRef(o.number)}</Link>{" "}
      {o.title} <span className="tu-links-sub">· {workOrderStatusFor(o).label}</span>
    </>
  );
}

export default function WorkOrderLinks({ accountId, order, links, heading }: Props) {
  const pm = links?.pmSource ?? null;
  const follows = links?.followsWorkOrder ?? null;
  const followUps = links?.followUps ?? [];
  const canFollowUp = isDone(order.status);
  if (!pm && !follows && followUps.length === 0 && !canFollowUp) return null;

  return (
    <div className="tu-links">
      {heading && hasLinks(links) && (
        <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide">Linked work</p>
      )}
      {pm && (
        <div>
          Raised from checklist{" "}
          <Link href={`/accounts/${accountId}/checklists/${pm.assignmentId}?period=${pm.scheduledDate.slice(0, 10)}`}>
            {pm.controlNumber}
          </Link>
          {pm.checklistName && <> — {pm.checklistName}</>}
          <div className="tu-links-sub">
            “{pm.question}” answered {pm.answer ?? "—"}{pm.remarks ? ` — ${pm.remarks}` : ""}
          </div>
        </div>
      )}
      {follows && (
        <div>Follows <OrderLink accountId={accountId} o={follows} /></div>
      )}
      {followUps.length > 0 && (
        <div>
          {followUps.length === 1 ? "Follow-up: " : `Follow-ups (${followUps.length}):`}
          {followUps.length === 1 ? (
            <OrderLink accountId={accountId} o={followUps[0]} />
          ) : (
            <ul style={{ marginTop: 2, paddingLeft: 16, listStyle: "disc" }}>
              {followUps.map((f) => <li key={f.id}><OrderLink accountId={accountId} o={f} /></li>)}
            </ul>
          )}
        </div>
      )}
      {/* A finished job is never reopened; something that came back is a new
          job linked to this one, so a repeat failure reads as one. */}
      {canFollowUp && (
        <div>
          <Link
            href={raiseWorkOrderHref(accountId, followUpDraft(order))}
            className="tu-btn-secondary tu-btn-sm"
            style={{ display: "inline-flex", fontWeight: 600 }}
            title={`Raise a new job linked to ${workOrderRef(order.number)} — for when the problem came back`}
          >
            Raise follow-up
          </Link>
        </div>
      )}
    </div>
  );
}
