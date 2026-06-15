"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

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
  WORK_ORDER_REQUESTED: "bg-purple-400",
  WORK_ORDER_ACCEPTED:  "bg-green-500",
  WORK_ORDER_REJECTED:  "bg-red-400",
  WORK_ORDER_STARTED:   "bg-amber-400",
  WORK_ORDER_COMPLETED: "bg-green-500",
  WORK_ORDER_OVERDUE:   "bg-red-400",
  CHECKLIST_INCOMPLETE: "bg-amber-400",
};

const WORK_ORDER_ACTIONS = new Set([
  "WORK_ORDER_REQUESTED", "WORK_ORDER_ACCEPTED", "WORK_ORDER_REJECTED",
  "WORK_ORDER_STARTED", "WORK_ORDER_COMPLETED", "WORK_ORDER_OVERDUE",
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

  useEffect(() => { fetchNotifications(); }, []);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const res = await api.get("/notifications");
      setNotifications(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    } catch {
      // silent
    }
  }

  async function markAllRead() {
    try {
      await api.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // silent
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-400 mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <p className="text-lg mb-1">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const dotCls = ACTION_DOT[n.action] ?? "bg-gray-300";
            const isDeepLinkable = WORK_ORDER_ACTIONS.has(n.action) && n.entityId && n.accountId;

            function handleClick() {
              if (!n.isRead) markRead(n.id);
            }

            const content = (
              <div
                onClick={handleClick}
                className={`flex gap-0 bg-white rounded-xl border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${
                  !n.isRead ? "border-blue-100 bg-blue-50/30" : "border-gray-100"
                }`}
              >
                <div className={`w-1 shrink-0 ${dotCls}`} />
                <div className="flex-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0 mt-1" />}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{n.body}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
                    {isDeepLinkable && (
                      <span className="text-xs text-[#2166AC] font-semibold">View →</span>
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
        </div>
      )}
    </div>
  );
}
