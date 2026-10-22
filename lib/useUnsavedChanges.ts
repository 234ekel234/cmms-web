"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

/**
 * Asks before leaving a page with unsaved work.
 *
 * Two exits are covered. Closing or reloading the tab gets the browser's own
 * prompt (`beforeunload` — the text is the browser's, not ours). A click on any
 * in-app link is caught in the capture phase, before Next's <Link> handles it,
 * and goes through the shared confirm dialog. The browser's Back button is not
 * caught: the app router offers no reliable hook for it.
 */
export function useUnsavedChanges(dirty: boolean, message = "Your answers since the last save will be lost.") {
  const confirm = useConfirm();
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onClick = async (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      if (await confirm({ title: "Leave without saving?", message, confirmLabel: "Leave" })) {
        router.push(url.pathname + url.search + url.hash);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, confirm, router, message]);
}
