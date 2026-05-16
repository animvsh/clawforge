import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AuthPanel } from "./AuthPanel";

const navItems = [
  ["/builder", "Builder"],
  ["/blueprint", "Blueprint"],
  ["/dashboard", "Dashboard"],
  ["/report", "Report"],
] as const;

export function ClawForgeLogo() {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label="ClawForge home">
      <div className="grid h-8 w-8 place-items-center">
        <div className="h-0 w-0 border-y-[9px] border-l-[15px] border-y-transparent border-l-white" />
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/50">
        clawforge
      </span>
    </Link>
  );
}

export function ClawForgeFrame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/78 px-5 py-4 backdrop-blur-xl md:px-10 lg:px-14">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
          <ClawForgeLogo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {navItems.map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="rounded-full px-4 py-2 text-sm text-white/48 transition hover:bg-white/8 hover:text-white"
                activeProps={{ className: "bg-white/10 text-white" }}
              >
                {label}
              </Link>
            ))}
          </nav>
          <AuthPanel />
        </div>
      </header>

      <div>{children}</div>

      <footer className="border-t border-white/10 px-5 py-8 text-sm text-white/42 md:px-10 lg:px-14">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <ClawForgeLogo />
          <span>Safe agents, built from plain English.</span>
        </div>
      </footer>
    </main>
  );
}

export function PageShell({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="px-5 py-10 md:px-10 md:py-14 lg:px-14">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[320px_1fr]">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-white/38">{eyebrow}</div>
          <h1 className="mt-4 max-w-sm text-4xl font-semibold leading-[1.02] tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/52">{body}</p>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

export function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-white/12 bg-white/[0.025] p-6">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">{title}</div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/56">{body}</p>
    </div>
  );
}
