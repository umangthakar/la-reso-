// ============================================================
// The pending-order auto-cancel window — SINGLE SOURCE OF TRUTH
// ------------------------------------------------------------
// A Pending order is one the owner hasn't accepted yet. Once it is older
// than this window, /api/cron/auto-cancel cancels it and refunds the
// customer. Everything that acts on — or talks about — that deadline reads
// it from here, so the sweep's cutoff and the wording of the notifications
// can never drift apart.
//
// This constant is the only edit needed to change the window: the sweep's
// cutoff, the WhatsApp copy and the ntfy push all derive from it.
//
// Importable from anywhere: no "server-only", no dependencies.
// ============================================================

/** How long a Pending order is left unaccepted before it is auto-cancelled. */
export const PENDING_AUTO_CANCEL_HOURS = 24;

/** The same window in milliseconds — used to build the sweep's UTC cutoff. */
export const PENDING_AUTO_CANCEL_MS = PENDING_AUTO_CANCEL_HOURS * 60 * 60 * 1000;

/** Short form for notification copy, e.g. "24h". */
export const PENDING_AUTO_CANCEL_LABEL = `${PENDING_AUTO_CANCEL_HOURS}h`;
