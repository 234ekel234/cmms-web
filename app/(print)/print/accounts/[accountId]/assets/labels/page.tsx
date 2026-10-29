"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import api from "@/lib/api";
import { locationPath, type AssetLocationRef } from "@/lib/assetLocations";

/**
 * Asset tags: a QR code per asset that opens its record, for sticking on the
 * machine. Scanning lands on the asset page, which is where its history, its
 * open work and "raise a request" already live — so the label needs no logic of
 * its own, and a login still guards everything behind it.
 *
 * Which assets: `?asset=<id>` for one, `?location=<id>` for everything filed
 * at a building or any floor in it (the register's own filter, carried over),
 * or the whole active register with neither. A filter rather than a list of
 * ids so a site with four hundred assets does not become a URL too long to
 * send. Archived kit is never tagged.
 *
 * The grid is 3 × 7 on A4 at 63.5 × 38.1 mm — Avery L7160 and its many
 * equivalents, the commonest laser label sheet — and prints with faint cut
 * lines for plain paper. The geometry lives in print.css under `@page labels`.
 *
 * Each tag reads in the order someone in a plant room needs it: whose tag it
 * is (the letterhead strip), which machine (the asset code, largest, because
 * it is what gets quoted over the radio), then the name, kind and where it
 * sits, and finally what scanning does. The QR keeps a quiet zone of two
 * modules: a code drawn hard against the label edge or the cut line is the one
 * a phone camera struggles with.
 */

const LABELS_PER_SHEET = 21;

type Asset = {
  id: string;
  name: string;
  assetCode: string | null;
  category: string;
  location: AssetLocationRef | null;
};

function Labels() {
  const { accountId } = useParams<{ accountId: string }>();
  const search = useSearchParams();
  const onlyAsset = search.get("asset");
  const locationId = search.get("location");
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [accountName, setAccountName] = useState("");
  const [qr, setQr] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cutLines, setCutLines] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get(`/accounts/${accountId}/assets`), api.get(`/accounts/${accountId}`)])
      .then(([list, account]) => {
        if (cancelled) return;
        const all = list.data as Asset[];
        const chosen = onlyAsset
          ? all.filter((a) => a.id === onlyAsset)
          : locationId
            // A building's scope is itself plus its floors. Two levels deep, so
            // the parent is the only ancestor there is to check.
            ? all.filter((a) => a.location && (a.location.id === locationId || a.location.parentId === locationId))
            : all;
        setAssets(chosen);
        setAccountName(account.data?.name ?? "");
      })
      .catch(() => { if (!cancelled) setError("Couldn't load the assets."); });
    return () => { cancelled = true; };
  }, [accountId, onlyAsset, locationId]);

  // QR codes are drawn in the browser as SVG: crisp at any print resolution,
  // and no asset id ever goes to a third-party image service.
  useEffect(() => {
    if (!assets) return;
    let cancelled = false;
    const origin = window.location.origin;
    Promise.all(
      assets.map(async (a) => [
        a.id,
        "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(
            await QRCode.toString(`${origin}/accounts/${accountId}/assets/${a.id}`, {
              type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" },
            })
          ),
      ] as const)
    ).then((pairs) => { if (!cancelled) setQr(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [assets, accountId]);

  const scopeLabel = useMemo(() => {
    if (!assets) return "";
    if (onlyAsset) return assets[0]?.name ?? "";
    if (locationId) {
      const hit = assets.find((a) => a.location?.id === locationId)?.location
        ?? assets.find((a) => a.location?.parentId === locationId)?.location?.parent;
      return hit ? `in ${hit.name}` : "";
    }
    return "whole register";
  }, [assets, onlyAsset, locationId]);

  useEffect(() => { document.title = `Asset labels · ${accountName}`; }, [accountName]);

  if (error) return <div className="ps-state">{error}</div>;
  if (!assets) return <div className="ps-state ps-muted">Loading…</div>;
  if (assets.length === 0) return <div className="ps-state">No active assets match, so there is nothing to label.</div>;

  const ready = Object.keys(qr).length === assets.length;

  return (
    <div className="ps-screen">
      <div className="ps-toolbar">
        <Link href={onlyAsset ? `/accounts/${accountId}/assets/${onlyAsset}` : `/accounts/${accountId}/assets`}>← Back to assets</Link>
        <span className="ps-muted">
          {assets.length} label{assets.length === 1 ? "" : "s"}{scopeLabel ? ` · ${scopeLabel}` : ""} · {Math.ceil(assets.length / LABELS_PER_SHEET)} sheet{assets.length > LABELS_PER_SHEET ? "s" : ""}
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
        {assets.map((a) => {
          const where = locationPath(a.location);
          return (
            <div key={a.id} className="ps-label-card">
              <div className="ps-tag">
                <div className="ps-tag-head">
                  {/* eslint-disable @next/next/no-img-element */}
                  <img src="/fmi_logo_dark.png" alt="FMI" className="ps-tag-logo" />
                  <img src="/logo_with_label_dark.png" alt="ServiceMaster" className="ps-tag-logo-sm" />
                  {/* eslint-enable @next/next/no-img-element */}
                  <span className="ps-tag-kicker">Asset tag</span>
                </div>
                <div className="ps-tag-body">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {qr[a.id] ? <img className="ps-label-qr" src={qr[a.id]} alt={`QR code for ${a.name}`} /> : <div className="ps-label-qr" />}
                  <div className="ps-label-text">
                    {a.assetCode && <div className="ps-label-code">{a.assetCode}</div>}
                    <div className={a.assetCode ? "ps-label-name" : "ps-label-name ps-label-name-lead"}>{a.name}</div>
                    <div className="ps-label-meta">{[a.category, where].filter(Boolean).join(" · ")}</div>
                    <div className="ps-label-meta ps-label-site">{accountName}</div>
                  </div>
                </div>
                <div className="ps-tag-foot">Scan for history, or to report a fault</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AssetLabelsPage() {
  return (
    <Suspense fallback={<div className="ps-state ps-muted">Loading…</div>}>
      <Labels />
    </Suspense>
  );
}
