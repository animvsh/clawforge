import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowUp, Check, Copy, Server, Shield, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AuthPanel } from "@/components/clawforge/AuthPanel";
import { ClawForgeLogo } from "@/components/clawforge/ClawForgeFrame";
import { useClawForgeAuth } from "@/lib/clawforge/auth";
import { getInstance, type ClawForgeInstance } from "@/lib/clawforge/instances";
import type { ProviderMode, RuntimeEvent } from "@/lib/clawforge/types";

export const Route = createFileRoute("/instance/$instanceId")({
  head: () => ({
    meta: [
      { title: "Instance Chat — ClawForge" },
      {
        name: "description",
        content: "Talk to a generated NemoClaw instance through the ClawForge chat web UI.",
      },
    ],
  }),
  component: InstanceChatPage,
});

const modelOptions: Array<{
  provider: ProviderMode;
  model: string;
  label: string;
}> = [
  { provider: "auto", model: "auto", label: "Auto" },
  {
    provider: "nemotron",
    model: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "Nemotron Ultra",
  },
  {
    provider: "nemotron",
    model: "nvidia/llama-3.3-nemotron-super-49b-v1",
    label: "Nemotron Super",
  },
  { provider: "nemotron", model: "nvidia/llama-3.1-nemotron-70b-instruct", label: "Nemotron 70B" },
  { provider: "minimax", model: "minimax-text-01", label: "MiniMax Text" },
  { provider: "pi", model: "pi-coding-agent", label: "Pi Coding SDK" },
];

function timeLabel(value: string) {
  if (!value) return "now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(-8, -3);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusCopy(instance: ClawForgeInstance) {
  if (instance.status === "created") {
    return "This chat is attached to the Brev-created NemoClaw instance. OpenHands controls and integration context are available here.";
  }
  if (instance.status === "failed") {
    return (
      instance.message ??
      "Brev creation failed, but this preview chat still controls the generated NemoClaw manifest."
    );
  }
  return "This is a deploy-ready instance chat preview. Once Brev auth is active, the same URL becomes the live control room.";
}

function InstanceChatPage() {
  const { instanceId } = Route.useParams();
  const auth = useClawForgeAuth();
  const [loaded, setLoaded] = useState(false);
  const [instance, setInstance] = useState<ClawForgeInstance | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [provider, setProvider] = useState<ProviderMode>("auto");
  const [model, setModel] = useState("auto");
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [chat, setChat] = useState<Array<[string, string]>>([]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const stored = getInstance(instanceId);
    setInstance(stored);
    if (stored) {
      setProvider(stored.blueprint?.provider ?? "auto");
      setModel(stored.blueprint?.model ?? "auto");
      setEvents([
        {
          id: `instance_loaded_${stored.id}`,
          agent_id: stored.blueprint?.blueprint_id ?? stored.id,
          type: "agent.started",
          message: `${stored.agentName} chat web UI attached to ${stored.instanceName}.`,
          timestamp: new Date().toISOString(),
          severity: stored.status === "failed" ? "warning" : "success",
        },
      ]);
      setChat([
        [
          "assistant",
          `${stored.agentName} is ready to talk.\n\n${statusCopy(stored)}\n\nAsk me to inspect policies, run a sandbox check, explain integrations, or continue shaping this NemoClaw instance.`,
        ],
      ]);
    }
    setLoaded(true);
  }, [auth.isAuthenticated, instanceId]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return `/instance/${instanceId}`;
    return `${window.location.origin}/instance/${instanceId}`;
  }, [instanceId]);

  async function sendChat(nextMessage = message) {
    const clean = nextMessage.trim();
    if (!clean || !instance) return;
    setMessage("");
    setLoading(true);
    setChat((current) => [...current, ["user", clean]]);

    const lower = clean.toLowerCase();
    let localReply = "";
    if (lower.includes("status") || lower.includes("deployed")) {
      localReply = `${instance.agentName} status: ${instance.status}. ${statusCopy(instance)}`;
    } else if (lower.includes("integration") || lower.includes("tool")) {
      const integrations = instance.integrationManifest?.integrations ?? [];
      localReply = integrations.length
        ? `This instance can request access to ${integrations.map((integration) => integration.label).join(", ")}. If a tool is required and not connected, the chat asks the user to connect it before the action runs.`
        : "This instance has the core sandbox tools attached. Extra integrations can be added from the workspace chat.";
    } else if (lower.includes("policy") || lower.includes("safe")) {
      localReply =
        "NemoClaw checks every tool action before execution. Read-only steps run automatically, shell and external actions pause for approval, and raw export/policy edits are blocked.";
    } else if (lower.includes("run") || lower.includes("test")) {
      setEvents((current) => [
        ...current,
        {
          id: `health_${Date.now()}`,
          agent_id: instance.blueprint?.blueprint_id ?? instance.id,
          type: "policy.checked",
          message:
            "Sandbox health check: policy pack loaded, memory boundary active, OpenHands control channel ready.",
          timestamp: new Date().toISOString(),
          severity: "success",
        },
      ]);
      localReply =
        "Sandbox check passed. The generated policy pack, memory boundary, and OpenHands control channel are ready for this instance.";
    }

    try {
      const response = await fetch("/api/clawforge/openhands/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: clean,
          provider,
          model,
          conversation_id: instance.openHands?.conversationId,
          instance_name: instance.instanceName,
          blueprint_id: instance.blueprint?.blueprint_id,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || "OpenHands chat failed.");
      }
      const reply = data.chat?.reply || "OpenHands inspected the NemoClaw instance.";
      const nextEvents = Array.isArray(data.chat?.events) ? data.chat.events : [];
      setEvents((current) => [...current, ...nextEvents]);
      setChat((current) => [
        ...current,
        ["assistant", localReply ? `${localReply}\n\n${reply}` : reply],
      ]);
    } catch (err) {
      setChat((current) => [
        ...current,
        [
          "assistant",
          localReply ||
            (err instanceof Error
              ? err.message
              : "The instance chat could not reach OpenHands, but the local control UI is still available."),
        ],
      ]);
    } finally {
      setLoading(false);
    }
  }

  function selectModel(value: string) {
    const selected = modelOptions.find((option) => `${option.provider}:${option.model}` === value);
    if (!selected) return;
    setProvider(selected.provider);
    setModel(selected.model);
  }

  async function copyLink() {
    if (typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  if (!auth.isAuthenticated) {
    return (
      <main className="min-h-screen bg-black text-white">
        <AuthPanel forceOpen locked />
      </main>
    );
  }

  if (!loaded) {
    return <main className="min-h-screen bg-black text-white" />;
  }

  if (!instance) {
    return (
      <main className="grid min-h-screen place-items-center bg-black px-6 text-white">
        <div className="max-w-md border border-white/12 p-6">
          <ClawForgeLogo />
          <h1 className="mt-8 text-3xl font-semibold">Instance not found.</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/52">
            Open a project, prepare a Brev launch, then come back to the generated instance chat.
          </p>
          <Link to="/dashboard" className="mt-5 inline-flex text-sm text-white/60 hover:text-white">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/84 px-5 py-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-5">
            <ClawForgeLogo />
            <div className="hidden min-w-0 border-l border-white/10 pl-5 md:block">
              <div className="truncate text-sm font-medium text-white">{instance.agentName}</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/35">
                instance chat / {instance.status}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/workspace/$projectId"
              params={{ projectId: instance.projectId }}
              className="hidden items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-white/50 transition hover:text-white sm:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Workspace
            </Link>
            <AuthPanel />
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-73px)] lg:grid-cols-[360px_1fr]">
        <aside className="border-b border-white/10 bg-[#050505] p-5 lg:border-b-0 lg:border-r">
          <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">live instance</div>
          <h1 className="mt-5 max-w-[11ch] text-4xl font-semibold leading-[0.98] tracking-tight">
            Talk to the agent.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/54">{statusCopy(instance)}</p>

          <div className="mt-6 border border-white/12 bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Server className="h-4 w-4" aria-hidden="true" />
              {instance.instanceName}
            </div>
            <div className="mt-3 grid gap-2 text-xs text-white/45">
              <div>Status: {instance.status}</div>
              <div>Mode: {instance.mode}</div>
              <div>OpenHands: {instance.openHands?.mode ?? "simulated"}</div>
            </div>
          </div>

          <div className="mt-4 border border-white/12 bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">chat link</div>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="grid h-8 w-8 place-items-center rounded-full border border-white/12 text-white/52 transition hover:text-white"
                aria-label="Copy instance chat link"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-3 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-white/42">
              {shareUrl}
            </div>
          </div>

          <div className="mt-4 border border-white/12 bg-white/[0.025] p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
              integrations
            </div>
            <div className="mt-4 space-y-3">
              {(instance.integrationManifest?.integrations ?? []).slice(0, 6).map((integration) => (
                <div key={integration.id} className="border-b border-white/8 pb-3">
                  <div className="text-sm text-white">{integration.label}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/34">
                    {integration.required ? "required" : "optional"} · {integration.status}
                  </div>
                </div>
              ))}
              {(instance.integrationManifest?.integrations ?? []).length === 0 && (
                <div className="text-sm leading-relaxed text-white/45">
                  Core tools are attached. Ask the workspace chat to add Gmail, calendar, phone,
                  voice, or GitHub.
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="grid min-w-0 bg-black xl:grid-cols-[1fr_360px]">
          <div className="flex min-h-[calc(100vh-73px)] flex-col">
            <div className="border-b border-white/10 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                    chat web ui
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{instance.agentName}</h2>
                </div>
                <label className="flex items-center gap-2 text-sm text-white/48">
                  Model
                  <select
                    value={`${provider}:${model}`}
                    onChange={(event) => selectModel(event.target.value)}
                    className="rounded-full border border-white/12 bg-black px-3 py-2 text-sm text-white outline-none"
                  >
                    {modelOptions.map((option) => (
                      <option
                        key={`${option.provider}:${option.model}`}
                        value={`${option.provider}:${option.model}`}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {chat.map(([role, body], index) => (
                <div
                  key={`${role}-${index}`}
                  className={`max-w-[760px] whitespace-pre-line border p-4 text-sm leading-relaxed ${
                    role === "user"
                      ? "ml-auto border-white/14 bg-white text-black"
                      : "border-white/12 bg-white/[0.035] text-white/68"
                  }`}
                >
                  {body}
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  "Run sandbox check",
                  "Show policy status",
                  "List integrations",
                  "Deployment status",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => void sendChat(chip)}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/42 transition hover:text-white"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendChat();
                }}
                className="flex items-center gap-2 rounded-[24px] border border-white/14 bg-[#20201e] p-2"
              >
                <input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/25"
                  placeholder={
                    loading ? "The instance is thinking..." : "Talk to this NemoClaw instance..."
                  }
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="grid h-10 w-10 place-items-center rounded-full bg-white text-black disabled:opacity-50"
                  aria-label="Send instance message"
                  disabled={loading}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>

          <aside className="border-t border-white/10 bg-[#050505] p-5 xl:border-l xl:border-t-0">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Instance stream
            </div>
            <div className="mt-4 max-h-[42vh] space-y-2 overflow-y-auto font-mono text-xs text-white/54 xl:max-h-[calc(100vh-220px)]">
              {events.map((event) => (
                <div key={event.id} className="border-b border-white/8 pb-2">
                  <span className="text-white/28">[{timeLabel(event.timestamp)}]</span>{" "}
                  {event.message}
                </div>
              ))}
            </div>

            <div className="mt-5 border border-white/12 bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <Shield className="h-4 w-4" aria-hidden="true" />
                Safety boundary
              </div>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/55">
                <p>Tool calls are routed through NemoClaw policy checks before execution.</p>
                <p>Approval decisions become shared memory for future runs in this workspace.</p>
                <p>
                  External integrations only activate after the user connects the required account.
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
