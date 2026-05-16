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
      { title: "ClawForge — Build NemoClaw agents that are safe enough to run" },
      {
        name: "description",
        content:
          "ClawForge turns one prompt into a NemoClaw blueprint, sandboxed agent, policy enforcement flow, memory boundary, and final report.",
      },
    ],
  }),
  component: Index,
});

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
    <section id={id} className="border-t border-white/[0.07] px-6 py-14 md:px-12 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          {eyebrow && (
            <div className="mb-4 text-[11px] lowercase tracking-[0.3em] text-white/35">
              {eyebrow}
            </div>
          )}
          <h2 className="max-w-2xl text-3xl font-semibold leading-[1.08] tracking-tight lowercase lg:text-4xl">
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
        className="h-full w-full scale-105 object-cover object-[62%_50%] opacity-64 blur-[1.5px] saturate-[0.78]"
      />
      <div className="absolute inset-0 bg-black/42" />
      <div className="absolute inset-y-0 left-0 w-36 bg-gradient-to-r from-black/85 to-transparent" />
    </div>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.02] p-7">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">{title}</div>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55 lowercase">{body}</p>
    </div>
  );
}

function ReportPlaceholder() {
  return (
    <div className="border border-white/10 bg-white/[0.02] p-7">
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
    <section className="border-t border-white/[0.07] px-6 py-16 md:px-12 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <div className="text-[11px] lowercase tracking-[0.3em] text-white/35">
            prompt to safe completion
          </div>
          <h2 className="mt-4 text-3xl font-semibold leading-[1.08] tracking-tight lowercase lg:text-5xl">
            prompt. blueprint. sandbox. enforce.
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/52 md:text-base">
            ClawForge keeps the path direct: describe a NemoClaw agent, inspect its policy pack,
            deploy it inside a sandbox, and finish with memory plus an audit-ready report.
          </p>
          <a
            href="#builder"
            className="mt-7 inline-block bg-white px-6 py-3 text-sm font-semibold lowercase text-black transition hover:bg-white/90"
          >
            build nemoclaw agent
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
        <section className="relative order-2 flex min-h-[64vh] animate-fade-in flex-col border-r border-white/[0.06] bg-black p-8 lg:order-1 lg:min-h-screen lg:p-14">
          <Logo />

          <div className="mt-auto max-w-xl pb-8 pt-16 lg:pb-12">
            <div className="mb-8 text-[11px] lowercase tracking-[0.34em] text-white/34">
              prompt -> blueprint -> sandbox -> policy -> memory
            </div>
            <h1 className="text-6xl font-semibold leading-[0.93] tracking-tight lowercase md:text-7xl lg:text-[5.6rem] xl:text-[6.2rem]">
              build NemoClaw agents that are safe enough to run.
            </h1>
            <p className="mt-7 max-w-md text-base leading-relaxed text-white/54 md:text-lg">
              ClawForge turns one prompt into a NemoClaw blueprint, sandboxed agent, live policy
              enforcement, approval gates, memory boundaries, and a final safety report.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#builder"
                className="inline-block bg-white px-7 py-3.5 text-sm font-semibold lowercase text-black transition hover:bg-white/90"
              >
                Build NemoClaw Agent
              </a>
              <a
                href="#dashboard"
                className="inline-block border border-white/20 px-7 py-3.5 text-sm font-semibold lowercase text-white transition hover:bg-white/[0.05]"
              >
                Watch Safety Demo
              </a>
            </div>
          </div>
        </section>

        <section className="relative order-1 min-h-[42vh] overflow-hidden lg:order-2 lg:min-h-screen">
          <HeroVisual />
        </section>
      </div>

      <section id="builder" className="border-t border-white/[0.07] px-6 py-14 md:px-12 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="mb-4 text-[11px] lowercase tracking-[0.3em] text-white/35">
              start with a NemoClaw prompt
            </div>
            <h2 className="max-w-2xl text-3xl font-semibold leading-[1.08] tracking-tight lowercase lg:text-4xl">
              describe the agent you want to control.
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

      <Section id="blueprint" eyebrow="review" title="check the blueprint.">
        {blueprint ? (
          <BlueprintReview
            blueprint={blueprint}
            onDeployed={(nextAgentId) => setAgentId(nextAgentId)}
          />
        ) : (
          <EmptyPanel
            title="waiting for blueprint"
            body="Generate a NemoClaw blueprint above and the sandbox, tools, policy pack, and memory rules will appear here."
          />
        )}
      </Section>

      <Section id="dashboard" eyebrow="run safely" title="watch NemoClaw enforce the run.">
        <LiveDashboard agentId={agentId} onReport={setReport} />
      </Section>

      <Section id="report" eyebrow="safe completion" title="read the final report.">
        {report ? <IncidentReport report={report} /> : <ReportPlaceholder />}
      </Section>

      <FinalCta />

      <footer className="flex flex-wrap justify-between gap-4 border-t border-white/[0.07] px-8 py-8 text-xs lowercase text-white/40 lg:px-16">
        <Logo size="sm" />
        <span>prompt -> NemoClaw blueprint -> sandboxed agent -> safe completion</span>
      </footer>
    </main>
  );
}
