"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { frequencyMeta } from "@/lib/maintenancePlans";
import { pmControlNumber } from "@/lib/pmControlNumber";
import { Cell, SheetHeader, Sign, printedStamp } from "@/components/print/SheetParts";

/**
 * A PM checklist on paper, two ways.
 *
 * **Blank** — for a round walked with a clipboard and keyed in afterwards: the
 * plant room with no signal, the client who wants a signed sheet in a binder.
 * `?period=` labels which period it is for.
 *
 * **Answered** (`?log=<round id>`) — the round as filed, with its control
 * number, answers, remarks and who answered what. This used to be refused on
 * the grounds that a paper copy of answers stops agreeing with the record when
 * a draft is edited. A submitted round's answers cannot be rewritten, so its
 * copy cannot go stale; a draft can, so a draft prints under a DRAFT mark and says so in the
 * header. Clients get the same sheet less per-answer attribution, which the API
 * already withholds from them.
 */

type PMItem = { id: string; label: string; order: number };
type PMSection = { id: string; title: string; answerOptions: string[]; order: number; items: PMItem[] };
type Assignment = {
  id: string;
  checklist: { id: string; name: string; frequency: string; sections: PMSection[] };
  asset: { id: string; name: string; assetCode: string | null } | null;
};
type LogItem = { itemId: string; answer: string; remarks: string | null; answeredAt: string; answeredByName?: string | null };
type PMLog = {
  id: string;
  number: number;
  createdAt: string;
  completedAt: string;
  performedByName: string;
  isDraft: boolean;
  isLate: boolean;
  items: LogItem[];
};

type Mode = "blank" | "answered";

const REMARK_LINES = 4;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function ChecklistForm() {
  const { accountId, assignmentId } = useParams<{ accountId: string; assignmentId: string }>();
  const params = useSearchParams();
  const period = params.get("period") ?? "";
  const logId = params.get("log");
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [log, setLog] = useState<PMLog | null>(null);
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(logId ? "answered" : "blank");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get(`/accounts/${accountId}/pm-checklists`),
      api.get(`/accounts/${accountId}`),
      logId ? api.get(`/account-pm-checklists/${assignmentId}/logs`) : Promise.resolve({ data: [] }),
    ])
      .then(([list, account, logs]) => {
        if (cancelled) return;
        const found = (list.data as Assignment[]).find((a) => a.id === assignmentId);
        if (!found) { setError("This checklist isn't assigned to the site any more."); return; }
        setAssignment(found);
        setAccountName(account.data?.name ?? "");
        if (logId) {
          const filed = (logs.data as PMLog[]).find((l) => l.id === logId) ?? null;
          setLog(filed);
          if (!filed) setMode("blank");
        }
      })
      .catch(() => { if (!cancelled) setError("Couldn't load the checklist."); });
    return () => { cancelled = true; };
  }, [accountId, assignmentId, logId]);

  const answered = mode === "answered" && log ? log : null;
  const control = answered ? pmControlNumber(answered) : null;

  useEffect(() => {
    if (assignment) {
      document.title = [assignment.checklist.name, period, control].filter(Boolean).join(" · ");
    }
  }, [assignment, period, control]);

  if (error) return <div className="ps-state">{error}</div>;
  if (!assignment) return <div className="ps-state ps-muted">Loading…</div>;

  const { checklist, asset } = assignment;
  const sections = [...checklist.sections].sort((a, b) => a.order - b.order);
  const byItem = new Map((answered?.items ?? []).map((li) => [li.itemId, li]));
  // The "By" column only when there is attribution to show — never for a
  // client, whom the API does not send it to.
  const showBy = !!answered && answered.items.some((li) => li.answeredByName);

  return (
    <div className="ps-screen">
      <div className="ps-toolbar">
        <Link href={`/accounts/${accountId}/checklists/${assignmentId}`}>← Back to the checklist</Link>
        <span className="ps-spacer" />
        {log && (
          <div className="ps-mode" role="radiogroup" aria-label="Sheet">
            <label>
              <input type="radio" name="mode" checked={mode === "blank"} onChange={() => setMode("blank")} />
              Blank form
            </label>
            <label>
              <input type="radio" name="mode" checked={mode === "answered"} onChange={() => setMode("answered")} />
              Answered{log.isDraft ? " (draft)" : ""}
            </label>
          </div>
        )}
        <button type="button" className="ps-print-btn" onClick={() => window.print()}>Print</button>
      </div>

      <article className={`ps-sheet${answered?.isDraft ? " ps-draft" : ""}`}>
        {answered?.isDraft && <div className="ps-watermark" aria-hidden="true">DRAFT</div>}
        <SheetHeader
          kicker="Preventive Maintenance"
          title={control ?? "Checklist"}
          titleSize={control ? undefined : "14pt"}
        />

        <h1 className="ps-title">{checklist.name}</h1>
        {answered?.isDraft && (
          <p className="ps-draft-note">Draft — not submitted. Answers may still change; the record online is the final version.</p>
        )}

        <div className="ps-grid">
          <Cell label="Site" value={accountName || "—"} wide />
          <Cell label="Frequency" value={frequencyMeta(checklist.frequency).label} />
          <Cell label="Period" value={period} />
          <Cell label="Asset" value={asset ? asset.name + (asset.assetCode ? ` (${asset.assetCode})` : "") : "—"} wide />
          <Cell label="Control no." value={control ?? ""} mono />
          <Cell
            label={answered && !answered.isDraft ? "Submitted" : "Date performed"}
            value={answered ? `${fmtDate(answered.completedAt)}, ${fmtTime(answered.completedAt)}${answered.isLate ? " (late)" : ""}` : ""}
          />
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
                  <th style={{ width: showBy ? "22%" : "28%" }}>Remarks</th>
                  {showBy && <th style={{ width: "16%" }}>By</th>}
                </tr>
              </thead>
              <tbody>
                {[...sec.items].sort((a, b) => a.order - b.order).map((item, i) => {
                  const a = byItem.get(item.id);
                  // An answer the options no longer list (the template was
                  // edited since) is still the record — print it in words.
                  const offList = a && !sec.answerOptions.includes(a.answer);
                  return (
                    <tr key={item.id}>
                      <td>{i + 1}. {item.label}</td>
                      {sec.answerOptions.map((opt) => (
                        <td key={opt} className="ps-box-col">
                          <span className="ps-box">{a?.answer === opt ? "✓" : ""}</span>
                        </td>
                      ))}
                      <td>
                        {offList && <strong>{a.answer}. </strong>}
                        {a?.remarks ?? ""}
                        {answered && !a && <span className="ps-muted">Not answered</span>}
                      </td>
                      {showBy && (
                        <td className="ps-by">
                          {a?.answeredByName ?? ""}
                          {a?.answeredAt && <span className="ps-muted"> · {fmtTime(a.answeredAt)}</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
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
          <Sign
            role="Performed by"
            caption="Name, signature and date"
            filled={answered && !answered.isDraft ? answered.performedByName : undefined}
          />
          <Sign role="Checked by" caption="Supervisor — name, signature and date" />
          <Sign role="Acknowledged by" caption="Client — name, signature and date" />
        </div>

        <footer className="ps-foot">
          <span>{[checklist.name, accountName, control].filter(Boolean).join(" · ")}</span>
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
