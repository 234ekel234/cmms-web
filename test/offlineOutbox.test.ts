import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: {} }));
const { mergeAnswers } = await import("@/lib/offlineOutbox");

describe("mergeAnswers", () => {
  const a = (itemId: string, answer: string, remarks: string | null = null) => ({ itemId, answer, remarks });

  it("keeps every answer from the other person's draft that this phone did not give", () => {
    const merged = mergeAnswers([a("q1", "OK"), a("q2", "OK", "checked")], [a("q3", "NOT OK")]);
    expect(merged).toEqual([a("q1", "OK"), a("q2", "OK", "checked"), a("q3", "NOT OK")]);
  });

  it("uses this phone's answer where both answered the same question", () => {
    expect(mergeAnswers([a("q1", "OK")], [a("q1", "NOT OK", "leak")])).toEqual([a("q1", "NOT OK", "leak")]);
  });

  it("drops nothing when the draft is empty", () => {
    expect(mergeAnswers([], [a("q1", "OK")])).toEqual([a("q1", "OK")]);
  });
});

const { projectJob } = await import("@/lib/offlineOutbox");

describe("projectJob", () => {
  const base = { status: "PENDING", timerStartedAt: null as string | null, actualSeconds: 0, startedAt: null as string | null, completedAt: null as string | null, remarks: null as string | null, openPause: null };
  const move = (doneAt: string, m: object, status: "waiting" | "failed" = "waiting") =>
    ({ id: doneAt, userId: "u", label: "", href: "", doneAt, queuedAt: Date.parse(doneAt), status, kind: "jobAction", workOrderId: "w", move: m }) as never;

  it("start, pause, resume, complete: the clock counts only the running stretches", () => {
    const out = projectJob(base, [
      move("2026-11-27T01:00:00Z", { type: "status", status: "IN_PROGRESS" }),
      move("2026-11-27T02:00:00Z", { type: "timer", action: "pause", reason: "gasket" }),
      move("2026-11-27T02:30:00Z", { type: "timer", action: "resume" }),
      move("2026-11-27T03:00:00Z", { type: "status", status: "COMPLETED", remarks: "done" }),
    ]);
    expect(out.status).toBe("COMPLETED");
    expect(out.actualSeconds).toBe(5400);
    expect(out.timerStartedAt).toBeNull();
    expect(out.startedAt).toBe("2026-11-27T01:00:00Z");
    expect(out.completedAt).toBe("2026-11-27T03:00:00Z");
    expect(out.remarks).toBe("done");
  });

  it("a hold stops the clock and carries its reason", () => {
    const out = projectJob({ ...base, status: "IN_PROGRESS", timerStartedAt: "2026-11-27T01:00:00Z" }, [
      move("2026-11-27T01:20:00Z", { type: "status", status: "ON_HOLD", reason: "parts" }),
    ]);
    expect(out.status).toBe("ON_HOLD");
    expect(out.actualSeconds).toBe(1200);
    expect(out.openPause).toMatchObject({ reason: "parts", kind: "HOLD" });
  });

  it("ignores moves that failed to send, and leaves the job alone with none waiting", () => {
    expect(projectJob(base, [move("2026-11-27T01:00:00Z", { type: "status", status: "IN_PROGRESS" }, "failed")])).toBe(base);
    expect(projectJob(base, [])).toBe(base);
  });
});
