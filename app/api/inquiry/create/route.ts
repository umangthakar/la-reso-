// ============================================================
// POST /api/inquiry/create
// ------------------------------------------------------------
// Persists a Custom Cake Inquiry and returns its unique, daily-resetting
// Inquiry Number (CQ-YYYYMMDD-NNN, assigned by the DB trigger). When the
// visitor is signed in, the inquiry is linked to their session email so it
// appears in their "My Custom Cake Inquiries" history. Then it best-effort
// alerts the owner (email + WhatsApp) — a failed alert never fails the save.
//
// This does NOT create an order, use checkout, or take payment.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, ownerEmail } from "@/lib/email";
import { buildInquiryOwnerEmail } from "@/lib/inquiry-email";

export const dynamic = "force-dynamic";

function s(v: unknown, max = 2000): string {
  return String(v ?? "").trim().slice(0, max);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Who is submitting? (optional — guests can inquire too.)
  let sessionEmail: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    sessionEmail = user?.email ?? null;
  } catch {
    sessionEmail = null;
  }

  let admin: SupabaseClient;
  try {
    admin = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server not configured." },
      { status: 500 },
    );
  }

  const images = Array.isArray(body.images)
    ? (body.images as unknown[]).map((u) => s(u, 1000)).filter(Boolean).slice(0, 20)
    : [];

  const insert = {
    customer_email: sessionEmail,
    name: s(body.name, 200),
    phone: s(body.phone, 60),
    email: s(body.email, 200),
    event_type: s(body.eventType, 60),
    delivery_date: s(body.deliveryDate, 40),
    servings: s(body.servings, 120),
    budget: s(body.budget, 120),
    flavour: s(body.flavour, 200),
    shape: s(body.shape, 200),
    colour_theme: s(body.colour, 200),
    cake_message: s(body.cakeMessage, 300),
    notes: s(body.notes, 2000),
    reference_images: images,
    status: "new",
  };

  if (!insert.name && !insert.phone && !insert.email) {
    return NextResponse.json({ error: "Please add your contact details." }, { status: 400 });
  }

  console.log("Saving inquiry...");
  const { data, error } = await admin
    .from("custom_inquiries")
    .insert(insert)
    .select("id,inquiry_number")
    .single();

  if (error) {
    console.error("Inquiry save failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.log("Inquiry saved.");

  const inquiryId = String((data as { id?: string }).id ?? "");
  const inquiryNumber = String((data as { inquiry_number?: string }).inquiry_number ?? "");

  // Best-effort owner email — never blocks the response. Recipient is
  // OWNER_EMAIL (env); we fall back to the bakery contact email if unset.
  try {
    console.log("Preparing email...");
    let recipient = ownerEmail();
    if (!recipient) {
      console.warn("OWNER_EMAIL missing — falling back to site_settings contact email.");
      const { data: settingsRow } = await admin
        .from("site_settings")
        .select("contact,email")
        .limit(1)
        .maybeSingle();
      const contact = (settingsRow?.contact ?? {}) as { email?: string };
      recipient = (contact.email || (settingsRow?.email as string) || "").trim();
    }

    if (!recipient) {
      console.error("No owner email recipient available (OWNER_EMAIL unset and no site_settings contact email). Skipping owner notification.");
    }

    if (recipient) {
      const origin = new URL(req.url).origin;
      const base = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? origin).replace(/\/$/, "");
      const { subject, html } = buildInquiryOwnerEmail(
        {
          inquiryNumber,
          name: insert.name,
          phone: insert.phone,
          email: insert.email,
          eventType: insert.event_type,
          deliveryDate: insert.delivery_date,
          budget: insert.budget,
          servings: insert.servings,
          flavour: insert.flavour,
          shape: insert.shape,
          colourTheme: insert.colour_theme,
          cakeMessage: insert.cake_message,
          notes: insert.notes,
          images,
        },
        {
          viewUrl: `${base}/admin/dashboard/inquiries?q=${encodeURIComponent(inquiryNumber)}`,
          adminUrl: `${base}/admin`,
        },
      );
      console.log("Sending owner email...", { to: recipient });
      const result = await sendEmail({ to: recipient, subject, html, replyTo: insert.email || undefined });
      console.log("sendEmail result:", result);
    }
  } catch (e) {
    // owner email is best-effort — log but never fail the inquiry save.
    console.error("Owner email step threw (best-effort, inquiry still saved):", e);
  }

  return NextResponse.json({ id: inquiryId, inquiry_number: inquiryNumber });
}
