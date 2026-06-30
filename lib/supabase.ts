// ============================================================
// Convenience re-export so `import { supabase } from "@/lib/supabase"`
// works. This is the SAME public/anon browser singleton defined in
// lib/supabase/client.ts — it is NOT a second client (no duplicate
// GoTrueClient). Use it for public, RLS-safe reads from client code.
//
// NOTE: the admin panel does NOT write through this client. RLS only
// lets the anon key read the storefront, so all admin create/update/
// delete operations go through the password-gated API routes under
// app/api/admin/** which use the service-role key server-side.
// ============================================================

export { supabaseBrowser as supabase } from "./supabase/client";
