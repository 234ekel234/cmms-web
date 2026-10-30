"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import api from "@/lib/api";
import { flattenTree, type AssetLocationNode } from "@/lib/assetLocations";

/**
 * Location stickers: a QR code per place — a plant room, a floor, a restroom —
 * that opens its page: what is there, the work open and done there, the rounds
 * walked there, and "Report a problem here". Same sheet as the asset tags
 * (Avery L7160, `@page labels` in print.css), same rules: drawn locally, and a
 * sign-in still guards everything behind the code.
 *
 * Which places: `?location=<id>` for one, `?under=<id>` for a building and its
 * floors, or every location on the site with neither.
 */

const LABELS_PER_SHEET = 21;

type Place = { id: string; name: string; building: string | null; code: string | null };

function Labels() {
  const { accountId } = useParams<{ accountId: string }>();
  const search = useSearchParams();
  const only = search.get("location");
  const under = search.get("under");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [accountName, setAccountName] = useState("");
  const [qr, setQr] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cutLines, setCutLines] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get(`/accounts/${accountId}/asset-locations`), api.get(`/accounts/${accountId}`)])
      .then(([tree, account]) => {
        if (cancelled) return;
        const all = flattenTree(tree.data as AssetLocationNode[]).map((o) => {
          const building = o.depth ? o.path.slice(0, o.path.length - o.node.name.length - 3) : null;
          return { id: o.id, name: o.node.name, building, parentId: o.node.parentId, code: o.node.reportCode ?? null };
        });
        const chosen = only
          ? all.filter((p) => p.id === only)
          : under
            ? all.filter((p) => p.id === under || p.parentId === under)
            : all;
        setPlaces(chosen);
        setAccountName(account.data?.name ?? "");
      })
      .catch(() => { if (!cancelled) setError("Couldn't load the locations."); });
    return () => { cancelled = true; };
  }, [accountId, only, under]);

  useEffect(() => {
    if (!places) return;
    let cancelled = false;
    const origin = window.location.origin;
    Promise.all(
      places.map(async (p) => [
        p.id,
        "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(
            // The sticker's short code, not the page's address: `/r/<code>` sends
            // a signed-in scan on to the place's page (recorded as a visit) and
            // offers anyone else the report form, and a code can be replaced
            // without reprinting every other sticker.
            await QRCode.toString(p.code ? `${origin}/r/${p.code}` : `${origin}/accounts/${accountId}/assets/locations/${p.id}?scan=1`, {
              type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" },
            })
          ),
      ] as const)
    ).then((pairs) => { if (!cancelled) setQr(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [places, accountId]);

  const scopeLabel = useMemo(() => {
    if (!places?.length) return "";
    if (only) return places[0].name;
    if (under) return `${places.find((p) => p.id === under)?.name ?? ""} and its floors`;
    return "every location";
  }, [places, only, under]);

  useEffect(() => { document.title = `Location stickers · ${accountName}`; }, [accountName]);

  if (error) return <div className="ps-state">{error}</div>;
  if (!places) return <div className="ps-state ps-muted">Loading…</div>;
  if (places.length === 0) return <div className="ps-state">No locations match, so there is nothing to print. Set locations up on the Assets page.</div>;

  const ready = Object.keys(qr).length === places.length;
  const back = only ? `/accounts/${accountId}/assets/locations/${only}` : `/accounts/${accountId}/assets`;

  return (
    <div className="ps-screen">
      <div className="ps-toolbar">
        <Link href={back}>← Back</Link>
        <span className="ps-muted">
          {places.length} sticker{places.length === 1 ? "" : "s"}{scopeLabel ? ` · ${scopeLabel}` : ""} · {Math.ceil(places.length / LABELS_PER_SHEET)} sheet{places.length > LABELS_PER_SHEET ? "s" : ""}
        </span>
        <span className="ps-spacer" />
        <label>
          <input type="checkbox" checked={cutLines} onChange={(e) => setCutLines(e.target.checked)} />
          Cut lines
        </label>
        <button type="button" className="ps-print-btn" onClick={() => window.print()} disabled={!ready}>
          {ready ? "Print" : "Preparing…"}
        </button>
      </div>

      <div className={`ps-labels${cutLines ? " ps-labels-cut" : ""}`}>
        {places.map((p) => (
          <div key={p.id} className="ps-label-card">
            <div className="ps-tag">
              <div className="ps-tag-head">
                {/* eslint-disable @next/next/no-img-element */}
                <img src="/fmi_logo_dark.png" alt="FMI" className="ps-tag-logo" />
                <img src="/logo_with_label_dark.png" alt="ServiceMaster" className="ps-tag-logo-sm" />
                {/* eslint-enable @next/next/no-img-element */}
                <span className="ps-tag-kicker">Location</span>
              </div>
              <div className="ps-tag-body">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {qr[p.id] ? <img className="ps-label-qr" src={qr[p.id]} alt={`QR code for ${p.name}`} /> : <div className="ps-label-qr" />}
                <div className="ps-label-text">
                  <div className="ps-label-name ps-label-name-lead">{p.name}</div>
                  {p.building && <div className="ps-label-meta">{p.building}</div>}
                  <div className="ps-label-meta ps-label-site">{accountName}</div>
                </div>
              </div>
              <div className="ps-tag-foot">Scan for work done here, or to report a problem</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LocationLabelsPage() {
  return (
    <Suspense fallback={<div className="ps-state ps-muted">Loading…</div>}>
      <Labels />
    </Suspense>
  );
}
