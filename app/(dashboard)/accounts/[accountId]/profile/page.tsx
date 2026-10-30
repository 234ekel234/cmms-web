"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api, { errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { MANAGERS, STAFF, hasRole } from "@/lib/rbac";
import { startLoad } from "@/lib/startLoad";
import { roleLabel } from "@/lib/statuses";
import { useConfirm } from "@/components/ConfirmDialog";
import { contentUrl, formatSize, type BaseAttachment } from "@/lib/attachments";
import {
  BILLING_LABEL, CONTRACT_STATUS, SERVICE_LABEL, SITE_STATUS, SITE_TYPE_LABEL,
  addressLine, dayInput, endsIn, fmtDay, noticeBy, peso,
  type Site, type SiteContact, type SiteContract, type SiteOperations, type SiteProfile,
} from "@/lib/siteProfile";

/**
 * A site's profile: who the customer is, where the site is, who to call, and
 * the contracts it runs under. Managers edit; supervisors and the site's
 * client read — the API decides which fields each receives
 * (backend/helpers/siteProfile.js), so this page draws what it is given.
 */
export default function SiteProfilePage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { user } = useAuth();
  const isManager = hasRole(user?.role, MANAGERS);
  const isStaff = hasRole(user?.role, STAFF);

  const [profile, setProfile] = useState<SiteProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/accounts/${accountId}/profile`);
      setProfile(res.data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load the site profile."));
    }
  }, [accountId]);
  useEffect(() => startLoad(load), [load]);

  if (error && !profile) return <div className="px-4 py-5 sm:p-8"><div className="tu-error-banner" role="alert">{error}</div></div>;
  if (!profile) {
    return (
      <div className="px-4 py-5 sm:p-8 space-y-4">
        <div className="tu-skeleton" style={{ height: 120, borderRadius: 12 }} />
        <div className="tu-skeleton" style={{ height: 220, borderRadius: 12 }} />
      </div>
    );
  }

  const { site, contacts, contracts, currentContractId } = profile;
  const current = contracts.find((c) => c.id === currentContractId) ?? null;
  const status = SITE_STATUS[site.status] ?? SITE_STATUS.ACTIVE;

  return (
    <div className="px-4 py-5 sm:p-8 space-y-6">
      {/* At a glance */}
      <div className="tu-card">
        <div className="tu-card-pad" style={{ paddingTop: 20 }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-[var(--tu-text-heading)]">{site.name}</h2>
                <span className={status.cls}>{status.label}</span>
                {site.siteCode && <span className="tu-wo-ref">{site.siteCode}</span>}
              </div>
              <p className="text-sm text-[var(--tu-text-subtle)] mt-1">
                {[site.clientName, site.siteType ? SITE_TYPE_LABEL[site.siteType] : null, site.city].filter(Boolean).join(" · ") || "No details recorded yet"}
              </p>
            </div>
            {isManager && !editingDetails && (
              <button type="button" className="tu-btn-secondary" onClick={() => setEditingDetails(true)}>Edit details</button>
            )}
          </div>
          {current ? (
            <p className="text-sm text-[var(--tu-text-body)] mt-3">
              Under contract{current.contractNumber ? ` ${current.contractNumber}` : ""} ·{" "}
              {current.services.map((s) => SERVICE_LABEL[s] ?? s).join(", ") || "scope not recorded"} ·{" "}
              <strong>{endsIn(current)}</strong>
            </p>
          ) : (
            <p className="text-sm text-[var(--tu-on-warning)] mt-3">No contract in force today.</p>
          )}
        </div>
      </div>

      {editingDetails ? (
        <DetailsForm
          site={site}
          accountId={accountId}
          onSaved={(s) => { setProfile({ ...profile, site: { ...site, ...s } }); setEditingDetails(false); }}
          onCancel={() => setEditingDetails(false)}
        />
      ) : (
        <div className="tu-person-grid">
          <SiteDetails site={site} isStaff={isStaff} />
          <SiteLocation site={site} />
        </div>
      )}

      <SiteOperationsCard accountId={accountId} ops={profile.operations} />

      <SitePlaces accountId={accountId} isStaff={isStaff} />

      <Contacts accountId={accountId} contacts={contacts} canEdit={isManager}
        onChange={(next) => setProfile({ ...profile, contacts: next })} />

      <Contracts accountId={accountId} contracts={contracts} currentId={currentContractId} canEdit={isManager}
        rosterRegular={profile.rosterRegular} onChange={load} />
    </div>
  );
}

// ── Details & location ────────────────────────────────────────────────────────

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children ?? <span className="tu-person-muted">Not recorded</span>}</dd>
    </div>
  );
}

function SiteDetails({ site, isStaff }: { site: Site; isStaff: boolean }) {
  return (
    <section className="tu-card">
      <div className="tu-card-header"><h2 className="tu-card-title">Site details</h2></div>
      <dl className="tu-person-facts">
        <Fact label="Client (registered name)">{site.clientName}</Fact>
        <Fact label="Site type">{site.siteType ? SITE_TYPE_LABEL[site.siteType] : null}</Fact>
        <Fact label="Floor area">{site.floorAreaSqm ? `${site.floorAreaSqm.toLocaleString()} m²` : null}</Fact>
        <Fact label="Operating hours">{site.operatingHours}</Fact>
        <Fact label="Access instructions"><span style={{ whiteSpace: "pre-wrap" }}>{site.accessNotes}</span></Fact>
        {site.description && <Fact label="Description">{site.description}</Fact>}
        {isStaff && (
          <Fact label="Internal notes (staff only)">
            {site.internalNotes ? <span style={{ whiteSpace: "pre-wrap" }}>{site.internalNotes}</span> : null}
          </Fact>
        )}
        <Fact label="On the system since">{fmtDay(site.createdAt)}</Fact>
      </dl>
    </section>
  );
}

function SiteLocation({ site }: { site: Site }) {
  const line = addressLine(site);
  const hasPin = site.latitude !== null && site.longitude !== null;
  return (
    <section className="tu-card">
      <div className="tu-card-header"><h2 className="tu-card-title">Location</h2></div>
      <dl className="tu-person-facts">
        <Fact label="Address">{line || null}</Fact>
        <Fact label="Map pin">
          {hasPin ? (
            <>
              <span className="tu-person-muted">{site.latitude!.toFixed(5)}, {site.longitude!.toFixed(5)} · </span>
              <a className="tu-link" target="_blank" rel="noopener noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`}>
                Open in Google Maps
              </a>
            </>
          ) : line ? (
            <a className="tu-link" target="_blank" rel="noopener noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(line)}`}>
              Search the address in Google Maps
            </a>
          ) : null}
        </Fact>
      </dl>
    </section>
  );
}

function OpsBlock({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--tu-text-subtle)]">{title}</h3>
        {href && <Link href={href} className="tu-link text-xs">Open →</Link>}
      </div>
      {children}
    </div>
  );
}

function OpsStat({ n, label, tone }: { n: number | string; label: string; tone?: "danger" | "warning" }) {
  const color = tone === "danger" ? "text-[var(--tu-on-danger)]" : tone === "warning" ? "text-[var(--tu-on-warning)]" : "text-[var(--tu-text-heading)]";
  return (
    <div>
      <div className={`text-lg font-bold tu-figure ${color}`}>{n}</div>
      <div className="text-xs text-[var(--tu-text-subtle)]">{label}</div>
    </div>
  );
}

const ROLE_ORDER = ["GENERAL_MANAGER", "MANAGER", "SUPERVISOR", "TECHNICIAN", "CLIENT"];

/**
 * How the site runs day to day — its shifts and who is on them today, the
 * team, the kit, the work and inspections, and (staff) the client's view of
 * it. Each block summarises a page and links to it; the figures come from the
 * profile read, which applies each role's usual limits.
 */
function SiteOperationsCard({ accountId, ops }: { accountId: string; ops: SiteOperations }) {
  const base = `/accounts/${accountId}`;
  const team = [...ops.team].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  return (
    <section className="tu-card">
      <div className="tu-card-header"><h2 className="tu-card-title">Running the site</h2></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 divide-[var(--tu-border)]">
        <OpsBlock title="Shifts" href={`${base}/schedule`}>
          {ops.shifts.length === 0 ? (
            <p className="text-sm text-[var(--tu-text-subtle)]">No shifts set up.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {ops.shifts.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span><span className="font-semibold text-[var(--tu-text-heading)]">{s.name}</span> <span className="text-[var(--tu-text-subtle)]">{s.startTime}–{s.endTime}</span></span>
                  <span className="text-[var(--tu-text-subtle)]"><span className="tu-figure">{s.rosteredToday}</span> on today</span>
                </li>
              ))}
            </ul>
          )}
        </OpsBlock>
        <OpsBlock title="Team" href={`${base}/employees`}>
          <p className="text-sm text-[var(--tu-text-body)] mb-2">
            <span className="tu-figure">{ops.roster.regular}</span> regular · <span className="tu-figure">{ops.roster.relievers}</span> reliever{ops.roster.relievers === 1 ? "" : "s"} on the roster
          </p>
          <ul className="text-sm space-y-0.5">
            {team.map((m) => (
              <li key={m.id}>{m.name} <span className="text-[var(--tu-text-subtle)]">· {roleLabel(m.role)}</span></li>
            ))}
          </ul>
        </OpsBlock>
        <OpsBlock title="Equipment" href={`${base}/assets`}>
          <div className="grid grid-cols-3 gap-2">
            <OpsStat n={ops.equipment.total} label="assets" />
            <OpsStat n={ops.equipment.breakdown} label="broken down" tone={ops.equipment.breakdown ? "danger" : undefined} />
            <OpsStat n={ops.equipment.withFindings} label="with findings" tone={ops.equipment.withFindings ? "warning" : undefined} />
          </div>
        </OpsBlock>
        <OpsBlock title="Work" href={`${base}/work-orders`}>
          <div className="grid grid-cols-2 gap-2">
            <OpsStat n={ops.work.open} label="open" />
            <OpsStat n={ops.work.overdue} label="overdue" tone={ops.work.overdue ? "danger" : undefined} />
            <OpsStat n={ops.work.awaitingSignOff} label="awaiting client sign-off" tone={ops.work.awaitingSignOff ? "warning" : undefined} />
            <OpsStat n={ops.work.completedLast30} label="finished in 30 days" />
          </div>
        </OpsBlock>
        <OpsBlock title="Inspections" href={`${base}/checklists`}>
          <div className="grid grid-cols-2 gap-2">
            <OpsStat n={ops.inspections.checklists} label="PM checklists" />
            {ops.inspections.plans !== undefined && <OpsStat n={ops.inspections.plans} label="maintenance plans" />}
          </div>
        </OpsBlock>
        {ops.satisfaction && (
          <OpsBlock title="Client satisfaction" href="/reports/client-satisfaction">
            {ops.satisfaction.responses === 0 ? (
              <p className="text-sm text-[var(--tu-text-subtle)]">No ratings in the last {ops.satisfaction.days} days.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <OpsStat n={`${ops.satisfaction.average} / 5`} label={`average, last ${ops.satisfaction.days} days`} tone={ops.satisfaction.average !== null && ops.satisfaction.average <= 2 ? "danger" : undefined} />
                <OpsStat n={ops.satisfaction.responses} label="ratings" />
              </div>
            )}
          </OpsBlock>
        )}
      </div>
    </section>
  );
}

type PlaceRow = {
  id: string; name: string; parentId: string | null;
  openJobs: number; recentJobs: number; repeatFlagged: boolean; visitsToday?: number;
};

/**
 * The places inside the site — buildings and the floors or rooms in them —
 * each with its open work and the repeat flag, linking to the place's own page
 * (the one its QR sticker opens). Read from the same summary as Assets → All
 * locations, so the two cannot disagree; the places themselves are set up on
 * the Assets page.
 */
function SitePlaces({ accountId, isStaff }: { accountId: string; isStaff: boolean }) {
  const [rows, setRows] = useState<PlaceRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await api.get(`/accounts/${accountId}/asset-locations/summary`);
      setRows(res.data.locations);
    } catch {
      setFailed(true);
    }
  }, [accountId]);
  useEffect(() => startLoad(load), [load]);

  if (failed) return null;
  const buildings = (rows ?? []).filter((r) => !r.parentId);
  const inside = (id: string) => (rows ?? []).filter((r) => r.parentId === id);
  const notScanned = isStaff ? (rows ?? []).filter((r) => !r.visitsToday).length : 0;
  const place = (r: PlaceRow, lead = false) => (
    <Link
      key={r.id}
      href={`/accounts/${accountId}/assets/locations/${r.id}`}
      className={lead ? "font-semibold text-[var(--tu-text-heading)] hover:underline" : "tu-badge tu-badge-neutral hover:underline"}
      title={`${r.openJobs} open job${r.openJobs === 1 ? "" : "s"}`}
    >
      {r.name}
      {r.openJobs > 0 && <span className="tu-figure"> · {r.openJobs} open</span>}
      {r.repeatFlagged && <span className="text-[var(--tu-on-warning)]"> · Repeat</span>}
    </Link>
  );

  return (
    <section className="tu-card">
      <div className="tu-card-header flex flex-wrap items-center justify-between gap-2">
        <h2 className="tu-card-title">Places on this site</h2>
        {rows && rows.length > 0 && (
          <span className="text-xs text-[var(--tu-text-subtle)]">
            {buildings.length} building{buildings.length === 1 ? "" : "s"} · {rows.length} place{rows.length === 1 ? "" : "s"}
            {isStaff && ` · ${notScanned} not scanned today`}
            {" · "}<Link href={`/accounts/${accountId}/assets/locations`} className="tu-link">All locations →</Link>
          </span>
        )}
      </div>
      {!rows ? (
        <div className="tu-card-pad"><div className="tu-skeleton" style={{ height: 60 }} /></div>
      ) : rows.length === 0 ? (
        <p className="tu-card-pad text-sm text-[var(--tu-text-subtle)]">
          No places mapped yet.{isStaff && <> Add buildings and floors with <Link href={`/accounts/${accountId}/assets`} className="tu-link">Manage locations</Link> on the Assets page.</>}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--tu-border)]">
          {buildings.map((b) => (
            <li key={b.id} className="px-5 py-3">
              <div className="text-sm">{place(b, true)}</div>
              {inside(b.id).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">{inside(b.id).map((r) => place(r))}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DetailsForm({ site, accountId, onSaved, onCancel }: {
  site: Site; accountId: string; onSaved: (s: Site) => void; onCancel: () => void;
}) {
  const [f, setF] = useState({
    name: site.name, siteCode: site.siteCode ?? "", clientName: site.clientName ?? "", siteType: site.siteType ?? "",
    status: site.status, floorAreaSqm: site.floorAreaSqm?.toString() ?? "", operatingHours: site.operatingHours ?? "",
    accessNotes: site.accessNotes ?? "", internalNotes: site.internalNotes ?? "", description: site.description ?? "",
    addressLine: site.addressLine ?? "", barangay: site.barangay ?? "", city: site.city ?? "", province: site.province ?? "",
    region: site.region ?? "", postalCode: site.postalCode ?? "",
    latitude: site.latitude?.toString() ?? "", longitude: site.longitude?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [locating, setLocating] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  function useMyLocation() {
    if (!navigator.geolocation) { setErr("This browser can't share its location."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((p) => ({ ...p, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setLocating(false);
      },
      () => { setErr("Couldn't read your location — allow it in the browser, or type the coordinates."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save() {
    setSaving(true); setErr("");
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      const res = await api.put(`/accounts/${accountId}/profile`, {
        ...f,
        siteType: f.siteType || null,
        floorAreaSqm: num(f.floorAreaSqm),
        latitude: num(f.latitude),
        longitude: num(f.longitude),
      });
      onSaved(res.data);
    } catch (e) {
      setErr(errorMessage(e, "Couldn't save the site details."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="tu-card">
      <div className="tu-card-header"><h2 className="tu-card-title">Edit site details</h2></div>
      <div className="tu-card-pad tu-form-grid">
        <div><label className="tu-label" htmlFor="sp-name">Site name *</label><input id="sp-name" className="tu-input" value={f.name} onChange={set("name")} /></div>
        <div><label className="tu-label" htmlFor="sp-code">Site code</label><input id="sp-code" className="tu-input" value={f.siteCode} onChange={set("siteCode")} placeholder="e.g. ORT-01" /></div>
        <div><label className="tu-label" htmlFor="sp-client">Client (registered name)</label><input id="sp-client" className="tu-input" value={f.clientName} onChange={set("clientName")} /></div>
        <div>
          <label className="tu-label" htmlFor="sp-type">Site type</label>
          <select id="sp-type" className="tu-select" value={f.siteType} onChange={set("siteType")}>
            <option value="">—</option>
            {Object.entries(SITE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="tu-label" htmlFor="sp-status">Status</label>
          <select id="sp-status" className="tu-select" value={f.status} onChange={set("status")}>
            {Object.entries(SITE_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
          </select>
        </div>
        <div><label className="tu-label" htmlFor="sp-area">Floor area (m²)</label><input id="sp-area" className="tu-input" type="number" min={1} value={f.floorAreaSqm} onChange={set("floorAreaSqm")} /></div>
        <div className="tu-span-2"><label className="tu-label" htmlFor="sp-hours">Operating hours</label><input id="sp-hours" className="tu-input" value={f.operatingHours} onChange={set("operatingHours")} placeholder="e.g. Mon–Sat 7am–7pm" /></div>
        <div className="tu-span-2"><label className="tu-label" htmlFor="sp-access">Access instructions</label><textarea id="sp-access" className="tu-textarea" rows={3} value={f.accessNotes} onChange={set("accessNotes")} placeholder="Gate, parking, security desk, escort rules" /></div>
        <div className="tu-span-2"><label className="tu-label" htmlFor="sp-desc">Description</label><input id="sp-desc" className="tu-input" value={f.description} onChange={set("description")} /></div>
        <div className="tu-span-2"><label className="tu-label" htmlFor="sp-notes">Internal notes (staff only — never shown to the client)</label><textarea id="sp-notes" className="tu-textarea" rows={3} value={f.internalNotes} onChange={set("internalNotes")} /></div>

        <div className="tu-span-2"><p className="tu-label" style={{ marginTop: 8 }}>Address</p></div>
        <div className="tu-span-2"><label className="tu-label" htmlFor="sp-street">Street, building</label><input id="sp-street" className="tu-input" value={f.addressLine} onChange={set("addressLine")} /></div>
        <div><label className="tu-label" htmlFor="sp-brgy">Barangay</label><input id="sp-brgy" className="tu-input" value={f.barangay} onChange={set("barangay")} /></div>
        <div><label className="tu-label" htmlFor="sp-city">City / municipality</label><input id="sp-city" className="tu-input" value={f.city} onChange={set("city")} /></div>
        <div><label className="tu-label" htmlFor="sp-prov">Province</label><input id="sp-prov" className="tu-input" value={f.province} onChange={set("province")} /></div>
        <div><label className="tu-label" htmlFor="sp-region">Region</label><input id="sp-region" className="tu-input" value={f.region} onChange={set("region")} placeholder="e.g. NCR" /></div>
        <div><label className="tu-label" htmlFor="sp-zip">ZIP code</label><input id="sp-zip" className="tu-input" value={f.postalCode} onChange={set("postalCode")} /></div>
        <div />
        <div><label className="tu-label" htmlFor="sp-lat">Latitude</label><input id="sp-lat" className="tu-input" inputMode="decimal" value={f.latitude} onChange={set("latitude")} placeholder="14.5869" /></div>
        <div><label className="tu-label" htmlFor="sp-lng">Longitude</label><input id="sp-lng" className="tu-input" inputMode="decimal" value={f.longitude} onChange={set("longitude")} placeholder="121.0614" /></div>
        <div className="tu-span-2">
          <button type="button" className="tu-btn-ghost" onClick={useMyLocation} disabled={locating}>
            {locating ? "Reading location…" : "Use my current location"}
          </button>
          <span className="text-xs text-[var(--tu-text-subtle)] ml-2">Stand at the site, or paste coordinates from Google Maps (right-click the spot).</span>
        </div>

        {err && <p className="tu-span-2 text-sm text-[var(--tu-on-danger)]" role="alert">{err}</p>}
        <div className="tu-span-2 tu-form-actions">
          <button type="button" className="tu-btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="tu-btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save details"}</button>
        </div>
      </div>
    </section>
  );
}

// ── Contacts ──────────────────────────────────────────────────────────────────

function Contacts({ accountId, contacts, canEdit, onChange }: {
  accountId: string; contacts: SiteContact[]; canEdit: boolean; onChange: (next: SiteContact[]) => void;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<SiteContact | "new" | null>(null);
  const [err, setErr] = useState("");

  async function remove(c: SiteContact) {
    if (!(await confirm({ title: `Remove ${c.name}?`, message: "They will no longer be listed as a contact for this site.", confirmLabel: "Remove" }))) return;
    try {
      await api.delete(`/accounts/${accountId}/contacts/${c.id}`);
      onChange(contacts.filter((x) => x.id !== c.id));
    } catch (e) {
      setErr(errorMessage(e, "Couldn't remove that contact."));
    }
  }

  function saved(c: SiteContact) {
    // One primary per side: mirror what the API did to the others.
    let next = editing === "new" ? [...contacts, c] : contacts.map((x) => (x.id === c.id ? c : x));
    if (c.isPrimary) next = next.map((x) => (x.side === c.side && x.id !== c.id ? { ...x, isPrimary: false } : x));
    onChange(next);
    setEditing(null);
  }

  const groups: { side: "CLIENT" | "OURS"; title: string }[] = [
    { side: "CLIENT", title: "Client contacts" },
    { side: "OURS", title: "Our team" },
  ];

  return (
    <section className="tu-card">
      <div className="tu-card-header">
        <h2 className="tu-card-title">Contacts</h2>
        {canEdit && editing === null && <button type="button" className="tu-btn-secondary" onClick={() => setEditing("new")}>Add contact</button>}
      </div>
      {err && <p className="tu-card-pad text-sm text-[var(--tu-on-danger)]" role="alert">{err}</p>}
      {editing !== null && (
        <ContactForm accountId={accountId} contact={editing === "new" ? null : editing} onSaved={saved} onCancel={() => setEditing(null)} />
      )}
      <div className="tu-card-pad grid gap-6 md:grid-cols-2">
        {groups.map((g) => {
          const list = contacts.filter((c) => c.side === g.side);
          return (
            <div key={g.side}>
              <p className="tu-label">{g.title}</p>
              {list.length === 0 ? (
                <p className="text-sm text-[var(--tu-text-subtle)]">None recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {list.map((c) => (
                    <li key={c.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--tu-text-heading)]">{c.name}</span>
                        {c.isPrimary && <span className="tu-badge tu-badge-info">Primary</span>}
                      </div>
                      {c.role && <div className="text-[var(--tu-text-subtle)]">{c.role}</div>}
                      <div className="flex flex-wrap gap-x-3">
                        {c.phone && <a className="tu-link" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a>}
                        {c.email && <a className="tu-link" href={`mailto:${c.email}`}>{c.email}</a>}
                      </div>
                      {canEdit && (
                        <div className="flex gap-3 mt-1">
                          <button type="button" className="text-xs font-semibold text-[var(--tu-text-brand)] cursor-pointer" onClick={() => setEditing(c)}>Edit</button>
                          <button type="button" className="text-xs font-semibold text-[var(--tu-on-danger)] cursor-pointer" onClick={() => remove(c)}>Remove</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ContactForm({ accountId, contact, onSaved, onCancel }: {
  accountId: string; contact: SiteContact | null; onSaved: (c: SiteContact) => void; onCancel: () => void;
}) {
  const [f, setF] = useState({
    side: contact?.side ?? "CLIENT", name: contact?.name ?? "", role: contact?.role ?? "",
    phone: contact?.phone ?? "", email: contact?.email ?? "", isPrimary: contact?.isPrimary ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setSaving(true); setErr("");
    try {
      const res = contact
        ? await api.put(`/accounts/${accountId}/contacts/${contact.id}`, f)
        : await api.post(`/accounts/${accountId}/contacts`, f);
      onSaved(res.data);
    } catch (e) {
      setErr(errorMessage(e, "Couldn't save the contact."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tu-card-pad tu-form-grid" style={{ borderBottom: "1px solid var(--tu-border)", marginBottom: 16 }}>
      <div>
        <label className="tu-label" htmlFor="ct-side">Side</label>
        <select id="ct-side" className="tu-select" value={f.side} onChange={(e) => setF({ ...f, side: e.target.value as "CLIENT" | "OURS" })}>
          <option value="CLIENT">Client</option>
          <option value="OURS">Our team</option>
        </select>
      </div>
      <div><label className="tu-label" htmlFor="ct-name">Name *</label><input id="ct-name" className="tu-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
      <div><label className="tu-label" htmlFor="ct-role">Role</label><input id="ct-role" className="tu-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="e.g. Building admin" /></div>
      <div><label className="tu-label" htmlFor="ct-phone">Phone</label><input id="ct-phone" className="tu-input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <div><label className="tu-label" htmlFor="ct-email">Email</label><input id="ct-email" className="tu-input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm mt-6">
        <input type="checkbox" checked={f.isPrimary} onChange={(e) => setF({ ...f, isPrimary: e.target.checked })} />
        Primary contact for this side
      </label>
      {err && <p className="tu-span-2 text-sm text-[var(--tu-on-danger)]" role="alert">{err}</p>}
      <div className="tu-span-2 tu-form-actions">
        <button type="button" className="tu-btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="tu-btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : contact ? "Save contact" : "Add contact"}</button>
      </div>
    </div>
  );
}

// ── Contracts ─────────────────────────────────────────────────────────────────

function Contracts({ accountId, contracts, currentId, canEdit, rosterRegular, onChange }: {
  accountId: string; contracts: SiteContract[]; currentId: string | null; canEdit: boolean;
  rosterRegular?: number; onChange: () => void;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<SiteContract | "new" | null>(null);
  const [err, setErr] = useState("");

  async function remove(c: SiteContract) {
    if (!(await confirm({
      title: "Remove this contract?",
      message: "Only for one entered by mistake — a contract that has ended stays on file by itself. Its documents are deleted too.",
      confirmLabel: "Remove contract",
    }))) return;
    try {
      await api.delete(`/accounts/${accountId}/contracts/${c.id}`);
      onChange();
    } catch (e) {
      setErr(errorMessage(e, "Couldn't remove that contract."));
    }
  }

  return (
    <section className="tu-card">
      <div className="tu-card-header">
        <h2 className="tu-card-title">Contracts</h2>
        {canEdit && editing === null && (
          <button type="button" className="tu-btn-secondary" onClick={() => setEditing("new")}>
            {contracts.length ? "Add renewal / contract" : "Add contract"}
          </button>
        )}
      </div>
      {err && <p className="tu-card-pad text-sm text-[var(--tu-on-danger)]" role="alert">{err}</p>}
      {editing !== null && (
        <ContractForm accountId={accountId} contract={editing === "new" ? null : editing}
          onSaved={() => { setEditing(null); onChange(); }} onCancel={() => setEditing(null)} />
      )}
      {contracts.length === 0 && editing === null ? (
        <p className="tu-person-empty">No contracts recorded for this site yet.</p>
      ) : (
        <ul className="tu-card-pad space-y-4">
          {contracts.map((c) => (
            <ContractRow key={c.id} c={c} isCurrent={c.id === currentId} canEdit={canEdit} rosterRegular={rosterRegular}
              onEdit={() => setEditing(c)} onRemove={() => remove(c)} onDocsChange={onChange} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ContractRow({ c, isCurrent, canEdit, rosterRegular, onEdit, onRemove, onDocsChange }: {
  c: SiteContract; isCurrent: boolean; canEdit: boolean; rosterRegular?: number;
  onEdit: () => void; onRemove: () => void; onDocsChange: () => void;
}) {
  const st = CONTRACT_STATUS[c.status];
  const notice = noticeBy(c);
  return (
    <li
      className="rounded-xl border p-4"
      style={{ borderColor: isCurrent ? "var(--tu-bd-success)" : "var(--tu-border)", background: isCurrent ? "var(--tu-soft-success)" : undefined }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={st.cls}>{st.label}</span>
          <span className="font-semibold text-[var(--tu-text-heading)]">{c.contractNumber ?? "Contract"}</span>
          <span className="text-sm text-[var(--tu-text-body)]">{fmtDay(c.startDate)} – {c.endDate ? fmtDay(c.endDate) : "open-ended"}</span>
        </div>
        {c.status !== "ENDED" && <span className="text-sm font-semibold text-[var(--tu-text-body)]">{endsIn(c)}</span>}
      </div>
      <dl className="grid gap-x-6 gap-y-2 mt-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="tu-person-muted text-xs">Scope</dt><dd>{c.services.map((s) => SERVICE_LABEL[s] ?? s).join(", ") || "—"}</dd></div>
        <div><dt className="tu-person-muted text-xs">Acquired</dt><dd>{fmtDay(c.acquiredOn)}</dd></div>
        <div><dt className="tu-person-muted text-xs">Notice period</dt><dd>{c.noticeDays ? `${c.noticeDays} days${notice ? ` — by ${fmtDay(notice)}` : ""}` : "—"}</dd></div>
        {c.contractedHeadcount !== undefined && (
          <div>
            <dt className="tu-person-muted text-xs">Contracted headcount</dt>
            <dd>
              {c.contractedHeadcount ?? "—"}
              {isCurrent && c.contractedHeadcount != null && rosterRegular !== undefined && (
                <span className={rosterRegular < c.contractedHeadcount ? "text-[var(--tu-on-danger)]" : "tu-person-muted"}>
                  {" "}· {rosterRegular} regular on the roster
                </span>
              )}
            </dd>
          </div>
        )}
        {c.contractValue !== undefined && (
          <div><dt className="tu-person-muted text-xs">Contract value (managers only)</dt><dd>{c.contractValue != null ? peso(c.contractValue) : "—"}{c.billingCycle ? ` · billed ${BILLING_LABEL[c.billingCycle].toLowerCase()}` : ""}</dd></div>
        )}
        {c.slaTerms && <div className="sm:col-span-2 lg:col-span-3"><dt className="tu-person-muted text-xs">SLA terms</dt><dd style={{ whiteSpace: "pre-wrap" }}>{c.slaTerms}</dd></div>}
        {c.notes && <div className="sm:col-span-2 lg:col-span-3"><dt className="tu-person-muted text-xs">Notes (managers only)</dt><dd style={{ whiteSpace: "pre-wrap" }}>{c.notes}</dd></div>}
      </dl>
      {c.documents && <ContractDocuments contractId={c.id} docs={c.documents} canEdit={canEdit} onChange={onDocsChange} />}
      {canEdit && (
        <div className="flex gap-4 mt-3">
          <button type="button" className="text-xs font-semibold text-[var(--tu-text-brand)] cursor-pointer" onClick={onEdit}>Edit</button>
          <button type="button" className="text-xs font-semibold text-[var(--tu-on-danger)] cursor-pointer" onClick={onRemove}>Remove</button>
        </div>
      )}
    </li>
  );
}

function ContractDocuments({ contractId, docs, canEdit, onChange }: {
  contractId: string; docs: BaseAttachment[]; canEdit: boolean; onChange: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const confirm = useConfirm();

  async function upload(file: File) {
    setBusy(true); setErr("");
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/site-contracts/${contractId}/documents`, form);
      onChange();
    } catch (e) {
      setErr(errorMessage(e, "Couldn't upload that file."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(d: BaseAttachment) {
    if (!(await confirm({ title: `Remove "${d.filename}"?`, message: "It is archived, not erased, and can be restored.", confirmLabel: "Remove" }))) return;
    try {
      await api.delete(`/attachments/${d.id}`);
      onChange();
    } catch (e) {
      setErr(errorMessage(e, "Couldn't remove that file."));
    }
  }

  return (
    <div className="mt-3">
      <p className="tu-person-muted text-xs">Documents (managers only)</p>
      {docs.length === 0 ? (
        <p className="text-sm text-[var(--tu-text-subtle)]">No documents attached.</p>
      ) : (
        <ul className="text-sm space-y-1">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2">
              <a className="tu-link" href={contentUrl(d)} target="_blank" rel="noopener noreferrer">{d.filename}</a>
              <span className="tu-person-muted text-xs">{formatSize(d.sizeBytes)}</span>
              {canEdit && <button type="button" className="text-xs text-[var(--tu-on-danger)] cursor-pointer" onClick={() => remove(d)}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.xlsx,image/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          <button type="button" className="text-xs font-semibold text-[var(--tu-text-brand)] cursor-pointer mt-1" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Uploading…" : "+ Attach the signed contract"}
          </button>
        </>
      )}
      {err && <p className="text-xs text-[var(--tu-on-danger)]" role="alert">{err}</p>}
    </div>
  );
}

function ContractForm({ accountId, contract, onSaved, onCancel }: {
  accountId: string; contract: SiteContract | null; onSaved: () => void; onCancel: () => void;
}) {
  const [f, setF] = useState({
    contractNumber: contract?.contractNumber ?? "",
    acquiredOn: dayInput(contract?.acquiredOn),
    startDate: dayInput(contract?.startDate),
    endDate: dayInput(contract?.endDate),
    noticeDays: contract?.noticeDays?.toString() ?? "",
    services: contract?.services ?? [],
    contractedHeadcount: contract?.contractedHeadcount?.toString() ?? "",
    slaTerms: contract?.slaTerms ?? "",
    contractValue: contract?.contractValue?.toString() ?? "",
    billingCycle: contract?.billingCycle ?? "",
    notes: contract?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const toggle = (s: string) => setF((p) => ({ ...p, services: p.services.includes(s) ? p.services.filter((x) => x !== s) : [...p.services, s] }));

  async function save() {
    setSaving(true); setErr("");
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const payload = {
      contractNumber: f.contractNumber, acquiredOn: f.acquiredOn || null, startDate: f.startDate || null,
      endDate: f.endDate || null, noticeDays: num(f.noticeDays), services: f.services,
      contractedHeadcount: num(f.contractedHeadcount), slaTerms: f.slaTerms,
      contractValue: num(f.contractValue), billingCycle: f.billingCycle || null, notes: f.notes,
    };
    try {
      if (contract) await api.put(`/accounts/${accountId}/contracts/${contract.id}`, payload);
      else await api.post(`/accounts/${accountId}/contracts`, payload);
      onSaved();
    } catch (e) {
      setErr(errorMessage(e, "Couldn't save the contract."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tu-card-pad tu-form-grid" style={{ borderBottom: "1px solid var(--tu-border)", marginBottom: 16 }}>
      <div><label className="tu-label" htmlFor="cn-no">Contract number</label><input id="cn-no" className="tu-input" value={f.contractNumber} onChange={set("contractNumber")} autoFocus /></div>
      <div><label className="tu-label" htmlFor="cn-acq">Date acquired (won)</label><input id="cn-acq" className="tu-input" type="date" value={f.acquiredOn} onChange={set("acquiredOn")} /></div>
      <div><label className="tu-label" htmlFor="cn-start">Service starts *</label><input id="cn-start" className="tu-input" type="date" value={f.startDate} onChange={set("startDate")} /></div>
      <div><label className="tu-label" htmlFor="cn-end">Ends (blank if open-ended)</label><input id="cn-end" className="tu-input" type="date" value={f.endDate} onChange={set("endDate")} /></div>
      <div><label className="tu-label" htmlFor="cn-notice">Notice period (days)</label><input id="cn-notice" className="tu-input" type="number" min={0} value={f.noticeDays} onChange={set("noticeDays")} /></div>
      <div><label className="tu-label" htmlFor="cn-heads">Contracted headcount</label><input id="cn-heads" className="tu-input" type="number" min={1} value={f.contractedHeadcount} onChange={set("contractedHeadcount")} /></div>
      <div className="tu-span-2">
        <p className="tu-label">Scope of services</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(SERVICE_LABEL).map(([v, l]) => {
            const on = f.services.includes(v);
            return (
              <button key={v} type="button" aria-pressed={on} onClick={() => toggle(v)}
                className="text-xs font-semibold px-3 py-1 rounded-full border cursor-pointer"
                style={{ borderColor: on ? "var(--tu-text-brand)" : "var(--tu-border)", background: on ? "var(--tu-bg-brand-soft)" : "var(--tu-bg-surface)", color: on ? "var(--tu-text-brand)" : "var(--tu-text-body)" }}>
                {l}
              </button>
            );
          })}
        </div>
      </div>
      <div className="tu-span-2"><label className="tu-label" htmlFor="cn-sla">SLA terms</label><textarea id="cn-sla" className="tu-textarea" rows={2} value={f.slaTerms} onChange={set("slaTerms")} placeholder="e.g. Critical: respond in 2 hours, fix in 24" /></div>
      <div className="tu-span-2"><p className="tu-label" style={{ marginTop: 8 }}>Commercial terms — managers only, never shown to supervisors or the client</p></div>
      <div><label className="tu-label" htmlFor="cn-value">Contract value (₱)</label><input id="cn-value" className="tu-input" type="number" min={0} step="0.01" value={f.contractValue} onChange={set("contractValue")} /></div>
      <div>
        <label className="tu-label" htmlFor="cn-bill">Billing cycle</label>
        <select id="cn-bill" className="tu-select" value={f.billingCycle} onChange={set("billingCycle")}>
          <option value="">—</option>
          {Object.entries(BILLING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="tu-span-2"><label className="tu-label" htmlFor="cn-notes">Notes</label><textarea id="cn-notes" className="tu-textarea" rows={2} value={f.notes} onChange={set("notes")} /></div>
      {err && <p className="tu-span-2 text-sm text-[var(--tu-on-danger)]" role="alert">{err}</p>}
      <div className="tu-span-2 tu-form-actions">
        <button type="button" className="tu-btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="tu-btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : contract ? "Save contract" : "Add contract"}</button>
      </div>
    </div>
  );
}
