"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canAccessRoute, type Role } from "@/lib/rbac";
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

function IconGear(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {/* Canonical Feather `settings` path. The previous copy had its arc pairs
          collapsed — `a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0` written as a single
          `a2 2 0 0 1-2.83 2.83`, and the vertical pair as `a2 2 0 0 1-4 0`.
          Those shortcuts change the sweep, so the cog teeth came out skewed.
          Do not "simplify" this path. */}
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
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

function IconBox(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  );
}

function IconBolt(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>
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

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

// Grouped into labeled sections (mirrors the account tab groups) so the global
// nav reads as distinct clusters instead of one long list. The first section
// has no heading — those are the primary entry points.
const NAV_SECTIONS: { heading?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/",         label: "Dashboard", Icon: IconGrid     },
      { href: "/accounts", label: "Accounts",  Icon: IconBuilding },
    ],
  },
  {
    heading: "Maintenance",
    items: [
      { href: "/work-orders",   label: "Work Orders",   Icon: IconClipboard },
      { href: "/assets",        label: "Assets",        Icon: IconBox       },
      { href: "/parts",         label: "Spare Parts",   Icon: IconBolt      },
      { href: "/pm-checklists",  label: "PM Checklists", Icon: IconChecklist },
    ],
  },
  {
    heading: "Workforce",
    items: [
      { href: "/employees", label: "Employees", Icon: IconUserPlus },
      { href: "/trainings", label: "Trainings", Icon: IconGradCap  },
    ],
  },
  {
    heading: "Insights",
    items: [
      { href: "/reports", label: "Reports", Icon: IconClipboard },
    ],
  },
  {
    heading: "Admin",
    items: [
      { href: "/users",    label: "Users",    Icon: IconUsers },
      { href: "/settings", label: "Settings", Icon: IconGear  },
    ],
  },
];

// ── Sidebar nav content (shared between desktop and mobile) ─

function NavContent({
  user,
  onNavigate,
}: {
  user: { name: string; email: string; role?: string } | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    api.get("/accounts").then((r) => setAccounts(r.data)).catch(() => {});
  }, []);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  // When switching accounts, keep the user on the same sub-section they're
  // already viewing (e.g. Assets → other account's Assets) rather than always
  // dumping them on Work Orders. Falls back to work-orders off account pages.
  const accountTabMatch = pathname.match(/^\/accounts\/[^/]+\/([^/]+)/);
  const accountSubPath = accountTabMatch ? accountTabMatch[1] : "work-orders";
  const activeAccountId = pathname.match(/^\/accounts\/([^/]+)/)?.[1];

  function renderNavItem(item: NavItem) {
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          className={`tu-nav-item${active ? " tu-active" : ""}`}
          aria-current={active ? "page" : undefined}
        >
          <span className="tu-nav-icon"><item.Icon /></span>
          <span style={{ flex: 1 }}>{item.label}</span>
        </Link>
      </li>
    );
  }

  return (
    <>
      {/* Identity, search, and notifications now live in the Topbar. */}

      {/* Primary navigation — grouped into labeled sections */}
      <nav className="tu-nav" aria-label="Main navigation">
        {NAV_SECTIONS.map((section, si) => {
          const items = section.items.filter((item) => canAccessRoute(user?.role as Role, item.href));
          if (items.length === 0) return null;
          return (
            <div key={section.heading ?? `nav-top-${si}`} className={section.heading ? "tu-section" : undefined}>
              {section.heading && <p className="tu-section-heading">{section.heading}</p>}
              <ul role="list">
                {items.map(renderNavItem)}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Accounts quick access */}
      {accounts.length > 0 && (
        <div className="tu-section">
          <p className="tu-section-heading">Accounts</p>
          <ul role="list">
            {accounts.map((acc) => {
              const active = acc.id === activeAccountId;
              return (
                <li key={acc.id}>
                  <Link
                    href={`/accounts/${acc.id}/${accountSubPath}`}
                    onClick={onNavigate}
                    className={`tu-project-item${active ? " tu-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span
                      className="tu-project-dot"
                      style={{ backgroundColor: active ? "var(--tu-nav-active-text)" : "var(--tu-nav-text-dim)" }}
                      aria-hidden="true"
                    />
                    <span className="tu-project-name">{acc.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Trailing space so the last section never hugs the viewport edge. */}
      <div style={{ flex: 1, minHeight: 16 }} />
    </>
  );
}

// ── Main component ────────────────────────────────────────

/**
 * Navigation surface. The mobile drawer's open state is owned by AppShell so
 * the Topbar's hamburger can drive it; this component only renders.
 */
export default function Sidebar({
  drawerOpen,
  onCloseDrawer,
}: {
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  const { user } = useAuth();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move focus to close button when drawer opens (WCAG 2.1 §3.2.2)
  useEffect(() => {
    if (drawerOpen) closeRef.current?.focus();
  }, [drawerOpen]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseDrawer();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, onCloseDrawer]);

  return (
    <>
      {/* Mobile overlay */}
      {drawerOpen && <div className="tu-overlay" onClick={onCloseDrawer} aria-hidden="true" />}

      {/* Mobile drawer */}
      <aside
        id="mobile-drawer"
        className={`tu-drawer${drawerOpen ? " tu-drawer-open" : ""}`}
        aria-label="Navigation"
        aria-hidden={!drawerOpen}
      >
        <div className="tu-drawer-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fmi_logo_light.png" alt="FMI" style={{ height: 26, width: "auto", objectFit: "contain" }} />
          <button
            ref={closeRef}
            className="tu-drawer-close"
            onClick={onCloseDrawer}
            aria-label="Close navigation"
            type="button"
          >
            <IconX />
          </button>
        </div>
        <div className="tu-inner">
          <NavContent user={user} onNavigate={onCloseDrawer} />
        </div>
      </aside>

      {/* Desktop sidebar — hidden below lg */}
      <aside className="tu-sidebar" aria-label="Navigation">
        <div className="tu-logo-strip">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fmi_logo_light.png" alt="FMI" style={{ height: 30, width: "auto", objectFit: "contain" }} />
        </div>
        <div className="tu-inner">
          <NavContent user={user} />
        </div>
      </aside>
    </>
  );
}
