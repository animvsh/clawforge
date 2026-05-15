import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useReveal } from "@/hooks/use-reveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClawForge — secure autonomous agents from one prompt" },
      {
        name: "description",
        content:
          "ClawForge generates OpenClaw/NemoClaw agents powered by NVIDIA Nemotron, with MiniMax support, safety policies, memory, and live audit logs.",
      },
    ],
  }),
  component: Index,
});

/* ---------------- shared bits ---------------- */

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
    <section id={id} className="border-t border-white/[0.07] px-6 md:px-12 lg:px-16 py-28">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          {eyebrow && (
            <div className="text-[11px] text-white/40 lowercase mb-4 tracking-[0.3em]">
              {eyebrow}
            </div>
          )}
          <h2 className="text-3xl lg:text-5xl font-semibold tracking-tight lowercase leading-[1.05] max-w-3xl">
            {title}
          </h2>
        </Reveal>
        {children && (
          <Reveal delay={120} className="mt-12">
            {children}
          </Reveal>
        )}
      </div>
    </section>
  );
}

/* ---------------- chat demo ---------------- */

const chatScript: { from: "user" | "ai" | "staff"; text: string }[] = [
  { from: "user", text: "hi — do you have any availability this week?" },
  { from: "ai", text: "yes! tue 2pm or thu 10am both open. which works?" },
  { from: "user", text: "thu 10am please. also do you accept hsa?" },
  { from: "ai", text: "booked thu 10am ✓ confirmation sent. yes, we accept hsa." },
  { from: "staff", text: "new booking · thu 10am · hsa flagged for billing" },
];

function ChatDemo() {
  const [shown, setShown] = useState(1);

  useEffect(() => {
    const t = setInterval(() => {
      setShown((s) => (s >= chatScript.length ? 1 : s + 1));
    }, 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-[#0b0d12] to-[#06070a] border border-white/10 rounded-2xl overflow-hidden shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.07] text-[11px] uppercase tracking-[0.22em] text-white/45">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          scheduling employee · live
        </div>
        <div>sms</div>
      </div>

      <div className="flex-1 p-5 space-y-3 overflow-hidden">
        {chatScript.slice(0, shown).map((m, i) => (
          <div
            key={i}
            className={`flex ${
              m.from === "user" ? "justify-start" : "justify-end"
            } animate-fade-in`}
          >
            <div
              className={[
                "max-w-[80%] text-sm px-3.5 py-2.5 rounded-2xl leading-snug border",
                m.from === "user" && "bg-white/[0.04] border-white/10 text-white/85 rounded-bl-md",
                m.from === "ai" && "bg-white/[0.07] border-white/15 text-white/95 rounded-br-md",
                m.from === "staff" &&
                  "bg-emerald-500/10 border-emerald-500/30 text-emerald-100 text-xs rounded-xl",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-50 mb-0.5">
                {m.from === "user" ? "customer" : m.from === "ai" ? "clawforge" : "staff alert"}
              </div>
              {m.text}
            </div>
          </div>
        ))}

        {shown < chatScript.length && (
          <div className="flex justify-end animate-fade-in">
            <div className="bg-white/[0.04] border border-white/10 px-3 py-2 rounded-2xl flex gap-1">
              <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" />
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-white/[0.07] text-[11px] text-white/35 lowercase flex justify-between">
        <span>booked in calendar · billing notified</span>
        <span>human in the loop ✓</span>
      </div>
    </div>
  );
}

/* ---------------- prompt-to-config ---------------- */

function BuildDiagram() {
  const generated = [
    "workflows",
    "memory",
    "knowledge",
    "escalation rules",
    "channels",
    "approvals",
  ];

  return (
    <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-6 items-center">
      <div className="border border-white/10 rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.7)]">
        <div className="text-[11px] uppercase tracking-[0.28em] text-white/40 mb-3">
          you describe
        </div>
        <div className="font-mono text-sm text-white/85 leading-relaxed">
          <span className="text-white/40">$</span> create an ai employee that books appointments,
          answers pricing questions, and follows up with leads who didn't reply.
        </div>
      </div>

      <div className="flex items-center justify-center text-white/30 text-2xl">
        <span className="hidden lg:block">→</span>
        <span className="lg:hidden">↓</span>
      </div>

      <div className="border border-white/15 rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 shadow-[0_20px_60px_-30px_rgba(80,120,255,0.25)]">
        <div className="text-[11px] uppercase tracking-[0.28em] text-white/65 mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          clawforge generates
        </div>
        <div className="grid grid-cols-2 gap-2">
          {generated.map((g, i) => (
            <div
              key={g}
              className="text-xs text-white/75 border border-white/10 px-3 py-2 rounded-xl bg-black/40 animate-fade-in"
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
            >
              ✓ {g}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- supervision ---------------- */

function SupervisionDiagram() {
  const channels = ["whatsapp", "sms", "web chat", "email"];
  const teammates = ["scheduler", "support", "follow-ups"];
  const staff = ["dashboard", "approvals", "alerts", "audit logs"];

  return (
    <div className="border border-white/10 rounded-2xl p-6 md:p-10 bg-gradient-to-b from-white/[0.025] to-white/[0.005] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
      <div className="grid grid-cols-3 gap-6 items-center text-center">
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">customers</div>
          <div className="space-y-1.5">
            {channels.map((c) => (
              <div
                key={c}
                className="text-xs text-white/70 border border-white/10 py-2 rounded-xl bg-black/40"
              >
                {c}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/65">ai employees</div>
          <div className="border border-white/20 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-3 space-y-1.5 relative">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full animate-ping" />
            {teammates.map((t) => (
              <div
                key={t}
                className="text-xs text-white border border-white/15 bg-white/[0.06] py-2 rounded-xl"
              >
                {t}
              </div>
            ))}
          </div>
          <div className="text-[10px] text-white/35 lowercase">persistent · context-aware</div>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.28em] text-emerald-300/70">
            your team
          </div>
          <div className="space-y-1.5">
            {staff.map((s) => (
              <div
                key={s}
                className="text-xs text-emerald-100 border border-emerald-500/30 bg-emerald-500/10 py-2 rounded-xl"
              >
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- hero visual ---------------- */

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
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[60%] aspect-square rounded-full blur-[120px] bg-indigo-500/25 animate-pulse" />
      <div className="absolute bottom-0 left-0 w-[40%] aspect-square rounded-full blur-[120px] bg-blue-600/20" />
      <div className="absolute top-0 right-0 w-[35%] aspect-square rounded-full blur-[120px] bg-cyan-500/10" />

      <svg
        className="absolute inset-0 w-full h-full"
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
            strokeOpacity="0.2"
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

      <div className="absolute top-6 right-6 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-white/65 border border-white/10 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        live · 12 employees
      </div>
      <div className="absolute bottom-6 left-6 right-6 flex justify-between text-[10px] uppercase tracking-[0.28em] text-white/40">
        <span>customers</span>
        <span>· clawforge ·</span>
        <span>your team</span>
      </div>
    </div>
  );
}

/* ---------------- human in the loop ---------------- */

function HumanLoopDiagram() {
  const steps = [
    { label: "customer", sub: "messages, calls, or books" },
    { label: "ai employee", sub: "drafts the response" },
    { label: "your team", sub: "approves · edits · escalates" },
    { label: "action sent", sub: "calendar · crm · sms · email" },
  ];
  return (
    <div className="border border-white/10 rounded-2xl p-6 md:p-10 bg-gradient-to-b from-white/[0.025] to-white/[0.005] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {steps.map((s, i) => (
          <Reveal key={s.label} delay={i * 120}>
            <div className="relative border border-white/10 bg-black/40 p-5 rounded-xl h-full hover:border-white/25 transition">
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/30 mb-3">
                step {i + 1}
              </div>
              <div className="text-base font-semibold lowercase text-white/95">{s.label}</div>
              <div className="text-xs text-white/50 lowercase mt-1">{s.sub}</div>
              {i < steps.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -right-3 -translate-y-1/2 text-white/30 text-xl">
                  →
                </div>
              )}
            </div>
          </Reveal>
        ))}
      </div>
      <div className="mt-6 grid md:grid-cols-2 gap-3 text-xs">
        <div className="border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 rounded-xl text-emerald-100/85 lowercase flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          low-risk · auto-handled (faqs, bookings, reminders)
        </div>
        <div className="border border-white/15 bg-white/[0.03] px-4 py-3 rounded-xl text-white/80 lowercase flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          high-stakes · paused for you (refunds, contracts, edge cases)
        </div>
      </div>
    </div>
  );
}

/* ---------------- integrations ---------------- */

function IntegrationsGrid() {
  const tools = [
    { name: "twilio", cat: "phone & sms", featured: true },
    { name: "whatsapp", cat: "messaging", featured: true },
    { name: "gmail", cat: "email" },
    { name: "outlook", cat: "email" },
    { name: "google calendar", cat: "calendar" },
    { name: "slack", cat: "team chat" },
    { name: "notion", cat: "docs" },
    { name: "airtable", cat: "data" },
    { name: "google sheets", cat: "data" },
    { name: "hubspot", cat: "crm" },
    { name: "salesforce", cat: "crm" },
    { name: "stripe", cat: "payments" },
    { name: "mailchimp", cat: "outreach" },
    { name: "zoom", cat: "meetings" },
    { name: "linear", cat: "tasks" },
    { name: "drive", cat: "storage" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
        {tools.map((t, i) => (
          <div
            key={t.name}
            className="p-5 bg-black hover:bg-white/[0.04] transition group animate-fade-in"
            style={{ animationDelay: `${i * 35}ms`, animationFillMode: "both" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  t.featured ? "bg-white" : "bg-white/30 group-hover:bg-white/60"
                }`}
              />
              <div className="font-semibold lowercase text-sm">{t.name}</div>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-white/40">{t.cat}</div>
          </div>
        ))}
        <div className="p-5 bg-black flex flex-col justify-center">
          <div className="text-2xl font-semibold text-white/95">+ 250</div>
          <div className="text-[11px] uppercase tracking-wider text-white/40 mt-1">
            via composio
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] text-white/55 lowercase">
        <span>powered by</span>
        <span className="border border-white/10 px-3 py-1.5 rounded-full text-white/65">
          twilio · phones &amp; sms
        </span>
        <span className="border border-white/10 px-3 py-1.5 rounded-full text-white/65">
          composio · 250+ tools
        </span>
        <span className="border border-white/10 px-3 py-1.5 rounded-full text-white/65">
          mcp · open standard
        </span>
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

function Index() {
  const employees = [
    {
      name: "scheduler",
      desc: "books appointments, sends reminders, and reschedules without back-and-forth.",
    },
    {
      name: "support rep",
      desc: "answers pricing, hours, and faqs across sms, web chat, and email — 24/7.",
    },
    {
      name: "intake coordinator",
      desc: "collects what you need from every new lead and routes them to the right place.",
    },
    {
      name: "follow-up agent",
      desc: "chases unresponsive leads, quotes, and invoices on your cadence.",
    },
    {
      name: "knowledge desk",
      desc: "searches your docs, sops, and spreadsheets the moment someone asks.",
    },
    {
      name: "ops assistant",
      desc: "coordinates volunteers, contractors, or staff schedules in plain english.",
    },
  ];

  const builtFor = [
    "small businesses",
    "agencies",
    "clinics",
    "nonprofits",
    "local services",
    "operations teams",
    "solo founders",
    "community orgs",
    "growing startups",
  ];

  return (
    <main className="min-h-screen bg-black text-white">
      {/* HERO */}
      <div className="grid lg:grid-cols-2 min-h-screen">
        <section className="relative flex flex-col justify-between p-8 lg:p-14 animate-fade-in order-2 lg:order-1">
          <Logo />

          <div className="max-w-md">
            <div className="text-[11px] uppercase tracking-[0.32em] text-white/45 mb-5">
              lovable for ai employees
            </div>
            <h1 className="text-5xl lg:text-7xl font-semibold tracking-tight leading-[0.95] lowercase">
              hi. we're clawforge.
            </h1>
            <p className="mt-6 text-base text-white/65 leading-relaxed lowercase max-w-sm">
              build ai employees for your business in plain english. they automate intake, support,
              scheduling, follow-ups, and the operational work that drowns small teams.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#start"
                className="bg-white text-black px-5 py-3 text-sm font-medium lowercase rounded-xl hover:bg-white/90 transition shadow-[0_10px_30px_-10px_rgba(255,255,255,0.45)] inline-block"
              >
                start building ai employees
              </a>
              <a
                href="#demo"
                className="border border-white/20 text-white px-5 py-3 text-sm font-medium lowercase rounded-xl hover:bg-white/[0.05] transition inline-block"
              >
                see how it works
              </a>
            </div>

            <div className="mt-8 text-[11px] uppercase tracking-[0.28em] text-white/35">
              powered by clawforge
            </div>
          </div>

          <footer className="text-xs text-white/40 lowercase">
            © clawforge · ai employees, human-supervised
          </footer>
        </section>

        <section className="relative min-h-[55vh] lg:min-h-screen overflow-hidden order-1 lg:order-2 bg-[#04060f]">
          <HeroVisual />
        </section>
      </div>

      {/* PROBLEM */}
      <Section eyebrow="the problem" title="too much work. not enough hands. no budget to hire.">
        <div className="grid md:grid-cols-3 gap-3">
          {[
            { stat: "1", label: "small team" },
            { stat: "∞", label: "incoming work" },
            { stat: "0", label: "budget for another hire" },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <div className="border border-white/10 p-6 rounded-2xl bg-gradient-to-b from-white/[0.025] to-transparent hover:border-white/25 transition h-full">
                <div className="text-5xl font-semibold text-white/95">{s.stat}</div>
                <div className="text-sm text-white/55 lowercase mt-2">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 text-white/65 lowercase max-w-3xl leading-relaxed">
          clawforge gives small teams the operational capacity of a much larger one — without the
          payroll, the recruiting, or the engineering overhead.
        </p>
      </Section>

      {/* DEMO */}
      <Section id="demo" eyebrow="live demo" title="meet your scheduling employee.">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-8 items-stretch">
          <div className="h-[520px]">
            <ChatDemo />
          </div>
          <div className="space-y-6 self-center">
            <p className="text-white/70 lowercase leading-relaxed">
              a real conversation. a customer asks about availability, books an appointment, and
              asks a billing question — all answered in seconds. your team gets a clean handoff when
              it matters.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "answers across sms, whatsapp, web, and email",
                "follows your scripts and brand voice — every time",
                "writes to your calendar, crm, and tools directly",
                "escalates to a human when stakes are high",
              ].map((x, i) => (
                <Reveal key={x} delay={i * 100}>
                  <li className="border border-white/10 px-4 py-3 rounded-xl bg-white/[0.02] lowercase text-white/80">
                    ✓ {x}
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* HOW */}
      <Section id="how" eyebrow="how it works" title="describe the role. in plain english.">
        <BuildDiagram />
        <p className="mt-8 text-white/60 lowercase max-w-3xl leading-relaxed">
          clawforge automatically generates the workflows, memory, knowledge retrieval, escalation
          rules, communication channels, and approval systems your ai employee needs to start
          working.
        </p>
      </Section>

      {/* ARCHITECTURE */}
      <Section eyebrow="under the hood" title="ai employees that stay under your control.">
        <SupervisionDiagram />
      </Section>

      {/* HUMAN IN THE LOOP */}
      <Section eyebrow="human in the loop" title="every important decision goes through a person.">
        <HumanLoopDiagram />
      </Section>

      {/* INTEGRATIONS */}
      <Section
        eyebrow="connected"
        title="phones, inboxes, calendars, crms — wired in from day one."
      >
        <IntegrationsGrid />
      </Section>

      {/* EMPLOYEES */}
      <Section eyebrow="examples" title="the team you can build today.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
          {employees.map((e, i) => (
            <div
              key={e.name}
              className="bg-black p-6 hover:bg-white/[0.03] transition group animate-fade-in"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/50 group-hover:bg-white" />
                <div className="font-semibold lowercase">{e.name}</div>
              </div>
              <div className="text-sm text-white/60 lowercase leading-relaxed">{e.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* NEMOCLAW */}
      <Section eyebrow="powered by clawforge" title="a runtime built for persistent ai workers.">
        <div className="grid md:grid-cols-2 gap-3">
          {[
            {
              t: "memory",
              d: "remembers customers, context, and past decisions across every channel.",
            },
            {
              t: "workflows",
              d: "follows multi-step operational processes, not just one-off chats.",
            },
            { t: "tools", d: "calls phones, calendars, crms, and 250+ apps via composio and mcp." },
            {
              t: "guardrails",
              d: "stays inside your rules, escalates the rest, and logs everything.",
            },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 100}>
              <div className="border border-white/10 rounded-2xl p-6 bg-gradient-to-b from-white/[0.03] to-transparent hover:border-white/25 transition h-full">
                <div className="text-sm font-semibold lowercase text-white/95">{c.t}</div>
                <div className="text-sm text-white/60 lowercase leading-relaxed mt-2">{c.d}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* BUILT FOR */}
      <Section eyebrow="built for" title="small teams that need to do more with less.">
        <div className="flex flex-wrap gap-2">
          {builtFor.map((b) => (
            <span
              key={b}
              className="border border-white/15 px-4 py-2 text-sm text-white/75 lowercase rounded-full hover:border-white/40 hover:text-white transition"
            >
              {b}
            </span>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <section
        id="start"
        className="border-t border-white/[0.07] px-6 md:px-12 lg:px-16 py-32 relative overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] aspect-square rounded-full blur-[140px] bg-indigo-500/10" />
        </div>
        <div className="max-w-5xl mx-auto relative">
          <Reveal>
            <div className="text-[11px] text-white/45 lowercase mb-4 tracking-[0.3em]">
              your team needs more capacity
            </div>
            <h2 className="text-4xl lg:text-6xl font-semibold tracking-tight lowercase leading-[1.05] max-w-3xl">
              automate the work. keep the humans for what matters.
            </h2>
            <p className="mt-6 text-white/65 lowercase max-w-2xl leading-relaxed">
              build one ai employee for one workflow. expand when you're ready. human-supervised
              from day one — and priced for the budgets real small teams actually have.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#"
                className="bg-white text-black px-6 py-3 text-sm font-medium lowercase rounded-xl hover:bg-white/90 transition shadow-[0_10px_30px_-10px_rgba(255,255,255,0.45)] inline-block"
              >
                start building with clawforge
              </a>
              <a
                href="#"
                className="border border-white/20 text-white px-6 py-3 text-sm font-medium lowercase rounded-xl hover:bg-white/[0.05] transition inline-block"
              >
                talk to the team →
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-white/[0.07] px-8 lg:px-16 py-8 text-xs text-white/40 lowercase flex flex-wrap justify-between gap-4">
        <Logo size="sm" />
        <span>ai employees for the teams doing the most with the least · powered by clawforge</span>
      </footer>
    </main>
  );
}
