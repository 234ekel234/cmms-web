"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import StatusPipeline, { APPROVAL_STEPS } from "@/components/StatusPipeline";
import { WORK_ORDER_CATEGORIES } from "@/lib/workOrderCategories";
import EmptyState from "@/components/EmptyState";
import type { WorkOrderStatus } from "@/lib/statuses";
import { awaitingClient, isDone, needsClientApproval, signOffCue } from "@/lib/workOrders";

// ── Types ────────────────────────────────────────────────
// Imported, not re-declared. A local copy of this union is what crashed this
// page: `CLIENT_STATUS[order.status]` came back undefined for APPROVED and
// `cfg.cls` threw, white-screening the client's own portal. TypeScript was
// happy because the API response is untyped at the boundary, so the narrow
// union was simply a false statement about runtime data — the compiler cannot
// catch a lie it has been told. Importing the real union makes the map
// exhaustive by construction, so the next status added here is a build error.
type Status = WorkOrderStatus;
type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type Comment = { id: string; body: string; authorName: string; createdAt: string };
type Asset = { id: string; name: string };

type WorkOrder = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  category: string | null;
  dueDate: string | null;
  isSpecialProject: boolean;
  type: "INTERNAL" | "EXTERNAL";
  remarks: string | null;
  completedAt: string | null;
  asset: { id: string; name: string } | null;
  comments: Comment[];
  createdAt: string;
};

// ── Config ───────────────────────────────────────────────
const CLIENT_STATUS: Record<Status, { label: string; cls: string }> = {
  REQUESTED:   { label: "Submitted",   cls: "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)]" },
  PENDING:     { label: "Accepted",    cls: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]" },
  IN_PROGRESS: { label: "In Progress", cls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" },
  ON_HOLD:     { label: "On Hold",     cls: "bg-[var(--tu-soft-neutral)] text-[var(--tu-on-neutral)]" },
  COMPLETED:   { label: "Completed",   cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
  // Client-facing wording: they pressed a button called Approve, so this says
  // Approved rather than "Signed off" or "Closed".
  APPROVED:    { label: "Approved",    cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" },
  REJECTED:    { label: "Declined",    cls: "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]" },
};

const PRIORITY_COLOR: Record<Priority, string> = {
  LOW: "text-[var(--tu-text-subtle)]", MEDIUM: "text-[var(--tu-on-brand)]", HIGH: "text-[var(--tu-on-warning)]", CRITICAL: "text-[var(--tu-on-danger)]",
};

type FilterKey = "all" | "awaiting" | "active" | "completed" | "declined";
// "awaiting" is rendered only when something is actually waiting — see the
// chip row. The others are always offered, so a client can see an empty tab and
// know it is empty rather than wonder where the tab went.
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "declined", label: "Declined" },
];

function filterOrders(orders: WorkOrder[], filter: FilterKey): WorkOrder[] {
  // Its own tab because neither of the others shows it usefully: "Active"
  // excludes it (the work really is finished) and "Completed" buries it beside
  // everything already settled — so the client's own to-do list was the one
  // view that could not show them their to-do.
  if (filter === "awaiting") return orders.filter(awaitingClient);
  if (filter === "active") return orders.filter((o) => o.status === "REQUESTED" || o.status === "PENDING" || o.status === "IN_PROGRESS" || o.status === "ON_HOLD");
  // Both finished states, or a client's own approved request would match no
  // filter at all and vanish from every tab except All.
  if (filter === "completed") return orders.filter((o) => isDone(o.status));
  if (filter === "declined") return orders.filter((o) => o.status === "REJECTED");
  return orders;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso) ?? "";
}

// ── Request card ─────────────────────────────────────────
function RequestCard({
  order,
  isClient,
  onAddComment,
  onSignOff,
}: {
  order: WorkOrder;
  isClient: boolean;
  onAddComment: (body: string) => Promise<void>;
  onSignOff: (status: "APPROVED" | "IN_PROGRESS", reason?: string) => Promise<void>;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [sendBackReason, setSendBackReason] = useState("");
  const [signingOff, setSigningOff] = useState(false);
  const [signOffError, setSignOffError] = useState("");

  const cfg = CLIENT_STATUS[order.status];
  const isDeclined = order.status === "REJECTED";
  // Finished, whether or not the client has signed it off yet.
  const isCompleted = isDone(order.status);
  const awaiting = awaitingClient(order);
  // Work parked with the client is deliberately excluded: dimming it is exactly
  // the wrong signal for the one card on this page that needs an answer.
  const isTerminal = (isDeclined || isCompleted) && !awaiting;
  const cue = signOffCue(order, isClient);

  async function handleSignOff(status: "APPROVED" | "IN_PROGRESS", reason?: string) {
    if (signingOff) return;
    setSigningOff(true);
    setSignOffError("");
    try {
      await onSignOff(status, reason);
      setSendingBack(false);
      setSendBackReason("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setSignOffError(e?.response?.data?.error ?? "Could not save that. Please try again.");
    } finally {
      setSigningOff(false);
    }
  }

  async function handleComment() {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    setCommentError(false);
    try {
      await onAddComment(commentText.trim());
      setCommentText("");
    } catch {
      setCommentError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-4 ${isTerminal ? "opacity-90" : ""}`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className={`flex-1 text-base font-bold leading-snug ${isTerminal ? "text-[var(--tu-text-subtle)]" : "text-[var(--tu-text-heading)]"}`}>
          {order.title}
        </h3>
        <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${cfg.cls}`}>{cfg.label}</span>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
        {cue && (
          <span className="rounded px-2 py-0.5 text-[11px] font-bold bg-[var(--tu-soft-info)] text-[var(--tu-on-info)]">
            ⏳ {cue}
          </span>
        )}
        {order.isSpecialProject && (
          <span className="rounded px-2 py-0.5 text-[11px] font-bold bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]">★ Special Project</span>
        )}
        <span className={`text-xs font-bold ${PRIORITY_COLOR[order.priority]}`}>
          {order.priority.charAt(0) + order.priority.slice(1).toLowerCase()}
        </span>
        {order.category && (
          <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)]">{order.category}</span>
        )}
        {order.asset && <span className="text-xs font-medium text-[var(--tu-text-brand)]">› {order.asset.name}</span>}
      </div>

      {order.description && <p className="text-[13px] text-[var(--tu-text-body)] leading-relaxed mb-3 line-clamp-3">{order.description}</p>}

      {/* Pipeline or declined banner */}
      {isDeclined ? (
        <div className="bg-[var(--tu-soft-danger)] rounded-lg p-2.5 my-2.5 text-center text-[13px] font-semibold text-[var(--tu-on-danger)]">
          This request was declined.
        </div>
      ) : (
        <StatusPipeline
          status={order.status}
          steps={needsClientApproval(order) ? APPROVAL_STEPS : undefined}
          ariaLabel={`Status: ${cfg.label}`}
        />
      )}

      {/* Completion remarks */}
      {isCompleted && order.remarks && (
        <div className="bg-[var(--tu-soft-success)] rounded-lg p-2.5 mb-2.5">
          <p className="text-[13px] text-[var(--tu-on-success)] italic">&ldquo;{order.remarks}&rdquo;</p>
        </div>
      )}

      {/* Sign-off. Wording mirrors the detail page's panel deliberately: a client
          who reaches the same decision from either place should not have to work
          out that they are the same decision. */}
      {awaiting && (
        <div className="rounded-lg border border-[var(--tu-bd-info)] bg-[var(--tu-soft-info)] p-3 my-2.5">
          <p className="text-[13px] font-bold text-[var(--tu-on-info)]">
            {isClient ? "Is this job done to your satisfaction?" : "Waiting for the client to sign off"}
          </p>
          <p className="text-[11px] text-[var(--tu-on-info)] opacity-90 mt-0.5">
            {isClient
              ? "Approve to close it, or send it back and tell us what still needs doing."
              : "Only the client can close this. It closes on its own if they don\u2019t respond."}
          </p>

          {signOffError && (
            <p className="text-[11px] font-semibold text-[var(--tu-on-danger)] mt-2">{signOffError}</p>
          )}

          {isClient && (
            <div className="mt-2.5">
              {sendingBack ? (
                <div>
                  <label htmlFor={`sendback-${order.id}`} className="block text-[11px] font-bold text-[var(--tu-on-info)] mb-1">
                    What still needs doing?
                  </label>
                  <textarea
                    id={`sendback-${order.id}`}
                    className="w-full rounded-lg border border-[var(--tu-border)] bg-[var(--tu-bg-surface)] px-3 py-2 text-[13px] text-[var(--tu-text-body)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                    rows={3}
                    value={sendBackReason}
                    onChange={(e) => setSendBackReason(e.target.value)}
                    placeholder="The leak has stopped but the ceiling stain is still there."
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      disabled={signingOff || !sendBackReason.trim()}
                      onClick={() => handleSignOff("IN_PROGRESS", sendBackReason.trim())}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
                    >
                      {signingOff ? "Sending\u2026" : "Send back"}
                    </button>
                    <button
                      type="button"
                      disabled={signingOff}
                      onClick={() => { setSendingBack(false); setSendBackReason(""); setSignOffError(""); }}
                      className="px-3 py-1.5 text-xs font-semibold text-[var(--tu-text-body)] bg-[var(--tu-bg-surface)] border border-[var(--tu-border)] rounded-lg hover:border-[var(--tu-border-strong)] disabled:opacity-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={signingOff}
                    onClick={() => handleSignOff("APPROVED")}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
                  >
                    {signingOff ? "Saving…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={signingOff}
                    onClick={() => setSendingBack(true)}
                    className="px-3 py-1.5 text-xs font-semibold text-[var(--tu-text-body)] bg-[var(--tu-bg-surface)] border border-[var(--tu-border)] rounded-lg hover:border-[var(--tu-border-strong)] disabled:opacity-50 cursor-pointer"
                  >
                    Send back
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer dates */}
      <div className="flex gap-1.5 text-[11px] text-[var(--tu-text-subtle)] mb-1">
        <span>Submitted {formatDate(order.createdAt)}</span>
        {order.completedAt && <span>· Done {formatDate(order.completedAt)}</span>}
      </div>

      {/* Comments toggle */}
      <button
        type="button"
        onClick={() => setShowComments((v) => !v)}
        className="mt-1.5 pt-2.5 border-t border-[var(--tu-border)] w-full text-left text-xs font-semibold text-[var(--tu-text-subtle)] hover:text-[var(--tu-text-body)] cursor-pointer"
      >
        {order.comments.length > 0
          ? `${order.comments.length} comment${order.comments.length !== 1 ? "s" : ""}`
          : "Comments"}{" "}
        {showComments ? "▾" : "▸"}
      </button>

      {showComments && (
        <div className="mt-2.5">
          {order.comments.length === 0 ? (
            <p className="text-xs text-[var(--tu-text-subtle)] mb-2">No replies yet.</p>
          ) : (
            order.comments.map((c) => (
              <div key={c.id} className="bg-[var(--tu-bg-secondary)] rounded-lg p-2.5 mb-2">
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-bold text-[var(--tu-text-body)]">{c.authorName}</span>
                  <span className="text-[11px] text-[var(--tu-text-subtle)]">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-[13px] text-[var(--tu-text-body)] leading-snug">{c.body}</p>
              </div>
            ))
          )}
          <div className="flex gap-2 items-end mt-1">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              rows={1}
              className="flex-1 border border-[var(--tu-border)] rounded-lg px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)] max-h-20"
            />
            <button
              type="button"
              onClick={handleComment}
              disabled={!commentText.trim() || submitting}
              className="bg-[var(--tu-text-brand)] text-white rounded-lg px-3.5 py-2 text-[13px] font-bold hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "…" : "Send"}
            </button>
          </div>
          {commentError && <p className="text-[var(--tu-on-danger)] text-[11px] mt-1.5">Couldn&apos;t send comment. Try again.</p>}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────
export default function ClientPortalPage() {
  const params = useParams();
  const accountId = params.accountId as string;

  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";

  // New request form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "MEDIUM" as Priority, category: "", assetId: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetchOrders();
    api.get(`/accounts/${accountId}/assets`).then((r) => setAssets(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function fetchOrders() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get(`/accounts/${accountId}/work-orders`);
      setOrders(res.data.map((o: WorkOrder) => ({ ...o, comments: o.comments ?? [] })));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function createRequest() {
    if (!form.title.trim()) {
      setFormError("Title is required.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const res = await api.post(`/accounts/${accountId}/work-orders`, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        category: form.category.trim() || null,
        assetId: form.assetId || null,
      });
      setOrders((prev) => [{ ...res.data, comments: res.data.comments ?? [] }, ...prev]);
      setShowForm(false);
      setForm({ title: "", description: "", priority: "MEDIUM", category: "", assetId: "" });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to submit request.");
    } finally {
      setSaving(false);
    }
  }

  // The server is the authority on what a client may do here — it refuses any
  // other transition, and any other field — so this sends the move and takes
  // the row it gets back rather than guessing the resulting state. A send-back
  // also writes a comment server-side, which is why the whole row is replaced
  // and the comment list re-read from the response.
  async function signOff(workOrderId: string, status: "APPROVED" | "IN_PROGRESS", reason?: string) {
    const res = await api.patch(`/work-orders/${workOrderId}`, reason ? { status, reason } : { status });
    setOrders((prev) =>
      prev.map((o) => (o.id === workOrderId ? { ...o, ...res.data, comments: res.data.comments ?? o.comments } : o))
    );
  }

  async function addComment(workOrderId: string, body: string) {
    const res = await api.post(`/work-orders/${workOrderId}/comments`, { body });
    setOrders((prev) =>
      prev.map((o) => (o.id === workOrderId ? { ...o, comments: [...o.comments, res.data] } : o))
    );
  }

  const visible = filterOrders(orders, filter);
  const activeCount = orders.filter((o) => ["REQUESTED", "PENDING", "IN_PROGRESS"].includes(o.status)).length;
  const inProgressCount = orders.filter((o) => o.status === "IN_PROGRESS").length;
  const completedCount = orders.filter((o) => isDone(o.status)).length;
  const awaitingCount = orders.filter(awaitingClient).length;
  const stats = [
    ...(awaitingCount > 0
      ? [{
          label: isClient ? "Needs your OK" : "Awaiting client",
          value: awaitingCount,
          cls: "text-[var(--tu-on-info)]",
        }]
      : []),
    { label: "Active", value: activeCount, cls: "text-[var(--tu-text-brand)]" },
    { label: "In Progress", value: inProgressCount, cls: "text-[var(--tu-on-warning)]" },
    { label: "Completed", value: completedCount, cls: "text-[var(--tu-on-success)]" },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">My Requests</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-[var(--tu-text-brand)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--tu-text-brand-strong)] transition-colors cursor-pointer"
        >
          + New Request
        </button>
      </div>

      {/* Summary stats */}
      {!loading && orders.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {stats.map((s) => (
            <div key={s.label} className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm px-4 py-3">
              <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
              <p className="text-xs font-semibold text-[var(--tu-text-subtle)] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* New request form */}
      {showForm && (
        <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6 mb-6">
          <h3 className="text-sm font-semibold text-[var(--tu-text-heading)] mb-4">New Request</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label htmlFor="req-title" className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Title *</label>
              <input
                id="req-title"
                className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="What do you need done?"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="req-desc" className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Description</label>
              <textarea
                id="req-desc"
                className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)] resize-none"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Add any helpful detail"
              />
            </div>
            <div>
              <label htmlFor="req-priority" className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Priority</label>
              <select
                id="req-priority"
                className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label htmlFor="req-category" className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Category</label>
              <select
                id="req-category"
                className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm bg-[var(--tu-bg-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="">Select category…</option>
                {WORK_ORDER_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {assets.length > 0 && (
              <div className="col-span-2">
                <label htmlFor="req-asset" className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">Equipment / Asset</label>
                <select
                  id="req-asset"
                  className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                  value={form.assetId}
                  onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value }))}
                >
                  <option value="">None / not sure</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {formError && <p className="text-[var(--tu-on-danger)] text-xs mt-3">{formError}</p>}
          <div className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => { setShowForm(false); setFormError(""); }}
              className="px-4 py-2 text-sm text-[var(--tu-text-body)] border border-[var(--tu-border)] rounded-lg hover:bg-[var(--tu-bg-secondary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={createRequest}
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(awaitingCount > 0
          ? [
              FILTERS[0],
              { key: "awaiting" as FilterKey, label: `${isClient ? "Needs your OK" : "Awaiting client"} (${awaitingCount})` },
              ...FILTERS.slice(1),
            ]
          : FILTERS
        ).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              filter === f.key
                ? "bg-[var(--tu-text-brand)] text-white border-[var(--tu-text-brand)]"
                : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-[var(--tu-soft-danger)] border border-[var(--tu-bd-danger)] text-[var(--tu-on-danger)] text-sm rounded-lg px-4 py-3 mb-6">
          Failed to load your requests.
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-40 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="tu-card">
          <EmptyState
            icon="inbox"
            title={filter === "all" ? "No requests yet" : `No ${filter} requests`}
            hint={
              filter === "all"
                ? "Submit a request with the + New Request button and the site team will pick it up."
                : "Nothing sits under this filter right now."
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((order) => (
            <RequestCard
              key={order.id}
              order={order}
              isClient={isClient}
              onAddComment={(body) => addComment(order.id, body)}
              onSignOff={(status, reason) => signOff(order.id, status, reason)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
