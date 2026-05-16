import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUp, Plus } from "lucide-react";
import { useState } from "react";
import { AuthPanel } from "@/components/clawforge/AuthPanel";
import { ClawForgeLogo } from "@/components/clawforge/ClawForgeFrame";
import heroImage from "@/assets/hero.png";
import { useClawForgeAuth } from "@/lib/clawforge/auth";
import { createProject } from "@/lib/clawforge/projects";

const incidentPrompt =
  "Create a NemoClaw agent that monitors system logs, detects suspicious behavior, writes an incident report, and asks before executing commands.";

const promptChips = [
  ["Incident response agent", incidentPrompt],
  [
    "GitHub triage agent",
    "Create a NemoClaw agent that reads GitHub issues, finds urgent bugs, drafts responses, and asks before posting.",
  ],
  [
    "Inbox approval agent",
    "Create a NemoClaw agent that summarizes important emails, drafts replies, and asks before sending anything.",
  ],
  [
    "Research-only agent",
    "Create a NemoClaw agent that researches a topic, saves sources, writes a brief, and asks before publishing.",
  ],
] as const;

const exampleAgents = [
  [
    "Phone receptionist",
    "Answer calls, take messages, check the calendar, and ask before sending texts.",
    "Create a NemoClaw phone receptionist agent that answers calls, takes messages, checks my calendar, books appointments, and asks before sending texts.",
  ],
  [
    "Security analyst",
    "Watch logs, spot suspicious behavior, write a report, and pause risky commands.",
    incidentPrompt,
  ],
  [
    "GitHub triage",
    "Find urgent bugs, suggest labels, draft replies, and ask before posting.",
    "Create a NemoClaw agent that reads GitHub issues, finds urgent bugs, drafts responses, and asks before posting.",
  ],
  [
    "Inbox assistant",
    "Summarize important email, draft follow-ups, and ask before sending anything.",
    "Create a NemoClaw inbox assistant that summarizes important emails, drafts replies, and asks before sending anything.",
  ],
  [
    "Research scout",
    "Collect sources, compare claims, write a brief, and keep publishing approval-gated.",
    "Create a NemoClaw research agent that researches a topic, saves sources, writes a brief, and asks before publishing.",
  ],
  [
    "Ops ticket agent",
    "Read incidents, create tickets, assign owners, and ask before notifying the team.",
    "Create a NemoClaw operations agent that reads incidents, creates tickets, assigns owners, and asks before sending team alerts.",
  ],
] as const;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClawForge — Text to NemoClaw instance" },
      {
        name: "description",
        content:
          "Describe a NemoClaw agent. ClawForge generates the workflow, tools, policies, memory, deployment config, and live runtime dashboard.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(incidentPrompt);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const auth = useClawForgeAuth();

  function fillPrompt(nextPrompt: string) {
    setPrompt(nextPrompt);
    document.getElementById("hero-agent-prompt")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  function createWorkspace(nextPrompt: string) {
    const cleanPrompt = nextPrompt.trim();
    if (!cleanPrompt) return;
    if (!auth.isAuthenticated) {
      setPendingPrompt(cleanPrompt);
      return;
    }
    setSubmitting(true);
    const project = createProject(cleanPrompt);
    window.setTimeout(() => {
      void navigate({
        to: "/workspace/$projectId",
        params: { projectId: project.id },
      });
    }, 260);
  }

  function continuePendingBuild() {
    if (!pendingPrompt || !auth.isAuthenticated) return;
    const nextPrompt = pendingPrompt;
    setPendingPrompt(null);
    createWorkspace(nextPrompt);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="grid min-h-[100dvh] bg-black lg:grid-cols-[42%_58%]">
        <div className="flex min-h-[100dvh] flex-col border-b border-white/10 px-6 py-6 md:px-10 lg:border-b-0 lg:border-r lg:px-14 lg:py-7">
          <header className="flex items-start justify-between gap-5">
            <ClawForgeLogo />
            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                className="hidden rounded-full border border-white/12 px-5 py-3 text-[11px] uppercase tracking-[0.24em] text-white/48 transition hover:border-white/28 hover:text-white sm:inline-flex"
              >
                Dashboard
              </Link>
              <AuthPanel />
            </div>
          </header>

          <div className="flex flex-1 flex-col justify-center py-8 lg:py-6">
            <div className="mb-5 text-[10px] uppercase tracking-[0.3em] text-white/35 sm:text-[11px]">
              text to nemoclaw instance
            </div>
            <h1 className="max-w-[12ch] text-[clamp(3.2rem,5.5vw,5.4rem)] font-semibold leading-[0.94] tracking-tight text-white">
              Text to NemoClaw instance.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/58 lg:text-[1.03rem]">
              Describe an agent. ClawForge generates the workflow, policies, memory, and runtime
              dashboard.
            </p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                createWorkspace(prompt);
              }}
              className={`hero-composer mt-7 overflow-hidden rounded-[28px] border border-white/14 bg-[#20201e] shadow-[0_20px_80px_rgba(0,0,0,0.45)] transition ${
                submitting ? "translate-y-[-6px] scale-[1.01] border-white/35" : ""
              }`}
            >
              <label className="sr-only" htmlFor="hero-agent-prompt">
                Describe the NemoClaw agent you want to build
              </label>
              <textarea
                id="hero-agent-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                className="min-h-[112px] w-full resize-none border-0 bg-transparent px-6 pt-6 text-base leading-relaxed text-white outline-none placeholder:text-white/28"
                placeholder="Describe the NemoClaw agent you want to build..."
              />
              <div className="flex items-center justify-between gap-3 px-4 pb-4">
                <button
                  type="button"
                  className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition hover:bg-white/8 hover:text-white"
                  aria-label="Add context"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </button>
                <div className="flex items-center gap-3">
                  <span className="hidden text-sm text-white/62 sm:inline">
                    {submitting ? "Forging" : "Build"}
                  </span>
                  <button
                    type="submit"
                    className="grid h-11 w-11 place-items-center rounded-full bg-white text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!prompt.trim() || submitting || auth.loading}
                    aria-label="Build NemoClaw instance"
                  >
                    <ArrowUp className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              {promptChips.map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => fillPrompt(value)}
                  className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/45 transition hover:border-white/25 hover:text-white"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative hidden min-h-[100dvh] overflow-hidden sm:block">
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[72%_center] opacity-45 saturate-[0.7] sm:opacity-55"
          />
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute right-5 top-5 border border-white/18 bg-black/50 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white/60">
            safe mode
          </div>
          <div className="absolute bottom-5 left-5 right-5 grid gap-px border border-white/15 bg-white/10 text-xs text-white/72 md:grid-cols-3">
            {["workflow generated", "policy pack ready", "audit stream live"].map((item) => (
              <div key={item} className="bg-black/72 px-4 py-3 uppercase tracking-[0.2em]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="border-t border-white/10 bg-black px-6 py-14 md:px-10 lg:px-14 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">examples</div>
              <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
                Agents people are building.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-white/48">
              Pick one, tune the prompt, then ClawForge turns it into a workspace with tools, safety
              checks, memory, and a Brev deploy path.
            </p>
          </div>

          <div className="mt-10 grid gap-px border border-white/12 bg-white/10 md:grid-cols-2 xl:grid-cols-3">
            {exampleAgents.map(([title, description, examplePrompt]) => (
              <button
                key={title}
                type="button"
                onClick={() => fillPrompt(examplePrompt)}
                className="group bg-black p-5 text-left transition hover:bg-white/[0.035]"
              >
                <div className="text-lg font-semibold text-white">{title}</div>
                <p className="mt-3 min-h-[3.5rem] text-sm leading-relaxed text-white/50">
                  {description}
                </p>
                <div className="mt-5 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/35 transition group-hover:text-white/58">
                  {examplePrompt}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
      <AuthPanel
        forceOpen={Boolean(pendingPrompt) && !auth.isAuthenticated}
        locked
        onAuthenticated={continuePendingBuild}
      />
    </main>
  );
}
