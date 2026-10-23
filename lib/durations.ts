/**
 * A span of minutes as a person would say it: "45m", "3h 20m", "2d 4h".
 * Two units at most — "2d 4h 13m" is precision nobody acts on. "—" for null.
 */
export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  const mins = min % 60;
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}
