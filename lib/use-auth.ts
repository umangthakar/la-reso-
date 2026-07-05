"use client";

// ============================================================
// Le Rasa Bakery — authentication hook (Supabase Auth, Google OAuth)
// ------------------------------------------------------------
// Real auth backed by Supabase. Exposes the current user (derived
// from the session), a Google sign-in trigger, and sign-out. Kept a
// small, stable surface so the navbar and account pages can consume
// it without knowing about Supabase.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
};

/** Derive a friendly display user from a Supabase auth user. */
function mapUser(u: User | null): AuthUser | null {
  if (!u) return null;
  const meta = u.user_metadata ?? {};
  const name =
    (meta.full_name as string) ||
    (meta.name as string) ||
    (u.email ? u.email.split("@")[0] : "") ||
    "There";
  return {
    id: u.id,
    name,
    email: u.email ?? "",
    avatar: (meta.avatar_url as string) || (meta.picture as string) || undefined,
  };
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  // `ready` stays false until we've resolved the initial session, so the UI
  // can avoid a flash of the signed-out state on first paint.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(mapUser(data.user));
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapUser(session?.user ?? null));
      setReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** Kick off Google OAuth. Returns to /auth/callback which decides where next. */
  const signInWithGoogle = useCallback(async (next = "/account") => {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  // `logout` kept as an alias for existing callers.
  return { user, ready, signInWithGoogle, signOut, logout: signOut };
}
