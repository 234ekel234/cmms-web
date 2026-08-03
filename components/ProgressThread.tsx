"use client";

import { API_BASE_URL } from "@/lib/api";
import EmptyState from "@/components/EmptyState";

/**
 * The running record of a work order: who did what, when, and the photos that
 * go with it.
 *
 * Notes and photos were separate surfaces before — a comment thread and a file
 * grid — which meant a photo carried no explanation and a note carried no
 * evidence. One entry now holds both, so the thread reads as a job history
 * rather than two lists that happen to share a page.
 */

export type ProgressAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  isImage: boolean;
  viewToken: string;
  createdAt: string;
};

export type ProgressEntry = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  attachments?: ProgressAttachment[];
};

type Props = {
  entries: ProgressEntry[];
  text: string;
  onTextChange: (v: string) => void;
  staged: File[];
  onStageFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUnstage: (index: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPost: () => void;
  posting: boolean;
  error?: string;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

function contentUrl(a: ProgressAttachment) {
  return `${API_BASE_URL}/attachments/${a.id}/content?token=${encodeURIComponent(a.viewToken)}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Absolute time, because "3 days ago" is useless when reconstructing a job. */
function stamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default function ProgressThread({
  entries, text, onTextChange, staged, onStageFiles, onUnstage,
  fileInputRef, onPost, posting, error,
}: Props) {
  const canPost = (text.trim().length > 0 || staged.length > 0) && !posting;

  return (
    <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6">
      <h2 className="text-sm font-semibold text-[var(--tu-text-body)] mb-4">
        Progress {entries.length > 0 && `(${entries.length})`}
      </h2>

      {entries.length === 0 ? (
        <EmptyState
          compact
          icon="activity"
          title="No updates yet"
          hint="Post what was found, what was done, and photos of the work."
        />
      ) : (
        <ol role="list" className="tu-thread">
          {entries.map((e) => {
            const photos = (e.attachments ?? []).filter((a) => a.isImage);
            const files = (e.attachments ?? []).filter((a) => !a.isImage);
            return (
              <li key={e.id} className="tu-thread-item">
                <span className="tu-thread-avatar" aria-hidden="true">{initials(e.authorName)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[var(--tu-text-heading)]">{e.authorName}</span>
                    <time dateTime={e.createdAt} className="text-xs text-[var(--tu-text-subtle)]">
                      {stamp(e.createdAt)}
                    </time>
                  </div>

                  {e.body && (
                    <p className="text-sm text-[var(--tu-text-body)]" style={{ marginTop: 3, whiteSpace: "pre-wrap" }}>
                      {e.body}
                    </p>
                  )}

                  {photos.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {photos.map((a) => (
                        <a key={a.id} href={contentUrl(a)} target="_blank" rel="noopener noreferrer" title={a.filename}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={contentUrl(a)}
                            alt={a.caption || a.filename}
                            loading="lazy"
                            style={{
                              width: 92, height: 92, objectFit: "cover", borderRadius: 8,
                              border: "1px solid var(--tu-border)", display: "block",
                              background: "var(--tu-bg-secondary)",
                            }}
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  {files.length > 0 && (
                    <ul role="list" style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {files.map((a) => (
                        <li key={a.id}>
                          <a href={contentUrl(a)} target="_blank" rel="noopener noreferrer" className="tu-link" style={{ fontSize: 13 }}>
                            {a.filename}
                          </a>
                          <span className="text-xs text-[var(--tu-text-subtle)]"> · {formatSize(a.sizeBytes)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Composer */}
      <div style={{ marginTop: 16, borderTop: "1px solid var(--tu-border)", paddingTop: 14 }}>
        {staged.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {staged.map((f, i) => (
              <span key={`${f.name}-${i}`} className="tu-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {f.name} · {formatSize(f.size)}
                <button
                  type="button"
                  onClick={() => onUnstage(i)}
                  aria-label={`Remove ${f.name}`}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 14, lineHeight: 1, padding: 0 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {error && <p className="tu-danger-text" style={{ fontSize: 12.5, marginBottom: 8 }}>{error}</p>}

        <div className="flex gap-2 items-start">
          <textarea
            className="flex-1 border border-[var(--tu-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
            rows={2}
            value={text}
            onChange={(ev) => onTextChange(ev.target.value)}
            placeholder="What was found, what was done…"
            // Enter posts; Shift+Enter starts a new line, since these run long.
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); if (canPost) onPost(); }
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={onStageFiles}
            className="tu-sr-only"
            id="progress-files"
          />
          <label htmlFor="progress-files" className="tu-btn-secondary tu-btn-sm" style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
            + Photo
          </label>
          <button
            onClick={onPost}
            disabled={!canPost}
            className="px-4 py-2 text-sm text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
            style={{ whiteSpace: "nowrap" }}
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
