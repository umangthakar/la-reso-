// ============================================================
// Admin API — login validation
// Validates a submitted password against the server-only ADMIN_PASSWORD
// env var. The correct password never reaches the client; the browser
// only learns whether the password it submitted was correct.
// ============================================================

import { NextResponse } from "next/server";
import { getAdminPassword } from "@/lib/admin-auth";

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
  try {
    const body = (await req.json()) as { password?: unknown };
    if (typeof body?.password === "string") password = body.password;
  } catch {
    // malformed body → treated as empty password below
  }

  if (password !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
