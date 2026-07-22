// ============================================================
// Admin API — login validation
// Validates a submitted password against the server-only ADMIN_PASSWORD
// env var. The correct password never reaches the client; the browser
// only learns whether the password it submitted was correct.
// ============================================================

import { NextResponse } from "next/server";
import { getAdminPassword, isAdminEmail } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = getAdminPassword();
  if (!expected) {
    return NextResponse.json(
      { error: "Admin password is not configured on the server." },
      { status: 500 },
    );
  }

  let password = "";
  let email = "";
  let emailProvided = false;
  try {
    const body = (await req.json()) as { password?: unknown; email?: unknown };
    if (typeof body?.password === "string") password = body.password;
    if (typeof body?.email === "string") {
      email = body.email.trim();
      emailProvided = true;
    }
  } catch {
    // malformed body → treated as empty credentials below
  }

  // The password is the real credential (it authorises every admin API via the
  // x-admin-auth header). The email is an additional allowlist gate at sign-in.
  //
  // Enforce the email gate ONLY when the client actually submits an email: the
  // sign-in form always does, while the dashboard's session re-validation posts
  // the password alone. Requiring an email on that re-check is what previously
  // bounced authenticated admins straight back to the login page.
  //
  // isAdminEmail() supports a comma-separated ADMIN_EMAIL list (trim + lowercase
  // + includes) and accepts any valid email when ADMIN_EMAIL is unset.
  const emailOk = !emailProvided || isAdminEmail(email);

  if (!emailOk || password !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
