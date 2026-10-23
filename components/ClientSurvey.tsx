"use client";

import { useState } from "react";
import api from "@/lib/api";
import type { SurveyScores } from "@/lib/workOrders";

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

/** What a supervisor or manager sees on the job. */
export function SurveyResult({ survey }: { survey: SurveyScores }) {
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
    </div>
  );
}

export { Stars };
