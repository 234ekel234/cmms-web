import api from "@/lib/api";
import { OUTBOX_STORE, openDb } from "@/lib/offlineData";

/**
 * Changes made without signal, kept on this device until they can be sent
 * (offline release 2: PM rounds). The checklist form puts a round here when its
 * save gets no answer; `syncOutbox` sends it when the signal comes back — on
 * load, on the browser's "online", and whenever a request reaches the server.
 *
 * Each round goes with `doneAt`, the time it was saved on the phone, so the
 * server judges lateness by when the work was done (backend
 * helpers/offlineTime.js, which also bounds that time).
 *
 * What can go wrong on the way, and what happens:
 *   - still no signal       stays waiting; tried again later
 *   - someone else started  their draft and these answers are merged (theirs
 *     the same round        kept, these added or winning where both answered)
 *   - already submitted     never overwritten: it is marked "couldn't send"
 *     by someone else       with the reason, for the person to open or discard
 *   - any other refusal     marked "couldn't send" with the server's reason
 *
 * One entry per round per period: saving the same round again offline
 * replaces the waiting copy. Entries belong to the person who made them and
 * survive a lapsed session (so signing in again sends them); signing out on
 * purpose asks first (AuthContext).
 */

export type OutboxItem = { itemId: string; answer: string; remarks: string | null };

export type OutboxRound = {
  id: string; // `${userId}|pm|${assignmentId}|${periodStart}`
  kind: "pmRound";
  userId: string;
  accountId: string;
  assignmentId: string;
  checklistName: string;
  periodStart: string; // YYYY-MM-DD
  logId: string | null; // the draft being continued, when there was one
  items: OutboxItem[];
  isDraft: boolean;
  doneAt: string; // ISO, from this device
  queuedAt: number;
  status: "waiting" | "failed";
  error?: string;
};

export const OUTBOX_EVENT = "hanni:outbox";
const notify = () => typeof window !== "undefined" && window.dispatchEvent(new Event(OUTBOX_EVENT));

export const roundKey = (userId: string, assignmentId: string, periodStart: string) =>
  `${userId}|pm|${assignmentId}|${periodStart}`;

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

export async function listOutbox(userId: string): Promise<OutboxRound[]> {
  const all = (await store<OutboxRound[]>("readonly", (s) => s.getAll())) ?? [];
  return all.filter((e) => e.userId === userId).sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function getQueuedRound(userId: string, assignmentId: string, periodStart: string): Promise<OutboxRound | null> {
  return (await store<OutboxRound>("readonly", (s) => s.get(roundKey(userId, assignmentId, periodStart)))) ?? null;
}

/** False when this device cannot keep it (no IndexedDB): the caller must say the save failed. */
export async function queueRound(entry: Omit<OutboxRound, "id" | "kind" | "queuedAt" | "status" | "error">): Promise<boolean> {
  if (!(await openDb())) return false;
  const row: OutboxRound = { ...entry, id: roundKey(entry.userId, entry.assignmentId, entry.periodStart), kind: "pmRound", queuedAt: Date.now(), status: "waiting" };
  await store("readwrite", (s) => s.put(row));
  notify();
  return true;
}

export async function discardQueued(id: string): Promise<void> {
  await store("readwrite", (s) => s.delete(id));
  notify();
}

export async function discardAllQueued(userId: string): Promise<void> {
  for (const e of await listOutbox(userId)) await store("readwrite", (s) => s.delete(e.id));
  notify();
}

type ApiError = { response?: { status: number; data?: { error?: string; logId?: string } }; isAxiosError?: boolean };

let syncing: Promise<void> | null = null;

/** Sends what is waiting, oldest first. Stops at the first sign there is still no signal. */
export function syncOutbox(userId: string): Promise<void> {
  syncing ??= (async () => {
    try {
      for (const entry of await listOutbox(userId)) {
        if (entry.status === "failed") continue;
        const outcome = await sendRound(entry);
        if (outcome === "offline") break;
      }
    } finally {
      syncing = null;
      notify();
    }
  })();
  return syncing;
}

async function sendRound(entry: OutboxRound): Promise<"sent" | "offline" | "failed"> {
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

async function mergeIntoDraft(entry: OutboxRound, logId: string): Promise<"sent" | "offline" | "failed"> {
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

async function fail(entry: OutboxRound, error: string) {
  await store("readwrite", (s) => s.put({ ...entry, status: "failed", error }));
  notify();
}
