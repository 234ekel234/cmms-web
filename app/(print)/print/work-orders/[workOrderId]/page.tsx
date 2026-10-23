"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { workOrderRef } from "@/lib/workOrders";
import WorkOrderSheet, { DEFAULT_SHEET_OPTIONS, type PrintableWorkOrder, printableNotes } from "@/components/print/WorkOrderSheet";
import SheetOptionsBar from "@/components/print/SheetOptionsBar";

/** One work order's job sheet. The sheet itself is components/print/WorkOrderSheet. */
export default function PrintWorkOrderPage() {
  const { workOrderId } = useParams<{ workOrderId: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<PrintableWorkOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState(DEFAULT_SHEET_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/work-orders/${workOrderId}`)
      .then((res) => { if (!cancelled) setOrder(res.data); })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.status === 404 ? "This work order doesn't exist, or isn't yours to see." : "Couldn't load the work order.");
      });
    return () => { cancelled = true; };
  }, [workOrderId]);

  useEffect(() => {
    if (order) document.title = `${workOrderRef(order.number)} · ${order.title}`;
  }, [order]);

  if (error) return <div className="ps-state">{error}</div>;
  if (!order) return <div className="ps-state ps-muted">Loading…</div>;

  const backHref = order.account ? `/accounts/${order.account.id}/work-orders/${order.id}` : "/work-orders";

  return (
    <div className="ps-screen">
      <SheetOptionsBar
        back={<Link href={backHref}>← Back to {workOrderRef(order.number)}</Link>}
        options={options}
        onChange={setOptions}
        hasNotes={printableNotes(order).length > 0}
        hasPauses={(order.pauses ?? []).length > 0}
      />
      <WorkOrderSheet order={order} options={options} printedBy={user?.name} />
    </div>
  );
}
