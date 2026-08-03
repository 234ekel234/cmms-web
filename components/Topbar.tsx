"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function IconBell(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconChevron(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconGear(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconLogOut(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconMenu(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...p}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconSearch(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconHelp(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconMail(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

function IconKeyboard(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </svg>
  );
}

const ROLE_LABELS: Record<string, string> = {
  GENERAL_MANAGER: "General Manager",
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  CLIENT: "Client",
};

// Set NEXT_PUBLIC_SUPPORT_EMAIL in .env.local to route support mail somewhere
// real; this fallback is a placeholder, not a live mailbox.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com";

/**
 * Application top bar: global search, notifications, and the signed-in user.
 *
 * Identity and notifications used to live in the sidebar. They sit here now so
 * the sidebar is purely navigation, and so "who am I / what needs me" stays in
 * one predictable corner on every page.
 */
export default function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  // Single source for the unread count now that the sidebar no longer shows it.
  useEffect(() => {
    let cancelled = false;
    function load() {
      api
        .get("/notifications")
        .then((r) => {
          if (!cancelled) setUnread(r.data.filter((n: { isRead: boolean }) => !n.isRead).length);
        })
        .catch(() => {});
    }
    load();
    // Re-check periodically so the badge doesn't go stale on a long-lived tab.
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Close whichever popover is open on outside click or Escape.
  useEffect(() => {
    if (!menuOpen && !helpOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t)) setMenuOpen(false);
      if (helpRef.current && !helpRef.current.contains(t)) setHelpOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      setHelpOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, helpOpen]);

  const initial = user?.name?.[0]?.toUpperCase() ?? "?";
  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : null;

  // Pre-fill the page and account context so a report is actionable without a
  // round-trip asking "where were you and who are you?".
  const supportHref =
    `mailto:${SUPPORT_EMAIL}` +
    `?subject=${encodeURIComponent("CMMS support request")}` +
    `&body=${encodeURIComponent(
      [
        "Describe the problem here.",
        "",
        "---",
        `User: ${user?.name ?? "—"} (${user?.email ?? "—"})`,
        roleLabel ? `Role: ${roleLabel}` : null,
        `Page: ${pathname}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )}`;

  return (
    <header className="tu-topbar">
      {/* Drawer trigger — only below lg, where the sidebar is hidden. */}
      <button
        type="button"
        className="tu-topbar-burger"
        onClick={onOpenNav}
        aria-label="Open navigation"
        aria-controls="mobile-drawer"
      >
        <IconMenu />
      </button>

      <button
        type="button"
        className="tu-topbar-search"
        onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
      >
        <IconSearch />
        <span className="tu-topbar-search-label">Search…</span>
        <span className="tu-kbd-hint">⌘K</span>
      </button>

      <div className="tu-topbar-actions">
        <div className="tu-usermenu" ref={helpRef}>
          <button
            type="button"
            className="tu-topbar-icon-btn"
            onClick={() => setHelpOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={helpOpen}
            aria-label="Help and support"
          >
            <IconHelp />
          </button>

          {helpOpen && (
            <div className="tu-menu tu-usermenu-panel" role="menu">
              <div className="tu-usermenu-header">
                <span className="tu-usermenu-name">Need help?</span>
                <span className="tu-usermenu-email">We&rsquo;ll include your current page automatically.</span>
              </div>
              <a
                href={supportHref}
                role="menuitem"
                className="tu-menu-item tu-menu-item-icon"
                onClick={() => setHelpOpen(false)}
              >
                <IconMail />
                Contact support
              </a>
              <button
                type="button"
                role="menuitem"
                className="tu-menu-item tu-menu-item-icon"
                onClick={() => {
                  setHelpOpen(false);
                  window.dispatchEvent(new CustomEvent("open-command-palette"));
                }}
              >
                <IconKeyboard />
                Search &amp; shortcuts
                <span className="tu-kbd-hint tu-menu-item-hint">⌘K</span>
              </button>
            </div>
          )}
        </div>

        <Link
          href="/notifications"
          className="tu-topbar-icon-btn"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <IconBell />
          {unread > 0 && (
            <span className="tu-topbar-dot" aria-hidden="true">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>

        <span className="tu-topbar-divider" aria-hidden="true" />

        <div className="tu-usermenu" ref={menuRef}>
          <button
            type="button"
            className="tu-usermenu-trigger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="tu-topbar-avatar" aria-hidden="true">{initial}</span>
            <span className="tu-usermenu-id">
              <span className="tu-usermenu-name">{user?.name ?? "—"}</span>
              <span className="tu-usermenu-email">{user?.email}</span>
            </span>
            <IconChevron className={menuOpen ? "tu-usermenu-chevron tu-open" : "tu-usermenu-chevron"} />
          </button>

          {menuOpen && (
            <div className="tu-menu tu-usermenu-panel" role="menu">
              {/* Repeated here because the trigger hides name/email on narrow screens. */}
              <div className="tu-usermenu-header">
                <span className="tu-usermenu-name">{user?.name}</span>
                <span className="tu-usermenu-email">{user?.email}</span>
                {roleLabel && <span className="tu-chip tu-usermenu-role">{roleLabel}</span>}
              </div>
              <Link
                href="/settings"
                role="menuitem"
                className="tu-menu-item tu-menu-item-icon"
                onClick={() => setMenuOpen(false)}
              >
                <IconGear />
                Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                className="tu-menu-item tu-menu-item-icon tu-menu-item-danger"
                onClick={() => {
                  setMenuOpen(false);
                  logout(); // AuthContext.logout already redirects to /login
                }}
              >
                <IconLogOut />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
