"use client";

import { useCallback, useEffect, useState } from "react";

// Demo-only, client-side "auth". A fake user object is stashed in localStorage
// so the account pages have something to render. No real authentication yet.
export type DemoUser = {
  name: string;
  email: string;
};

const STORAGE_KEY = "lerasa_user";
// Fired on the same tab whenever we change the stored user, so every hook
// instance (navbar, account page, …) stays in sync without a full reload.
const AUTH_EVENT = "lerasa-auth-change";

function readUser(): DemoUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DemoUser) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<DemoUser | null>(null);
  // Avoid a hydration mismatch: nothing is known until we've read localStorage.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readUser());
    setReady(true);

    const sync = () => setUser(readUser());
    window.addEventListener(AUTH_EVENT, sync);
    // Keep other tabs in sync too.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const login = useCallback((next: DemoUser) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(AUTH_EVENT));
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(AUTH_EVENT));
  }, []);

  return { user, ready, login, logout };
}
