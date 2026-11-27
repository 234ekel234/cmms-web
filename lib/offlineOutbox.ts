import api from "@/lib/api";
import { OUTBOX_STORE, openDb } from "@/lib/offlineData";
import { isPhotoFile, shrinkPhoto } from "@/lib/reportPhotos";

/**
 * Changes made without signal, kept on this device until they can be sent.
 *
 *   pmRound   a PM round, draft or submitted (release 2)
 *   step      a job's step ticked or unticked (release 3)
 *   comment   an update on a job, with or without photos (release 3)
 *   upload    a photo or file added to a job (release 3)
 *   jobAction start/resume, hold or complete a job; pause or resume its clock
 *             (release 4). The server checks the time against the job's own
 *             history and caps a stretch over 16 hours; one refused makes the
 *             later ones for that job fail too, since they followed from it.
 *
 * A form puts its change here when the save gets no answer; `syncOutbox` sends
 * everything, oldest first, when the signal comes back — on load, on the
 * browser's "online", and whenever a request reaches the server
 * (lib/offline.ts). Each goes with `doneAt`, the time it was made on the phone,
 * which the server bounds (backend helpers/offlineTime.js) and uses: a round's
 * lateness, a comment's and a photo's place in the job's history.
 *
 * What can go wrong on the way, and what happens:
 *   - still no signal         stays waiting; tried again later
 *   - someone else started    their draft and these answers are merged
 *     the same round          (`mergeAnswers`)
 *   - anything refused        never forced: the entry is marked "couldn't send"
 *     (round already filed,   with the server's reason, for the person to open
 *     step deleted, job       or discard — a comment's words stay readable so
 *     reassigned…)            they can be copied
 *
 * Entries belong to the person who made them and survive a lapsed session (so
 * signing in again sends them); signing out on purpose asks first (AuthContext).
 * Photos are shrunk before they are kept (as report photos are), so a day of
 * pictures does not fill the phone.
 */

export type OutboxItem = { itemId: string; answer: string; remarks: string | null };
export type OutboxFile = { name: string; type: string; blob: Blob };

type Base = {
  id: string;
  userId: string;
  /** What it is, for the offline bar: "Fire pump weekly", "Update on WO-1042". */
  label: string;
  /** Where to open it. */
  href: string;
  doneAt: string; // ISO, from this device
  queuedAt: number;
  status: "waiting" | "failed";
  error?: string;
};

export type OutboxRound = Base & {
  kind: "pmRound";
  accountId: string;
  assignmentId: string;
  checklistName: string;
  periodStart: string; // YYYY-MM-DD
  logId: string | null; // the draft being continued, when there was one
  items: OutboxItem[];
  isDraft: boolean;
};
export type OutboxStep = Base & { kind: "step"; workOrderId: string; itemId: string; isDone: boolean };
export type OutboxComment = Base & { kind: "comment"; workOrderId: string; body: string; internal: boolean; files: OutboxFile[] };
/** `parent` is the attachment route's segment: "work-orders", "assets", "asset-locations"… */
export type OutboxUpload = Base & { kind: "upload"; parent: string; parentId: string; file: OutboxFile };
export type OutboxJobAction = Base & {
  kind: "jobAction";
  workOrderId: string;
  /** A status move (PATCH) or the clock's own buttons (POST /timer). */
  move:
    | { type: "status"; status: "IN_PROGRESS" | "ON_HOLD" | "COMPLETED"; reason?: string; remarks?: string }
    | { type: "timer"; action: "pause" | "resume"; reason?: string };
};
export type OutboxEntry = OutboxRound | OutboxStep | OutboxComment | OutboxUpload | OutboxJobAction;

export const OUTBOX_EVENT = "hanni:outbox";
const notify = () => typeof window !== "undefined" && window.dispatchEvent(new Event(OUTBOX_EVENT));

export const roundKey = (userId: string, assignmentId: string, periodStart: string) =>
  `${userId}|pm|${assignmentId}|${periodStart}`;
const newId = (userId: string, kind: string) =>
  `${userId}|${kind}|${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

async function store<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(OUTBOX_STORE, mode);
      const req = run(t.objectStore(OUTBOX_STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function put(entry: OutboxEntry): Promise<boolean> {
  if (!(await openDb())) return false;
  await store("readwrite", (s) => s.put(entry));
  notify();
  return true;
}

export async function listOutbox(userId: string): Promise<OutboxEntry[]> {
  const all = (await store<OutboxEntry[]>("readonly", (s) => s.getAll())) ?? [];
  return all
    .filter((e) => e.userId === userId)
    // Rows from before release 3 carry no kind/label; they were all rounds.
    .map((e) => (e.kind ? e : ({ ...(e as OutboxRound), kind: "pmRound" } as OutboxRound)))
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

export const roundsOf = (rows: OutboxEntry[]) => rows.filter((r): r is OutboxRound => r.kind === "pmRound");
export const forJob = (rows: OutboxEntry[], workOrderId: string) =>
  rows.filter((r) => (r.kind === "step" || r.kind === "comment" || r.kind === "jobAction") ? r.workOrderId === workOrderId : r.kind === "upload" && r.parent === "work-orders" && r.parentId === workOrderId);
export const uploadsFor = (rows: OutboxEntry[], parent: string, parentId: string) =>
  rows.filter((r): r is OutboxUpload => r.kind === "upload" && r.parent === parent && r.parentId === parentId);

/** What the offline bar and the badges call it. */
export const entryLabel = (e: OutboxEntry) => e.label ?? (e.kind === "pmRound" ? e.checklistName : "A change");
export const entryHref = (e: OutboxEntry) =>
  e.href ?? (e.kind === "pmRound" ? `/accounts/${e.accountId}/checklists/${e.assignmentId}?period=${e.periodStart}` : "/today");

// ── Putting changes in ──────────────────────────────────────────────────────
// Each returns false when this device cannot keep it (no IndexedDB): the
// caller must then say the save failed, as it did before there was an outbox.

export async function queueRound(entry: Omit<OutboxRound, "id" | "kind" | "queuedAt" | "status" | "error" | "label" | "href">): Promise<boolean> {
  return put({
    ...entry,
    id: roundKey(entry.userId, entry.assignmentId, entry.periodStart),
    kind: "pmRound",
    label: entry.checklistName,
    href: `/accounts/${entry.accountId}/checklists/${entry.assignmentId}?period=${entry.periodStart}`,
    queuedAt: Date.now(),
    status: "waiting",
  });
}

/** A step ticked or unticked. The latest wins: ticking twice offline sends one change. */
export async function queueStep(e: { userId: string; workOrderId: string; itemId: string; isDone: boolean; label: string; href: string }): Promise<boolean> {
  return put({
    ...e,
    id: `${e.userId}|step|${e.workOrderId}|${e.itemId}`,
    kind: "step",
    doneAt: new Date().toISOString(),
    queuedAt: Date.now(),
    status: "waiting",
  });
}

async function keepFile(f: File): Promise<OutboxFile> {
  const kept = isPhotoFile(f) ? await shrinkPhoto(f).catch(() => f) : f;
  return { name: kept.name, type: kept.type || f.type, blob: kept };
}

export async function queueComment(e: { userId: string; workOrderId: string; body: string; internal: boolean; files: File[]; label: string; href: string }): Promise<boolean> {
  const files = await Promise.all(e.files.map(keepFile));
  return put({
    userId: e.userId, workOrderId: e.workOrderId, body: e.body, internal: e.internal, files, label: e.label, href: e.href,
    id: newId(e.userId, "comment"),
    kind: "comment",
    doneAt: new Date().toISOString(),
    queuedAt: Date.now(),
    status: "waiting",
  });
}

export async function queueUpload(e: { userId: string; parent: string; parentId: string; file: File; label: string; href: string }): Promise<boolean> {
  return put({
    userId: e.userId, parentId: e.parentId, parent: e.parent, file: await keepFile(e.file), label: e.label, href: e.href,
    id: newId(e.userId, "upload"),
    kind: "upload",
    doneAt: new Date().toISOString(),
    queuedAt: Date.now(),
    status: "waiting",
  });
}

export async function queueJobAction(e: { userId: string; workOrderId: string; move: OutboxJobAction["move"]; label: string; href: string }): Promise<boolean> {
  return put({
    ...e,
    id: newId(e.userId, "job"),
    kind: "jobAction",
    doneAt: new Date().toISOString(),
    queuedAt: Date.now(),
    status: "waiting",
  });
}

/** "Started", "Paused: waiting for a gasket"… for the notices. */
export function describeMove(m: OutboxJobAction["move"]): string {
  if (m.type === "timer") return m.action === "pause" ? `Paused the clock${m.reason ? `: ${m.reason}` : ""}` : "Resumed the clock";
  if (m.status === "IN_PROGRESS") return "Started";
  if (m.status === "ON_HOLD") return `Put on hold${m.reason ? `: ${m.reason}` : ""}`;
  return "Completed";
}

type ProjectedOrder = {
  status: string;
  timerStartedAt: string | null;
  actualSeconds: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  remarks?: string | null;
  openPause?: { reason: string; kind?: string; pausedAt?: string } | null;
};

/**
 * The job as it will be once the waiting moves land, so a technician can start,
 * pause, resume and complete in a row with no signal and see each step take.
 * Mirrors what the API does with them (backend workOrderRoutes, timer and
 * status), minus the 16-hour cap, which only the server applies.
 */
export function projectJob<T extends ProjectedOrder>(order: T, entries: OutboxEntry[]): T {
  const moves = entries.filter((e): e is OutboxJobAction => e.kind === "jobAction" && e.status === "waiting");
  if (!moves.length) return order;
  let o: T = { ...order };
  const bank = (at: string) => {
    if (!o.timerStartedAt) return;
    const secs = Math.max(0, Math.floor((Date.parse(at) - Date.parse(o.timerStartedAt)) / 1000));
    o = { ...o, actualSeconds: (o.actualSeconds ?? 0) + secs, timerStartedAt: null };
  };
  for (const e of moves) {
    const m = e.move;
    if (m.type === "timer") {
      if (m.action === "pause") { bank(e.doneAt); o = { ...o, openPause: { reason: m.reason ?? "", kind: "CLOCK", pausedAt: e.doneAt } }; }
      else if (!o.timerStartedAt) o = { ...o, timerStartedAt: e.doneAt, openPause: null };
    } else if (m.status === "IN_PROGRESS") {
      o = { ...o, status: "IN_PROGRESS", startedAt: o.startedAt ?? e.doneAt, openPause: null, timerStartedAt: o.timerStartedAt ?? e.doneAt };
    } else if (m.status === "ON_HOLD") {
      bank(e.doneAt);
      o = { ...o, status: "ON_HOLD", openPause: { reason: m.reason ?? "", kind: "HOLD", pausedAt: e.doneAt } };
    } else {
      bank(e.doneAt);
      o = { ...o, status: "COMPLETED", completedAt: e.doneAt, remarks: m.remarks ?? o.remarks ?? null, openPause: null };
    }
  }
  return o;
}

export async function discardQueued(id: string): Promise<void> {
  await store("readwrite", (s) => s.delete(id));
  notify();
}

export async function discardAllQueued(userId: string): Promise<void> {
  for (const e of await listOutbox(userId)) await store("readwrite", (s) => s.delete(e.id));
  notify();
}

// ── Sending ─────────────────────────────────────────────────────────────────

type ApiError = { response?: { status: number; data?: { error?: string; logId?: string } }; isAxiosError?: boolean };
type Outcome = "sent" | "offline" | "failed";

let syncing: Promise<void> | null = null;

/** Sends what is waiting, oldest first. Stops at the first sign there is still no signal. */
export function syncOutbox(userId: string): Promise<void> {
  syncing ??= (async () => {
    try {
      // A job whose earlier move was refused: its later moves followed from
      // that one ("paused" after a "started" that never happened), so they are
      // not sent either.
      const brokenJobs = new Set<string>();
      for (const entry of await listOutbox(userId)) {
        if (entry.kind === "jobAction" && entry.status === "failed") brokenJobs.add(entry.workOrderId);
        if (entry.status === "failed") continue;
        if (entry.kind === "jobAction" && brokenJobs.has(entry.workOrderId)) {
          await fail(entry, "An earlier change to this job made on this phone couldn't be sent, so this one wasn't either.");
          continue;
        }
        const outcome = await send(entry);
        if (outcome === "offline") break;
        if (outcome === "failed" && entry.kind === "jobAction") brokenJobs.add(entry.workOrderId);
      }
    } finally {
      syncing = null;
      notify();
    }
  })();
  return syncing;
}

async function send(entry: OutboxEntry): Promise<Outcome> {
  try {
    switch (entry.kind) {
      case "pmRound": return await sendRound(entry);
      case "step":
        await api.patch(`/work-orders/${entry.workOrderId}/checklist-items/${entry.itemId}`, { isDone: entry.isDone });
        break;
      case "comment": {
        if (entry.files.length) {
          const form = new FormData();
          if (entry.body) form.append("body", entry.body);
          if (entry.internal) form.append("internal", "true");
          form.append("doneAt", entry.doneAt);
          for (const f of entry.files) form.append("files", new File([f.blob], f.name, { type: f.type }));
          await api.post(`/work-orders/${entry.workOrderId}/comments`, form);
        } else {
          await api.post(`/work-orders/${entry.workOrderId}/comments`, { body: entry.body, internal: entry.internal, doneAt: entry.doneAt });
        }
        break;
      }
      case "jobAction": {
        const m = entry.move;
        if (m.type === "timer") {
          await api.post(`/work-orders/${entry.workOrderId}/timer`, { action: m.action, reason: m.reason, doneAt: entry.doneAt });
        } else {
          await api.patch(`/work-orders/${entry.workOrderId}`, { status: m.status, reason: m.reason, remarks: m.remarks, doneAt: entry.doneAt });
        }
        break;
      }
      case "upload": {
        const form = new FormData();
        form.append("file", new File([entry.file.blob], entry.file.name, { type: entry.file.type }));
        form.append("doneAt", entry.doneAt);
        await api.post(`/${entry.parent}/${entry.parentId}/attachments`, form);
        break;
      }
    }
    await discardQueued(entry.id);
    return "sent";
  } catch (err) {
    const e = err as ApiError;
    if (!e.response) return "offline";
    const reason = e.response.status === 404
      ? (entry.kind === "step" ? "This step was removed while you were offline." : "This job is no longer yours or no longer exists.")
      : e.response.data?.error ?? "The server refused this change.";
    await fail(entry, reason);
    return "failed";
  }
}

async function sendRound(entry: OutboxRound): Promise<Outcome> {
  const base = `/account-pm-checklists/${entry.assignmentId}/logs`;
  const body = { items: entry.items, isDraft: entry.isDraft, doneAt: entry.doneAt };
  try {
    if (entry.logId) await api.put(`${base}/${entry.logId}`, body);
    else await api.post(base, { ...body, scheduledDate: entry.periodStart });
    await discardQueued(entry.id);
    return "sent";
  } catch (err) {
    const e = err as ApiError;
    if (!e.response) return "offline";
    // Someone started this round while we were offline: continue their draft
    // with these answers merged in, rather than failing.
    if (e.response.status === 409 && e.response.data?.logId && !entry.logId) {
      return mergeIntoDraft(entry, e.response.data.logId);
    }
    await fail(entry, e.response.data?.error ?? "The server refused this round.");
    return "failed";
  }
}

async function mergeIntoDraft(entry: OutboxRound, logId: string): Promise<Outcome> {
  try {
    const { data: logs } = await api.get<{ id: string; isDraft: boolean; items: OutboxItem[] }[]>(`/account-pm-checklists/${entry.assignmentId}/logs`);
    const current = logs.find((l) => l.id === logId);
    if (!current || !current.isDraft) {
      await fail(entry, "Someone else submitted this round while you were offline, so your answers weren't sent. Open it to see what was filed.");
      return "failed";
    }
    const merged = mergeAnswers(current.items, entry.items);
    await api.put(`/account-pm-checklists/${entry.assignmentId}/logs/${logId}`, { items: merged, isDraft: entry.isDraft, doneAt: entry.doneAt });
    await discardQueued(entry.id);
    return "sent";
  } catch (err) {
    const e = err as ApiError;
    if (!e.response) return "offline";
    await fail(entry, e.response.data?.error ?? "The server refused this round.");
    return "failed";
  }
}

/**
 * Someone else's draft plus the answers saved on this phone: every question
 * either of them answered, this phone's answer winning where both did (it is
 * the one being sent now, by the person sending it). Nothing of theirs is
 * dropped — the server deletes whatever a save leaves out.
 */
export function mergeAnswers(theirs: OutboxItem[], mine: OutboxItem[]): OutboxItem[] {
  const ours = new Set(mine.map((i) => i.itemId));
  return [
    ...theirs.filter((i) => !ours.has(i.itemId)).map((i) => ({ itemId: i.itemId, answer: i.answer, remarks: i.remarks ?? null })),
    ...mine,
  ];
}

async function fail(entry: OutboxEntry, error: string) {
  await store("readwrite", (s) => s.put({ ...entry, status: "failed", error }));
  notify();
}
