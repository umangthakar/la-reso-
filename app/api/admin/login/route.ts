// ============================================================
// Admin API — login validation
// Validates a submitted password against the server-only ADMIN_PASSWORD
// env var. The correct password never reaches the client; the browser
// only learns whether the password it submitted was correct.
// ============================================================

import { NextResponse } from "next/server";
import { getAdminPassword, getAdminEmail, isValidEmail } from "@/lib/admin-auth";

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
  try {
    const body = (await req.json()) as { password?: unknown; email?: unknown };
    if (typeof body?.password === "string") password = body.password;
    if (typeof body?.email === "string") email = body.email.trim();
  } catch {
    // malformed body → treated as empty credentials below
  }

  // Email must be present and well-formed. When ADMIN_EMAIL is configured it
  // must also match (case-insensitive); otherwise any valid email is accepted
  // so deployments that only set ADMIN_PASSWORD keep working unchanged.
  const expectedEmail = getAdminEmail();
  const emailOk =
    isValidEmail(email) &&
    (!expectedEmail || email.toLowerCase() === expectedEmail.toLowerCase());

  if (!emailOk || password !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
