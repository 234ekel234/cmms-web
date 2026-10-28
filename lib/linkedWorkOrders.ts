/**
 * Work orders raised from something else — a follow-up to an earlier job, or a
 * repair raised from a PM checklist finding. Mirrors
 * `backend/helpers/workOrderLinks.js`, which checks the links; this side only
 * opens the ordinary New Work Order form with the fields filled in.
 *
 * The draft travels in the URL of the site's work-order page, so the button on
 * a job or a checklist round is a plain link and the form needs no second
 * fetch. The page reads it once on arrival and then rewrites its own URL.
 */
import { workOrderRef } from "@/lib/workOrders";

export type RaiseDraft = {
  /** What the form says this is linked to — "Follow-up to WO-1041". */
  label: string;
  title: string;
  description?: string;
  assetId?: string | null;
  priority?: string;
  category?: string | null;
} & (
  | { followsWorkOrderId: string; sourcePmLogId?: never; sourcePmItemId?: never }
  | { sourcePmLogId: string; sourcePmItemId: string; followsWorkOrderId?: never }
);

export type RaiseLink =
  | { label: string; followsWorkOrderId: string }
  | { label: string; sourcePmLogId: string; sourcePmItemId: string };

const FIELDS = ["label", "title", "description", "assetId", "priority", "category", "followsWorkOrderId", "sourcePmLogId", "sourcePmItemId"] as const;

export function raiseWorkOrderHref(accountId: string, draft: RaiseDraft): string {
  const q = new URLSearchParams({ raise: "1" });
  for (const k of FIELDS) {
    const v = (draft as Record<string, unknown>)[k];
    if (typeof v === "string" && v) q.set(k, v);
  }
  return `/accounts/${accountId}/work-orders?${q.toString()}`;
}

/** The draft in a work-order page URL, or null when it carries none. */
export function readRaiseDraft(params: URLSearchParams): { fields: Partial<Record<(typeof FIELDS)[number], string>>; link: RaiseLink | null } | null {
  if (params.get("raise") !== "1") return null;
  const fields: Partial<Record<(typeof FIELDS)[number], string>> = {};
  for (const k of FIELDS) {
    const v = params.get(k);
    if (v) fields[k] = v;
  }
  const label = fields.label ?? "Linked work order";
  const link: RaiseLink | null = fields.followsWorkOrderId
    ? { label, followsWorkOrderId: fields.followsWorkOrderId }
    : fields.sourcePmLogId && fields.sourcePmItemId
    ? { label, sourcePmLogId: fields.sourcePmLogId, sourcePmItemId: fields.sourcePmItemId }
    : null;
  return { fields, link };
}

/** What the single-order read carries about links (GET /work-orders/:id). */
export type LinkedOrder = { id: string; number: number; title: string; status: string; acceptedAt?: string | null };
export type PmSource = {
  logId: string;
  controlNumber: string;
  assignmentId: string;
  checklistName: string | null;
  scheduledDate: string;
  question: string;
  answer: string | null;
  remarks: string | null;
};
export type WorkOrderLinks = {
  /** Technicians are not sent the job-to-job links. */
  followsWorkOrder?: LinkedOrder | null;
  followUps?: LinkedOrder[];
  pmSource?: PmSource | null;
};

/** Whether a job carries any link worth a heading. */
export function hasLinks(l: WorkOrderLinks | null | undefined): boolean {
  return !!(l?.pmSource || l?.followsWorkOrder || (l?.followUps?.length ?? 0) > 0);
}

/** The follow-up draft for a job. */
export function followUpDraft(wo: {
  id: string; number: number; title: string; priority?: string; category?: string | null;
  asset?: { id: string } | null; assetId?: string | null;
}): RaiseDraft {
  const ref = workOrderRef(wo.number);
  return {
    label: `Follow-up to ${ref} — ${wo.title}`,
    // A follow-up to a follow-up keeps one prefix, not "Follow-up: Follow-up: …".
    title: /^follow-up:/i.test(wo.title) ? wo.title : `Follow-up: ${wo.title}`,
    description: `Follows ${ref}. `,
    assetId: wo.asset?.id ?? wo.assetId ?? null,
    priority: wo.priority,
    category: wo.category ?? null,
    followsWorkOrderId: wo.id,
  };
}

/** The repair draft for a checklist finding. */
export function findingDraft(f: {
  logId: string; itemId: string; controlNumber: string; question: string; answer: string;
  remarks?: string | null; assetId?: string | null; assetName?: string | null;
}): RaiseDraft {
  return {
    label: `From checklist ${f.controlNumber} — ${f.question}: ${f.answer}`,
    title: f.assetName ? `${f.assetName} — ${f.question}` : f.question,
    description: `Found on checklist ${f.controlNumber}: "${f.question}" answered ${f.answer}.${f.remarks ? ` Remark: ${f.remarks}` : ""}`,
    assetId: f.assetId ?? null,
    sourcePmLogId: f.logId,
    sourcePmItemId: f.itemId,
  };
}

/**
 * Whether a PM answer is a finding. Mirrors `classifyAnswer` in
 * backend/helpers/pmAnswers.js: the section's first option is the satisfactory
 * one, N/A is neither, any other listed option is a finding, and an answer the
 * section no longer lists is not invented into one.
 */
export function isPmFinding(answer: string | null | undefined, options: string[]): boolean {
  const a = String(answer ?? "").trim().toLowerCase();
  if (!a || /^(n\/?a|not applicable|none applicable)$/.test(a)) return false;
  return options.map((o) => o.trim().toLowerCase()).indexOf(a) > 0;
}
