"use client";

import { useState } from "react";
import api from "@/lib/api";
import { isLowRating, type SurveyScores } from "@/lib/workOrders";

/**
 * The client side of the survey: "How did we do?" on a signed-off job, and the
 * staff side: the rating it got.
 *
 * Overall is required; quality, timeliness and communication are optional, so
 * a quick tap of the stars still counts. Once sent, the client sees a thank-you
 * and never their scores again — the ratings are read by supervisors and above
 * (the API withholds them from everyone else).
 */

export type { SurveyScores };

const ASPECTS = [
  { key: "quality", label: "Quality of the work" },
  { key: "timeliness", label: "Timeliness" },
  { key: "communication", label: "Communication" },
] as const;

type AspectKey = (typeof ASPECTS)[number]["key"];

function Stars({
  value,
  onChange,
  label,
  size = "md",
}: {
  value: number | null;
  onChange?: (v: number) => void;
  label: string;
  size?: "md" | "sm";
}) {
  if (!onChange) {
    return (
      <span className={`tu-stars tu-stars-${size}`} role="img" aria-label={value ? `${label}: ${value} out of 5` : `${label}: not rated`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={value && n <= value ? "tu-star-on" : "tu-star-off"} aria-hidden="true">★</span>
        ))}
      </span>
    );
  }
  return (
    <span className={`tu-stars tu-stars-${size}`} role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} out of 5`}
          className={`tu-star-btn ${value && n <= value ? "tu-star-on" : "tu-star-off"}`}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

/** The client's form. `onDone` fires once the survey is saved. */
export function SurveyForm({ workOrderId, onDone }: { workOrderId: string; onDone: () => void }) {
  const [overall, setOverall] = useState<number | null>(null);
  const [aspects, setAspects] = useState<Record<AspectKey, number | null>>({ quality: null, timeliness: null, communication: null });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!overall || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/work-orders/${workOrderId}/survey`, { overall, ...aspects, comment: comment.trim() });
      onDone();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Couldn't send your feedback. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="tu-survey">
      <p className="tu-survey-title">How did we do?</p>
      <div className="tu-survey-row">
        <span className="tu-survey-label">Overall *</span>
        <Stars value={overall} onChange={setOverall} label="Overall" />
      </div>
      {ASPECTS.map((a) => (
        <div key={a.key} className="tu-survey-row">
          <span className="tu-survey-label">{a.label}</span>
          <Stars
            value={aspects[a.key]}
            onChange={(v) => setAspects((prev) => ({ ...prev, [a.key]: prev[a.key] === v ? null : v }))}
            label={a.label}
            size="sm"
          />
        </div>
      ))}
      <textarea
        className="tu-input"
        rows={2}
        maxLength={1000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Anything you'd like to tell us? (optional)"
        aria-label="Comment"
      />
      {error && <p role="alert" className="tu-survey-error">{error}</p>}
      <button type="button" className="tu-btn-primary tu-btn-sm" onClick={submit} disabled={!overall || busy}>
        {busy ? "Sending…" : "Send feedback"}
      </button>
    </div>
  );
}

/**
 * What the team did about a rating. Offered on every rating and asked for on a
 * low one: the low-rating alert is only useful if it gets an answer. May be
 * rewritten — the latest account is the one worth keeping.
 */
function FollowUp({ workOrderId, survey }: { workOrderId: string; survey: SurveyScores }) {
  const [saved, setSaved] = useState({
    note: survey.followUpNote ?? null, at: survey.followedUpAt ?? null, by: survey.followedUpByName ?? null,
  });
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const low = isLowRating(survey.overall);

  async function save() {
    if (!note.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.post(`/work-orders/${workOrderId}/survey/follow-up`, { note: note.trim() });
      setSaved({ note: res.data.followUpNote, at: res.data.followedUpAt, by: res.data.followedUpByName });
      setEditing(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error ?? "Couldn't save the follow-up.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="tu-survey-follow">
        <label className="tu-survey-label" htmlFor={`follow-${workOrderId}`}>What was done about it?</label>
        <textarea id={`follow-${workOrderId}`} className="tu-input" rows={2} maxLength={1000} autoFocus
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Called the client, resealed the valve, offered a revisit" />
        {error && <p role="alert" className="tu-survey-error">{error}</p>}
        <div className="tu-survey-follow-actions">
          <button type="button" className="tu-btn-primary tu-btn-sm" onClick={save} disabled={!note.trim() || busy}>
            {busy ? "Saving…" : "Save follow-up"}
          </button>
          <button type="button" className="tu-btn-ghost tu-btn-sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }
  if (saved.note) {
    return (
      <div className="tu-survey-follow">
        <p className="tu-survey-label">Follow-up</p>
        <p className="tu-survey-comment">{saved.note}</p>
        <p className="tu-survey-meta">
          {saved.by}{saved.at ? ` · ${new Date(saved.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}{" "}
          · <button type="button" className="tu-link-button" onClick={() => { setNote(saved.note ?? ""); setEditing(true); }}>Edit</button>
        </p>
      </div>
    );
  }
  return (
    <div className="tu-survey-follow">
      {low && <p className="tu-survey-attention">A low rating — record what was done about it.</p>}
      <button type="button" className={low ? "tu-btn-primary tu-btn-sm" : "tu-btn-ghost tu-btn-sm"} onClick={() => setEditing(true)}>
        Add follow-up
      </button>
    </div>
  );
}

/** What a supervisor or manager sees on the job. */
export function SurveyResult({ survey, workOrderId }: { survey: SurveyScores; workOrderId: string }) {
  return (
    <div className="tu-survey-result">
      <div className="tu-survey-row">
        <span className="tu-survey-label">Client rating</span>
        <Stars value={survey.overall} label="Overall" />
        <span className="tu-survey-score">{survey.overall}/5</span>
      </div>
      <p className="tu-survey-aspects">
        {ASPECTS.map((a) => `${a.label.replace(" of the work", "")} ${survey[a.key] ?? "—"}`).join(" · ")}
      </p>
      {survey.comment && <p className="tu-survey-comment">“{survey.comment}”</p>}
      <p className="tu-survey-meta">
        {survey.submittedByName} · {new Date(survey.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </p>
      <FollowUp workOrderId={workOrderId} survey={survey} />
    </div>
  );
}

export { Stars };
