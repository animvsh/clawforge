import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase, type SupabaseSession } from "@/lib/supabase/client";

export type ClawForgeAuthState = {
  loading: boolean;
  session: SupabaseSession | null;
  demoEmail: string | null;
  email: string | null;
  isAuthenticated: boolean;
};

export const DEMO_EMAIL_KEY = "clawforge_demo_email";

export function getDemoEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(DEMO_EMAIL_KEY);
}

export function setDemoEmail(email: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_EMAIL_KEY, email);
  window.dispatchEvent(new Event("clawforge-auth-changed"));
}

export function clearDemoEmail() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DEMO_EMAIL_KEY);
  window.dispatchEvent(new Event("clawforge-auth-changed"));
}

export function useClawForgeAuth(): ClawForgeAuthState {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [demoEmail, setDemoEmailState] = useState<string | null>(null);

  const refreshDemoEmail = useCallback(() => {
    setDemoEmailState(getDemoEmail());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlDemoEmail = new URLSearchParams(window.location.search).get("demo_email");
    if (urlDemoEmail) setDemoEmail(urlDemoEmail);
    refreshDemoEmail();

    window.addEventListener("storage", refreshDemoEmail);
    window.addEventListener("clawforge-auth-changed", refreshDemoEmail);
    return () => {
      window.removeEventListener("storage", refreshDemoEmail);
      window.removeEventListener("clawforge-auth-changed", refreshDemoEmail);
    };
  }, [refreshDemoEmail]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      window.dispatchEvent(new Event("clawforge-auth-changed"));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const email = session?.user?.email ?? demoEmail;

  return {
    loading,
    session,
    demoEmail,
    email,
    isAuthenticated: Boolean(email) || !isSupabaseConfigured,
  };
}
