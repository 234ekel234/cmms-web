"use client";

import { useEffect, useRef } from "react";
import { WORK_ORDER_STATUS, type WorkOrderPriority, type WorkOrderStatus } from "@/lib/statuses";
import { isOverdue, stageNote, workOrderRef, type StageShape } from "@/lib/workOrders";

/**
 * The left rail of the split view: the queue you work down.
 *
 * Compact by necessity — the wide table has nine columns and none of them
 * survive 380px — so this carries only what you scan for when choosing what to
 * open next: what stage it is at and whose move it is, what it is, where, how
 * urgent, and whether it is late. Everything
 * else is one selection away in the pane beside it, and the full table is still
 * a view of its own for the times you genuinely want to read down a column.
 *
 * Arrow keys and j/k walk the list with the detail following, which is what
 * makes a queue of ten quick rather than ten round trips. Anything typed into an
 * input is left alone — j and k are letters before they are shortcuts.
 */

export type QueueOrder = StageShape & {
  id: string;
  number: number;
  title: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority | null;
  dueDate: string | null;
  type?: string | null;
  isSpecialProject?: boolean;
  account?: { name: string } | null;
  asset?: { name: string } | null;
  assignments: { employee: { name: string } }[];
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WorkOrderQueue({
  orders,
  selectedId,
  onSelect,
  loading,
  changedId,
  showAccount = true,
  isClient = false,
}: {
  orders: QueueOrder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  /** Briefly highlighted after a change lands, so the list registers it too. */
  changedId?: string | null;
  /** Hidden on the account-scoped list, where every row says the same thing. */
  showAccount?: boolean;
  /** Words the stage line from the client's side — see stageNote. */
  isClient?: boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the selected row in view when the selection moves by keyboard —
  // otherwise walking past the fold selects rows you cannot see.
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>(`[data-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      // Never steal a keystroke from something being typed into.
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Nor from someone reading the detail pane: arrow keys scroll, and
      // hijacking them there jumped to the next order and remounted the pane
      // out from under whatever was being read.
      if (el?.closest(".tu-detail")) return;

      const down = e.key === "ArrowDown" || e.key === "j";
      const up = e.key === "ArrowUp" || e.key === "k";
      if (!down && !up) return;
      if (orders.length === 0) return;

      e.preventDefault();
      const at = orders.findIndex((o) => o.id === selectedId);
      // Nothing selected yet: down starts at the top, up starts at the bottom.
      const next = at === -1
        ? (down ? 0 : orders.length - 1)
        : Math.min(orders.length - 1, Math.max(0, at + (down ? 1 : -1)));
      onSelect(orders[next].id);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [orders, selectedId, onSelect]);

  if (loading) {
    return (
      <ul className="tu-queue-list" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="tu-queue-item" aria-hidden="true">
            <div className="tu-skeleton" style={{ height: 13, borderRadius: 4, marginBottom: 7 }} />
            <div className="tu-skeleton" style={{ height: 11, borderRadius: 4, width: "60%" }} />
          </li>
        ))}
      </ul>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="tu-queue-empty">
        <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5 }}>Nothing matches</p>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--tu-text-subtle)" }}>
          Clear a filter chip to widen the queue.
        </p>
      </div>
    );
  }

  // A plain list of buttons, deliberately *not* role="listbox". That role comes
  // with a keyboard contract — roving tabindex, aria-activedescendant — none of
  // which this implements, and its options must be direct children of the
  // listbox rather than buttons nested inside list items. Claiming the role
  // without the behaviour reads worse to a screen reader than not claiming it:
  // `aria-current` says which row the pane is showing, and each row is a real
  // button that Tab reaches on its own.
  return (
    <ul className="tu-queue-list" ref={listRef} aria-label="Work order queue">
      {orders.map((o) => {
        const late = isOverdue(o);
        const stage = WORK_ORDER_STATUS[o.status];
        const note = stageNote(o, isClient);
        const selected = o.id === selectedId;
        return (
          <li key={o.id}>
            <button
              type="button"
              data-id={o.id}
              aria-current={selected ? "true" : undefined}
              className={`tu-queue-item${selected ? " tu-queue-item-active" : ""}${o.id === changedId ? " tu-changed" : ""}`}
              onClick={() => onSelect(o.id)}
            >
              <span className="tu-queue-top">
                <span className={stage.badge}>{stage.label}</span>
                <span className="tu-queue-title">{o.title}</span>
                {o.isSpecialProject && <span className="tu-queue-star" title="Special project" aria-label="Special project">★</span>}
              </span>

              <span className={`tu-queue-note${note.attention ? " tu-attention" : ""}`} title={note.text}>
                {note.text}
              </span>

              <span className="tu-queue-meta">
                <span className="tu-wo-ref">{workOrderRef(o.number)}</span>
                {showAccount && o.account?.name && <span className="tu-queue-account">{o.account.name}</span>}
                {o.asset?.name && <span>{o.asset.name}</span>}
                {o.priority && <span className={`tu-queue-pri tu-queue-pri-${o.priority.toLowerCase()}`}>{o.priority}</span>}
                {o.dueDate && (
                  <span className={late ? "tu-queue-late" : undefined}>
                    {late ? "Late " : "Due "}{shortDate(o.dueDate)}
                  </span>
                )}
              </span>

              <span className="tu-queue-meta tu-queue-who">
                {o.assignments.length > 0
                  ? o.assignments.map((a) => a.employee.name).join(", ")
                  : "Unassigned"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
