import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AgentBuilder } from "@/components/clawforge/AgentBuilder";
import { BlueprintReview } from "@/components/clawforge/BlueprintReview";
import { IncidentReport } from "@/components/clawforge/IncidentReport";
import { LiveDashboard } from "@/components/clawforge/LiveDashboard";
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
          "ClawForge generates OpenClaw agents powered by NVIDIA Nemotron, connects tools, creates memory, writes safety policies, and deploys them inside NemoClaw with live audit logs.",
      },
    ],
  }),
  component: Index,
});

const heroStats = ["OpenClaw", "NemoClaw", "Nemotron", "MiniMax-ready"];

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
  const s = size === "sm" ? "w-5 h-5 text-[7px]" : "w-9 h-9 text-[11px]";
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${s} bg-gradient-to-br from-white to-white/70 text-black flex items-center justify-center rounded-lg shadow-[0_0_24px_-4px_rgba(255,255,255,0.35)]`}
      >
        <span className="translate-x-[1px]">▶</span>
      </div>
      <span className="text-[11px] uppercase tracking-[0.32em] text-white/45 font-medium">
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
  const nodes = [
    { x: 18, y: 22, size: 6, delay: 0 },
    { x: 32, y: 68, size: 4, delay: 0.4 },
    { x: 52, y: 38, size: 8, delay: 0.8 },
    { x: 70, y: 78, size: 5, delay: 1.2 },
    { x: 82, y: 28, size: 6, delay: 1.6 },
    { x: 44, y: 84, size: 4, delay: 2.0 },
    { x: 12, y: 52, size: 5, delay: 2.4 },
    { x: 90, y: 60, size: 6, delay: 0.6 },
  ];
  const edges: [number, number][] = [
    [0, 2],
    [1, 2],
    [2, 3],
    [2, 4],
    [3, 5],
    [6, 0],
    [4, 7],
    [2, 6],
  ];

  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(80,110,230,0.28) 0%, #0a1230 38%, #04060f 82%)",
        }}
      />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[54%] aspect-square rounded-full blur-[130px] bg-indigo-500/20" />
      <svg
        className="absolute inset-0 h-full w-full opacity-75"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke="white"
            strokeOpacity="0.14"
            strokeWidth="0.15"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {nodes.map((n, i) => (
          <g key={i}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.size / 3}
              fill="rgb(170, 200, 255)"
              opacity="0.3"
              style={{ animation: `pulse 2.8s ease-in-out ${n.delay}s infinite` }}
            />
            <circle
              cx={n.x}
              cy={n.y}
              r={n.size / 6}
              fill="white"
              opacity="0.95"
              style={{ animation: `pulse 2.8s ease-in-out ${n.delay}s infinite` }}
            />
          </g>
        ))}
      </svg>

      <div className="absolute right-6 top-6 hidden md:block">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-white/65 border border-white/10 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          sandbox live
        </div>
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
      <div className="grid min-h-[86vh] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative order-2 flex flex-col p-8 animate-fade-in lg:order-1 lg:p-14">
          <Logo />

          <div className="my-auto max-w-xl py-16 lg:py-10">
            <div className="mb-5 text-[11px] uppercase tracking-[0.22em] text-white/45">
              Describe an agent. Sandbox it. Run it.
            </div>
            <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight lowercase lg:text-6xl xl:text-[4.4rem]">
              Build secure autonomous agents from one prompt.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-white/65">
              ClawForge generates OpenClaw agents powered by NVIDIA Nemotron, connects tools,
              creates memory, writes safety policies, and deploys them inside NemoClaw with live
              audit logs.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#builder"
                className="inline-block rounded-xl bg-white px-5 py-3 text-sm font-medium lowercase text-black shadow-[0_10px_30px_-10px_rgba(255,255,255,0.45)] transition hover:bg-white/90"
              >
                Build an Agent
              </a>
              <a
                href="#dashboard"
                className="inline-block rounded-xl border border-white/20 px-5 py-3 text-sm font-medium lowercase text-white transition hover:bg-white/[0.05]"
              >
                Watch Demo
              </a>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.16em] text-white/35">
              {heroStats.map((stat) => (
                <span key={stat}>{stat}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="relative order-1 min-h-[38vh] overflow-hidden bg-[#04060f] lg:order-2 lg:min-h-[86vh]">
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
        <LiveDashboard agentId={agentId} />
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
