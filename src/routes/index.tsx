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
      { title: "ClawForge — secure NemoClaw agents from one prompt" },
      {
        name: "description",
        content:
          "ClawForge turns one prompt into a running NemoClaw agent with policies, memory, approvals, and live audit logs.",
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
      <div className="order-2 flex min-h-[68vh] flex-col border-r border-white/10 px-7 py-8 md:px-10 lg:order-1 lg:min-h-screen lg:px-14">
        <Logo />
        <div className="mt-8 max-w-sm">
          <AuthPanel />
        </div>

        <div className="mt-auto max-w-xl pb-8 pt-16">
          <div className="mb-8 text-[11px] uppercase tracking-[0.34em] text-white/35">
            prompt · sandbox · audit
          </div>
          <h1 className="text-5xl font-semibold leading-[0.96] tracking-tight text-white md:text-6xl xl:text-[5.25rem]">
            Build safe NemoClaw agents.
          </h1>
          <p className="mt-7 text-base leading-relaxed text-white/58 md:text-lg">
            ClawForge turns one prompt into a running agent with tools, memory, approval gates,
            policy enforcement, privacy guardrails, and live audit logs.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#builder"
              className="bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Build NemoClaw Agent
            </a>
            <a
              href="#dashboard"
              className="border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
            >
              Watch Safety Demo
            </a>
          </div>
        </div>
      </div>

      <div className="relative order-1 min-h-[44vh] overflow-hidden lg:order-2 lg:min-h-screen">
        <img
          src={heroImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-55 saturate-[0.7]"
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute right-5 top-5 border border-white/18 bg-black/50 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white/60">
          sandbox live
        </div>
        <div className="absolute bottom-5 left-5 right-5 grid gap-px overflow-hidden border border-white/15 bg-white/10 text-xs text-white/72 md:grid-cols-3">
          {["OpenClaw runtime", "NemoClaw policy", "Nemotron reasoning"].map((item) => (
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
    ["Describe", "Tell ClawForge what your NemoClaw agent should do."],
    ["Generate", "Create the sandbox profile, tools, memory rules, and policy pack."],
    ["Deploy", "Run SentinelClaw with Nemotron reasoning and NemoClaw enforcement."],
    ["Control", "Watch audit logs, approve risky actions, and save decisions to memory."],
  ];

  return (
    <Section id="how" eyebrow="flow" title="From prompt to protected agent.">
      <div className="grid gap-px overflow-hidden border border-white/12 bg-white/10 md:grid-cols-4">
        {steps.map(([title, body], index) => (
          <div key={title} className="min-h-44 bg-black p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
              0{index + 1}
            </div>
            <h3 className="mt-8 text-xl font-semibold text-white">{title}</h3>
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

      <Section id="builder" eyebrow="builder" title="Describe your NemoClaw agent.">
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

      <Section id="blueprint" eyebrow="review" title="Inspect the sandbox plan.">
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
            body="Generate the SentinelClaw demo blueprint above to review tools, policies, memory rules, and the NemoClaw deployment profile."
          />
        )}
      </Section>

      <Section id="dashboard" eyebrow="runtime" title="Watch NemoClaw enforce control.">
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

      <Section id="report" eyebrow="output" title="Finish with a useful report.">
        {report ? (
          <IncidentReport report={report} />
        ) : (
          <EmptyState
            title="report waiting"
            body="Deploy the agent, let it reach the shell approval gate, then approve or deny the command to generate the final incident report."
          />
        )}
      </Section>

      <footer className="border-t border-white/10 px-5 py-8 text-sm text-white/42 md:px-10 lg:px-14">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <Logo />
          <span>The secure agent factory for NemoClaw.</span>
        </div>
      </footer>
    </main>
  );
}
