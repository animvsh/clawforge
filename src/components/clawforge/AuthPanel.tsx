import { isSupabaseConfigured, supabase, type SupabaseSession } from "@/lib/supabase/client";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  clearDemoEmail,
  DEMO_EMAIL_KEY,
  setDemoEmail as saveDemoEmail,
} from "@/lib/clawforge/auth";

type AuthPanelProps = {
  forceOpen?: boolean;
  locked?: boolean;
  onAuthenticated?: () => void;
};

const DEFAULT_DEMO_EMAIL = "demo@clawforge.local";

function isEmailDeliveryBusy(message: string) {
  return /rate limit|too many|email|confirmation|signup/i.test(message);
}

export function AuthPanel({ forceOpen = false, locked = false, onAuthenticated }: AuthPanelProps) {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [demoEmail, setDemoEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const [loading, setLoading] = useState(false);

  const ensureProfile = useCallback(async (nextSession: SupabaseSession | null) => {
    if (!supabase || !nextSession?.user?.id || !nextSession.user.email) return;
    await supabase.from("profiles").upsert({
      id: nextSession.user.id,
      email: nextSession.user.email,
      updated_at: new Date().toISOString(),
    });
  }, []);

  useEffect(() => {
    const urlDemoEmail = new URLSearchParams(window.location.search).get("demo_email");
    if (urlDemoEmail) {
      saveDemoEmail(urlDemoEmail);
      setDemoEmail(urlDemoEmail);
    }

    const savedDemoEmail = window.localStorage.getItem(DEMO_EMAIL_KEY);
    if (savedDemoEmail) setDemoEmail(savedDemoEmail);

    if (!supabase) return;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        setSession(data.session);
        await ensureProfile(data.session);
      })
      .catch(() => {
        setMessageTone("error");
        setMessage("Could not load your session. You can still build in guest mode.");
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void ensureProfile(nextSession);
      setMessage("");
    });

    return () => subscription.unsubscribe();
  }, [ensureProfile]);

  useEffect(() => {
    if (session?.user || demoEmail) onAuthenticated?.();
  }, [demoEmail, onAuthenticated, session?.user]);

  useEffect(() => {
    if (!open && !forceOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (locked) return;
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [forceOpen, locked, open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setMessage("");
    const redirectTo = typeof window === "undefined" ? undefined : window.location.origin;
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
          });
    setLoading(false);

    if (error) {
      if (mode === "signup" && isEmailDeliveryBusy(error.message)) {
        continueAsDemo(
          email.trim(),
          "Email signup is busy right now, so I opened a demo workspace. You can keep building and connect a saved account later.",
        );
        return;
      }

      setMessageTone("error");
      setMessage(error.message);
      return;
    }

    setMessageTone("info");
    setMessage(
      mode === "signin"
        ? "Signed in."
        : data.session
          ? "Account created."
          : "Check your email to confirm your account.",
    );
    await ensureProfile(data.session);
    setPassword("");
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    clearDemoEmail();
    setSession(null);
    setDemoEmail(null);
    setOpen(false);
  }

  function continueAsDemo(nextEmail = email.trim(), nextMessage = "") {
    const resolvedEmail = nextEmail.trim() || DEFAULT_DEMO_EMAIL;
    saveDemoEmail(resolvedEmail);
    setDemoEmail(resolvedEmail);
    setPassword("");
    setMessageTone("info");
    setMessage(nextMessage);
    setOpen(false);
    onAuthenticated?.();
  }

  if (!isSupabaseConfigured) {
    return <div className="text-xs uppercase tracking-[0.22em] text-white/28">demo mode</div>;
  }

  if (session?.user || demoEmail) {
    return (
      <div className="flex max-w-[220px] items-center gap-3 text-xs text-white/48 sm:max-w-[280px]">
        <span className="truncate rounded-full border border-white/10 px-3 py-1.5">
          {session?.user.email ?? demoEmail}
        </span>
        <button
          type="button"
          onClick={signOut}
          className="text-white/70 transition hover:text-white"
        >
          sign out
        </button>
      </div>
    );
  }

  if (!open && !forceOpen) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-white/12 px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/62 transition hover:border-white/28 hover:text-white"
      >
        sign in
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/72 px-4 py-6 backdrop-blur-xl">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!locked) setOpen(false);
        }}
        aria-label="Close sign in"
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/12 bg-[#11110f] shadow-[0_28px_100px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/36">account</div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">
              {mode === "signin" ? "Welcome back." : "Create your account."}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!locked) setOpen(false);
            }}
            className="grid h-9 w-9 place-items-center rounded-full text-white/50 transition hover:bg-white/8 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-full border border-white/10 bg-white/10 p-1">
            {[
              ["signin", "Sign in"],
              ["signup", "Create"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-label={value === "signin" ? "Switch to sign in" : "Switch to create account"}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value as "signin" | "signup");
                  setMessage("");
                }}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  mode === value ? "bg-white text-black" : "text-white/52 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-3">
            <label className="grid gap-2 text-sm text-white/62">
              Email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="h-12 rounded-2xl border border-white/12 bg-black/70 px-4 text-base text-white outline-none placeholder:text-white/25 focus:border-white/38"
              />
            </label>
            <label className="grid gap-2 text-sm text-white/62">
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={mode === "signin" ? "Your password" : "At least 6 characters"}
                className="h-12 rounded-2xl border border-white/12 bg-black/70 px-4 text-base text-white outline-none placeholder:text-white/25 focus:border-white/38"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !email || password.length < 6}
            className="mt-5 h-12 w-full rounded-full bg-white text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading
              ? "Working..."
              : mode === "signin"
                ? "Sign in to ClawForge"
                : "Create ClawForge account"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMessage("");
            }}
            className="mt-4 w-full text-center text-sm text-white/48 transition hover:text-white"
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>

          {message && (
            <div
              aria-live="polite"
              className={`mt-4 rounded-2xl border p-3 text-sm ${
                messageTone === "error"
                  ? "border-red-400/25 bg-red-500/10 text-red-100/78"
                  : "border-white/10 bg-white/[0.035] text-white/62"
              }`}
            >
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={() => continueAsDemo()}
            className="mt-4 h-11 w-full rounded-full border border-white/14 text-sm font-semibold text-white/72 transition hover:border-white/32 hover:text-white"
          >
            Continue in demo workspace
          </button>

          <button
            type="button"
            onClick={() => {
              if (!locked) setOpen(false);
            }}
            className={`mt-4 w-full text-center text-sm transition ${
              locked ? "cursor-not-allowed text-white/18" : "text-white/38 hover:text-white/70"
            }`}
            disabled={locked}
          >
            {locked ? "Sign in or create an account to continue" : "Close"}
          </button>

          <p className="mt-5 text-center text-xs leading-relaxed text-white/34">
            Demo workspaces keep the build flow moving. A saved account can be connected when email
            signup is available.
          </p>
        </form>
      </div>
    </div>
  );
}
