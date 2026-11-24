import { describe, expect, it } from "vitest";
import type { WorkOrderStatus } from "@/lib/statuses";
import {
  STAFF_TRANSITIONS, awaitingClient, awaitingReview, canSendBack, isCancellation, isClosed, isOverdue, isSettled,
  matchesWorkOrderRef, needsClientApproval, needsReason, openStepsNote, passesFilters, possibleDuplicates,
  rejectWords, signOffCue, stageNote, surveyable, transitionLabel, triageRank, workOrderRef, batchPrintHref, MAX_BATCH_PRINT,
} from "@/lib/workOrders";

const ALL: WorkOrderStatus[] = ["REQUESTED", "PENDING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "APPROVED", "REJECTED"];
const internal = { type: "INTERNAL" };
const external = { type: "EXTERNAL" };
const past = new Date(Date.now() - 86_400_000).toISOString();
const future = new Date(Date.now() + 86_400_000).toISOString();

describe("who signs work off", () => {
  it("is the client for their own requests and special projects only", () => {
    expect(needsClientApproval(external)).toBe(true);
    expect(needsClientApproval({ type: "INTERNAL", isSpecialProject: true })).toBe(true);
    expect(needsClientApproval(internal)).toBe(false);
  });

  it("reviews before the client sees it", () => {
    const done = { ...external, status: "COMPLETED" as const };
    expect(awaitingReview(done)).toBe(true);
    expect(awaitingClient(done)).toBe(false);
    const verified = { ...done, verifiedAt: past };
    expect(awaitingReview(verified)).toBe(false);
    expect(awaitingClient(verified)).toBe(true);
    expect(signOffCue(verified, true)).toBe("Awaiting your sign-off");
    expect(signOffCue(verified, false)).toBe("Awaiting client sign-off");
    expect(signOffCue({ ...internal, status: "COMPLETED", verifiedAt: past }, false)).toBeNull();
  });

  it("settles internal work once verified, client work once approved, rejected work never", () => {
    expect(isSettled({ ...internal, status: "COMPLETED" })).toBe(false);
    expect(isSettled({ ...internal, status: "COMPLETED", verifiedAt: past })).toBe(true);
    expect(isSettled({ ...external, status: "COMPLETED", verifiedAt: past })).toBe(false);
    expect(isSettled({ ...external, status: "APPROVED" })).toBe(true);
    expect(isSettled({ ...internal, status: "REJECTED" })).toBe(false);
  });

  it("lets a client rate only signed-off work of theirs", () => {
    expect(surveyable({ ...external, status: "APPROVED" })).toBe(true);
    expect(surveyable({ ...internal, status: "APPROVED" })).toBe(false);
    expect(surveyable({ ...external, status: "COMPLETED", verifiedAt: past })).toBe(false);
  });
});

describe("closed and overdue", () => {
  it("counts completed, approved and rejected as closed — the server's CLOSED_STATUSES", () => {
    expect(ALL.filter((s) => isClosed({ status: s }))).toEqual(["COMPLETED", "APPROVED", "REJECTED"]);
  });

  it("is overdue only when open and past the due date", () => {
    expect(isOverdue({ status: "IN_PROGRESS", dueDate: past })).toBe(true);
    expect(isOverdue({ status: "IN_PROGRESS", dueDate: future })).toBe(false);
    expect(isOverdue({ status: "IN_PROGRESS", dueDate: null })).toBe(false);
    // Waiting on a slow client is not the technician running late.
    expect(isOverdue({ status: "COMPLETED", dueDate: past })).toBe(false);
    expect(isOverdue({ status: "REJECTED", dueDate: past })).toBe(false);
  });

  it("ranks open work first, then work parked with the client, then finished work", () => {
    expect(triageRank({ ...internal, status: "IN_PROGRESS" })).toBe(0);
    expect(triageRank({ ...external, status: "COMPLETED", verifiedAt: past })).toBe(1);
    expect(triageRank({ ...internal, status: "APPROVED" })).toBe(2);
    expect(triageRank({ ...internal, status: "REJECTED" })).toBe(2);
  });
});

describe("filters", () => {
  const late = { ...external, status: "COMPLETED" as const, dueDate: past, verifiedAt: past };
  const lateOpen = { ...internal, status: "IN_PROGRESS" as const, dueDate: past };

  it("narrows nothing when both axes are empty", () => {
    expect(passesFilters(late, new Set(), new Set())).toBe(true);
  });

  it("ANDs status and flags, and the flags with each other", () => {
    expect(passesFilters(lateOpen, new Set(["IN_PROGRESS"]), new Set(["OVERDUE"]))).toBe(true);
    expect(passesFilters(lateOpen, new Set(["PENDING"]), new Set(["OVERDUE"]))).toBe(false);
    expect(passesFilters(late, new Set(), new Set(["AWAITING"]))).toBe(true);
    expect(passesFilters(late, new Set(), new Set(["AWAITING", "OVERDUE"]))).toBe(false);
    expect(passesFilters({ ...internal, status: "COMPLETED", dueDate: null }, new Set(), new Set(["REVIEW"]))).toBe(true);
  });
});

describe("transitions offered to staff", () => {
  it("offers nothing out of a finished job — approving and sending back have their own controls", () => {
    expect(STAFF_TRANSITIONS.COMPLETED).toEqual([]);
    expect(STAFF_TRANSITIONS.APPROVED).toEqual([]);
    expect(STAFF_TRANSITIONS.REJECTED).toEqual([]);
  });

  it("names a move by where it comes from", () => {
    expect(transitionLabel("REQUESTED", "PENDING")).toBe("Accept");
    expect(transitionLabel("IN_PROGRESS", "PENDING")).toBe("Revert to Accepted");
    expect(transitionLabel("PENDING", "IN_PROGRESS")).toBe("Start work");
    expect(transitionLabel("ON_HOLD", "IN_PROGRESS")).toBe("Resume work");
    expect(transitionLabel("REQUESTED", "REJECTED")).toBe("Reject");
    expect(transitionLabel("PENDING", "REJECTED")).toBe("Cancel job");
  });

  it("asks why for hold and reject", () => {
    expect(ALL.filter(needsReason)).toEqual(["ON_HOLD", "REJECTED"]);
  });

  it("lets supervisors send any completed job back, a client only their own, a technician never", () => {
    const done = { ...internal, status: "COMPLETED" as const };
    expect(canSendBack("SUPERVISOR", done)).toBe(true);
    expect(canSendBack("TECHNICIAN", done)).toBe(false);
    expect(canSendBack("CLIENT", done)).toBe(false);
    expect(canSendBack("CLIENT", { ...external, status: "COMPLETED" })).toBe(true);
    expect(canSendBack("MANAGER", { ...internal, status: "IN_PROGRESS" })).toBe(false);
  });
});

describe("rejected or cancelled", () => {
  it("is a cancellation once the job had been accepted", () => {
    expect(isCancellation({ acceptedAt: past })).toBe(true);
    expect(isCancellation({ acceptedAt: null })).toBe(false);
    expect(rejectWords({ acceptedAt: past }).action).toBe("Cancel job");
    expect(rejectWords({}).action).toBe("Reject");
  });
});

describe("stage note", () => {
  it("says whose move it is", () => {
    expect(stageNote({ status: "PENDING", assignments: [] }, false)).toEqual({ text: "Accepted — nobody assigned yet", attention: true });
    expect(stageNote({ status: "PENDING", assignments: [{ employee: { name: "A" } }] }, false).text).toBe("Ready to start");
    expect(stageNote({ status: "IN_PROGRESS", openPause: { reason: "Waiting on parts" } }, false).text).toBe("Paused — Waiting on parts");
    expect(stageNote({ status: "ON_HOLD", openPause: { reason: "Leak not fixed", kind: "SENT_BACK" } }, false).text).toBe("Sent back — Leak not fixed");
  });

  it("never tells a client about the clock", () => {
    expect(stageNote({ status: "IN_PROGRESS", openPause: { reason: "Lunch" } }, true).text).toBe("Work under way");
  });

  it("counts down an unanswered sign-off", () => {
    const now = Date.UTC(2026, 10, 10);
    const wo = { ...external, status: "COMPLETED" as const, verifiedAt: "x", autoApproveAt: new Date(now + 2.5 * 86_400_000).toISOString() };
    expect(stageNote(wo, false, now).text).toBe("Waiting for client sign-off — closes automatically in 3 days");
    expect(stageNote({ ...wo, autoApproveAt: new Date(now - 1).toISOString() }, true, now).text)
      .toBe("Waiting for your sign-off — closes automatically at the next daily run");
  });

  it("tells a sweep's close from a client's", () => {
    expect(stageNote({ status: "APPROVED", approvedById: null }, false).text).toBe("Closed automatically — no client response");
    expect(stageNote({ status: "APPROVED", approvedById: "u", approvedByName: "Dana" }, false).text).toBe("Signed off by Dana");
  });
});

describe("open steps", () => {
  it("says nothing when every step is ticked", () => {
    expect(openStepsNote([{ isDone: true }], "complete")).toBeNull();
    expect(openStepsNote(undefined, "review")).toBeNull();
  });

  it("counts what is left", () => {
    expect(openStepsNote([{ isDone: false }, { isDone: true }], "review")).toBe("1 of 2 steps isn't ticked on this job. Check the remarks before verifying.");
  });
});

describe("references", () => {
  it("formats and recognises WO numbers in the forms people type", () => {
    expect(workOrderRef(1042)).toBe("WO-1042");
    for (const q of ["1042", "#1042", "wo-1042", "WO 1042", " WO1042 "]) expect(matchesWorkOrderRef(1042, q)).toBe(true);
    expect(matchesWorkOrderRef(1042, "104")).toBe(false);
    expect(matchesWorkOrderRef(undefined, "1042")).toBe(false);
  });

  it("caps a batch print", () => {
    const ids = Array.from({ length: MAX_BATCH_PRINT + 5 }, (_, i) => `id${i}`);
    expect(batchPrintHref(ids).split(",")).toHaveLength(MAX_BATCH_PRINT);
  });
});

describe("possible duplicates", () => {
  const orders = [
    { status: "IN_PROGRESS" as const, title: "Chiller tripped on Tower A", asset: { id: "ch1" } },
    { status: "PENDING" as const, title: "Water leaking from ceiling in lobby", asset: null },
    { status: "APPROVED" as const, title: "Water leaking from ceiling", asset: { id: "ch1" } },
  ];

  it("matches the same asset first, ignoring closed jobs", () => {
    expect(possibleDuplicates(orders, { assetId: "ch1" }).map((o) => o.title)).toEqual(["Chiller tripped on Tower A"]);
  });

  it("falls back to two shared title words", () => {
    expect(possibleDuplicates(orders, { title: "Ceiling leaking again" }).map((o) => o.title)).toEqual(["Water leaking from ceiling in lobby"]);
    expect(possibleDuplicates(orders, { title: "Leaking tap" })).toEqual([]);
  });
});
