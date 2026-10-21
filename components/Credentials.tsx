"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import {
  ACCEPT_SCANS,
  MAX_MB,
  contentUrl,
  credentialStatus,
  daysUntil,
  formatDate,
  formatSize,
  toDateInput,
  type Credential,
  type CredentialStatus,
} from "@/lib/attachments";

/**
 * An employee's credentials: licences, clearances, training certificates.
 *
 * Separate from <Attachments> rather than a mode on it. That component is a
 * gallery — a grid of job photos where the image is the content. This is a
 * register: what the document is, whether it is still valid, and when it
 * lapses. The upload differs too, since a credential is not worth filing
 * without saying what it is, so the label is collected before the file rather
 * than as an afterthought caption.
 *
 * Staff-only, enforced by the API (see canReachEmployeeFile in
 * backend/routes/attachmentRoutes.js). The caller should also not render it for
 * a client — a 404 section is a worse answer than no section.
 */

// Uses the tu-badge-* variants that lib/statuses.ts maps every other domain
// enum onto, so a lapsed credential reads with the same weight as an overdue
// work order rather than inventing a second visual language for "bad".
const STATUS_STYLE: Record<CredentialStatus, { label: (c: Credential) => string; className: string }> = {
  expired: { label: () => "Expired", className: "tu-badge tu-badge-danger" },
  expiring: {
    label: (c) => {
      const d = daysUntil(c.expiresAt!);
      return d === 0 ? "Expires today" : `${d} day${d === 1 ? "" : "s"} left`;
    },
    className: "tu-badge tu-badge-warning",
  },
  valid: { label: () => "Valid", className: "tu-badge tu-badge-success" },
  "no-expiry": { label: () => "No expiry", className: "tu-badge tu-badge-neutral" },
};

type Draft = { label: string; issuedAt: string; expiresAt: string };
const EMPTY: Draft = { label: "", issuedAt: "", expiresAt: "" };

export default function Credentials({
  employeeId,
  canEdit = false,
}: {
  employeeId: string;
  canEdit?: boolean;
}) {
  const [items, setItems] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(EMPTY);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api
      .get(`/employees/${employeeId}/attachments`)
      .then((res) => setItems(res.data))
      .catch(() => {
        /* a failure here should not blank the rest of the page */
      });
  }, [employeeId]);

  // Set state from the promise callback, not the effect body, and drop a slow
  // response for a previous employee after a navigation.
  useEffect(() => {
    let cancelled = false;
    api
      .get(`/employees/${employeeId}/attachments`)
      .then((res) => { if (!cancelled) setItems(res.data); })
      .catch(() => { /* leave the section empty rather than break the page */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId]);

  // View tokens lapse; refresh before a left-open page starts 401ing on links.
  useEffect(() => {
    if (items.length === 0) return;
    const ttl = items[0].viewTokenExpiresIn ?? 600;
    const timer = setTimeout(load, Math.max(30, ttl - 60) * 1000);
    return () => clearTimeout(timer);
  }, [items, load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    setError("");

    if (!draft.label.trim()) return setError("Give the document a name, e.g. “PRC Electrical Licence”.");
    if (!file) return setError("Choose the scan or photo to file.");
    // Checked here for an instant answer; the API enforces it regardless.
    if (file.size > MAX_MB * 1024 * 1024) {
      return setError(`“${file.name}” is ${formatSize(file.size)}. The limit is ${MAX_MB} MB.`);
    }

    const form = new FormData();
    form.append("file", file);
    form.append("label", draft.label.trim());
    if (draft.issuedAt) form.append("issuedAt", draft.issuedAt);
    if (draft.expiresAt) form.append("expiresAt", draft.expiresAt);

    setBusy(true);
    try {
      await api.post(`/employees/${employeeId}/attachments`, form);
      // Re-fetch rather than prepend: the list is ordered by expiry, so a new
      // row rarely belongs at the top and the server decides where it sits.
      load();
      setDraft(EMPTY);
      setAdding(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      setError(readError(err, "Upload failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function save(id: string) {
    setError("");
    if (!edit.label.trim()) return setError("The name cannot be empty.");
    setBusy(true);
    try {
      await api.patch(`/attachments/${id}`, {
        label: edit.label.trim(),
        issuedAt: edit.issuedAt || null,
        expiresAt: edit.expiresAt || null,
      });
      load();
      setEditingId(null);
    } catch (err: unknown) {
      setError(readError(err, "Could not save those details."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Credential) {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/attachments/${c.id}`);
      setItems((prev) => prev.filter((x) => x.id !== c.id));
    } catch {
      setError(`Could not remove “${c.label ?? c.filename}”.`);
    } finally {
      setBusy(false);
    }
  }

  const lapsing = items.filter((c) => {
    const s = credentialStatus(c);
    return s === "expired" || s === "expiring";
  }).length;

  return (
    <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--tu-border)]">
        <div>
          <p className="text-sm font-bold text-[var(--tu-text-heading)]">Credentials</p>
          <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
            {items.length === 0
              ? "Licences, clearances and certificates"
              : lapsing > 0
                ? `${items.length} on file · ${lapsing} need attention`
                : `${items.length} on file · all current`}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="tu-btn-secondary tu-btn-sm"
            onClick={() => { setAdding((o) => !o); setError(""); }}
          >
            {adding ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>

      {adding && canEdit && (
        <form onSubmit={upload} className="px-5 py-4 border-b border-[var(--tu-border)]" style={{ background: "var(--tu-bg-secondary)" }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <label style={{ gridColumn: "1 / -1" }}>
              <span className="tu-label">Document name</span>
              <input
                className="tu-input"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="PRC Electrical Licence"
                autoFocus
              />
            </label>
            <label>
              <span className="tu-label">Issued</span>
              <input type="date" className="tu-input" value={draft.issuedAt} onChange={(e) => setDraft({ ...draft, issuedAt: e.target.value })} />
            </label>
            <label>
              <span className="tu-label">Expires</span>
              <input type="date" className="tu-input" value={draft.expiresAt} onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })} />
            </label>
            <label>
              <span className="tu-label">Scan or photo</span>
              <input ref={fileRef} type="file" accept={ACCEPT_SCANS} className="tu-input" style={{ padding: 6 }} />
            </label>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--tu-text-subtle)", marginTop: 8 }}>
            Leave <strong>Expires</strong> empty for a credential that does not lapse. PDF or image, up to {MAX_MB} MB.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" className="tu-btn-primary tu-btn-sm" disabled={busy}>
              {busy ? "Filing…" : "File credential"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="tu-danger-text" style={{ fontSize: 12.5, padding: "10px 20px 0" }}>{error}</p>
      )}

      {loading ? (
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2].map((i) => <div key={i} className="tu-skeleton" style={{ height: 44, borderRadius: 8 }} />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon="training"
          title="No credentials on file"
          hint={canEdit ? "Add a PRC licence, NBI clearance or training certificate." : "Nothing has been filed."}
        />
      ) : (
        <ul role="list" style={{ display: "flex", flexDirection: "column" }}>
          {items.map((c) => {
            const status = credentialStatus(c);
            const style = STATUS_STYLE[status];
            const isEditing = editingId === c.id;

            return (
              <li key={c.id} className="px-5 py-3 border-b border-[var(--tu-border)] last:border-b-0">
                {isEditing ? (
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                    <label style={{ gridColumn: "1 / -1" }}>
                      <span className="tu-label">Document name</span>
                      <input className="tu-input" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
                    </label>
                    <label>
                      <span className="tu-label">Issued</span>
                      <input type="date" className="tu-input" value={edit.issuedAt} onChange={(e) => setEdit({ ...edit, issuedAt: e.target.value })} />
                    </label>
                    <label>
                      <span className="tu-label">Expires</span>
                      <input type="date" className="tu-input" value={edit.expiresAt} onChange={(e) => setEdit({ ...edit, expiresAt: e.target.value })} />
                    </label>
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                      <button type="button" className="tu-btn-primary tu-btn-sm" disabled={busy} onClick={() => save(c.id)}>
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button type="button" className="tu-btn-secondary tu-btn-sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                        <a href={contentUrl(c)} target="_blank" rel="noopener noreferrer" className="tu-link" style={{ fontSize: 13.5, fontWeight: 600 }}>
                          {c.label ?? c.filename}
                        </a>
                        <span className={style.className}>{style.label(c)}</span>
                      </div>
                      <p style={{ fontSize: 11.5, color: "var(--tu-text-subtle)", marginTop: 2 }}>
                        {[
                          c.issuedAt ? `Issued ${formatDate(c.issuedAt)}` : null,
                          c.expiresAt ? `Expires ${formatDate(c.expiresAt)}` : null,
                          formatSize(c.sizeBytes),
                          c.uploadedByName,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {canEdit && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          className="tu-btn-secondary tu-btn-sm"
                          onClick={() => {
                            setEditingId(c.id);
                            setEdit({
                              label: c.label ?? "",
                              issuedAt: toDateInput(c.issuedAt),
                              expiresAt: toDateInput(c.expiresAt),
                            });
                            setError("");
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className="tu-btn-secondary tu-btn-sm" disabled={busy} onClick={() => remove(c)}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function readError(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}
