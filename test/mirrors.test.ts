import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { WorkOrderStatus } from "@/lib/statuses";
import { STAFF_TRANSITIONS, isClosed, needsClientApproval, isSettled } from "@/lib/workOrders";
import { DEFAULT_DUE_DAYS } from "@/lib/dueDates";
import { getPeriodStart, pmSchedule } from "@/lib/pmPeriod";
import { pmControlNumber } from "@/lib/pmControlNumber";
import { MAX_REPORT_PHOTOS } from "@/lib/reportPhotos";

/**
 * The web copies of backend rules, checked against the backend itself.
 * Runs where the backend sits beside the web folder (a developer's checkout);
 * CI checks out the web repo alone, so it skips there.
 */
const backend = fileURLToPath(new URL("../../backend/helpers/", import.meta.url));
const here = existsSync(`${backend}workOrderApproval.js`);
const load = (f: string) => import(/* @vite-ignore */ `${backend}${f}`);

const ALL: WorkOrderStatus[] = ["REQUESTED", "PENDING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "APPROVED", "REJECTED"];

describe.skipIf(!here)("web mirrors agree with the backend", () => {
  it("work-order transitions, closed and settled", async () => {
    const api = await load("workOrderApproval.js");
    for (const status of ALL) {
      for (const shape of [{ type: "INTERNAL" }, { type: "EXTERNAL" }, { type: "INTERNAL", isSpecialProject: true }]) {
        const wo = { ...shape, status, verifiedAt: "2026-11-01T00:00:00Z" };
        // Staff are offered the server's moves, less the two out of COMPLETED
        // that have their own controls (approve, send back).
        const server = (api.allowedTransitions(wo) as string[]).filter(() => status !== "COMPLETED");
        expect(STAFF_TRANSITIONS[status], `${status} ${JSON.stringify(shape)}`).toEqual(server);
        expect(needsClientApproval(wo)).toBe(api.needsClientApproval(wo));
        expect(isSettled(wo)).toBe(api.isSettled(wo));
      }
      expect(isClosed({ status })).toBe((api.CLOSED_STATUSES as string[]).includes(status));
    }
  });

  it("photos per problem report", async () => {
    expect(MAX_REPORT_PHOTOS).toBe((await load("publicReports.js")).MAX_PHOTOS_PER_SEND);
  });

  it("default due days", async () => {
    expect(DEFAULT_DUE_DAYS).toEqual((await load("dueDates.js")).DEFAULT_DUE_DAYS);
  });

  it("PM periods, calendar and every-N-days, over two years of days", async () => {
    const api = await load("pmPeriod.js");
    const schedules = [
      ...["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "SEMI_ANNUALLY", "ANNUALLY"].map((f) => pmSchedule({ frequency: f })),
      pmSchedule({ frequency: "CUSTOM_DAYS", intervalDays: 10 }, { startDate: "2026-03-07T00:00:00Z" }),
      pmSchedule({ frequency: "CUSTOM_DAYS", intervalDays: 45 }, { startDate: "2025-12-30T00:00:00Z" }),
    ];
    for (let t = Date.UTC(2026, 0, 1, 4); t < Date.UTC(2028, 0, 1); t += 86_400_000) {
      const d = new Date(t);
      for (const s of schedules) {
        expect(getPeriodStart(s, d).toISOString(), `${s.frequency}/${s.intervalDays} on ${d.toISOString()}`)
          .toBe(new Date(api.getPeriodStart(s, d)).toISOString());
      }
    }
  });

  it("PM control numbers", async () => {
    const api = await load("pmControlNumber.js");
    const log = { number: 7, createdAt: "2026-12-31T20:00:00Z" };
    expect(pmControlNumber(log)).toBe(api.pmControlNumber({ ...log, createdAt: new Date(log.createdAt) }));
  });
});
