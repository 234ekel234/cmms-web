"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// Minimal shape the calendar needs; callers may pass richer objects.
export type CalendarOrder = {
  id: string;
  title: string;
  status: "REQUESTED" | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
  dueDate: string | null;
};

type Props<T extends CalendarOrder> = {
  orders: T[];
  hrefFor: (order: T) => string;
  tooltipFor?: (order: T) => string;
  loading?: boolean;
};

const CALENDAR_STATUS: Record<CalendarOrder["status"], { bg: string; fg: string; label: string }> = {
  REQUESTED:   { bg: "#eef6ff", fg: "#1447e6", label: "Requested"   },
  PENDING:     { bg: "#fef3c7", fg: "#92400e", label: "Pending"     },
  IN_PROGRESS: { bg: "#dbeafe", fg: "#1d4ed8", label: "In Progress" },
  COMPLETED:   { bg: "#dcfce7", fg: "#166534", label: "Completed"   },
  REJECTED:    { bg: "#fee2e2", fg: "#991b1b", label: "Rejected"    },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Local (not UTC) yyyy-mm-dd key so buckets line up with the displayed grid.
function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 6×7 grid of dates covering the month `cursor` falls in, padded with
// trailing/leading days from adjacent months.
function monthMatrix(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // back up to Sunday
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function WorkOrderCalendar<T extends CalendarOrder>({ orders, hrefFor, tooltipFor, loading }: Props<T>) {
  const [cursor, setCursor] = useState(() => new Date());

  const ordersByDay = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const wo of orders) {
      if (!wo.dueDate) continue;
      const key = dateKey(new Date(wo.dueDate));
      const bucket = map.get(key);
      if (bucket) bucket.push(wo);
      else map.set(key, [wo]);
    }
    return map;
  }, [orders]);

  const noDueDateCount = orders.filter((wo) => !wo.dueDate).length;
  const cells = useMemo(() => monthMatrix(cursor), [cursor]);
  const todayKey = dateKey(new Date());
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--tu-text-heading)", margin: 0 }}>{monthLabel}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setCursor(new Date())} style={navBtn} aria-label="Go to current month">Today</button>
          <button type="button" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))} style={navBtn} aria-label="Previous month">‹</button>
          <button type="button" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))} style={navBtn} aria-label="Next month">›</button>
        </div>
      </div>

      {loading ? (
        <div className="tu-skeleton" style={{ height: 560, borderRadius: 8 }} aria-label="Loading calendar" />
      ) : (
        <>
          {/* Weekday header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderTop: "1px solid var(--tu-border)", borderLeft: "1px solid var(--tu-border)" }}>
            {WEEKDAYS.map((d) => (
              <div key={d} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "var(--tu-text-subtle)", textTransform: "uppercase", letterSpacing: 0.4, borderRight: "1px solid var(--tu-border)", borderBottom: "1px solid var(--tu-border)", background: "var(--tu-bg-secondary)" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderLeft: "1px solid var(--tu-border)" }}>
            {cells.map((d) => {
              const key = dateKey(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = key === todayKey;
              const dayOrders = ordersByDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  style={{
                    minHeight: 104,
                    padding: 6,
                    borderRight: "1px solid var(--tu-border)",
                    borderBottom: "1px solid var(--tu-border)",
                    background: inMonth ? "var(--tu-bg-surface)" : "var(--tu-bg-secondary)",
                    opacity: inMonth ? 1 : 0.55,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: isToday ? 700 : 500,
                        color: isToday ? "#fff" : "var(--tu-text-body)",
                        background: isToday ? "var(--tu-text-brand)" : "transparent",
                        borderRadius: 999,
                        minWidth: 20,
                        height: 20,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 5px",
                      }}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {dayOrders.slice(0, 3).map((wo) => {
                      const c = CALENDAR_STATUS[wo.status];
                      return (
                        <Link
                          key={wo.id}
                          href={hrefFor(wo)}
                          title={tooltipFor ? tooltipFor(wo) : `${wo.title} (${c.label})`}
                          style={{
                            display: "block",
                            fontSize: 11,
                            fontWeight: 600,
                            lineHeight: 1.3,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: c.bg,
                            color: c.fg,
                            textDecoration: "none",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {wo.title}
                        </Link>
                      );
                    })}
                    {dayOrders.length > 3 && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--tu-text-subtle)", paddingLeft: 4 }}>
                        +{dayOrders.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend + no-due-date note */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 14 }}>
            {(Object.keys(CALENDAR_STATUS) as CalendarOrder["status"][]).map((s) => (
              <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tu-text-body)" }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: CALENDAR_STATUS[s].bg, border: `1px solid ${CALENDAR_STATUS[s].fg}33` }} />
                {CALENDAR_STATUS[s].label}
              </span>
            ))}
            {noDueDateCount > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--tu-text-subtle)" }}>
                {noDueDateCount} work order{noDueDateCount !== 1 ? "s" : ""} with no due date (not shown)
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  minWidth: 34,
  height: 34,
  padding: "0 10px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: 8,
  border: "1px solid var(--tu-border)",
  background: "var(--tu-bg-surface)",
  color: "var(--tu-text-body)",
};
