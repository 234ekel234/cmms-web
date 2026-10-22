"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import {
  ACCEPT,
  MAX_MB,
  contentUrl,
  formatSize,
  type BaseAttachment,
} from "@/lib/attachments";
import { useConfirm } from "@/components/ConfirmDialog";
import ArchivedList from "@/components/ArchivedList";

/**
 * Photos and documents on a work order or an asset.
 *
 * Thumbnails are plain <img> tags rather than blob fetches: the API issues a
 * short-lived, single-attachment view token with the listing, so the browser
 * can load each image directly. That keeps a dozen 4 MB job photos out of the
 * page's memory, and on S3 the request redirects straight to storage.
 */

// Employee credentials are a different shape and live in <Credentials>; this
// component stays the gallery it was. Both draw their limits and their fetch
// URL from lib/attachments so they cannot drift apart.
type Attachment = BaseAttachment;

type Props = {
  /** Which kind of parent this list hangs off. */
  parent: "work-orders" | "assets";
  parentId: string;
  /** Staff may remove; clients may only add and view. */
  canDelete?: boolean;
  /** Hides the upload control on terminal or read-only records. */
  canUpload?: boolean;
  /** Assets only: the photo currently shown as the asset's cover. */
  coverId?: string | null;
  /** Assets only, staff only: offered as "Make cover" on each photo. */
  onSetCover?: (id: string | null) => void;
  onUploaded?: (a: Attachment) => void;
  onRemoved?: (id: string) => void;
};

export default function Attachments({
  parent,
  parentId,
  canDelete = false,
  canUpload = true,
  coverId = null,
  onSetCover,
  onUploaded,
  onRemoved,
}: Props) {
  const confirm = useConfirm();
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/${parent}/${parentId}/attachments`);
      setItems(res.data);
    } catch {
      // A failure here should not blank the rest of the page.
    } finally {
      setLoading(false);
    }
  }, [parent, parentId]);

  // Fetched in a promise callback rather than by awaiting in the effect body,
  // so state is never set synchronously during the effect. The `cancelled`
  // flag also stops a slow response from a previous parentId landing on the
  // wrong record after a navigation.
  useEffect(() => {
    let cancelled = false;
    api
      .get(`/${parent}/${parentId}/attachments`)
      .then((res) => { if (!cancelled) setItems(res.data); })
      .catch(() => { /* a failure here should not blank the rest of the page */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [parent, parentId]);

  // View tokens expire, so a page left open would eventually show broken
  // thumbnails. Refresh a little before they lapse.
  useEffect(() => {
    if (items.length === 0) return;
    const ttl = items[0].viewTokenExpiresIn ?? 600;
    const timer = setTimeout(load, Math.max(30, ttl - 60) * 1000);
    return () => clearTimeout(timer);
  }, [items, load]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    // Checked here purely so the user hears about it instantly; the API
    // enforces both limits regardless.
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`"${file.name}" is ${formatSize(file.size)}. The limit is ${MAX_MB} MB.`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const res = await api.post(`/${parent}/${parentId}/attachments`, form);
      setItems((prev) => [res.data, ...prev]);
      onUploaded?.(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { error?: string } } })?.response;
      setError(status?.data?.error ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(a: Attachment) {
    if (!(await confirm({
      title: "Remove this file?",
      message: `“${a.filename}” will be hidden from this list. It isn't erased — staff can restore it from “Show removed files”.`,
      confirmLabel: "Remove",
    }))) return;
    setDeletingId(a.id);
    setError("");
    try {
      await api.delete(`/attachments/${a.id}`);
      setItems((prev) => prev.filter((x) => x.id !== a.id));
      onRemoved?.(a.id);
    } catch {
      setError(`Could not remove "${a.filename}".`);
    } finally {
      setDeletingId(null);
    }
  }

  const images = items.filter((a) => a.isImage);
  const files = items.filter((a) => !a.isImage);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-[var(--tu-text-body)]">
          Attachments {items.length > 0 && `(${items.length})`}
        </h2>
        {canUpload && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={onPick}
              disabled={uploading}
              className="tu-sr-only"
              id={`att-${parentId}`}
            />
            <label
              htmlFor={`att-${parentId}`}
              className="tu-btn-secondary tu-btn-sm"
              style={{ cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.6 : 1 }}
            >
              {uploading ? "Uploading…" : "+ Add file"}
            </label>
          </>
        )}
      </div>

      {error && <p className="tu-danger-text" style={{ fontSize: 12.5, marginBottom: 10 }}>{error}</p>}

      {loading ? (
        <div style={{ display: "flex", gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="tu-skeleton" style={{ width: 96, height: 96, borderRadius: 8 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon="activity"
          title="No attachments"
          hint={canUpload ? "Add photos of the work, a nameplate, or a manual." : "Nothing has been attached."}
        />
      ) : (
        <>
          {images.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 10, marginBottom: files.length > 0 ? 14 : 0 }}>
              {images.map((a) => (
                <figure key={a.id} style={{ margin: 0, position: "relative" }}>
                  <a href={contentUrl(a)} target="_blank" rel="noopener noreferrer" title={a.filename}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={contentUrl(a)}
                      alt={a.caption || a.filename}
                      loading="lazy"
                      style={{
                        width: "100%", aspectRatio: "1 / 1", objectFit: "cover",
                        borderRadius: 8, border: "1px solid var(--tu-border)", display: "block",
                        background: "var(--tu-bg-secondary)",
                      }}
                    />
                  </a>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => remove(a)}
                      disabled={deletingId === a.id}
                      aria-label={`Remove ${a.filename}`}
                      className="tu-attachment-remove"
                    >
                      ×
                    </button>
                  )}
                  {a.id === coverId && <span className="tu-cover-badge">Cover</span>}
                  {onSetCover && a.id !== coverId && (
                    <button type="button" className="tu-cover-set" onClick={() => onSetCover(a.id)}>
                      Make cover
                    </button>
                  )}
                  {a.caption && (
                    <figcaption style={{ fontSize: 11, color: "var(--tu-text-subtle)", marginTop: 4 }}>
                      {a.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <ul role="list" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {files.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3"
                  style={{ border: "1px solid var(--tu-border)", borderRadius: 8, padding: "8px 12px" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a
                      href={contentUrl(a)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tu-link"
                      style={{ fontSize: 13.5, fontWeight: 600 }}
                    >
                      {a.filename}
                    </a>
                    <p style={{ fontSize: 11.5, color: "var(--tu-text-subtle)", marginTop: 1 }}>
                      {formatSize(a.sizeBytes)}
                      {a.uploadedByName ? ` · ${a.uploadedByName}` : ""}
                      {a.caption ? ` · ${a.caption}` : ""}
                    </p>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => remove(a)}
                      disabled={deletingId === a.id}
                      className="tu-btn-secondary tu-btn-sm"
                    >
                      {deletingId === a.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {/* Staff only — the same people who may remove a file. */}
      {canDelete && (
        <ArchivedList<Attachment & { archivedByName?: string | null }>
          noun="removed files"
          load={async () => (await api.get(`/${parent}/${parentId}/attachments?archived=true`)).data}
          title={(a) => a.filename}
          detail={(a) => [formatSize(a.sizeBytes), a.archivedByName ? `removed by ${a.archivedByName}` : null].filter(Boolean).join(" · ")}
          restore={async (a) => {
            const res = await api.post(`/attachments/${a.id}/restore`);
            setItems((prev) => [res.data, ...prev]);
          }}
          canRestore
        />
      )}
    </div>
  );
}
