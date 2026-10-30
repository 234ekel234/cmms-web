// A site's profile: labels and shapes for the page at /accounts/<id>/profile.
// The API decides what each role receives (backend/helpers/siteProfile.js);
// the optional fields below are optional because some callers never get them.

import type { BaseAttachment } from "@/lib/attachments";

export const SITE_TYPE_LABEL: Record<string, string> = {
  OFFICE: "Office", RETAIL: "Retail / mall", HOSPITAL: "Hospital / clinic", RESIDENTIAL: "Residential",
  INDUSTRIAL: "Industrial / plant", EDUCATION: "School / campus", HOTEL: "Hotel", GOVERNMENT: "Government",
  MIXED_USE: "Mixed use", OTHER: "Other",
};

export const SITE_STATUS: Record<string, { label: string; cls: string }> = {
  ONBOARDING: { label: "Onboarding", cls: "tu-badge tu-badge-info" },
  ACTIVE: { label: "Active", cls: "tu-badge tu-badge-success" },
  SUSPENDED: { label: "Suspended", cls: "tu-badge tu-badge-warning" },
  ENDED: { label: "Ended", cls: "tu-badge tu-badge-neutral" },
};

export const SERVICE_LABEL: Record<string, string> = {
  MAINTENANCE: "Maintenance", JANITORIAL: "Janitorial", MANPOWER: "Manpower", PEST_CONTROL: "Pest control",
  SECURITY: "Security", LANDSCAPING: "Landscaping", OTHER: "Other",
};

export const BILLING_LABEL: Record<string, string> = {
  MONTHLY: "Monthly", QUARTERLY: "Quarterly", SEMI_ANNUAL: "Semi-annual", ANNUAL: "Annual", ONE_TIME: "One-time",
};

export const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  CURRENT: { label: "Current", cls: "tu-badge tu-badge-success" },
  UPCOMING: { label: "Upcoming", cls: "tu-badge tu-badge-info" },
  ENDED: { label: "Ended", cls: "tu-badge tu-badge-neutral" },
};

export type Site = {
  id: string;
  name: string;
  description: string | null;
  siteCode: string | null;
  clientName: string | null;
  siteType: string | null;
  status: string;
  floorAreaSqm: number | null;
  operatingHours: string | null;
  accessNotes: string | null;
  /** Staff only. */
  internalNotes?: string | null;
  addressLine: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

export type SiteContact = {
  id: string;
  side: "CLIENT" | "OURS";
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
};

export type SiteContract = {
  id: string;
  contractNumber: string | null;
  acquiredOn: string | null;
  startDate: string;
  endDate: string | null;
  noticeDays: number | null;
  services: string[];
  slaTerms: string | null;
  status: "CURRENT" | "UPCOMING" | "ENDED";
  daysToEnd: number | null;
  /** Staff only. */
  contractedHeadcount?: number | null;
  /** Managers only. */
  contractValue?: number | null;
  billingCycle?: string | null;
  notes?: string | null;
  documents?: BaseAttachment[];
};

export type SiteProfile = {
  site: Site;
  contacts: SiteContact[];
  contracts: SiteContract[];
  currentContractId: string | null;
  /** Staff only: regular employees on the roster. */
  rosterRegular?: number;
};

/** A `@db.Date` value ("2026-10-30T00:00:00.000Z") as "Oct 30, 2026", read as the calendar day it is. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "YYYY-MM-DD" for a date input, from a `@db.Date` value. */
export const dayInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

export const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The address on one line, skipping what is blank. */
export function addressLine(s: Site): string {
  return [s.addressLine, s.barangay, s.city, s.province, s.region, s.postalCode].filter(Boolean).join(", ");
}

/** The date notice must be given by, or null when the contract names no notice period or end. */
export function noticeBy(c: SiteContract): string | null {
  if (!c.endDate || !c.noticeDays) return null;
  return new Date(new Date(c.endDate).getTime() - c.noticeDays * 86_400_000).toISOString();
}

/** "Ends in 3 months", "Ends in 12 days", "Ends today", "Open-ended". */
export function endsIn(c: SiteContract): string {
  if (c.daysToEnd === null) return "Open-ended";
  if (c.daysToEnd < 0) return `Ended ${fmtDay(c.endDate)}`;
  if (c.daysToEnd === 0) return "Ends today";
  if (c.daysToEnd < 60) return `Ends in ${c.daysToEnd} day${c.daysToEnd === 1 ? "" : "s"}`;
  return `Ends in ${Math.round(c.daysToEnd / 30)} months`;
}
