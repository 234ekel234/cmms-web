"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";

// ── Inline SVG icons ─────────────────────────────────────

function IconGrid(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

function IconBuilding(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function IconChecklist(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  );
}

function IconBell(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function IconGear(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function IconUsers(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconHelp(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function IconUserPlus(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <line x1="19" y1="8" x2="19" y2="14"/>
      <line x1="22" y1="11" x2="16" y2="11"/>
    </svg>
  );
}

function IconClipboard(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
      <line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  );
}

function IconGradCap(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
      <path d="M6 12v5c0 1.657 2.686 3 6 3s6-1.343 6-3v-5"/>
    </svg>
  );
}

function IconLogOut(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

function IconChevronUpDown(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <polyline points="18 15 12 9 6 15" transform="translate(0,-2)"/>
      <polyline points="18 9 12 15 6 9" transform="translate(0,2)"/>
    </svg>
  );
}

function IconMenu(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...p}>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function IconX(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...p}>
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}



// ── Data ─────────────────────────────────────────────────

type Account = { id: string; name: string };
type Role = "GENERAL_MANAGER" | "MANAGER" | "SUPERVISOR" | "CLIENT";

const NAV_ITEMS: {
  href: string;
  label: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  badge?: boolean;
  roles?: Role[];
}[] = [
  { href: "/",               label: "Dashboard",     Icon: IconGrid      },
  { href: "/work-orders",    label: "Work Orders",   Icon: IconClipboard },
  { href: "/accounts",       label: "Accounts",      Icon: IconBuilding  },
  { href: "/employees",      label: "Employees",     Icon: IconUserPlus  },
  { href: "/pm-checklists",  label: "PM Checklists", Icon: IconChecklist },
  { href: "/trainings",      label: "Trainings",     Icon: IconGradCap   },
  { href: "/reports",        label: "Reports",       Icon: IconClipboard },
  { href: "/notifications",  label: "Notifications", Icon: IconBell, badge: true },
  { href: "/users",          label: "Users",         Icon: IconUsers, roles: ["GENERAL_MANAGER", "MANAGER"] },
  { href: "/settings",       label: "Settings",      Icon: IconGear     },
];

// ── Sidebar nav content (shared between desktop and mobile) ─

function NavContent({ user, logout }: { user: { name: string; email: string; role?: string } | null; logout: () => void }) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    api.get("/notifications").then((r) => {
      setUnreadCount(r.data.filter((n: { isRead: boolean }) => !n.isRead).length);
    }).catch(() => {});
    api.get("/accounts").then((r) => setAccounts(r.data)).catch(() => {});
  }, []);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  const initial = user?.name?.[0]?.toUpperCase() ?? "?";

  return (
    <>
      {/* User identity header */}
      <div className="tu-user-header">
        <div className="tu-avatar" aria-hidden="true">{initial}</div>
        <div className="tu-user-info">
          <span className="tu-user-name">{user?.name}</span>
          <span className="tu-user-email">{user?.email}</span>
        </div>
        <button className="tu-chevron-btn" aria-label="Switch account" type="button">
          <IconChevronUpDown />
        </button>
      </div>

      {/* Primary navigation */}
      <nav className="tu-nav" aria-label="Main navigation">
        <ul role="list">
          {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user?.role as Role)).map((item) => {
            const active = isActive(item.href);
            const count = item.badge ? unreadCount : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`tu-nav-item${active ? " tu-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="tu-nav-icon" style={{ position: "relative" }}>
                    <item.Icon />
                    {count > 0 && (
                      <span
                        aria-label={`${count} unread`}
                        style={{
                          position: "absolute",
                          top: -4,
                          right: -5,
                          minWidth: 14,
                          height: 14,
                          padding: "0 3px",
                          background: "#ef4444",
                          color: "#fff",
                          borderRadius: 9999,
                          fontSize: 9,
                          fontWeight: 700,
                          lineHeight: "14px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {count > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginLeft: 4 }}>
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Accounts quick access */}
      {accounts.length > 0 && (
        <div className="tu-section">
          <p className="tu-section-heading">Accounts</p>
          <ul role="list">
            {accounts.map((acc) => (
              <li key={acc.id}>
                <Link
                  href={`/accounts/${acc.id}/work-orders`}
                  className="tu-project-item"
                >
                  <span
                    className="tu-project-dot"
                    style={{ backgroundColor: "#2166AC" }}
                    aria-hidden="true"
                  />
                  <span className="tu-project-name">{acc.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Spacer pushes utility group to bottom */}
      <div style={{ flex: 1 }} />

      {/* Bottom utility group */}
      <div className="tu-utility-group">
        <ul role="list">
          <li>
            <button className="tu-utility-item" type="button" onClick={logout}>
              <IconLogOut />
              Sign out
            </button>
          </li>
        </ul>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move focus to close button when drawer opens (WCAG 2.1 §3.2.2)
  useEffect(() => {
    if (drawerOpen) closeRef.current?.focus();
  }, [drawerOpen]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <>
      {/* Mobile hamburger — hidden on lg+ */}
      <button
        className="tu-mobile-toggle"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open navigation"
        aria-expanded={drawerOpen}
        aria-controls="mobile-drawer"
        type="button"
      >
        <IconMenu />
      </button>

      {/* Mobile overlay */}
      {drawerOpen && (
        <div
          className="tu-overlay"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        id="mobile-drawer"
        className={`tu-drawer${drawerOpen ? " tu-drawer-open" : ""}`}
        aria-label="Navigation"
        aria-hidden={!drawerOpen}
      >
        <div className="tu-drawer-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fmi_logo.png" alt="FMI" style={{ height: 28, width: "auto", objectFit: "contain" }} />
          <button
            ref={closeRef}
            className="tu-drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            type="button"
          >
            <IconX />
          </button>
        </div>
        <div className="tu-inner">
          <NavContent user={user} logout={logout} />
        </div>
      </aside>

      {/* Desktop sidebar — hidden below lg */}
      <aside className="tu-sidebar" aria-label="Navigation">
        <div className="tu-logo-strip">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fmi_logo.png" alt="FMI" style={{ height: 28, width: "auto", objectFit: "contain" }} />
          <span className="tu-logo-label">Maintenance Mgmt</span>
        </div>
        <div className="tu-inner">
          <NavContent user={user} logout={logout} />
        </div>
      </aside>

    </>
  );
}
