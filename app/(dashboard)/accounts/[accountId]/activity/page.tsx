"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import EmptyState from "@/components/EmptyState";

type AuditLog = {
  id: string;
  action: string;
  description: string;
  performedByName: string | null;
  createdAt: string;
};

const ACTION_DOT: Record<string, string> = {
  WORK_ORDER_REQUESTED: "bg-[var(--tu-status-pending)]",
  WORK_ORDER_CREATED:   "bg-[var(--tu-priority-medium)]",
  WORK_ORDER_ACCEPTED:  "bg-[var(--tu-status-completed)]",
  WORK_ORDER_REJECTED:  "bg-[var(--tu-priority-critical)]",
  WORK_ORDER_STARTED:   "bg-[var(--tu-priority-high)]",
  WORK_ORDER_COMPLETED: "bg-[var(--tu-status-completed)]",
  WORK_ORDER_UPDATED:   "bg-[var(--tu-priority-medium)]",
  CHECKLIST_COMPLETED:  "bg-[var(--tu-text-brand)]",
  CHECKLIST_ASSIGNED:   "bg-cyan-500",
  CHECKLIST_REMOVED:    "bg-[var(--tu-text-subtle)]",
  CHECKLIST_INCOMPLETE: "bg-[var(--tu-priority-critical)]",
  CHECKLIST_EDITED:     "bg-[var(--tu-priority-high)]",
  ATTENDANCE_MARKED:    "bg-[var(--tu-status-on-hold)]",
  ASSET_CREATED:        "bg-violet-400",
  ASSET_STATUS_CHANGED: "bg-[var(--tu-health-poor)]",
  MEMBER_ADDED:         "bg-violet-400",
  MEMBER_REMOVED:       "bg-[var(--tu-priority-critical)]",
};

type FilterKey = "all" | "work_orders" | "checklists" | "attendance" | "assets" | "members";

const FILTERS: { key: FilterKey; label: string; actions: string[] }[] = [
  { key: "all",         label: "All",         actions: [] },
  { key: "work_orders", label: "Work Orders",  actions: ["WORK_ORDER_REQUESTED","WORK_ORDER_CREATED","WORK_ORDER_ACCEPTED","WORK_ORDER_REJECTED","WORK_ORDER_STARTED","WORK_ORDER_COMPLETED","WORK_ORDER_UPDATED"] },
  { key: "checklists",  label: "Checklists",   actions: ["CHECKLIST_COMPLETED","CHECKLIST_ASSIGNED","CHECKLIST_REMOVED","CHECKLIST_INCOMPLETE","CHECKLIST_EDITED"] },
  { key: "attendance",  label: "Attendance",   actions: ["ATTENDANCE_MARKED"] },
  { key: "assets",      label: "Assets",       actions: ["ASSET_CREATED","ASSET_STATUS_CHANGED"] },
  { key: "members",     label: "Members",      actions: ["MEMBER_ADDED","MEMBER_REMOVED"] },
];

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (mins < 1) return `just now · ${time}`;
  if (mins < 60) return `${mins}m ago · ${time}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago · ${time}`;
  const days = Math.floor(hours / 24);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${days}d ago · ${date}, ${time}`;
}

function groupByDate(logs: AuditLog[]) {
  const groups: { label: string; items: AuditLog[] }[] = [];
  const map = new Map<string, AuditLog[]>();
  logs.forEach((log) => {
    const d = new Date(log.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    let label: string;
    if (d.toDateString() === today.toDateString()) label = "Today";
    else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    if (!map.has(label)) { map.set(label, []); groups.push({ label, items: map.get(label)! }); }
    map.get(label)!.push(log);
  });
  return groups;
}

export default function ActivityPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  useEffect(() => { loadInitial(); }, [accountId]);

  async function loadInitial() {
    setLoading(true);
    try {
      const res = await api.get(`/accounts/${accountId}/audit-logs?limit=30`);
      setLogs(res.data);
      setHasMore(res.data.length === 30);
      setCursor(res.data[res.data.length - 1]?.id ?? null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.get(`/accounts/${accountId}/audit-logs?limit=30&cursor=${cursor}`);
      setLogs((prev) => [...prev, ...res.data]);
      setHasMore(res.data.length === 30);
      setCursor(res.data[res.data.length - 1]?.id ?? null);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }

  const filterDef = FILTERS.find((f) => f.key === activeFilter)!;
  const filteredLogs = activeFilter === "all" ? logs : logs.filter((l) => filterDef.actions.includes(l.action));
  const groups = groupByDate(filteredLogs);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h2 className="text-lg font-bold text-[var(--tu-text-heading)] mb-4">Activity Log</h2>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
              activeFilter === f.key ? "bg-[var(--tu-text-brand)] text-white border-[var(--tu-text-brand)]" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-14 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />)}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="tu-card">
          <EmptyState
            icon="activity"
            title={activeFilter === "all" ? "No activity yet" : `No ${filterDef.label.toLowerCase()} activity`}
            hint={
              activeFilter === "all"
                ? "Every change made on this account is recorded here."
                : "Nothing has been recorded under this filter yet."
            }
          />
        </div>
      ) : (
        <div>
          {groups.map((group) => (
            <div key={group.label} className="mb-6">
              <p className="text-xs font-bold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-3 ml-8">
                {group.label}
              </p>
              {group.items.map((log, idx) => {
                const dotCls = ACTION_DOT[log.action] ?? "bg-[var(--tu-text-disabled)]";
                const isLast = idx === group.items.length - 1;
                return (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center w-5 shrink-0 pt-1">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotCls}`} />
                      {!isLast && <div className="w-0.5 bg-[var(--tu-bg-tertiary)] flex-1 mt-1" style={{ minHeight: "20px" }} />}
                    </div>
                    <div className={`flex-1 pb-3 ml-2 ${!isLast ? "border-b border-[var(--tu-border)]" : ""}`}>
                      <p className="text-sm text-[var(--tu-text-heading)] font-medium">{log.description}</p>
                      <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
                        {log.performedByName ?? "System"} · {formatTimestamp(log.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 text-sm text-[var(--tu-text-subtle)] border border-[var(--tu-border)] rounded-xl hover:bg-[var(--tu-bg-secondary)] cursor-pointer disabled:opacity-50 mt-4"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
