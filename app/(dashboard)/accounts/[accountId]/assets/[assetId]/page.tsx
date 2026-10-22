"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { isClosed, workOrderRef } from "@/lib/workOrders";
import { ASSET_HEALTH, ASSET_HEALTH_CLS, ASSET_HEALTH_HINT, type WorkOrderStatus } from "@/lib/statuses";
import { useAuth } from "@/context/AuthContext";
import { canManage } from "@/lib/rbac";
import Breadcrumbs from "@/components/Breadcrumbs";
import { fmtQty, type Part } from "@/lib/parts";
import EmptyState from "@/components/EmptyState";
import Attachments from "@/components/Attachments";
import LocationPicker from "@/components/LocationPicker";
import {
  type AssetLocationNode,
  type AssetLocationRef,
  locationPath,
} from "@/lib/assetLocations";
import { frequencyMeta } from "@/lib/maintenancePlans";
import { useConfirm } from "@/components/ConfirmDialog";
import CapacityUnitSelect from "@/components/CapacityUnitSelect";
import { MAX_FINDINGS, formatCapacity } from "@/lib/assetCapacity";
import { contentUrl, type BaseAttachment } from "@/lib/attachments";

type AssetHealth = "FUNCTIONAL" | "FUNCTIONAL_WITH_FINDINGS" | "BREAKDOWN";

type Asset = {
  id: string;
  name: string;
  category: string;
  status: string;
  health: AssetHealth;
  assetCode: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  location: AssetLocationRef | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyExpiry: string | null;
  manufacturedDate: string | null;
  /** What was found. Only ever set while health is not FUNCTIONAL. */
  findings: string | null;
  capacity: number | null;
  capacityUnit: string | null;
  /** The cover photo, as an attachment DTO; null when none is chosen. */
  cover: BaseAttachment | null;
  archivedAt: string | null;
  createdAt: string;
};

type WorkOrder = {
  id: string;
  number: number;
  title: string;
  // The union, not `string`: it is what the shared status predicates take, and
  // it makes adding a status a compile error here rather than a silent gap.
  status: WorkOrderStatus;
  priority: string;
  createdAt: string;
  completedAt: string | null;
  accountId: string;
  assignments: { employee: { id: string; name: string } }[];
};

type PMLogLite = {
  id: string;
  scheduledDate: string;
  completedAt: string;
  isDraft: boolean;
  isLate: boolean;
};

type PMChecklistAssignment = {
  id: string;
  isActive: boolean;
  checklist: { id: string; name: string; frequency: string };
  logs: PMLogLite[];
};

const WO_STATUS_CLS: Record<string, string> = {
  REQUESTED:   "bg-[var(--tu-soft-info)] text-[var(--tu-on-info)]",
  PENDING:     "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]",
  IN_PROGRESS: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]",
  ON_HOLD:     "bg-[var(--tu-soft-neutral)] text-[var(--tu-on-neutral)]",
  COMPLETED:   "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]",
  REJECTED:    "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]",
};

const WO_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Requested", PENDING: "Accepted", IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold", COMPLETED: "Completed", REJECTED: "Rejected",
};

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  LOW:      { label: "Low",      cls: "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)]" },
  MEDIUM:   { label: "Medium",   cls: "bg-[var(--tu-soft-brand)] text-[var(--tu-on-brand)]" },
  HIGH:     { label: "High",     cls: "bg-[var(--tu-soft-accent)] text-[var(--tu-on-accent)]" },
  CRITICAL: { label: "Critical", cls: "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]" },
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const fmtCost = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// One work-order row: title + priority, status, dates, and assignees.
function WorkOrderRow({ wo }: { wo: WorkOrder }) {
  const pr = PRIORITY_CONFIG[wo.priority] ?? { label: wo.priority, cls: "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)]" };
  // The shared predicate. The local list this replaces omitted APPROVED, so a
  // signed-off job in an asset's history showed "Opened <createdAt>" instead of
  // when it was actually finished — and it shadowed the shared name with
  // different semantics, which is worse than either mistake alone.
  const closed = isClosed(wo);
  const dateLabel =
    closed && wo.completedAt ? `Completed ${fmtDate(wo.completedAt)}` : `Opened ${fmtDate(wo.createdAt)}`;
  const assignees = (wo.assignments ?? []).map((a) => a.employee.name);
  return (
    <Link
      href={`/accounts/${wo.accountId}/work-orders/${wo.id}`}
      className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-[var(--tu-bg-secondary)] transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-[var(--tu-text-heading)] truncate"><span className="tu-wo-ref" style={{ marginRight: 6 }}>{workOrderRef(wo.number)}</span>{wo.title}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pr.cls}`}>{pr.label}</span>
        </div>
        <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
          {dateLabel} · {assignees.length > 0 ? assignees.join(", ") : "Unassigned"}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${WO_STATUS_CLS[wo.status] ?? "bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-body)]"}`}>
        {WO_STATUS_LABELS[wo.status] ?? wo.status}
      </span>
    </Link>
  );
}

const INPUT_CLS =
  "w-full border border-[var(--tu-border)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]";

// The nine editable fields of the Details block, in the order they are shown.
// `kind` drives both the input type and how the value is sent: text fields go
// as trimmed strings (the API turns "" into null), dates as yyyy-mm-dd, and
// cost as a number or null — never "", which would reach `parseFloat` as NaN.
const DETAIL_FIELDS = [
  { key: "assetCode",        label: "Asset Code",    kind: "text" },
  { key: "brand",            label: "Brand",         kind: "text" },
  { key: "model",            label: "Model",         kind: "text" },
  { key: "serialNumber",     label: "Serial No.",    kind: "text" },
  { key: "manufacturedDate", label: "Manufactured",  kind: "date" },
  { key: "purchaseDate",     label: "Purchase Date", kind: "date" },
  { key: "purchaseCost",     label: "Purchase Cost", kind: "cost" },
  { key: "warrantyExpiry",   label: "Warranty Expiry", kind: "date" },
  { key: "capacity",         label: "Capacity",      kind: "capacity" },
] as const;

type DetailKey = (typeof DETAIL_FIELDS)[number]["key"];
type DetailsDraft = Record<DetailKey, string>;

/**
 * What the PUT accepts, which is no longer the same shape as what it returns:
 * the asset carries a whole `location` record, but a write names the id it
 * should point at. Typing this as `Partial<Asset>` let `locationId` through as
 * an unchecked extra property in one direction and rejected it in the other.
 */
type AssetUpdate = Partial<Omit<Asset, "location" | "cover">> & {
  locationId?: string | null;
  coverAttachmentId?: string | null;
};

// Stored dates are UTC midnight, so slicing the ISO string is what a
// <input type="date"> wants — going through a Date first would shift the day
// for anyone west of UTC.
const draftFromAsset = (a: Asset): DetailsDraft => ({
  assetCode: a.assetCode ?? "",
  brand: a.brand ?? "",
  model: a.model ?? "",
  serialNumber: a.serialNumber ?? "",
  manufacturedDate: a.manufacturedDate?.slice(0, 10) ?? "",
  purchaseDate: a.purchaseDate?.slice(0, 10) ?? "",
  purchaseCost: a.purchaseCost != null ? String(a.purchaseCost) : "",
  warrantyExpiry: a.warrantyExpiry?.slice(0, 10) ?? "",
  capacity: a.capacity != null ? String(a.capacity) : "",
});

// Warranty coverage relative to `now`, or null when no expiry is on file.
function warrantyStatus(expiry: string | null, now: number) {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - now) / 86_400_000);
  if (days < 0) return { label: "Expired", cls: "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]" };
  if (days <= 30) return { label: `Expires in ${days}d`, cls: "bg-[var(--tu-soft-warning)] text-[var(--tu-on-warning)]" };
  return { label: "Under warranty", cls: "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]" };
}

export default function AssetDetailPage() {
  const confirm = useConfirm();
  const params = useParams();
  const { user } = useAuth();
  // A client reads their own site's equipment — the API already withholds
  // purchase cost — but archiving it and editing its health or status is ours.
  const writable = canManage(user?.role);
  const accountId = params.accountId as string;
  const assetId = params.assetId as string;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [pmChecklists, setPmChecklists] = useState<PMChecklistAssignment[]>([]);
  const [spareParts, setSpareParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editHealth, setEditHealth] = useState(false);
  const [editStatus, setEditStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [editDetails, setEditDetails] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState<DetailsDraft | null>(null);
  // Held apart from `detailsDraft`, which is all strings: this one is an id.
  const [locationDraft, setLocationDraft] = useState<string | null>(null);
  const [locations, setLocations] = useState<AssetLocationNode[]>([]);
  // Capacity's unit is a pick from a list, held apart from the all-string
  // `detailsDraft` like the location id above.
  const [capacityUnitDraft, setCapacityUnitDraft] = useState("");
  // Choosing a health other than Functional asks what was found before it saves.
  const [healthChoice, setHealthChoice] = useState<AssetHealth | null>(null);
  const [findingsDraft, setFindingsDraft] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  // Captured once at mount so warranty/age math stays pure across re-renders.
  const [now] = useState(() => Date.now());
  // Bumped by the "Try again" button. A counter in the deps re-runs the effect
  // below rather than calling a bare fetch function, so a retry keeps the same
  // cancellation guard as the mount fetch.
  const [reloadKey, setReloadKey] = useState(0);

  const loadLocations = useCallback(async () => {
    try {
      const res = await api.get(`/accounts/${accountId}/asset-locations`);
      setLocations(res.data);
    } catch {
      // The picker simply has nothing to offer; the record still reads.
    }
  }, [accountId]);

  // Wrapped rather than called straight from the effect body: `loadLocations`
  // sets state, and calling it bare is the cascading-render pattern the React
  // lint rule refuses. The await also keeps it consistent with the fetches below.
  useEffect(() => {
    (async () => { await loadLocations(); })();
  }, [loadLocations]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setLoading(true);
      if (!cancelled) setError(false);
      try {
        const [assetRes, woRes, pmRes, partsRes] = await Promise.all([
          api.get(`/assets/${assetId}`),
          api.get(`/assets/${assetId}/work-orders`).catch(() => ({ data: [] })),
          api.get(`/assets/${assetId}/pm-checklists`).catch(() => ({ data: [] })),
          api.get(`/assets/${assetId}/parts`).catch(() => ({ data: [] })),
        ]);
        if (!cancelled) setAsset(assetRes.data);
        if (!cancelled) setWorkOrders(woRes.data);
        if (!cancelled) setPmChecklists(pmRes.data);
        if (!cancelled) setSpareParts(partsRes.data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [assetId, reloadKey]);

  // PUT on the account-scoped path, which is the only asset write the API
  // exposes. This used to PATCH /assets/:id — a route that does not exist — so
  // every edit from this page 404'd into the silent catch and the UI simply
  // snapped back to the old value with no error shown.
  async function updateAsset(updates: AssetUpdate) {
    if (!asset) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await api.put(`/accounts/${accountId}/assets/${assetId}`, updates);
      setAsset(res.data);
      setEditHealth(false);
      setHealthChoice(null);
      setEditStatus(false);
      setEditDetails(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setSaveError(e?.response?.data?.error ?? "Could not save that change.");
    } finally {
      setSaving(false);
    }
  }

  // The Details block saves as one unit rather than field by field: nine
  // separate inline editors would be nine chances to leave a half-typed serial
  // number behind, and the API takes the whole set in one PUT anyway.
  async function saveDetails() {
    if (!detailsDraft) return;
    if (detailsDraft.purchaseCost.trim() && !Number.isFinite(Number(detailsDraft.purchaseCost))) {
      setSaveError("Purchase cost must be a number.");
      return;
    }
    const capacity = detailsDraft.capacity.trim();
    if (capacity && !(Number(capacity) > 0)) {
      setSaveError("Capacity must be a number greater than zero.");
      return;
    }
    if (capacity && !capacityUnitDraft) {
      setSaveError("Pick a unit for the capacity.");
      return;
    }
    await updateAsset({
      assetCode: detailsDraft.assetCode.trim() || null,
      brand: detailsDraft.brand.trim() || null,
      model: detailsDraft.model.trim() || null,
      serialNumber: detailsDraft.serialNumber.trim() || null,
      locationId: locationDraft,
      manufacturedDate: detailsDraft.manufacturedDate || null,
      purchaseDate: detailsDraft.purchaseDate || null,
      purchaseCost: detailsDraft.purchaseCost.trim() ? Number(detailsDraft.purchaseCost) : null,
      warrantyExpiry: detailsDraft.warrantyExpiry || null,
      capacity: capacity ? Number(capacity) : null,
      capacityUnit: capacity ? capacityUnitDraft : null,
    });
  }

  // Functional saves at once — the API clears any findings with it. Anything
  // else opens the findings box first: "it has findings" with no findings
  // written down is the gap this field exists to close.
  function chooseHealth(h: AssetHealth) {
    if (h === "FUNCTIONAL") {
      updateAsset({ health: h });
      return;
    }
    setHealthChoice(h);
    setFindingsDraft(asset?.findings ?? "");
    setSaveError("");
  }

  async function saveHealthWithFindings() {
    if (!healthChoice) return;
    if (!findingsDraft.trim()) {
      setSaveError("Describe what was found.");
      return;
    }
    await updateAsset({ health: healthChoice, findings: findingsDraft.trim() });
  }

  // Re-read after an upload: the API makes a staff member's first photo the
  // cover, and this page should show it without a reload.
  async function refreshAsset() {
    try {
      const res = await api.get(`/assets/${assetId}`);
      setAsset(res.data);
    } catch {
      // The upload itself succeeded; a stale cover is not worth an error.
    }
  }

  async function toggleArchive() {
    if (!asset) return;
    if (!asset.archivedAt && !(await confirm({
      title: "Archive this asset?",
      message: `${asset.name} will be hidden from the register and can't be picked on new work orders. Its history is kept, and you can unarchive it.`,
      confirmLabel: "Archive",
    }))) return;
    setSaving(true);
    setSaveError("");
    try {
      // Account-scoped, like the PUT above. This posted to /assets/:id/archive,
      // which does not exist, and the silent catch hid the 404 — so Archive and
      // Unarchive on this page never did anything.
      const base = `/accounts/${accountId}/assets/${assetId}`;
      const res = await api.post(asset.archivedAt ? `${base}/unarchive` : `${base}/archive`);
      setAsset(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setSaveError(e?.response?.data?.error ?? (asset.archivedAt ? "Could not unarchive this asset." : "Could not archive this asset."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="h-8 w-48 bg-[var(--tu-bg-secondary-strong)] rounded animate-pulse mb-6" />
        <div className="h-64 bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] animate-pulse" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="p-8">
        <div className="bg-[var(--tu-soft-danger)] border border-[var(--tu-bd-danger)] text-[var(--tu-on-danger)] text-sm rounded-lg px-4 py-3">
          Failed to load asset.{" "}
          <button onClick={() => setReloadKey((k) => k + 1)} className="underline cursor-pointer">Try again</button>
        </div>
      </div>
    );
  }

  const hCfg = { label: ASSET_HEALTH[asset.health].label, cls: ASSET_HEALTH_CLS[asset.health] };
  const openWOs = workOrders.filter((w) => !["COMPLETED", "REJECTED"].includes(w.status));
  const closedWOs = workOrders.filter((w) => ["COMPLETED", "REJECTED"].includes(w.status));
  const warranty = warrantyStatus(asset.warrantyExpiry, now);
  const lastServiced = workOrders
    .filter((w) => w.status === "COMPLETED" && w.completedAt)
    .map((w) => w.completedAt as string)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Assets", href: `/accounts/${accountId}/assets` },
          { label: asset.name },
        ]}
      />

      {/* Main info card */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-4 min-w-0">
          {asset.cover && (
            <a href={contentUrl(asset.cover)} target="_blank" rel="noopener noreferrer" className="shrink-0" title="Open the full photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={contentUrl(asset.cover)}
                alt={`Photo of ${asset.name}`}
                className="tu-asset-cover"
              />
            </a>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--tu-text-heading)]">{asset.name}</h1>
            <p className="text-sm text-[var(--tu-text-subtle)] mt-0.5">{asset.category}</p>
            {asset.archivedAt && (
              <span className="inline-block mt-1 text-xs bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-subtle)] rounded-full px-2 py-0.5">Archived</span>
            )}
          </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!asset.archivedAt && (
              <Link
                href={`/accounts/${accountId}/work-orders?assetId=${asset.id}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--tu-text-brand)] hover:bg-[var(--tu-text-brand-strong)] transition-colors"
              >
                + New Work Order
              </Link>
            )}
            {writable && !asset.archivedAt && (
              <Link
                href={`/print/accounts/${accountId}/assets/labels?asset=${asset.id}`}
                target="_blank"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--tu-border)] text-[var(--tu-text-subtle)] hover:bg-[var(--tu-bg-secondary)] transition-colors"
              >
                Print label
              </Link>
            )}
            {writable && (
              <button
                onClick={toggleArchive}
                disabled={saving}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                  asset.archivedAt
                    ? "border-[var(--tu-bd-success)] text-[var(--tu-on-success)] hover:bg-[var(--tu-soft-success)]"
                    : "border-[var(--tu-border)] text-[var(--tu-text-subtle)] hover:bg-[var(--tu-bg-secondary)]"
                }`}
              >
                {asset.archivedAt ? "Unarchive" : "Archive"}
              </button>
            )}
          </div>
        </div>

        {/* Health */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-1">Health</p>
          {editHealth ? (
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(ASSET_HEALTH) as AssetHealth[]).map((h) => (
                <button
                  key={h}
                  onClick={() => chooseHealth(h)}
                  disabled={saving}
                  aria-pressed={(healthChoice ?? asset.health) === h}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    (healthChoice ?? asset.health) === h ? ASSET_HEALTH_CLS[h] + " border-current" : "bg-[var(--tu-bg-surface)] text-[var(--tu-text-body)] border-[var(--tu-border)] hover:border-[var(--tu-border-strong)]"
                  }`}
                >
                  {ASSET_HEALTH[h].label}
                </button>
              ))}
              <button
                onClick={() => { setEditHealth(false); setHealthChoice(null); setSaveError(""); }}
                className="px-3 py-1.5 text-xs text-[var(--tu-text-subtle)] cursor-pointer"
              >
                Cancel
              </button>
              {healthChoice && (
                <div className="w-full mt-1">
                  <label htmlFor="asset-findings" className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">
                    What was found?
                  </label>
                  <textarea
                    id="asset-findings"
                    className="w-full border border-[var(--tu-border)] rounded-lg px-3 py-2 text-xs text-[var(--tu-text-body)] bg-[var(--tu-bg-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                    rows={3}
                    maxLength={MAX_FINDINGS}
                    value={findingsDraft}
                    onChange={(e) => setFindingsDraft(e.target.value)}
                    placeholder={healthChoice === "BREAKDOWN" ? "e.g. Compressor tripped on overload, will not restart." : "e.g. Condenser coil fouled; vibration on fan motor."}
                    autoFocus
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={saveHealthWithFindings}
                      disabled={saving || !findingsDraft.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--tu-text-brand)] hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? "Saving…" : `Save as ${ASSET_HEALTH[healthChoice].label}`}
                    </button>
                  </div>
                </div>
              )}
              <p className="w-full text-[11px] text-[var(--tu-text-subtle)] mt-1">
                {ASSET_HEALTH_HINT[healthChoice ?? asset.health]}. Marking an asset as a breakdown starts its downtime clock; moving it off stops it. Setting it back to Functional clears the findings.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${hCfg.cls}`}>{hCfg.label}</span>
              {writable && !asset.archivedAt && (
                <button onClick={() => setEditHealth(true)} className="text-xs text-[var(--tu-text-brand)] hover:underline cursor-pointer">Edit</button>
              )}
            </div>
          )}
          {!editHealth && asset.health !== "FUNCTIONAL" && (
            <div className="mt-2 rounded-lg border border-[var(--tu-border)] bg-[var(--tu-bg-secondary)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide">Findings</p>
                {writable && !asset.archivedAt && (
                  <button
                    onClick={() => { setEditHealth(true); chooseHealth(asset.health); }}
                    className="text-xs text-[var(--tu-text-brand)] hover:underline cursor-pointer"
                  >
                    {asset.findings ? "Edit" : "Add"}
                  </button>
                )}
              </div>
              <p className="text-xs text-[var(--tu-text-body)] mt-1 whitespace-pre-wrap">
                {asset.findings ?? <span className="text-[var(--tu-text-disabled)]">Nothing written down yet.</span>}
              </p>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide mb-1">Status</p>
          {editStatus ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="flex-1 min-w-[200px] border border-[var(--tu-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--tu-text-body)] bg-[var(--tu-bg-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--tu-text-brand)]"
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") updateAsset({ status: statusDraft }); }}
                placeholder="e.g. Awaiting spare parts"
                maxLength={80}
                autoFocus
              />
              <button
                onClick={() => updateAsset({ status: statusDraft })}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--tu-text-brand)] hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => { setEditStatus(false); setSaveError(""); }} className="px-3 py-1.5 text-xs text-[var(--tu-text-subtle)] cursor-pointer">Cancel</button>
              <p className="w-full text-[11px] text-[var(--tu-text-subtle)]">
                Describe what the asset is doing, in your own words. Condition is recorded under Health.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--tu-bg-secondary)] text-[var(--tu-text-body)]">
                {asset.status || "—"}
              </span>
              {writable && !asset.archivedAt && (
                <button onClick={() => { setStatusDraft(asset.status ?? ""); setEditStatus(true); }} className="text-xs text-[var(--tu-text-brand)] hover:underline cursor-pointer">Edit</button>
              )}
            </div>
          )}
        </div>

        {/* A failed save used to be invisible — the value simply snapped back.
            Say so instead, since the one error a user can actually cause here
            is a duplicate asset code. */}
        {saveError && (
          <p className="text-xs font-semibold text-[var(--tu-on-danger)] mb-4">{saveError}</p>
        )}

        {/* Details */}
        <div className="pt-4 border-t border-[var(--tu-border)]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide">Details</p>
            {writable && !asset.archivedAt && !editDetails && (
              <button
                onClick={() => {
                  setDetailsDraft(draftFromAsset(asset));
                  setLocationDraft(asset.location?.id ?? null);
                  setCapacityUnitDraft(asset.capacityUnit ?? "");
                  setSaveError("");
                  setEditDetails(true);
                }}
                className="text-xs text-[var(--tu-text-brand)] hover:underline cursor-pointer"
              >
                Edit
              </button>
            )}
          </div>
          {editDetails && detailsDraft ? (
            <>
              <div className="mb-4">
                <LocationPicker
                  accountId={accountId}
                  tree={locations}
                  value={locationDraft}
                  onChange={setLocationDraft}
                  onTreeChange={loadLocations}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                {DETAIL_FIELDS.map((f) => f.kind === "capacity" ? (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1" htmlFor="asset-capacity">{f.label}</label>
                    <div className="flex gap-1.5">
                      <input
                        id="asset-capacity"
                        className={INPUT_CLS}
                        type="number"
                        min="0"
                        step="any"
                        value={detailsDraft.capacity}
                        onChange={(e) => setDetailsDraft((d) => (d ? { ...d, capacity: e.target.value } : d))}
                      />
                      <CapacityUnitSelect
                        className={INPUT_CLS}
                        style={{ width: 96, flexShrink: 0 }}
                        value={capacityUnitDraft}
                        onChange={(unit) => setCapacityUnitDraft(unit)}
                      />
                    </div>
                  </div>
                ) : (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-[var(--tu-text-subtle)] mb-1">{f.label}</label>
                    <input
                      className={INPUT_CLS}
                      type={f.kind === "date" ? "date" : f.kind === "cost" ? "number" : "text"}
                      {...(f.kind === "cost" ? { min: "0", step: "0.01" } : {})}
                      value={detailsDraft[f.key]}
                      onChange={(e) => setDetailsDraft((d) => (d ? { ...d, [f.key]: e.target.value } : d))}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button
                  onClick={() => { setEditDetails(false); setSaveError(""); }}
                  className="px-3 py-1.5 text-xs text-[var(--tu-text-subtle)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={saveDetails}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[var(--tu-text-brand)] rounded-lg hover:bg-[var(--tu-text-brand-strong)] disabled:opacity-50 cursor-pointer"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          ) : (
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-xs">
              {[
                { label: "Asset Code", value: asset.assetCode },
                { label: "Brand", value: asset.brand },
                { label: "Model", value: asset.model },
                { label: "Serial No.", value: asset.serialNumber },
                { label: "Capacity", value: formatCapacity(asset.capacity, asset.capacityUnit) },
                { label: "Location", value: locationPath(asset.location) || null },
                { label: "Manufactured", value: asset.manufacturedDate ? fmtDate(asset.manufacturedDate) : null },
                { label: "Purchased", value: asset.purchaseDate ? fmtDate(asset.purchaseDate) : null },
                { label: "Purchase Cost", value: asset.purchaseCost != null ? fmtCost(asset.purchaseCost) : null },
                { label: "Registered", value: fmtDate(asset.createdAt) },
              ].map((f) => (
                <div key={f.label}>
                  <dt className="font-semibold text-[var(--tu-text-subtle)]">{f.label}</dt>
                  <dd className="text-[var(--tu-text-body)] mt-0.5">{f.value ?? <span className="text-[var(--tu-text-disabled)]">—</span>}</dd>
                </div>
              ))}
              <div>
                <dt className="font-semibold text-[var(--tu-text-subtle)]">Warranty</dt>
                <dd className="mt-0.5">
                  {asset.warrantyExpiry ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[var(--tu-text-body)]">{fmtDate(asset.warrantyExpiry)}</span>
                      {warranty && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${warranty.cls}`}>
                          {warranty.label}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[var(--tu-text-disabled)]">—</span>
                  )}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Open Work Orders", value: String(openWOs.length), accent: openWOs.length > 0 ? "text-[var(--tu-text-brand)]" : "text-[var(--tu-text-heading)]" },
          { label: "Total Work Orders", value: String(workOrders.length), accent: "text-[var(--tu-text-heading)]" },
          { label: "Last Serviced", value: lastServiced ? fmtDate(lastServiced) : "—", accent: "text-[var(--tu-text-heading)]" },
          { label: "PM Checklists", value: String(pmChecklists.length), accent: "text-[var(--tu-text-heading)]" },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-4">
            <p className="text-[11px] font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide">{s.label}</p>
            <p className={`text-lg font-bold mt-1 ${s.accent}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Spare parts that fit this asset */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--tu-border)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--tu-text-body)]">Spare Parts ({spareParts.length})</h2>
            <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">Stocked spares linked to this equipment.</p>
          </div>
          <Link href={`/accounts/${accountId}/parts`} className="text-xs font-semibold text-[var(--tu-text-brand)] hover:underline">
            All parts
          </Link>
        </div>
        {spareParts.length === 0 ? (
          <p className="px-6 py-6 text-sm text-[var(--tu-text-subtle)]">
            No spare parts linked yet. Link them from a part&apos;s page under Spare Parts.
          </p>
        ) : (
          <div className="divide-y divide-[var(--tu-border)]">
            {spareParts.map((p) => (
              <Link
                key={p.id}
                href={`/accounts/${accountId}/parts/${p.id}`}
                className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-[var(--tu-bg-secondary)] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--tu-text-heading)] truncate">{p.name}</p>
                  <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
                    {[p.partNumber, p.location].filter(Boolean).join(" · ") || "No part number"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    p.quantityOnHand < 0
                      ? "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]"
                      : p.isLowStock
                        ? "bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]"
                        : "bg-[var(--tu-soft-success)] text-[var(--tu-on-success)]"
                  }`}
                >
                  {fmtQty(p.quantityOnHand)}{p.unit ? ` ${p.unit}` : ""} on hand
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Documents — manuals, warranty scans, nameplate photos */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm p-6 mb-6">
        <Attachments
          parent="assets"
          parentId={asset.id}
          canUpload
          // Staff only, as the API enforces: a client may add a photo but not
          // remove one, and the removed-files list is staff's to restore from.
          canDelete={writable}
          coverId={asset.cover?.id ?? null}
          onSetCover={writable && !asset.archivedAt ? (id) => updateAsset({ coverAttachmentId: id }) : undefined}
          onUploaded={refreshAsset}
          onRemoved={(id) => { if (id === asset.cover?.id) setAsset((a) => (a ? { ...a, cover: null } : a)); }}
        />
      </div>

      {/* PM checklists */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-[var(--tu-border)]">
          <h2 className="text-sm font-semibold text-[var(--tu-text-body)]">PM Checklists ({pmChecklists.length})</h2>
        </div>
        {pmChecklists.length === 0 ? (
          <EmptyState compact icon="checklist" title="No PM checklists" hint="Assign a checklist to this asset to schedule preventive maintenance." />
        ) : (
          <div className="divide-y divide-[var(--tu-border)]">
            {pmChecklists.map((pm) => {
              const freq = frequencyMeta(pm.checklist.frequency);
              const last = pm.logs[0];
              return (
                <Link
                  key={pm.id}
                  href={`/accounts/${accountId}/checklists/${pm.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-[var(--tu-bg-secondary)] transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--tu-text-heading)]">{pm.checklist.name}</p>
                    <p className="text-xs text-[var(--tu-text-subtle)] mt-0.5">
                      {last ? `Last done ${fmtDate(last.completedAt)}${last.isDraft ? " (draft)" : ""}` : "Never completed"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!pm.isActive && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--tu-bg-secondary-strong)] text-[var(--tu-text-subtle)]">Inactive</span>
                    )}
                    {last?.isLate && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--tu-soft-danger)] text-[var(--tu-on-danger)]">Late</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${freq.cls}`}>{freq.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Work orders */}
      <div className="bg-[var(--tu-bg-surface)] rounded-xl border border-[var(--tu-border)] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--tu-border)] flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--tu-text-body)]">Work Orders ({workOrders.length})</h2>
          {workOrders.length > 0 && (
            <p className="text-xs text-[var(--tu-text-subtle)]">{openWOs.length} open · {closedWOs.length} closed</p>
          )}
        </div>
        {workOrders.length === 0 ? (
          <EmptyState compact icon="workOrder" title="No work orders yet" hint="Repairs and maintenance raised against this asset appear here." />
        ) : (
          <>
            {openWOs.length > 0 && (
              <>
                <p className="px-6 pt-3 pb-1 text-[11px] font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide">
                  Open ({openWOs.length})
                </p>
                <div className="divide-y divide-[var(--tu-border)]">
                  {openWOs.map((wo) => <WorkOrderRow key={wo.id} wo={wo} />)}
                </div>
              </>
            )}
            {closedWOs.length > 0 && (
              <>
                <p className="px-6 pt-3 pb-1 text-[11px] font-semibold text-[var(--tu-text-subtle)] uppercase tracking-wide border-t border-[var(--tu-border)]">
                  History ({closedWOs.length})
                </p>
                <div className="divide-y divide-[var(--tu-border)]">
                  {closedWOs.map((wo) => <WorkOrderRow key={wo.id} wo={wo} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
