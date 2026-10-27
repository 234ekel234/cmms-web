/**
 * The pieces every printed sheet is built from — the letterhead, a labelled
 * cell, a signature block. Shared so a work order and a checklist come out of
 * the printer looking like one company's paperwork. Styles in app/(print)/print.css.
 */

export function SheetHeader({ kicker, title, titleSize }: { kicker: string; title: string; titleSize?: string }) {
  return (
    <header className="ps-head">
      <div className="ps-logos">
        {/* eslint-disable @next/next/no-img-element */}
        <img src="/fmi_logo_dark.png" alt="FMI" />
        <img src="/servicemaster_logo_hq.png" alt="ServiceMaster" className="ps-logo-label" />
        {/* eslint-enable @next/next/no-img-element */}
      </div>
      <div className="ps-doc-title">
        <div className="ps-kicker">{kicker}</div>
        <div className="ps-ref" style={titleSize ? { fontSize: titleSize } : undefined}>{title}</div>
      </div>
    </header>
  );
}

export function Cell({ label, value, wide, full, mono }: { label: string; value: string; wide?: boolean; full?: boolean; mono?: boolean }) {
  return (
    <div className={`ps-cell${wide ? " ps-wide" : ""}${full ? " ps-full" : ""}`}>
      <span className="ps-label">{label}</span>
      <span className={`ps-value${mono ? " ps-mono" : ""}`}>{value}</span>
    </div>
  );
}

/** `filled` prints on the line instead of leaving it blank — for a sign-off already recorded online. */
export function Sign({ role, caption, filled }: { role: string; caption: string; filled?: string }) {
  return (
    <div className="ps-sign">
      <div className="ps-sign-role">{role}</div>
      <div className="ps-sign-line">{filled}</div>
      <div className="ps-sign-caption">{caption}</div>
    </div>
  );
}

export function printedStamp(name?: string) {
  const when = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  return `Printed ${when}${name ? ` by ${name}` : ""}`;
}
