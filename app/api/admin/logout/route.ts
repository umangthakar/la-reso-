// ============================================================
// Admin API — sign out
// ------------------------------------------------------------
// Clears the httpOnly session cookie. Needed because the client can no
// longer "forget" the credential itself (there is nothing in
// sessionStorage to remove any more) — only the server can expire it.
// ============================================================

import { NextResponse } from "next/server";
import { clearSessionCookieHeader } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearSessionCookieHeader());
  return res;
}
