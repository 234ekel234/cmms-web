"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * One "are you sure?" for the whole app.
 *
 * `const confirm = useConfirm(); if (!(await confirm({...}))) return;` — a
 * promise rather than a pair of open/closed states per page, so guarding an
 * action is one line at the top of the handler that already does the work.
 * Twenty-odd delete and remove buttons fired on the first click before this;
 * a dialog per page would have been twenty copies to drift apart.
 *
 * Focus starts on Cancel and Escape cancels: a stray Enter must never be the
 * thing that deletes. It sits above other modals (z-index), because several
 * removals — a location, a credential — are asked from inside one.
 */

export type ConfirmOptions = {
  title: string;
  /** What will happen, in a sentence. Name the thing being removed. */
  message?: React.ReactNode;
  /** The button label — the verb, e.g. "Delete", "Remove", "Archive". */
  confirmLabel?: string;
  /** Red confirm button. Default true; pass false for reversible actions. */
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...o, resolve });
      }),
    [],
  );

  const settle = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); settle(false); }
    };
    // Capture phase, so an underlying modal's own Escape handler does not
    // close it too.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending, settle]);

  const destructive = pending?.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="tu-modal-overlay tu-confirm-overlay"
          role="presentation"
          onClick={() => settle(false)}
        >
          <div
            className="tu-modal"
            style={{ maxWidth: 420 }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="tu-confirm-title"
            aria-describedby={pending.message ? "tu-confirm-message" : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tu-modal-header">
              <h2 id="tu-confirm-title" className="tu-modal-title">{pending.title}</h2>
            </div>
            {pending.message && (
              <div className="tu-modal-body">
                <p id="tu-confirm-message" className="tu-confirm-message">{pending.message}</p>
              </div>
            )}
            <div className="tu-modal-footer">
              <button ref={cancelRef} type="button" className="tu-btn-secondary tu-btn-sm" onClick={() => settle(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={destructive ? "tu-btn-confirm-danger tu-btn-sm" : "tu-btn-primary tu-btn-sm"}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
