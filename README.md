# Le Rasa Bakery

An eggless bakery storefront and admin panel built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, and **Supabase**.

## Features

- Marketing site — home, menu, about, and contact pages
- Password-gated **admin dashboard**: products, orders, payments, delivery, content/settings, and analytics
- Supabase Postgres with Row Level Security; service-role access confined to server-side API routes
- Stripe configuration stored encrypted, with a refunds tool

## Tech stack

Next.js · React 18 · TypeScript · Tailwind CSS · Supabase (`@supabase/supabase-js`) · Stripe · Recharts · Three.js / React Three Fiber

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

### Environment variables

Copy `.env.example` to `.env.local` and provide:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key (protected by RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Server-only.** Bypasses RLS — never expose to the client |
| `ADMIN_PASSWORD` | yes | **Server-only.** Admin gate password, validated by `/api/admin/login` |
| `ADMIN_ENCRYPTION_KEY` | no | Encrypts admin secrets; falls back to the service-role key |
| `SUPABASE_PROJECT_REF` | no | Used only by `npm run gen:types` |

> Secrets live only in `.env.local` (gitignored) and in your Vercel project settings — never in source.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Lint with ESLint |
| `npm run gen:types` | Regenerate Supabase types |

## Deployment (Vercel)

1. Import the repository into Vercel.
2. Add every required environment variable from the table above in **Project Settings → Environment Variables**.
3. Deploy — Vercel runs `npm run build` automatically.
