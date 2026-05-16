import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AgentBuilder } from "@/components/clawforge/AgentBuilder";
import { AuthPanel } from "@/components/clawforge/AuthPanel";
import { BlueprintReview } from "@/components/clawforge/BlueprintReview";
import { IncidentReport } from "@/components/clawforge/IncidentReport";
import { LiveDashboard } from "@/components/clawforge/LiveDashboard";
import heroImage from "@/assets/hero.png";
import type {
  BlueprintResponse,
  IncidentReport as IncidentReportModel,
} from "@/lib/clawforge/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClawForge — safe agents from one prompt" },
      {
        name: "description",
        content:
          "ClawForge turns plain English into a safe agent you can review, run, and control.",
      },
    ],
  }),
  component: Index,
});

function Logo() {
  return (
    <div className="flex items-center gap-3" aria-label="ClawForge">
      <div className="grid h-8 w-8 place-items-center bg-white text-[10px] font-black text-black">
        CF
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/50">
        clawforge
      </span>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-t border-white/10 px-5 py-12 md:px-10 lg:px-14">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[320px_1fr]">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-white/38">{eyebrow}</div>
          <h2 className="mt-4 max-w-sm text-3xl font-semibold leading-[1.02] tracking-tight md:text-4xl">
            {title}
          </h2>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

function Hero() {
  return (
    <section className="grid min-h-screen bg-black lg:grid-cols-[34%_66%]">
      <div className="order-1 flex min-h-[58vh] flex-col border-b border-white/10 px-6 py-6 md:px-10 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-14 lg:py-8">
        <div className="flex items-start justify-between gap-5">
          <Logo />
          <AuthPanel />
        </div>

        <div className="mt-auto max-w-xl pb-8 pt-20 sm:pt-24 lg:pb-8">
          <div className="mb-6 text-[10px] uppercase tracking-[0.3em] text-white/35 sm:text-[11px]">
            describe · review · run
          </div>
          <h1 className="max-w-[11ch] text-[3.35rem] font-semibold leading-[0.96] tracking-tight text-white sm:text-6xl xl:text-[5.25rem]">
            Build safe agents from one prompt.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/58 md:text-lg">
            Tell ClawForge what you want done. It builds the agent, adds guardrails, and shows you
            every step.
          </p>
          <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
            <a
              href="#builder"
              className="bg-white px-6 py-3 text-center text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Build an Agent
            </a>
            <a
              href="#dashboard"
              className="border border-white/25 px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/8"
            >
              Watch Safety Demo
            </a>
          </div>
        </div>
      </div>

      <div className="relative order-2 hidden min-h-[34vh] overflow-hidden sm:block lg:min-h-screen">
        <img
          src={heroImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[72%_center] opacity-45 saturate-[0.7] sm:opacity-55"
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute right-5 top-5 hidden border border-white/18 bg-black/50 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white/60 sm:block">
          safe mode
        </div>
        <div className="absolute bottom-5 left-5 right-5 hidden gap-px border border-white/15 bg-white/10 text-xs text-white/72 sm:grid md:grid-cols-3">
          {["agent created", "risky actions paused", "live activity"].map((item) => (
            <div key={item} className="bg-black/72 px-4 py-3 uppercase tracking-[0.2em]">
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-white/12 bg-white/[0.025] p-6">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">{title}</div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/56">{body}</p>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    ["Describe", "Say what the agent should do."],
    ["Review", "See the plan before it runs."],
    ["Run", "Watch every action live."],
    ["Approve", "You decide on risky steps."],
  ];

  return (
    <Section id="how" eyebrow="flow" title="How it works.">
      <div className="grid gap-px overflow-hidden border border-white/12 bg-white/10 md:grid-cols-4">
        {steps.map(([title, body], index) => (
          <div key={title} className="bg-black p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
              0{index + 1}
            </div>
            <h3 className="mt-6 text-xl font-semibold text-white">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/55">{body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Index() {
  const [blueprint, setBlueprint] = useState<BlueprintResponse | null>(null);
  const [agentId, setAgentId] = useState<string | undefined>();
  const [report, setReport] = useState<IncidentReportModel | null>(null);

  useEffect(() => {
    if (!agentId) return;
    fetch(`/api/agents/${agentId}/report`)
      .then((response) => response.json())
      .then((data) => setReport(data.report ?? null))
      .catch(() => setReport(null));
  }, [agentId]);

  return (
    <main className="min-h-screen bg-black text-white">
      <Hero />
      <HowItWorks />

      <Section id="builder" eyebrow="builder" title="Describe the agent you want.">
        <AgentBuilder
          onBlueprint={(nextBlueprint) => {
            setBlueprint(nextBlueprint);
            setAgentId(undefined);
            setReport(null);
            window.setTimeout(() => {
              document.getElementById("blueprint")?.scrollIntoView({ behavior: "smooth" });
            }, 80);
          }}
        />
      </Section>

      <Section id="blueprint" eyebrow="review" title="Review the plan.">
        {blueprint ? (
          <BlueprintReview
            blueprint={blueprint}
            onDeployed={(nextAgentId) => {
              setAgentId(nextAgentId);
              window.setTimeout(() => {
                document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" });
              }, 120);
            }}
          />
        ) : (
          <EmptyState
            title="blueprint waiting"
            body="Generate an agent above to review what it can do, what needs approval, and what is blocked."
          />
        )}
      </Section>

      <Section id="dashboard" eyebrow="runtime" title="Watch it run.">
        <LiveDashboard
          agentId={agentId}
          onReport={(nextReport) => {
            setReport(nextReport);
            window.setTimeout(() => {
              document.getElementById("report")?.scrollIntoView({ behavior: "smooth" });
            }, 120);
          }}
        />
      </Section>

      <Section id="report" eyebrow="output" title="Get the result.">
        {report ? (
          <IncidentReport report={report} />
        ) : (
          <EmptyState
            title="report waiting"
            body="Run the agent and approve or deny the risky step to finish the report."
          />
        )}
      </Section>

      <footer className="border-t border-white/10 px-5 py-8 text-sm text-white/42 md:px-10 lg:px-14">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <Logo />
          <span>Safe agents, built from plain English.</span>
        </div>
      </footer>
    </main>
  );
}
