import { isSupabaseConfigured, supabase, type SupabaseSession } from "@/lib/supabase/client";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

export function AuthPanel() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setMessage("");
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setMessage("");
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(mode === "signin" ? "Signed in." : "Check your email.");
    setPassword("");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setOpen(false);
  }

  if (!isSupabaseConfigured) {
    return <div className="text-xs uppercase tracking-[0.22em] text-white/28">demo mode</div>;
  }

  if (session?.user) {
    return (
      <div className="flex max-w-[220px] items-center gap-3 text-xs text-white/48 sm:max-w-[280px]">
        <span className="truncate rounded-full border border-white/10 px-3 py-1.5">
          {session.user.email}
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

  if (!open) {
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
        onClick={() => setOpen(false)}
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
            onClick={() => setOpen(false)}
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
            {loading ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
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
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-sm text-white/62">
              {message}
            </div>
          )}

          <p className="mt-5 text-center text-xs leading-relaxed text-white/34">
            Your saved ClawForge agents and runs stay attached to this account.
          </p>
        </form>
      </div>
    </div>
  );
}
