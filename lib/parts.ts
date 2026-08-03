// Shared types and formatters for spare parts, used by the account parts pages,
// the cross-account list, the asset detail panel, and the work-order part picker.

export type Part = {
  id: string;
  name: string;
  partNumber: string | null;
  category: string | null;
  unit: string | null;
  location: string | null;
  unitCost: number | null;
  supplier: string | null;
  quantityOnHand: number;
  minQuantity: number | null;
  archivedAt: string | null;
  accountId: string;
  isLowStock: boolean;
  account?: { id: string; name: string };
};

export type PartTransactionType = "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "RETURN";

export type PartTransaction = {
  id: string;
  type: PartTransactionType;
  quantity: number;
  balanceAfter: number;
  unitCost: number | null;
  reason: string | null;
  workOrderId: string | null;
  workOrder: { id: string; title: string } | null;
  performedByName: string;
  createdAt: string;
};

export const MOVEMENT_CONFIG: Record<PartTransactionType, { label: string; cls: string }> = {
  RECEIPT:    { label: "Received",  cls: "bg-green-50 text-green-700" },
  ISSUE:      { label: "Issued",    cls: "bg-blue-50 text-blue-700" },
  RETURN:     { label: "Returned",  cls: "bg-teal-50 text-teal-700" },
  ADJUSTMENT: { label: "Adjusted",  cls: "bg-amber-50 text-amber-700" },
};

// Quantities are stored as floats so partial units (2.5 L) work, but whole
// numbers should read as "10", not "10.0".
export const fmtQty = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toLocaleString("en-PH", { maximumFractionDigits: 3 });

export const fmtCost = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
