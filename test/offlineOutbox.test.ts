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
