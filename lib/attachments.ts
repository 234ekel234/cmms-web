import { API_BASE_URL } from "@/lib/api";

/**
 * Shared attachment plumbing.
 *
 * Two components render attachments now — the photo gallery on work orders and
 * assets, and the credential list on an employee — and they must agree on the
 * limits and on how a file is fetched. The MIME list and size cap in particular
 * mirror backend/helpers/storage.js; when that changes, this changes with it.
 */

/**
 * Mirrors ALLOWED_MIME in backend/helpers/storage.js. Extensions ride alongside
 * the types because a browser that does not know a file's type (an .xlsx on a
 * machine without Office, say) would otherwise grey it out in the picker; the
 * API decides from the extension in exactly that case.
 */
export const ACCEPT = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv", "text/plain",
  ".jpg", ".jpeg", ".png", ".webp", ".heic", ".pdf", ".docx", ".xlsx", ".pptx", ".csv", ".txt",
].join(",");

/**
 * A credential is a scanned certificate or licence, so its picker offers scans
 * only. The API would take a document too; this keeps the picker to what the
 * form asks for.
 */
export const ACCEPT_SCANS = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

/** Mirrors MAX_BYTES in backend/helpers/storage.js. */
export const MAX_MB = 15;

/** Mirrors CAPTION_MAX in backend/routes/attachmentRoutes.js. */
export const CAPTION_MAX = 200;

export type BaseAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  uploadedByName: string | null;
  uploadedById?: string | null;
  createdAt: string;
  isImage: boolean;
  /** A small preview exists — see `thumbUrl`. */
  hasThumb?: boolean;
  viewToken: string;
  viewTokenExpiresIn: number;
};

/** An employee credential: the same row, with the certificate fields filled in. */
export type Credential = BaseAttachment & {
  label: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  /** Decided by the API so every client agrees on where the boundary falls. */
  isExpired: boolean;
};

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * A URL the browser can fetch directly.
 *
 * The token rides in the query string because <img src> cannot send an
 * Authorization header. It authorises this one attachment for a few minutes —
 * see issueViewToken in backend/helpers/attachments.js.
 */
export function contentUrl(a: Pick<BaseAttachment, "id" | "viewToken">) {
  return `${API_BASE_URL}/attachments/${a.id}/content?token=${encodeURIComponent(a.viewToken)}`;
}

/**
 * For an <img> drawn small: the 400px WebP preview when there is one, else the
 * file itself. Links that open the photo keep `contentUrl` — full size there.
 */
export function thumbUrl(a: Pick<BaseAttachment, "id" | "viewToken" | "hasThumb">) {
  return a.hasThumb ? `${contentUrl(a)}&size=thumb` : contentUrl(a);
}

/**
 * Dates arrive as UTC-midnight ISO strings from a @db.Date column, so they are
 * formatted in UTC. Reading them locally would show the previous day to anyone
 * west of Greenwich — and the Philippines is east, which is exactly the sort of
 * off-by-one that only shows up for the one user in a different zone.
 */
export function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The `YYYY-MM-DD` a date input wants, from the API's ISO string. */
export function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * How a credential is doing, as a small vocabulary the UI can switch on.
 *
 * "Expiring" is 60 days, which is roughly the lead time for renewing a PRC
 * licence — long enough to act on, short enough that the warning still means
 * something when it appears.
 */
export const EXPIRING_SOON_DAYS = 60;

export type CredentialStatus = "expired" | "expiring" | "valid" | "no-expiry";

export function credentialStatus(c: Credential): CredentialStatus {
  if (!c.expiresAt) return "no-expiry";
  if (c.isExpired) return "expired";
  return daysUntil(c.expiresAt) <= EXPIRING_SOON_DAYS ? "expiring" : "valid";
}

/** Whole days from today (UTC) until an ISO date. Negative once past. */
export function daysUntil(iso: string) {
  const then = new Date(iso).getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((then - today) / 86_400_000);
}
