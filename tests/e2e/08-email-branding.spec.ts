// ============================================================
// EMAIL BRANDING + CTA RENDERING — every email we send, in a real browser.
//
// Two things are checked for all seven customer emails (plus the owner's
// inquiry email), because both have reached inboxes broken before:
//
//   BRANDING — the header reads "Le Rasa" over "House of Eggless Desserts",
//              from ONE shared source (lib/email-brand). The retired
//              "Le Rasa Bakery" wording appears nowhere, even when the
//              settings row still holds it.
//   CTAs     — every button is a real, styled, clickable HTML element with an
//              ABSOLUTE href. The welcome email's "Start Ordering" is the
//              regression case: it used to be handed the bare path "/account",
//              which email clients printed as "[/account]Start Ordering".
//
// The HTML is rendered with page.setContent() and inspected through the DOM,
// so "the button renders" is measured (size, colour, href, click target)
// rather than asserted against a substring. Layout is re-measured at desktop,
// tablet and mobile widths, and in both colour schemes.
//
// No live services: the auth senders talk to a stubbed Resend, and the order
// templates are pure builders.
// ============================================================

import { test, expect, type Page } from "@playwright/test";
// MUST come before any lib import — the email modules are server-only.
import "./allow-server-only";
import {
  EMAIL_BRAND,
  emailBrandText,
  resolveEmailBrand,
  emailButton,
  emailSiteUrl,
} from "../../lib/email-brand";
import {
  sendVerificationEmail,
  sendForgotPasswordEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
} from "../../lib/auth-email";
import {
  buildOrderPlacedEmail,
  buildOrderAcceptedEmail,
  buildOrderCancelledEmail,
  buildOrderRefundedEmail,
  type OrderEmailBrand,
  type OrderEmailData,
} from "../../lib/order-email-templates";
import { buildInquiryOwnerEmail } from "../../lib/inquiry-email";

const LEGACY = "Le Rasa Bakery";

// ------------------------------------------------------------
// Environment: no site URL configured, which is the exact condition that
// produced the "/account" bug. Every link must still be absolute.
// ------------------------------------------------------------

const SAVED: Record<string, string | undefined> = {};
const MANAGED = [
  "NEXT_PUBLIC_SITE_URL",
  "SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "AUTH_EMAIL_FROM",
  "AUTH_SUPPORT_EMAIL",
  "OWNER_EMAIL",
  "NEXT_PUBLIC_BRAND_NAME",
];

let sent: { subject: string; html: string }[] = [];
let realFetch: typeof globalThis.fetch;

test.beforeEach(() => {
  for (const key of MANAGED) {
    SAVED[key] = process.env[key];
    delete process.env[key];
  }
  process.env.RESEND_API_KEY = "re_test_key_for_the_email_branding_suite";

  sent = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("api.resend.com")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      sent.push({ subject: body.subject, html: body.html });
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of MANAGED) {
    if (SAVED[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED[key] as string;
  }
});

// ------------------------------------------------------------
// Fixtures for the order templates. The brand is resolved exactly as
// lib/order-email resolves it — from the shipped branding defaults, which
// still carry the retired long name, so the normalisation is under test.
// ------------------------------------------------------------

function orderBrand(): OrderEmailBrand {
  const brand = resolveEmailBrand({
    name: LEGACY,
    shortName: "Le Rasa",
    tagline: "House of Eggless Desserts",
    copyright: `${LEGACY}. All rights reserved.`,
    supportEmail: "",
    phone: "+44 7700 900456",
  });
  return {
    brandName: brand.name,
    shortName: brand.name,
    tagline: brand.tagline,
    logoUrl: "",
    siteUrl: brand.website,
    ordersUrl: `${brand.website}/account/orders`,
    contactUrl: `${brand.website}/contact`,
    supportEmail: brand.supportEmail,
    phone: brand.phone,
    instagramUrl: "https://instagram.com/lerasa",
    address: "Manchester, UK",
    copyright: brand.copyright,
  };
}

function orderData(): OrderEmailData {
  return {
    orderNumber: "11112222",
    customerName: "Priya Sharma",
    customerEmail: "priya@example.com",
    phone: "+447700900456",
    orderDate: "6 August 2026, 13:03",
    deliveryDate: "12 August 2026",
    addressLine: "42 Rose Lane",
    city: "Manchester",
    postcode: "M14 5TP",
    items: [
      {
        name: "Belgian Chocolate Truffle Cake",
        size: "8 inch",
        quantity: 1,
        unitPrice: 54,
        addons: 9,
        lineTotal: 63,
        imageUrl: "",
        accessories: [{ label: "Candles", value: "Sparkler × 2", price: 6 }],
      },
    ],
    specialInstructions: "Please ring the bell twice.",
    subtotal: 122,
    deliveryFee: 5.5,
    discount: 10,
    total: 117.5,
    paymentMethod: "Card (Stripe)",
    paymentStatus: "Paid",
    orderStatus: "Pending",
    refundStatus: "Refunded",
    refundAmount: 117.5,
    cancelledAt: "6 August 2026, 18:00",
    cancellationReason: "Cancelled at your request",
    refundEta: "5–10 business days",
  };
}

/** Every email in the system, as { name → html }. */
async function renderAll(): Promise<Record<string, string>> {
  await sendWelcomeEmail({ to: "priya@example.com", name: "Priya" });
  const welcome = sent.pop()!.html;

  await sendVerificationEmail({
    to: "priya@example.com",
    name: "Priya",
    verifyUrl: "https://www.lerasa.co.uk/auth/verify?token=abc",
  });
  const verification = sent.pop()!.html;

  await sendForgotPasswordEmail({
    to: "priya@example.com",
    resetUrl: "https://www.lerasa.co.uk/auth/reset-password?token=abc",
  });
  const forgot = sent.pop()!.html;

  await sendPasswordChangedEmail({ to: "priya@example.com", when: "6 August 2026, 14:03" });
  const changed = sent.pop()!.html;

  const brand = orderBrand();
  const order = orderData();

  return {
    "Welcome Email": welcome,
    "Email Verification": verification,
    "Forgot Password": forgot,
    "Password Reset (changed)": changed,
    "Order Confirmation": buildOrderPlacedEmail(brand, order).html,
    "Order Accepted": buildOrderAcceptedEmail(brand, order).html,
    "Order Cancelled": buildOrderCancelledEmail(brand, order).html,
    "Refund Email": buildOrderRefundedEmail(brand, order).html,
    "Custom Inquiry (owner)": buildInquiryOwnerEmail(
      {
        inquiryNumber: "CQ-20260806-001",
        name: "Priya Sharma",
        phone: "07700900456",
        email: "priya@example.com",
        eventType: "Birthday",
        deliveryDate: "12 August 2026",
        budget: "£120",
        servings: "20",
        flavour: "Chocolate",
        shape: "Round",
        colourTheme: "Blush",
        cakeMessage: "Happy Birthday",
        notes: "",
        images: [],
      },
      {
        viewUrl: "https://www.lerasa.co.uk/admin/dashboard/inquiries/1",
        adminUrl: "https://www.lerasa.co.uk/admin/dashboard",
      },
    ).html,
  };
}

// ------------------------------------------------------------
// DOM helpers
// ------------------------------------------------------------

type Cta = {
  text: string;
  href: string;
  width: number;
  height: number;
  background: string;
  colour: string;
};

/**
 * Every anchor rendered as a button: the pill-shaped, padded cell that
 * lib/email-brand.emailButton() emits. A plain link inside a padded layout
 * cell (the "copy and paste this link" fallback, the footer contact links) is
 * deliberately not one.
 */
async function ctas(page: Page): Promise<Cta[]> {
  return page.evaluate(() => {
    const out: Cta[] = [];
    for (const a of Array.from(document.querySelectorAll("a"))) {
      const cell = a.closest("td");
      if (!cell) continue;
      const cs = getComputedStyle(cell);
      const padded = parseFloat(cs.paddingTop) >= 8 && parseFloat(cs.paddingLeft) >= 12;
      const pill = parseFloat(cs.borderTopLeftRadius) >= 100;
      if (!padded || !pill) continue;
      const box = a.getBoundingClientRect();
      out.push({
        text: (a.textContent ?? "").trim(),
        href: a.getAttribute("href") ?? "",
        width: box.width,
        height: box.height,
        background: cs.backgroundColor,
        colour: getComputedStyle(a).color,
      });
    }
    return out as never as Cta[];
  });
}

/** The text a human reads, with runs of whitespace collapsed. */
async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " ").trim());
}

/** The same, lowercased — the tagline is rendered in CSS small caps. */
async function visibleTextLower(page: Page): Promise<string> {
  return (await visibleText(page)).toLowerCase();
}

// ------------------------------------------------------------
// 1. Branding — one shared source, applied to every template.
// ------------------------------------------------------------

test("every email leads with the Le Rasa / House of Eggless Desserts lockup", async ({ page }) => {
  const emails = await renderAll();

  const name0 = EMAIL_BRAND.name.toLowerCase();
  const tagline0 = EMAIL_BRAND.tagline.toLowerCase();

  for (const [name, html] of Object.entries(emails)) {
    await page.setContent(html);
    const text = await visibleTextLower(page);

    expect(text, `${name}: brand name missing`).toContain(name0);
    expect(text, `${name}: tagline missing`).toContain(tagline0);
    // The wordmark leads and the tagline sits directly under it.
    expect(text.indexOf(name0), `${name}: wordmark is not first`).toBeLessThan(
      text.indexOf(tagline0),
    );
    expect(
      text.indexOf(tagline0) - text.indexOf(name0),
      `${name}: the tagline is not part of the header lockup`,
    ).toBeLessThanOrEqual(name0.length + 2);
  }
});

test('no email contains the retired "Le Rasa Bakery" wording', async () => {
  const emails = await renderAll();

  for (const [name, html] of Object.entries(emails)) {
    expect(html, `${name} still says ${LEGACY}`).not.toContain(LEGACY);
  }

  // Including the subject lines the four auth emails send under.
  for (const line of sent.map((s) => s.subject)) {
    expect(line).not.toContain(LEGACY);
  }
});

test("branding survives a settings row that still holds the old name", () => {
  const brand = resolveEmailBrand({
    name: LEGACY,
    shortName: "",
    tagline: "",
    copyright: `${LEGACY}. All rights reserved.`,
  });

  expect(brand.name).toBe("Le Rasa");
  expect(brand.tagline).toBe("House of Eggless Desserts");
  expect(brand.copyright).toBe("Le Rasa. All rights reserved.");
  expect(brand.supportEmail).toBe("Info.lerasa@gmail.com");
  expect(emailBrandText("Order from Le Rasa Bakery today")).toBe("Order from Le Rasa today");

  // An admin who renames the bakery still wins.
  expect(resolveEmailBrand({ shortName: "Rasa Patisserie" }).name).toBe("Rasa Patisserie");
});

// ------------------------------------------------------------
// 2. CTA buttons — the regression, and the shared helper.
// ------------------------------------------------------------

test('the welcome email renders a real "Start Ordering" button, never "[/account]"', async ({
  page,
}) => {
  // No NEXT_PUBLIC_SITE_URL is set — the exact condition that produced the bug.
  await sendWelcomeEmail({ to: "priya@example.com", name: "Priya" });
  const html = sent.pop()!.html;

  await page.setContent(html);
  const text = await visibleText(page);

  // What the customer used to read.
  expect(text).not.toContain("[/account]");
  expect(text).not.toContain("/account]");
  expect(html).not.toMatch(/\[[^\]]*\]\([^)]*\)/); // no markdown link syntax anywhere

  const button = (await ctas(page)).find((c) => c.text === "Start Ordering");
  expect(button, "the Start Ordering button is missing").toBeTruthy();
  expect(button!.href).toBe("https://www.lerasa.co.uk/account");
  expect(button!.width).toBeGreaterThan(80);
  expect(button!.height).toBeGreaterThan(14);
  // Filled, white-on-wine, exactly like every other primary CTA.
  expect(button!.background).toBe("rgb(135, 56, 83)");
  expect(button!.colour).toBe("rgb(255, 255, 255)");
});

test("the account link falls back to the website, and follows a configured site URL", () => {
  // Nothing configured → the public site, never a bare path or localhost.
  expect(emailSiteUrl()).toBe(EMAIL_BRAND.website);

  process.env.NEXT_PUBLIC_SITE_URL = "https://staging.lerasa.co.uk/";
  expect(emailSiteUrl()).toBe("https://staging.lerasa.co.uk");

  // A loopback host is useless in an inbox and is replaced.
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  expect(emailSiteUrl()).toBe(EMAIL_BRAND.website);
});

test("a CTA with an unusable URL renders nothing rather than a broken link", () => {
  expect(emailButton("/account", "Start Ordering")).toBe("");
  expect(emailButton("javascript:alert(1)", "Start Ordering")).toBe("");
  expect(emailButton("", "Start Ordering")).toBe("");
  // …unless a usable fallback was supplied.
  expect(emailButton("/account", "Start Ordering", { fallbackHref: EMAIL_BRAND.website })).toContain(
    `href="${EMAIL_BRAND.website}"`,
  );
});

test("every button in every email is a rendered, absolute, clickable link", async ({ page }) => {
  const emails = await renderAll();

  for (const [name, html] of Object.entries(emails)) {
    await page.setContent(html);

    const buttons = await ctas(page);
    expect(buttons.length, `${name} has no CTA button`).toBeGreaterThan(0);

    for (const b of buttons) {
      expect(b.text, `${name}: a button has no label`).not.toBe("");
      expect(b.href, `${name}: "${b.text}" is not absolute`).toMatch(
        /^(https?:\/\/|mailto:|tel:)/,
      );
      expect(b.href, `${name}: "${b.text}" leaks a placeholder`).not.toMatch(/\{|\}|%s|undefined/);
      expect(b.width, `${name}: "${b.text}" has no width`).toBeGreaterThan(60);
      expect(b.height, `${name}: "${b.text}" has no height`).toBeGreaterThan(14);
    }
  }
});

test("the expected CTAs are present on the emails that need them", async ({ page }) => {
  const emails = await renderAll();

  const expected: Record<string, string[]> = {
    "Welcome Email": ["Start Ordering"],
    "Email Verification": ["Verify Email"],
    "Forgot Password": ["Reset Password"],
    "Password Reset (changed)": ["Reset Password"],
    "Order Confirmation": ["Track Orders", "Visit Website", "Contact Support"],
    "Order Accepted": ["Track Orders", "Visit Website", "Contact Support"],
    "Order Cancelled": ["Track Orders", "Visit Website", "Contact Support"],
    "Refund Email": ["Track Orders", "Visit Website", "Contact Support"],
    "Custom Inquiry (owner)": ["View Inquiry", "Open Admin"],
  };

  for (const [name, labels] of Object.entries(expected)) {
    await page.setContent(emails[name]);
    const found = (await ctas(page)).map((c) => c.text);
    for (const label of labels) {
      expect(found, `${name} is missing the "${label}" button`).toContain(label);
    }
  }
});

// ------------------------------------------------------------
// 3. Nothing leaks: no markdown, no raw template syntax, no bare paths.
// ------------------------------------------------------------

test("no email leaks markdown, placeholders or unresolved template syntax", async ({ page }) => {
  const emails = await renderAll();

  for (const [name, html] of Object.entries(emails)) {
    await page.setContent(html);
    const text = await visibleText(page);

    expect(text, `${name}: markdown link`).not.toMatch(/\[[^\]]+\]\(/);
    expect(text, `${name}: bracketed path`).not.toMatch(/\[\/[a-z-]+\]/i);
    expect(text, `${name}: unresolved template literal`).not.toContain("${");
    expect(text, `${name}: handlebars placeholder`).not.toMatch(/\{\{|\}\}/);
    expect(text, `${name}: undefined value`).not.toContain("undefined");
    expect(text, `${name}: null value`).not.toContain("null");
    expect(html, `${name}: unescaped tag`).not.toContain("<script");

    // No anchor anywhere in the document — button or not — is relative.
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? ""),
    );
    for (const href of hrefs) {
      expect(href, `${name}: relative href "${href}"`).toMatch(/^(https?:\/\/|mailto:|tel:)/);
    }
  }
});

// ------------------------------------------------------------
// 4. Responsive + colour scheme.
// ------------------------------------------------------------

const VIEWPORTS = [
  { label: "desktop", width: 1280, height: 900 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "mobile", width: 375, height: 812 },
  { label: "small mobile", width: 320, height: 640 },
];

test("every email fits its viewport at desktop, tablet and mobile widths", async ({ page }) => {
  const emails = await renderAll();

  for (const { label, width, height } of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    for (const [name, html] of Object.entries(emails)) {
      await page.setContent(html);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // A couple of pixels of rounding is fine; a sideways-scrolling email is not.
      expect(overflow, `${name} overflows at ${label} (${width}px)`).toBeLessThanOrEqual(2);
    }
  }
});

test("buttons stay readable and tappable on a phone, in light and dark", async ({ page }) => {
  const emails = await renderAll();
  await page.setViewportSize({ width: 375, height: 812 });

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [name, html] of Object.entries(emails)) {
      await page.setContent(html);
      for (const b of await ctas(page)) {
        expect(b.width, `${name}: "${b.text}" collapsed in ${scheme}`).toBeGreaterThan(60);
        // Buttons keep their own background in dark mode — an email client's
        // dark theme must not be able to paint white text onto white.
        expect(b.background, `${name}: "${b.text}" lost its fill in ${scheme}`).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
      }
    }
  }
  await page.emulateMedia({ colorScheme: null });
});
