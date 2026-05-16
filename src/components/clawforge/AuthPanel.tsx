import { isSupabaseConfigured, supabase, type SupabaseSession } from "@/lib/supabase/client";
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
      <div className="flex max-w-[280px] items-center gap-3 text-xs text-white/48">
        <span className="truncate">{session.user.email}</span>
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
        className="text-xs uppercase tracking-[0.22em] text-white/42 transition hover:text-white"
      >
        sign in
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm border border-white/12 bg-black/86 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">
          {mode === "signin" ? "sign in" : "create account"}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-white/35 transition hover:text-white"
        >
          close
        </button>
      </div>

      <div className="mt-4 grid gap-2">
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

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || !email || password.length < 6}
          className="bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading ? "working" : mode === "signin" ? "sign in" : "create"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-xs text-white/45 transition hover:text-white"
        >
          {mode === "signin" ? "create account" : "use existing"}
        </button>
      </div>

      {message && <div className="mt-3 text-xs text-white/48">{message}</div>}
    </form>
  );
}
