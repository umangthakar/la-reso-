// ============================================================
// Le Rasa Bakery — delivery date rules (client + server safe)
//
// Pure helpers that turn the admin delivery settings (lead time,
// available weekdays, blocked dates) into a usable delivery calendar
// for the checkout date picker. No imports / side effects.
// ============================================================

// Index 0..6 → weekday name, matching JS Date.getDay().
const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type DeliveryRules = {
  leadTimeDays: number;
  deliveryDays: string[]; // lowercase weekday names
  blockedDates: string[]; // "YYYY-MM-DD"
};

/** Parse a "YYYY-MM-DD" string into a local-midnight Date (or null). */
export function parseYMD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Format a Date as a local "YYYY-MM-DD" string. */
export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today at local midnight. */
function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The earliest date the customer may pick (today + lead time). */
export function minDeliveryDate(leadTimeDays: number): Date {
  const d = today();
  d.setDate(d.getDate() + Math.max(0, Math.trunc(leadTimeDays) || 0));
  return d;
}

/** Is this weekday available for delivery? (empty list = all days) */
function isDeliverableWeekday(d: Date, deliveryDays: string[]): boolean {
  if (!Array.isArray(deliveryDays) || deliveryDays.length === 0) return true;
  return deliveryDays.includes(DAY_NAMES[d.getDay()]);
}

/**
 * Whether a "YYYY-MM-DD" string is a valid delivery date: on/after the
 * lead-time minimum, on an available weekday, and not a blocked date.
 */
export function isDeliverableDate(s: string, rules: DeliveryRules): boolean {
  const d = parseYMD(s);
  if (!d) return false;
  if (d < minDeliveryDate(rules.leadTimeDays)) return false;
  if ((rules.blockedDates ?? []).includes(s)) return false;
  return isDeliverableWeekday(d, rules.deliveryDays);
}

/**
 * The first valid delivery date, scanning forward from the lead-time
 * minimum. Used to seed the date picker's `min` and default value.
 */
export function firstDeliverableDate(rules: DeliveryRules): string {
  const d = minDeliveryDate(rules.leadTimeDays);
  for (let i = 0; i < 400; i++) {
    const s = toYMD(d);
    if (isDeliverableDate(s, rules)) return s;
    d.setDate(d.getDate() + 1);
  }
  return toYMD(d);
}

/** Human list of delivery days, e.g. "Mon, Wed, Fri" (empty = every day). */
export function deliveryDaysLabel(deliveryDays: string[]): string {
  if (!Array.isArray(deliveryDays) || deliveryDays.length === 0) return "any day";
  const short: Record<string, string> = {
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
  };
  // Preserve Mon→Sun order regardless of stored order.
  return DAY_NAMES.slice(1)
    .concat("sunday")
    .filter((d) => deliveryDays.includes(d))
    .map((d) => short[d])
    .join(", ");
}
