// ============================================================
// The pending-order auto-cancel window — SINGLE SOURCE OF TRUTH
// ------------------------------------------------------------
// A Pending order is one the owner hasn't accepted yet. Once it is older
// than this window, /api/cron/auto-cancel cancels it and refunds the
// customer. Everything that acts on — or talks about — that deadline reads
// it from here, so the sweep's cutoff and the wording of the notifications
// can never drift apart.
//
// ⚠ TEMPORARY (testing): this is normally 24 hours. It is set to 2 while the
// lifecycle is being tested end to end — put it back to 24 afterwards. This
// constant is the only edit needed to change it.
//
// Importable from anywhere: no "server-only", no dependencies.
// ============================================================

/** How long a Pending order is left unaccepted before it is auto-cancelled. */
export const PENDING_AUTO_CANCEL_HOURS = 2;

/** The same window in milliseconds — used to build the sweep's UTC cutoff. */
export const PENDING_AUTO_CANCEL_MS = PENDING_AUTO_CANCEL_HOURS * 60 * 60 * 1000;

/** Short form for notification copy, e.g. "2h". */
export const PENDING_AUTO_CANCEL_LABEL = `${PENDING_AUTO_CANCEL_HOURS}h`;
