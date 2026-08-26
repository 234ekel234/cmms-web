"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import EmptyState from "@/components/EmptyState";

const PAGE_SIZE = 25;

type Notification = {
  id: string;
  title: string;
  body: string;
  action: string;
  isRead: boolean;
  entityId: string | null;
  accountId: string | null;
  createdAt: string;
};

const ACTION_DOT: Record<string, string> = {
  WORK_ORDER_REQUESTED: "bg-[var(--tu-status-pending)]",
  WORK_ORDER_ACCEPTED:  "bg-[var(--tu-status-completed)]",
  WORK_ORDER_REJECTED:  "bg-[var(--tu-priority-critical)]",
  WORK_ORDER_STARTED:   "bg-[var(--tu-priority-high)]",
  WORK_ORDER_ON_HOLD:   "bg-[var(--tu-priority-medium)]",
  WORK_ORDER_COMPLETED: "bg-[var(--tu-status-completed)]",
  WORK_ORDER_APPROVED:  "bg-[var(--tu-status-completed)]",
  WORK_ORDER_REWORK:    "bg-[var(--tu-priority-critical)]",
  WORK_ORDER_OVERDUE:   "bg-[var(--tu-priority-critical)]",
  WORK_ORDER_GENERATED: "bg-[var(--tu-status-pending)]",
  CHECKLIST_INCOMPLETE: "bg-[var(--tu-priority-high)]",
  PM_CHECKLIST_PENDING: "bg-[var(--tu-status-pending)]",
  PART_LOW_STOCK:       "bg-[var(--tu-health-poor)]",
};

// Every action whose `entityId` is a work order, and so can be opened from the
// row. Sign-off and send-back were missing here: both carry a work-order id and
// both are the ones a reader most wants to jump straight into.
const WORK_ORDER_ACTIONS = new Set([
  "WORK_ORDER_REQUESTED", "WORK_ORDER_ACCEPTED", "WORK_ORDER_REJECTED",
  "WORK_ORDER_STARTED", "WORK_ORDER_ON_HOLD", "WORK_ORDER_COMPLETED",
  "WORK_ORDER_APPROVED", "WORK_ORDER_REWORK", "WORK_ORDER_OVERDUE",
  "WORK_ORDER_GENERATED",
]);

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // From the server, not from `notifications`: the list is now a page at a
  // time, so counting the rows in hand would report the unread total of
  // whatever happens to be loaded rather than of the account.
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Sending `limit` is what asks for the paginated envelope; without it
        // the endpoint answers with a bare array for the mobile client.
        const [list, count] = await Promise.all([
          api.get("/notifications", { params: { limit: PAGE_SIZE } }),
          api.get("/notifications/unread-count"),
        ]);
        if (cancelled) return;
        setNotifications(list.data.items);
        setCursor(list.data.nextCursor);
        setUnreadCount(count.data.count ?? 0);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.get("/notifications", { params: { limit: PAGE_SIZE, cursor } });
      setNotifications((prev) => [...prev, ...res.data.items]);
      setCursor(res.data.nextCursor);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }

  async function markRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silent
    }
  }

  async function markAllRead() {
    try {
      await api.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      // read-all is server-wide, so it clears the unread beyond this page too.
      setUnreadCount(0);
    } catch {
      // silent
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--tu-text-heading)]">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-[var(--tu-text-subtle)] mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-[var(--tu-text-subtle)] bg-[var(--tu-bg-secondary-strong)] hover:bg-[var(--tu-bg-tertiary)] px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="tu-card">
          <EmptyState
            icon="notification"
            title="No notifications yet"
            hint="Overdue work orders, PM reminders, and status changes on your accounts land here."
          />
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const dotCls = ACTION_DOT[n.action] ?? "bg-[var(--tu-text-disabled)]";
            const isDeepLinkable = WORK_ORDER_ACTIONS.has(n.action) && n.entityId && n.accountId;

            function handleClick() {
              if (!n.isRead) markRead(n.id);
            }

            const content = (
              <div
                onClick={handleClick}
                className={`flex gap-0 bg-[var(--tu-bg-surface)] rounded-xl border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${
                  !n.isRead ? "border-[var(--tu-bd-info)] bg-[var(--tu-soft-brand)]/30" : "border-[var(--tu-border)]"
                }`}
              >
                <div className={`w-1 shrink-0 ${dotCls}`} />
                <div className="flex-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--tu-text-heading)]">{n.title}</p>
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-[var(--tu-priority-medium)] shrink-0 mt-1" />}
                  </div>
                  <p className="text-sm text-[var(--tu-text-body)] mt-0.5">{n.body}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-[var(--tu-text-subtle)]">{timeAgo(n.createdAt)}</span>
                    {isDeepLinkable && (
                      <span className="text-xs text-[var(--tu-text-brand)] font-semibold">View →</span>
                    )}
                  </div>
                </div>
              </div>
            );

            if (isDeepLinkable) {
              return (
                <Link key={n.id} href={`/accounts/${n.accountId}/work-orders/${n.entityId}`}>
                  {content}
                </Link>
              );
            }

            return <div key={n.id}>{content}</div>;
          })}

          {cursor && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full text-sm text-[var(--tu-text-subtle)] bg-[var(--tu-bg-secondary-strong)] hover:bg-[var(--tu-bg-tertiary)] px-3 py-2.5 rounded-lg cursor-pointer transition-colors disabled:opacity-50 mt-2"
            >
              {loadingMore ? "Loading…" : "Load older"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
