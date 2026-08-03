"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import CommandPalette from "@/components/CommandPalette";

/**
 * Chrome for every signed-in page: navigation rail, top bar, and content column.
 *
 * The mobile drawer's open state lives here because two siblings need it — the
 * Topbar's hamburger opens it and the Sidebar renders it.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="tu-shell">
      <Sidebar drawerOpen={drawerOpen} onCloseDrawer={() => setDrawerOpen(false)} />
      <div className="tu-shell-main">
        <Topbar onOpenNav={() => setDrawerOpen(true)} />
        <main className="tu-shell-content">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
