import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AgentBuilder } from "@/components/clawforge/AgentBuilder";
import { BlueprintReview } from "@/components/clawforge/BlueprintReview";
import { IncidentReport } from "@/components/clawforge/IncidentReport";
import { LiveDashboard } from "@/components/clawforge/LiveDashboard";
import heroImage from "@/assets/hero.png";
import { useReveal } from "@/hooks/use-reveal";
import type {
  BlueprintResponse,
  IncidentReport as IncidentReportModel,
} from "@/lib/clawforge/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClawForge — secure autonomous agents from one prompt" },
      {
        name: "description",
        content:
          "ClawForge generates OpenClaw-compatible agent instances powered by NVIDIA Nemotron, attaches tools and memory, writes NemoClaw policies, and deploys them with live audit logs.",
      },
    ],
  }),
  component: Index,
});

const simpleSteps = ["Prompt", "Blueprint", "Deploy", "Audit"];

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, shown } = useReveal();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={[
        "transition-all duration-700 ease-out will-change-transform",
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-5 w-5 text-[7px]" : "h-9 w-9 text-[11px]";
  return (
    <div className="flex items-center gap-3" aria-label="ClawForge">
      <div
        className={`${s} flex items-center justify-center bg-white text-black shadow-[0_0_24px_-4px_rgba(255,255,255,0.35)]`}
      >
        <span className="translate-x-[1px]">▶</span>
      </div>
      <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/45">
        clawforge
      </span>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
  id,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="border-t border-white/[0.07] px-6 md:px-12 lg:px-16 py-16">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          {eyebrow && (
            <div className="text-[11px] text-white/40 lowercase mb-4 tracking-[0.3em]">
              {eyebrow}
            </div>
          )}
          <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight lowercase leading-[1.08] max-w-2xl">
            {title}
          </h2>
        </Reveal>
        {children && (
          <Reveal delay={120} className="mt-10">
            {children}
          </Reveal>
        )}
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#161815]">
      <img
        src={heroImage}
        alt=""
        className="h-full w-full scale-105 object-cover object-[68%_50%] opacity-70 blur-[1px] saturate-[0.85]"
      />
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
      <div className="absolute right-6 top-6 hidden md:block">
        <div className="flex items-center gap-2 border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] uppercase tracking-[0.28em] text-white/65 backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          sandbox live
        </div>
      </div>
      <div className="absolute bottom-6 left-6 hidden border border-white/10 bg-black/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/50 backdrop-blur md:block">
        approval gate armed
      </div>
    </div>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-8">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">{title}</div>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55 lowercase">{body}</p>
    </div>
  );
}

function SimpleFlow() {
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-4">
      {simpleSteps.map((step, index) => (
        <div key={step} className="bg-black p-5">
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">
            {String(index + 1).padStart(2, "0")}
          </div>
          <div className="mt-3 text-base font-semibold lowercase text-white/90">{step}</div>
          <div className="mt-2 text-sm lowercase leading-relaxed text-white/55">
            {index === 0 && "Describe the workflow."}
            {index === 1 && "Review tools and policies."}
            {index === 2 && "Run the agent safely."}
            {index === 3 && "Watch logs, memory, and report."}
          </div>
        </div>
      ))}
    </div>
  );
}

function SafetyStrip() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {[
        ["Allowed", "Read logs and write local reports."],
        ["Approval", "Pause shell commands and external alerts."],
        ["Blocked", "Deny raw exports and unsafe actions."],
      ].map(([title, body]) => (
        <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="font-semibold lowercase text-white/90">{title}</div>
          <div className="mt-2 text-sm lowercase text-white/55">{body}</div>
        </div>
      ))}
    </div>
  );
}

function ReportPlaceholder() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-8">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">report waiting</div>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55 lowercase">
        Generate and deploy SentinelClaw, then deny or approve the pending shell action to complete
        the report.
      </p>
    </div>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-white/[0.07] px-6 py-20 md:px-12 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-8 md:p-10">
          <div className="text-[11px] lowercase tracking-[0.3em] text-white/45">
            ready for the demo
          </div>
          <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.08] tracking-tight lowercase lg:text-5xl">
            describe an agent. generate it. sandbox it. run it.
          </h2>
          <a
            href="#builder"
            className="mt-7 inline-block rounded-xl bg-white px-6 py-3 text-sm font-medium lowercase text-black transition hover:bg-white/90"
          >
            Build an Agent
          </a>
        </div>
      </div>
    </section>
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
      <div className="grid min-h-screen lg:grid-cols-[34%_66%]">
        <section className="relative order-2 flex min-h-[64vh] flex-col border-r border-white/[0.06] bg-black p-8 animate-fade-in lg:order-1 lg:min-h-screen lg:p-14">
          <Logo />

          <div className="mt-auto max-w-xl pb-8 pt-16 lg:pb-12">
            <h1 className="text-5xl font-semibold leading-[0.98] tracking-tight lowercase md:text-6xl lg:text-[4.6rem] xl:text-[5.2rem]">
              Build NemoClaw-secured agent instances from one prompt.
            </h1>
            <p className="mt-7 max-w-lg text-base leading-relaxed text-white/58 md:text-lg">
              ClawForge generates OpenClaw-compatible agent instances powered by NVIDIA Nemotron,
              attaches tools and memory, writes NemoClaw policies, and deploys them with live audit
              logs.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#builder"
                className="inline-block bg-white px-7 py-3.5 text-sm font-semibold lowercase text-black transition hover:bg-white/90"
              >
                Build an Agent
              </a>
              <a
                href="#dashboard"
                className="inline-block border border-white/20 px-7 py-3.5 text-sm font-semibold lowercase text-white transition hover:bg-white/[0.05]"
              >
                Watch Demo
              </a>
            </div>
          </div>
        </section>

        <section className="relative order-1 min-h-[42vh] overflow-hidden lg:order-2 lg:min-h-screen">
          <HeroVisual />
        </section>
      </div>

      <section id="builder" className="border-t border-white/[0.07] px-6 py-16 md:px-12 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="mb-4 text-[11px] lowercase tracking-[0.3em] text-white/45">builder</div>
            <h2 className="max-w-2xl text-3xl font-semibold leading-[1.08] tracking-tight lowercase lg:text-4xl">
              describe your agent. ClawForge will build it.
            </h2>
          </Reveal>
          <Reveal delay={120} className="mt-10">
            <AgentBuilder
              onBlueprint={(nextBlueprint) => {
                setBlueprint(nextBlueprint);
                setAgentId(undefined);
                setReport(null);
              }}
            />
          </Reveal>
        </div>
      </section>

      <Section id="how" eyebrow="flow" title="one clean path from prompt to audit.">
        <SimpleFlow />
      </Section>

      <Section id="blueprint" eyebrow="blueprint review" title="review the generated blueprint.">
        {blueprint ? (
          <BlueprintReview
            blueprint={blueprint}
            onDeployed={(nextAgentId) => setAgentId(nextAgentId)}
          />
        ) : (
          <EmptyPanel
            title="waiting for blueprint"
            body="Generate an agent above and the review panel will appear here."
          />
        )}
      </Section>

      <Section id="safety" eyebrow="safety" title="autonomy with guardrails.">
        <SafetyStrip />
      </Section>

      <Section id="dashboard" eyebrow="live dashboard" title="see every decision as it happens.">
        <LiveDashboard agentId={agentId} onReport={setReport} />
      </Section>

      <Section id="report" eyebrow="final output" title="final incident output.">
        {report ? <IncidentReport report={report} /> : <ReportPlaceholder />}
      </Section>

      <FinalCta />

      <footer className="flex flex-wrap justify-between gap-4 border-t border-white/[0.07] px-8 py-8 text-xs lowercase text-white/40 lg:px-16">
        <Logo size="sm" />
        <span>from prompt to protected agent · OpenClaw · NemoClaw · Nemotron</span>
      </footer>
    </main>
  );
}
