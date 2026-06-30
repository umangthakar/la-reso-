# Supabase backend — Le Rasa Bakery

Backend wiring for the existing Next.js app. **No frontend components were touched.**

## Layout

```
supabase/sql/01_schema.sql            tables, indexes, triggers
supabase/sql/02_rls_and_realtime.sql  RLS policies + realtime publication
lib/supabase/database.types.ts        TS types (regenerate with `npm run gen:types`)
lib/supabase/client.ts                public anon client + per-order tracking client
lib/supabase/server.ts                service-role client — server-only, RLS-bypassing
lib/supabase/hooks/                    three realtime hooks
scripts/test-rls.mjs                   RLS isolation test (`npm run test:rls`)
.env.local.example                     env var names
```

## Setup order (once keys are available)

1. Run `supabase/sql/01_schema.sql` then `02_rls_and_realtime.sql` in the SQL Editor (in that order).
2. Copy `.env.local.example` → `.env.local`, fill in URL + anon + service-role keys + project ref.
3. `npm run gen:types` — regenerate types from the live DB (drop-in replacement; the hand-authored file already matches the CLI shape).
4. `npm run test:rls` — must print **ALL RLS CHECKS PASSED** before considering this done.

## ⚠️ Flags raised (need decisions before building further)

### 1. Realtime cannot use the `x-tracking-token` header (confirmed)
Supabase does **not** forward custom request headers over the Realtime WebSocket. RLS policies that read
`current_setting('request.headers')->>'x-tracking-token'` therefore evaluate to false during
`postgres_changes`.

- **REST** reads on the tracking page **are** secured by the header and work correctly. ✅
- **Realtime** on `order_status_history` will receive **no rows** under the current schema (fails closed — no leak, but no live updates).

To get live tracking updates, choose one (not built yet — confirm approach first):
- **(a) Signed-JWT claim (recommended):** a server action mints a short-lived JWT containing the order id / token; the tracking page passes it as the realtime access token; add an RLS policy reading the claim from `auth.jwt()`.
- **(b) Broadcast from trigger:** an `order_status_history` trigger broadcasts to a private topic keyed by `tracking_token` (Realtime Authorization).

Interim: `useOrderTrackingRealtime` returns `refetch()` for manual/polled refresh.

### 2. Admin dashboard realtime has no RLS path over anon
The schema intentionally has **no admin SELECT policy** on `orders` (admin is meant to use the service role server-side). But the admin dashboard runs in the browser, where the service role must never go — so an anon `postgres_changes` subscription on `orders` gets **zero events**.

To make the admin dashboard live, choose one (confirm first):
- **(a) Admin auth + policy (recommended):** real Supabase Auth admin user + an "admins select all orders" RLS policy; pass the authenticated session client into `useOrdersRealtime({ client })`.
- **(b) Broadcast** order changes from a trigger to a private admin topic.

This naturally slots in when the admin panel + auth are built.

### 3. UK postcode matching (`delivery_zones.postcode_pattern`)
The example patterns (`"SW1*"`) are US-zip-style prefix globs and will **mis-match** UK postcodes: `"SW1*"`
also matches `SW10`–`SW19` (different areas), and the column ignores the outward/inward split, whitespace,
and casing.

Agreed approach (to build later): normalise input (uppercase, strip space, take the **outward code**, e.g.
`SW1A`), store zones as lists of exact outward codes / area prefixes, and match **most-specific (longest)
first**. Zone-matching logic is **not built yet** — confirmed direction only.

## Service-role isolation

`lib/supabase/server.ts` starts with `import "server-only"`. Any attempt to import it (even transitively)
from a Client Component fails the build. It is the only file that reads `SUPABASE_SERVICE_ROLE_KEY`
(no `NEXT_PUBLIC_` prefix), so the key can never reach the browser bundle.
