// ============================================================
// Admin API — session check
// ------------------------------------------------------------
// The dashboard shell calls this on mount to decide whether to render or
// bounce to /admin. It replaces the old pattern of re-POSTing the stored
// password to /api/admin/login: there is no stored password any more, and
// the signed httpOnly cookie is not readable from JavaScript, so the
// client has to ask the server whether it is still signed in.
//
// Returns only whether the session is valid (and which email it belongs
// to) — never anything that could authorise a request on its own.
// ============================================================

import { NextResponse } from "next/server";
import { adminEmailFromRequest, isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json(
    { ok: true, email: adminEmailFromRequest(req) },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
