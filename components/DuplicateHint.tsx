"use client";

import Link from "next/link";
import { workOrderStatusFor, type WorkOrderStatus } from "@/lib/statuses";
import { possibleDuplicates, workOrderRef } from "@/lib/workOrders";

/**
 * "Already open on this asset: WO-1042" under the New Work Order and request
 * forms. Reads the list the page has already loaded — no extra request — so it
 * only knows what the caller can see, which is the right scope for a hint.
 */
type Row = { id: string; number: number; title: string; status: WorkOrderStatus; acceptedAt?: string | null; asset?: { id: string; name?: string } | null };

export default function DuplicateHint({ orders, assetId, title, accountId }: {
  orders: Row[]; assetId?: string | null; title?: string; accountId: string;
}) {
  const dups = possibleDuplicates(orders, { assetId, title });
  if (dups.length === 0) return null;
  const sameAsset = !!assetId && dups.every((d) => d.asset?.id === assetId);
  return (
    <div className="tu-dup-hint" role="status">
      <p>{sameAsset ? "Already open on this asset — is it one of these?" : "Similar jobs already open — is it one of these?"}</p>
      <ul>
        {dups.map((d) => (
          <li key={d.id}>
            <Link href={`/accounts/${accountId}/work-orders/${d.id}`} target="_blank">{workOrderRef(d.number)}</Link>{" "}
            {d.title} <span className="tu-links-sub">· {workOrderStatusFor(d).label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
