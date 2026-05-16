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

const examplePrompt =
  "Create an agent that monitors system logs, detects suspicious behavior, writes an incident report, and asks before executing commands.";

const generationSteps = [
  "Understanding workflow",
  "Selecting agent type",
  "Choosing tools",
  "Creating memory",
  "Writing safety policies",
  "Preparing OpenClaw runtime",
  "Configuring NemoClaw sandbox",
  "Blueprint ready",
];

const heroStats = ["OpenClaw", "NemoClaw", "Nemotron", "MiniMax-ready"];

const liveLogs = [
  "Agent started inside NemoClaw sandbox.",
  "Reading system logs.",
  "Detected repeated failed login attempts.",
  "Classifying event with Nemotron.",
  "Severity: High.",
  "Generating incident report.",
  "Attempted action: execute remediation command.",
  "Policy check triggered.",
  "Approval required before shell execution.",
  "Waiting for user decision.",
];

const tools = [
  { name: "Log Reader", detail: "Reads incoming system logs.", permission: "Allowed", risk: "Low" },
  {
    name: "Threat Classifier",
    detail: "Detects suspicious patterns.",
    permission: "Allowed",
    risk: "Low",
  },
  {
    name: "Report Writer",
    detail: "Generates incident reports.",
    permission: "Allowed",
    risk: "Low",
  },
  {
    name: "Shell Executor",
    detail: "Requires approval before running commands.",
    permission: "Approval Required",
    risk: "High",
  },
  {
    name: "Alert Sender",
    detail: "Requires approval before notifying external channels.",
    permission: "Approval Required",
    risk: "Medium",
  },
];

const policies = [
  { rule: "Shell commands require human approval.", effect: "Approval Required" },
  { rule: "External alerts require human approval.", effect: "Approval Required" },
  { rule: "Raw log export is blocked.", effect: "Blocked" },
  { rule: "Report writing is allowed.", effect: "Allowed" },
  { rule: "Log reading is allowed.", effect: "Allowed" },
];

const features = [
  {
    title: "One-Prompt Agent Creation",
    body: "Describe the workflow. ClawForge generates the agent.",
  },
  {
    title: "OpenClaw Runtime",
    body: "Deploy agents that can reason, use tools, and complete multi-step tasks.",
  },
  {
    title: "Nemotron-Powered Reasoning",
    body: "Agents use NVIDIA Nemotron to plan, classify, decide, and act.",
  },
  {
    title: "NemoClaw Security Policies",
    body: "Risky actions are blocked, paused, or routed for approval before execution.",
  },
  {
    title: "Persistent Memory",
    body: "Agents remember prior decisions, user preferences, past incidents, and blocked actions.",
  },
  {
    title: "Live Audit Logs",
    body: "Every tool call, policy check, memory update, and approval request is visible in real time.",
  },
];

const safetyCards = [
  {
    label: "Allowed",
    body: "Read logs, inspect issues, summarize files, search documents.",
    tone: "emerald",
  },
  {
    label: "Approval Required",
    body: "Send alerts, post comments, execute commands, create tickets.",
    tone: "amber",
  },
  {
    label: "Blocked",
    body: "Export secrets, delete files, disable logs, bypass policies.",
    tone: "rose",
  },
];

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
    <section id={id} className="border-t border-white/[0.07] px-6 md:px-12 lg:px-16 py-20">
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

function PromptCard() {
  return (
    <div className="border border-white/10 bg-black/45 backdrop-blur rounded-2xl p-5 md:p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
      <div className="text-[10px] uppercase tracking-[0.26em] text-white/40 mb-3">
        describe your agent
      </div>
      <div className="font-mono text-sm leading-relaxed text-white/85 border border-white/10 rounded-xl bg-white/[0.035] p-4">
        {examplePrompt}
      </div>
    </div>
  );
}

function GenerationPanel() {
  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
          generate agent blueprint
        </div>
        <div className="text-[11px] text-emerald-300/80 lowercase">ready</div>
      </div>
      <div className="p-5 grid gap-2">
        {generationSteps.slice(0, 5).map((step, i) => (
          <div
            key={step}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/75 animate-fade-in"
            style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/15 text-[11px] text-emerald-200">
              ✓
            </span>
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

function BlueprintPreview() {
  return (
    <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6">
      <div className="border border-white/10 rounded-2xl bg-black/35 p-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-white/40 mb-4">
          your secure agent blueprint is ready
        </div>
        <h3 className="text-3xl font-semibold tracking-tight lowercase">SentinelClaw</h3>
        <p className="mt-4 text-sm text-white/65 lowercase leading-relaxed">
          SentinelClaw monitors system logs, detects suspicious behavior, classifies incidents,
          writes reports, and requests approval before executing risky actions.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
          {[
            ["Model", "NVIDIA Nemotron"],
            ["Option", "MiniMax-ready"],
            ["Runtime", "OpenClaw"],
            ["Sandbox", "NemoClaw"],
            ["Memory", "Active"],
          ].map(([label, value]) => (
            <div key={label} className="border border-white/10 rounded-xl bg-white/[0.03] p-3">
              <div className="uppercase tracking-[0.2em] text-white/35 text-[10px]">{label}</div>
              <div className="mt-1 text-white/80">{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        {tools.map((tool, i) => (
          <div
            key={tool.name}
            className="border border-white/10 rounded-xl bg-white/[0.025] p-4 animate-fade-in"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold lowercase text-white/95">{tool.name}</div>
                <div className="text-xs text-white/55 lowercase mt-1">{tool.detail}</div>
              </div>
              <div className="flex gap-2 text-[10px] uppercase tracking-[0.14em]">
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-white/55">
                  {tool.permission}
                </span>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-white/55">
                  {tool.risk}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SafetyCards() {
  const toneClass = {
    emerald: "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-100",
    amber: "border-amber-400/30 bg-amber-400/[0.07] text-amber-100",
    rose: "border-rose-400/30 bg-rose-400/[0.07] text-rose-100",
  };

  return (
    <div className="grid md:grid-cols-3 gap-3">
      {safetyCards.map((card) => (
        <div key={card.label} className={`rounded-2xl border p-6 ${toneClass[card.tone]}`}>
          <div className="text-lg font-semibold lowercase">{card.label}</div>
          <p className="mt-3 text-sm leading-relaxed opacity-75 lowercase">{card.body}</p>
        </div>
      ))}
    </div>
  );
}

function LiveLogPreview() {
  const [shown, setShown] = useState(4);

  useEffect(() => {
    const timer = setInterval(() => {
      setShown((current) => (current >= liveLogs.length ? 4 : current + 1));
    }, 1100);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#06070a] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
          live agent activity
        </div>
        <div className="flex items-center gap-2 text-[11px] text-emerald-300/75 lowercase">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          streaming
        </div>
      </div>
      <div className="p-5 font-mono text-xs leading-relaxed">
        {liveLogs.slice(0, shown).map((line, i) => (
          <div
            key={`${line}-${i}`}
            className="grid grid-cols-[58px_1fr] gap-3 border-b border-white/[0.05] py-2 last:border-0 animate-fade-in"
          >
            <span className="text-white/30">00:{String(i * 3 + 1).padStart(2, "0")}</span>
            <span
              className={
                line.includes("Approval") || line.includes("Policy")
                  ? "text-amber-200"
                  : line.includes("Severity")
                    ? "text-rose-200"
                    : "text-white/75"
              }
            >
              {line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PolicyTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      {policies.map((policy) => (
        <div
          key={policy.rule}
          className="grid gap-2 border-b border-white/[0.07] bg-black/35 p-4 text-sm last:border-0 md:grid-cols-[1fr_180px]"
        >
          <div className="text-white/75 lowercase">{policy.rule}</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
            {policy.effect}
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr_0.9fr]">
      <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">agent chat</div>
        <div className="mt-5 space-y-3 text-sm lowercase">
          <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] p-3 text-white/70">
            what are you doing?
          </div>
          <div className="rounded-2xl rounded-br-md border border-white/15 bg-white/[0.07] p-3 text-white/85">
            reading logs, classifying the incident, and waiting for approval before remediation.
          </div>
        </div>
      </div>
      <LiveLogPreview />
      <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">policy + memory</div>
        <div className="mt-5 grid gap-3">
          {[
            "Policy Mode: Enforced",
            "Memory: Active",
            "Blocked: raw log export",
            "Pending: shell approval",
          ].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70"
            >
              {item}
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-4 text-sm text-amber-100">
          <div className="font-semibold lowercase">Approval Required</div>
          <p className="mt-2 text-xs leading-relaxed opacity-80">
            The agent wants to execute `block_ip 185.92.XX.XX`. NemoClaw policy requires human
            approval before this can continue.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black">
              Approve Action
            </button>
            <button className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white">
              Deny Action
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FinalReport() {
  const rows = [
    ["Severity", "High"],
    ["Detected Behavior", "Repeated failed login attempts"],
    ["Likely Threat", "Brute-force login attempt"],
    [
      "Recommended Action",
      "Review source IP, monitor additional attempts, and block only after approval",
    ],
    ["Policy Result", "Shell command paused for approval"],
    ["Final Decision", "User denied command execution"],
    ["Memory Update", "Future shell actions for unknown IPs require explicit approval"],
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6">
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">
        incident report generated
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/65 lowercase">
        SentinelClaw detected suspicious login behavior, classified the event as high severity,
        generated an incident report, and safely paused before executing any remediation command.
      </p>
      <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-2 bg-black p-4 text-sm md:grid-cols-[200px_1fr]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">{label}</div>
            <div className="text-white/75">{value}</div>
          </div>
        ))}
      </div>
    </div>
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
      <div className="grid min-h-[92vh] lg:grid-cols-[0.9fr_1.1fr]">
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

        <section className="relative order-1 min-h-[44vh] overflow-hidden bg-[#04060f] lg:order-2 lg:min-h-[92vh]">
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

      <Section id="how" eyebrow="how it works" title="from prompt to protected agent.">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["Describe", "Tell ClawForge what you want your agent to do."],
            ["Generate", "ClawForge creates the tools, memory, policies, and workflow steps."],
            [
              "Deploy",
              "The agent runs with OpenClaw, reasons with Nemotron, and operates inside NemoClaw.",
            ],
            ["Control", "Live logs, approval gates, and policy checks keep the agent accountable."],
          ].map(([title, body], i) => (
            <Reveal key={title} delay={i * 100}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.025] p-6">
                <div className="text-[11px] uppercase tracking-[0.25em] text-white/35">
                  step {i + 1}
                </div>
                <div className="mt-4 text-lg font-semibold lowercase">{title}</div>
                <p className="mt-3 text-sm leading-relaxed text-white/60 lowercase">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="features" eyebrow="features" title="everything your agent needs to run safely.">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className="bg-black p-6 transition hover:bg-white/[0.03] animate-fade-in"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
            >
              <div className="font-semibold lowercase text-white/95">{feature.title}</div>
              <p className="mt-3 text-sm leading-relaxed text-white/60 lowercase">{feature.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="blueprint"
        eyebrow="blueprint review"
        title="your secure agent blueprint is ready."
      >
        {blueprint ? (
          <BlueprintReview
            blueprint={blueprint}
            onDeployed={(nextAgentId) => setAgentId(nextAgentId)}
          />
        ) : (
          <BlueprintPreview />
        )}
      </Section>

      <Section id="safety" eyebrow="safety" title="autonomy with guardrails.">
        <div className="grid gap-8">
          <p className="max-w-3xl text-white/65 lowercase leading-relaxed">
            ClawForge does not just help agents act. It helps them act safely. Every generated agent
            includes policy rules that define what it can do, what requires approval, and what is
            completely blocked.
          </p>
          <SafetyCards />
          <PolicyTable />
        </div>
      </Section>

      <Section id="dashboard" eyebrow="live dashboard" title="see every decision as it happens.">
        <LiveDashboard agentId={agentId} />
      </Section>

      <Section id="report" eyebrow="final output" title="incident report generated.">
        {report ? <IncidentReport report={report} /> : <FinalReport />}
      </Section>

      <section className="relative overflow-hidden border-t border-white/[0.07] px-6 py-24 md:px-12 lg:px-16">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 aspect-square w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[140px]" />
        </div>
        <div className="relative mx-auto max-w-5xl">
          <Reveal>
            <div className="mb-4 text-[11px] lowercase tracking-[0.3em] text-white/45">
              fastest path to safe autonomy
            </div>
            <h2 className="max-w-3xl text-4xl font-semibold leading-[1.07] tracking-tight lowercase lg:text-5xl">
              ClawForge is not just an agent. It is the fastest way to build and safely deploy
              autonomous agents.
            </h2>
            <p className="mt-6 max-w-2xl text-white/65 lowercase leading-relaxed">
              In our demo, ClawForge creates a cybersecurity incident response agent that monitors
              logs, detects suspicious activity, writes a report, and pauses before executing risky
              commands.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#builder"
                className="inline-block rounded-xl bg-white px-6 py-3 text-sm font-medium lowercase text-black shadow-[0_10px_30px_-10px_rgba(255,255,255,0.45)] transition hover:bg-white/90"
              >
                Build an Agent
              </a>
              <a
                href="#dashboard"
                className="inline-block rounded-xl border border-white/20 px-6 py-3 text-sm font-medium lowercase text-white transition hover:bg-white/[0.05]"
              >
                Watch Demo
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="flex flex-wrap justify-between gap-4 border-t border-white/[0.07] px-8 py-8 text-xs lowercase text-white/40 lg:px-16">
        <Logo size="sm" />
        <span>from prompt to protected agent · OpenClaw · NemoClaw · Nemotron</span>
      </footer>
    </main>
  );
}
