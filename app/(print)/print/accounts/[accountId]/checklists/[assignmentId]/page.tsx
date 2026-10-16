"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { frequencyMeta } from "@/lib/maintenancePlans";
import { Cell, SheetHeader, Sign, printedStamp } from "@/components/print/SheetParts";

/**
 * A PM checklist as a blank paper form, for rounds walked with a clipboard and
 * keyed in afterwards — the plant room with no signal, the site whose
 * technician has no phone, the client who wants a signed sheet in a binder.
 *
 * Blank on purpose. Answers already filed belong to the record online, and a
 * printed copy of them is a second version that stops agreeing with the first
 * the moment someone edits a draft. `?period=` only labels which period the
 * sheet is for; the fill-in page passes the one it is showing.
 */

type PMSection = { id: string; title: string; answerOptions: string[]; order: number; items: { id: string; label: string; order: number }[] };
type Assignment = {
  id: string;
  checklist: { id: string; name: string; frequency: string; sections: PMSection[] };
  asset: { id: string; name: string; assetCode: string | null } | null;
};

const REMARK_LINES = 4;

function ChecklistForm() {
  const { accountId, assignmentId } = useParams<{ accountId: string; assignmentId: string }>();
  const period = useSearchParams().get("period") ?? "";
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get(`/accounts/${accountId}/pm-checklists`), api.get(`/accounts/${accountId}`)])
      .then(([list, account]) => {
        if (cancelled) return;
        const found = (list.data as Assignment[]).find((a) => a.id === assignmentId);
        if (!found) { setError("This checklist isn't assigned to the site any more."); return; }
        setAssignment(found);
        setAccountName(account.data?.name ?? "");
      })
      .catch(() => { if (!cancelled) setError("Couldn't load the checklist."); });
    return () => { cancelled = true; };
  }, [accountId, assignmentId]);

  useEffect(() => {
    if (assignment) document.title = `${assignment.checklist.name}${period ? ` · ${period}` : ""}`;
  }, [assignment, period]);

  if (error) return <div className="ps-state">{error}</div>;
  if (!assignment) return <div className="ps-state ps-muted">Loading…</div>;

  const { checklist, asset } = assignment;
  const sections = [...checklist.sections].sort((a, b) => a.order - b.order);

  return (
    <div className="ps-screen">
      <div className="ps-toolbar">
        <Link href={`/accounts/${accountId}/checklists/${assignmentId}`}>← Back to the checklist</Link>
        <span className="ps-spacer" />
        <button type="button" className="ps-print-btn" onClick={() => window.print()}>Print</button>
      </div>

      <article className="ps-sheet">
        <SheetHeader kicker="Preventive Maintenance" title="Checklist" titleSize="14pt" />

        <h1 className="ps-title">{checklist.name}</h1>

        <div className="ps-grid">
          <Cell label="Site" value={accountName || "—"} wide />
          <Cell label="Frequency" value={frequencyMeta(checklist.frequency).label} />
          <Cell label="Period" value={period} />
          <Cell label="Asset" value={asset ? asset.name + (asset.assetCode ? ` (${asset.assetCode})` : "") : "—"} wide />
          <Cell label="Date performed" value="" />
          <Cell label="Time" value="" />
        </div>

        {sections.map((sec) => (
          <section key={sec.id} className="ps-section">
            <h2>{sec.title}</h2>
            <table className="ps-table">
              <thead>
                <tr>
                  <th>Item</th>
                  {sec.answerOptions.map((opt) => (
                    <th key={opt} className="ps-box-col" style={{ width: 54 }}>{opt}</th>
                  ))}
                  <th style={{ width: "28%" }}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {[...sec.items].sort((a, b) => a.order - b.order).map((item, i) => (
                  <tr key={item.id}>
                    <td>{i + 1}. {item.label}</td>
                    {sec.answerOptions.map((opt) => (
                      <td key={opt} className="ps-box-col"><span className="ps-box" /></td>
                    ))}
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <section className="ps-section">
          <h2>Findings / remarks</h2>
          <div className="ps-lines">
            {Array.from({ length: REMARK_LINES }, (_, i) => <div key={i} />)}
          </div>
        </section>

        <div className="ps-signs ps-cols-3">
          <Sign role="Performed by" caption="Name, signature and date" />
          <Sign role="Checked by" caption="Supervisor — name, signature and date" />
          <Sign role="Acknowledged by" caption="Client — name, signature and date" />
        </div>

        <footer className="ps-foot">
          <span>{checklist.name} · {accountName}</span>
          <span>{printedStamp(user?.name)}</span>
        </footer>
      </article>
    </div>
  );
}

export default function PrintChecklistPage() {
  return (
    <Suspense fallback={<div className="ps-state ps-muted">Loading…</div>}>
      <ChecklistForm />
    </Suspense>
  );
}
