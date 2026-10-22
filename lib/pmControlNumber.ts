/**
 * "PM-2026-00142" — the control number on a PM round. Mirrors pmControlNumber
 * in backend/helpers/pmControlNumber.js: one global sequence, prefixed with the
 * year (UTC) the round was started.
 */
export function pmControlNumber(log: { number?: number | null; createdAt?: string | null } | null | undefined): string | null {
  if (!log?.number || !log.createdAt) return null;
  const year = new Date(log.createdAt).getUTCFullYear();
  return `PM-${year}-${String(log.number).padStart(5, "0")}`;
}
