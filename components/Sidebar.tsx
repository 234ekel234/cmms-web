"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { href: "/",              label: "Dashboard",    icon: "▦"  },
  { href: "/accounts",      label: "Accounts",     icon: "◫"  },
  { href: "/pm-checklists", label: "PM Checklists", icon: "✓" },
  { href: "/notifications", label: "Notifications", icon: "⊙" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="w-60 min-h-screen bg-[#1a3a5c] flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <p className="text-white text-xl font-black tracking-tight">CMMS</p>
        <p className="text-white/50 text-xs mt-0.5">Maintenance Management</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(item.href)
                ? "bg-white/15 text-white"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            <span className="text-base w-5 text-center">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">{user?.name?.[0]?.toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-white/50 text-xs truncate">{user?.role?.replace("_", " ")}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full text-left text-white/50 hover:text-white text-xs font-medium transition-colors px-1 cursor-pointer"
        >
          Sign out →
        </button>
      </div>
    </aside>
  );
}
