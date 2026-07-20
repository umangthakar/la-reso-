// ============================================================
// Le Rasa Bakery — Custom Cake Inquiries (shared, client + server safe).
// ------------------------------------------------------------
// Types + status metadata + shaping for the inquiry system, shared by the
// API routes, the customer history page and the admin panel so the Inquiry
// Number, statuses and fields read identically everywhere. Pure (no imports
// / side effects) so it's usable from client components and server routes.
// ============================================================

export type InquiryStatus = "new" | "contacted" | "confirmed" | "closed" | "cancelled";

export const INQUIRY_STATUSES: InquiryStatus[] = [
  "new",
  "contacted",
  "confirmed",
  "closed",
  "cancelled",
];

/** Bakery-style badge label + classes for a status. */
export const INQUIRY_STATUS_META: Record<
  InquiryStatus,
  { label: string; className: string }
> = {
  new: { label: "New", className: "bg-dustyrose-light/70 text-wine-dark" },
  contacted: { label: "Contacted", className: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmed", className: "bg-green-100 text-green-700" },
  closed: { label: "Closed", className: "bg-gray-200 text-gray-700" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
};

export function inquiryStatusMeta(status: string | null | undefined) {
  const key = (status ?? "new").toLowerCase() as InquiryStatus;
  return INQUIRY_STATUS_META[key] ?? INQUIRY_STATUS_META.new;
}

/** The customer-facing lifecycle order, used for the timeline. */
export const INQUIRY_TIMELINE: { key: InquiryStatus; label: string }[] = [
  { key: "new", label: "Submitted" },
  { key: "contacted", label: "Contacted" },
  { key: "confirmed", label: "Confirmed" },
  { key: "closed", label: "Closed" },
];

// The shape every UI consumes — a normalised inquiry.
export type Inquiry = {
  id: string;
  inquiry_number: string;
  status: InquiryStatus;
  name: string;
  phone: string;
  email: string;
  event_type: string;
  delivery_date: string;
  servings: string;
  budget: string;
  flavour: string;
  shape: string;
  colour_theme: string;
  cake_message: string;
  notes: string;
  reference_images: string[];
  created_at: string | null;
  contacted_at: string | null;
  confirmed_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  converted_order_id: string | null;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function nullableStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** Normalise a raw DB row (service-role select) into the UI `Inquiry`. */
export function normalizeInquiry(row: Record<string, unknown>): Inquiry {
  const status = (str(row.status).toLowerCase() || "new") as InquiryStatus;
  return {
    id: String(row.id ?? ""),
    inquiry_number: str(row.inquiry_number),
    status: INQUIRY_STATUSES.includes(status) ? status : "new",
    name: str(row.name),
    phone: str(row.phone),
    email: str(row.email),
    event_type: str(row.event_type),
    delivery_date: str(row.delivery_date),
    servings: str(row.servings),
    budget: str(row.budget),
    flavour: str(row.flavour),
    shape: str(row.shape),
    colour_theme: str(row.colour_theme),
    cake_message: str(row.cake_message),
    notes: str(row.notes),
    reference_images: Array.isArray(row.reference_images)
      ? (row.reference_images as unknown[]).map(String).filter(Boolean)
      : [],
    created_at: nullableStr(row.created_at),
    contacted_at: nullableStr(row.contacted_at),
    confirmed_at: nullableStr(row.confirmed_at),
    closed_at: nullableStr(row.closed_at),
    cancelled_at: nullableStr(row.cancelled_at),
    converted_order_id: nullableStr(row.converted_order_id),
  };
}

/** The timestamp column that a status transition should stamp. */
export function timestampColumnForStatus(status: InquiryStatus): string | null {
  switch (status) {
    case "contacted":
      return "contacted_at";
    case "confirmed":
      return "confirmed_at";
    case "closed":
      return "closed_at";
    case "cancelled":
      return "cancelled_at";
    default:
      return null; // "new" has no dedicated timestamp (created_at covers it)
  }
}
