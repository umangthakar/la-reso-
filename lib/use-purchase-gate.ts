"use client";

// ============================================================
// Le Rasa Bakery — purchase authentication gate
// ------------------------------------------------------------
// Purchasing requires a signed-in (Google) customer. Call `requireAuth`
// from any buy action: it resolves true when the customer may continue,
// or stashes the intent, sends them to the login page, and returns false.
// Nothing else about the cart / checkout flow changes.
// ============================================================

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/lib/use-auth";
import {
  loginHrefFor,
  savePurchaseIntent,
  type PurchaseIntent,
} from "@/lib/purchase-intent";

export function usePurchaseGate() {
  const router = useRouter();
  const { user, ready } = useAuth();

  const requireAuth = useCallback(
    async (intent: Omit<PurchaseIntent, "ts">): Promise<boolean> => {
      // The hook's session may still be resolving on a fast click, so fall
      // back to asking Supabase directly rather than bouncing a customer
      // who is in fact signed in.
      let authed = !!user;
      if (!authed) {
        const supabase = createClient() as unknown as SupabaseClient;
        const { data } = await supabase.auth.getUser();
        authed = !!data.user;
      }
      if (authed) return true;

      savePurchaseIntent(intent);
      router.push(loginHrefFor(intent.href));
      return false;
    },
    [user, router],
  );

  return { requireAuth, user, ready };
}
