// Employee skills — the closed set a technician can be tagged with. Mirrors
// backend/helpers/employeeCategories.js, which mirrors the Postgres enum; the
// API rejects anything not in this list, so the two must stay in step.
//
// Values are stored SCREAMING_CASE and never shown that way: everything the
// user reads goes through skillLabel().
export const EMPLOYEE_CATEGORIES = [
  "ELECTRICAL",
  "MECHANICAL",
  "PLUMBING",
  "HVAC",
  "CIVIL",
  "CARPENTRY",
  "PAINTING",
  "CLEANING",
  "LANDSCAPING",
  "SAFETY_FIRE",
  "SECURITY",
  "IT",
  "GENERAL",
] as const;

export type EmployeeCategory = (typeof EMPLOYEE_CATEGORIES)[number];

const LABELS: Record<string, string> = {
  ELECTRICAL: "Electrical",
  MECHANICAL: "Mechanical",
  PLUMBING: "Plumbing",
  HVAC: "HVAC",
  CIVIL: "Civil / Structural",
  CARPENTRY: "Carpentry",
  PAINTING: "Painting",
  CLEANING: "Cleaning",
  LANDSCAPING: "Landscaping",
  SAFETY_FIRE: "Safety / Fire",
  SECURITY: "Security",
  IT: "IT",
  GENERAL: "General",
};

/** Display name for a stored skill. Falls back to the raw value so a skill
 *  added to the enum before this file catches up still renders as something. */
export const skillLabel = (value: string) => LABELS[value] ?? value;

/** Sort stored skills into the canonical display order above. */
export const orderSkills = (values: string[]) =>
  [...values].sort(
    (a, b) =>
      (EMPLOYEE_CATEGORIES as readonly string[]).indexOf(a) -
      (EMPLOYEE_CATEGORIES as readonly string[]).indexOf(b),
  );
