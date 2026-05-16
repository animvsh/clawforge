import { isSupabaseConfigured, supabase, type SupabaseSession } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export function AuthPanel() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setMessage("");
    const authCall =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { error } = await authCall;
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(mode === "signin" ? "Signed in." : "Check your email if confirmation is enabled.");
    setPassword("");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="border border-white/12 bg-black/45 p-4 text-xs text-white/48">
        <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">account</div>
        <div className="mt-2">Demo mode. Add Supabase env vars to enable accounts.</div>
      </div>
    );
  }

  if (session?.user) {
    return (
      <div className="border border-white/12 bg-black/45 p-4 text-xs text-white/58">
        <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">signed in</div>
        <div className="mt-2 truncate text-white/82">{session.user.email}</div>
        <button
          type="button"
          onClick={signOut}
          className="mt-3 border border-white/18 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/35"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="border border-white/12 bg-black/45 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">account</div>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-xs text-white/48 transition hover:text-white"
        >
          {mode === "signin" ? "Create" : "Sign in"}
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          autoComplete="email"
          placeholder="email"
          className="border border-white/12 bg-black px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/35"
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="password"
          className="border border-white/12 bg-black px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/35"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !email || password.length < 6}
        className="mt-3 w-full bg-white px-3 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {loading ? "Working" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      {message && <div className="mt-3 text-xs text-white/50">{message}</div>}
    </form>
  );
}
