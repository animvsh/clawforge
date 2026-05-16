import type {
  BlueprintResponse,
  IncidentReport,
  MemoryItem,
  ProviderMode,
  RuntimeEvent,
} from "@/lib/clawforge/types";
import { useEffect, useMemo, useState } from "react";

type BrevPanelState = {
  status: string;
  message: string;
  cliPath: string | null;
  instances: Array<Record<string, unknown>>;
  installCommand: string;
};

type LaunchPanelState = {
  mode: string;
  instanceName: string;
  command: string;
  integrationManifest?: {
    agent?: {
      name?: string;
      blueprint_id?: string | null;
    };
    integrations?: Array<{
      id: string;
      label: string;
      status: string;
      required: boolean;
      auth_config_id: string | null;
      connected_account_id: string | null;
    }>;
    inbox?: {
      email: string | null;
      status: string;
    };
    capabilities?: {
      agentphone: boolean;
      voice_agent: boolean;
      agent_inbox: boolean;
      docs_sheets_gmail: boolean;
    };
  };
  startupScript?: {
    path: string | null;
    inline: boolean;
  };
  openHands: {
    mode: string;
    workspaceUrl: string | null;
    runtimeApiUrl: string | null;
    serverImage: string;
    conversationId: string;
  };
};

type ComposioPanelState = {
  configured: boolean;
  connect_base_url: string;
  dashboard_url: string;
  phone_number: string | null;
  auth_configs: Array<{
    id: string;
    label: string;
    toolkit: string;
    purpose: string;
    status: string;
    auth_config_id: string | null;
    connected_account_id: string | null;
    connectable: boolean;
  }>;
};

type IntegrationNeed = {
  id: string;
  label: string;
  reason: string;
  status: "connected" | "connect";
};

type AgentInbox = {
  id: string;
  email: string;
  display_name: string;
  status: string;
};

const policies = [
  ["allow", "Log reading allowed"],
  ["allow", "Report writing allowed"],
  ["pause", "Shell execution requires approval"],
  ["pause", "External alerts require approval"],
  ["deny", "Raw log export blocked"],
  ["deny", "Secret access blocked"],
  ["deny", "Policy editing blocked"],
];

const commands = [
  "What are you doing?",
  "Show current incident.",
  "Why did NemoClaw pause this?",
  "Show memory.",
];

const chatModelOptions: Record<ProviderMode, Array<[string, string]>> = {
  auto: [["auto", "Auto fallback"]],
  nemotron: [
    ["nvidia/llama-3.1-nemotron-nano-8b-v1", "Nemotron Nano 8B"],
    ["nvidia/llama-3.1-nemotron-70b-instruct", "Nemotron 70B"],
    ["nvidia/nemotron-4-340b-instruct", "Nemotron 340B"],
  ],
  minimax: [
    ["minimax/token-plan", "MiniMax token plan"],
    ["abab6.5s-chat", "MiniMax abab6.5s"],
    ["MiniMax-Text-01", "MiniMax Text 01"],
  ],
  pi: [["pi-3-mini", "Pi coding"]],
  mock: [["mock/sentinelclaw", "Mock demo"]],
};

const chatProviderOptions: Array<[ProviderMode, string]> = [
  ["auto", "Auto"],
  ["nemotron", "Nemotron"],
  ["minimax", "MiniMax"],
  ["pi", "Pi"],
  ["mock", "Mock"],
];

function eventTone(event: RuntimeEvent) {
  if (event.severity === "error" || event.type === "policy.blocked") return "text-red-200";
  if (event.severity === "warning" || event.type === "approval.requested") return "text-amber-200";
  if (event.severity === "success" || event.type === "report.created") return "text-emerald-200";
  return "text-white/72";
}

export function LiveDashboard({
  agentId,
  blueprint,
  onReport,
}: {
  agentId?: string;
  blueprint?: BlueprintResponse | null;
  onReport?: (report: IncidentReport) => void;
}) {
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [status, setStatus] = useState<
    "ready to deploy" | "running" | "waiting_for_approval" | "completed" | "stopped"
  >("ready to deploy");
  const [approvalStatus, setApprovalStatus] = useState<"pending" | "approved" | "denied">(
    "pending",
  );
  const [chatReply, setChatReply] = useState("Deploy SentinelClaw to inspect the running agent.");
  const [brevStatus, setBrevStatus] = useState<BrevPanelState | null>(null);
  const [launchPlan, setLaunchPlan] = useState<LaunchPanelState | null>(null);
  const [composioStatus, setComposioStatus] = useState<ComposioPanelState | null>(null);
  const [sandboxMessage, setSandboxMessage] = useState("Inspect the generated NemoClaw sandbox.");
  const [sandboxReply, setSandboxReply] = useState("OpenHands sandbox chat is ready.");
  const [chatProvider, setChatProvider] = useState<ProviderMode>("auto");
  const [chatModel, setChatModel] = useState("auto");
  const [chatMeta, setChatMeta] = useState("Auto routes Nemotron, then MiniMax, then mock.");
  const [integrationNeeds, setIntegrationNeeds] = useState<IntegrationNeed[]>([]);
  const [creatingBrev, setCreatingBrev] = useState(false);
  const [connectingIntegration, setConnectingIntegration] = useState<string | null>(null);
  const [creatingInbox, setCreatingInbox] = useState(false);
  const [agentInbox, setAgentInbox] = useState<AgentInbox | null>(null);

  const agentName = blueprint?.agent_name ?? "SentinelClaw";
  const isReceptionist = blueprint?.template_id === "phone_receptionist";

  useEffect(() => {
    if (!agentId) {
      setStatus("ready to deploy");
      setEvents([]);
      setMemory([]);
      setReport(null);
      setApprovalStatus("pending");
      setChatReply(`Deploy ${agentName} to inspect the running agent.`);
      return;
    }

    setEvents([]);
    setApprovalStatus("pending");
    setStatus("waiting_for_approval");
    setChatReply(
      isReceptionist
        ? `${agentName} answered the call, checked availability, and is waiting before sending a customer text.`
        : `${agentName} is reading logs inside NemoClaw and waiting at the approval gate.`,
    );

    const source = new EventSource(`/api/agents/${agentId}/logs/stream`);
    source.onmessage = (message) => {
      setEvents((current) => [...current, JSON.parse(message.data)]);
    };
    source.onerror = () => source.close();

    fetch(`/api/agents/${agentId}/memory`)
      .then((response) => response.json())
      .then((data) => setMemory(data.memory ?? []))
      .catch(() => setMemory([]));

    fetch(`/api/agents/${agentId}/report`)
      .then((response) => response.json())
      .then((data) => {
        setReport(data.report ?? null);
        if (data.report) onReport?.(data.report);
      })
      .catch(() => setReport(null));

    return () => source.close();
  }, [agentId, agentName, isReceptionist, onReport]);

  useEffect(() => {
    fetch("/api/clawforge/brev/status")
      .then((response) => response.json())
      .then((data) => setBrevStatus(data.brev ?? null))
      .catch(() =>
        setBrevStatus({
          status: "error",
          message: "Could not reach the Brev status endpoint.",
          cliPath: null,
          instances: [],
          installCommand: "brew install brevdev/homebrew-brev/brev",
        }),
      );
  }, []);

  useEffect(() => {
    fetch("/api/clawforge/composio/status")
      .then((response) => response.json())
      .then((data) => setComposioStatus(data.composio ?? null))
      .catch(() => setComposioStatus(null));
  }, []);

  const statusRows = useMemo(
    () => [
      ["Status", status],
      ["Sandbox", agentId ? "NemoClaw active" : "Not deployed"],
      ["Policy", "Enforced"],
      ["Model", blueprint?.model ?? "NVIDIA Nemotron"],
      ["Memory", agentId ? "Active" : "Waiting"],
      ["Audit", agentId ? "Live" : "Waiting"],
    ],
    [agentId, blueprint?.model, status],
  );

  async function setRuntime(nextAction: "start" | "stop") {
    if (!agentId) return;
    const response = await fetch(`/api/agents/${agentId}/${nextAction}`, { method: "POST" });
    const data = await response.json();
    if (data.ok) {
      setStatus(data.status ?? (nextAction === "start" ? "running" : "stopped"));
      setEvents((current) => [
        ...current,
        {
          id: `runtime_${nextAction}_${Date.now()}`,
          agent_id: agentId,
          type: nextAction === "start" ? "agent.started" : "agent.completed",
          message: nextAction === "start" ? "Agent runtime resumed." : "Agent runtime stopped.",
          timestamp: new Date().toISOString(),
          severity: nextAction === "start" ? "success" : "warning",
        },
      ]);
    }
  }

  async function decide(decision: "approved" | "denied") {
    const response = await fetch("/api/approvals/approval_shell_block_ip/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = await response.json();
    if (data.ok) {
      setApprovalStatus(decision);
      if (data.runtime_status) setStatus(data.runtime_status);
      setChatReply(
        isReceptionist
          ? decision === "denied"
            ? "NemoClaw kept the text in draft mode, saved the decision to memory, and completed safely."
            : "NemoClaw logged the approval and released the confirmation text."
          : decision === "denied"
            ? "NemoClaw blocked the command, saved the decision to memory, and continued with a report-only workflow."
            : "NemoClaw logged the approval and released the shell action.",
      );
      setMemory((current) => {
        const nextItem = data.memory_item as MemoryItem;
        if (current.some((item) => item.id === nextItem.id || item.content === nextItem.content)) {
          return current;
        }
        return [...current, nextItem];
      });
      setEvents((current) => [...current, ...((data.events as RuntimeEvent[] | undefined) ?? [])]);
      if (data.report) {
        setReport(data.report);
        onReport?.(data.report);
      }
    }
  }

  async function prepareBrevLaunch() {
    const response = await fetch("/api/clawforge/brev/launch-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instance_name: "clawforge-nemoclaw",
        blueprint,
        agent_inbox: agentInbox,
      }),
    });
    const data = await response.json();
    if (data.ok && data.launch) {
      setLaunchPlan(data.launch);
      setBrevStatus(data.launch.status ?? brevStatus);
      setEvents((current) => [
        ...current,
        ...((data.launch.events as RuntimeEvent[] | undefined) ?? []),
      ]);
    }
  }

  async function createBrevSandbox() {
    setCreatingBrev(true);
    try {
      const response = await fetch("/api/clawforge/brev/instances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instance_name: "clawforge-nemoclaw",
          instance_type: "verda_L40S",
          confirmation: "CREATE_BREV_INSTANCE",
          blueprint,
          agent_inbox: agentInbox,
        }),
      });
      const data = await response.json();
      if (data.ok && data.launch) {
        setLaunchPlan(data.launch);
        setBrevStatus(data.launch.status ?? brevStatus);
        setEvents((current) => [
          ...current,
          ...((data.launch.events as RuntimeEvent[] | undefined) ?? []),
        ]);
        setSandboxReply(
          data.launch.ok
            ? "Brev accepted the NemoClaw launch. Watch the instance list for the remote workspace."
            : "Brev did not create the instance. Check the latest audit event for details.",
        );
      }
    } finally {
      setCreatingBrev(false);
    }
  }

  async function sendSandboxMessage() {
    const lowerMessage = sandboxMessage.toLowerCase();
    const nextNeeds: IntegrationNeed[] = [];
    if (/\b(phone|call|calls|receptionist|sms|text|voicemail)\b/.test(lowerMessage)) {
      nextNeeds.push({
        id: "phone_sms",
        label: "AgentPhone",
        reason: "Needed to answer calls and send customer confirmations.",
        status: "connect",
      });
    }
    if (/\b(calendar|schedule|appointment|booking|book|availability)\b/.test(lowerMessage)) {
      nextNeeds.push({
        id: "calendar",
        label: "Calendar",
        reason: "Needed to check availability and book appointments.",
        status: "connect",
      });
    }
    if (/\b(email|follow up|confirmation|intake)\b/.test(lowerMessage)) {
      nextNeeds.push({
        id: "email",
        label: "Email",
        reason: "Needed for follow-up summaries and confirmations.",
        status: "connect",
      });
    }
    if (nextNeeds.length) setIntegrationNeeds(nextNeeds);

    const response = await fetch("/api/clawforge/openhands/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: sandboxMessage, provider: chatProvider, model: chatModel }),
    });
    const data = await response.json();
    if (data.ok && data.chat) {
      setSandboxReply(data.chat.reply);
      const thinkingEvent = (data.chat.events as RuntimeEvent[] | undefined)?.find(
        (event) => event.type === "agent.thinking",
      );
      const provider = thinkingEvent?.metadata?.provider;
      const model = thinkingEvent?.metadata?.model;
      const fallback = thinkingEvent?.metadata?.fallback_chain;
      setChatMeta(
        [
          provider ? `Provider: ${provider}` : undefined,
          model ? `Model: ${model}` : undefined,
          fallback ? `Fallback: ${fallback}` : undefined,
        ]
          .filter(Boolean)
          .join(" · ") || "Sandbox chat completed.",
      );
      setEvents((current) => [
        ...current,
        ...((data.chat.events as RuntimeEvent[] | undefined) ?? []),
      ]);
      if (!launchPlan) {
        setLaunchPlan({
          mode: "dry_run",
          instanceName: "clawforge-nemoclaw",
          command:
            "brev create clawforge-nemoclaw --gpu-name L40S --startup-script @scripts/brev/setup-clawforge.sh",
          openHands: data.chat.openHands,
        });
      }
    }
  }

  async function connectIntegration(integrationId: string) {
    setConnectingIntegration(integrationId);
    try {
      const response = await fetch("/api/clawforge/integrations/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          integration_id: integrationId,
          user_id: "clawforge-demo-user",
          callback_url: window.location.href,
        }),
      });
      const data = await response.json();
      if (data.ok && data.connect) {
        const redirectUrl = data.connect.redirect_url as string | null;
        setSandboxReply(data.connect.message ?? "Integration connect link prepared.");
        if (redirectUrl) window.open(redirectUrl, "_blank", "noopener,noreferrer");
        const statusResponse = await fetch(
          "/api/clawforge/integrations?user_id=clawforge-demo-user",
        );
        const statusData = await statusResponse.json();
        setComposioStatus(statusData.integrations ?? null);
      } else {
        setSandboxReply(data.error?.message ?? "Could not prepare this integration.");
      }
    } catch {
      setSandboxReply("Could not prepare this integration.");
    } finally {
      setConnectingIntegration(null);
    }
  }

  async function createInbox() {
    setCreatingInbox(true);
    try {
      const response = await fetch("/api/clawforge/agentmail/inboxes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_name: agentName,
          blueprint_id: blueprint?.blueprint_id ?? "demo",
          username: `${agentName}-${blueprint?.template_id ?? "agent"}`,
        }),
      });
      const data = await response.json();
      if (data.ok && data.inbox) {
        setAgentInbox(data.inbox);
        setSandboxReply(`${agentName} now has an inbox: ${data.inbox.email}`);
      } else {
        setSandboxReply(data.error?.message ?? "Could not create the agent inbox.");
      }
    } catch {
      setSandboxReply("Could not create the agent inbox.");
    } finally {
      setCreatingInbox(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-px overflow-hidden border border-white/12 bg-white/10 md:grid-cols-3 lg:grid-cols-6">
        {statusRows.map(([label, value]) => (
          <div key={label} className="bg-black p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/32">{label}</div>
            <div className="mt-2 text-sm text-white/78">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.25fr_0.95fr]">
        <div className="border border-white/12 bg-white/[0.025]">
          <div className="border-b border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.24em] text-white/38">
            agent control
          </div>
          <div className="p-5">
            <h3 className="text-2xl font-semibold text-white">{agentName}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/55">Running inside NemoClaw.</p>
            <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={() => setRuntime("start")}
                disabled={!agentId || status === "running"}
                className="bg-white px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45"
              >
                Start
              </button>
              <button
                type="button"
                onClick={() => setRuntime("stop")}
                disabled={!agentId || status === "stopped"}
                className="border border-white/22 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Stop
              </button>
            </div>

            <div className="mt-6 grid gap-2">
              {commands.map((command) => (
                <button
                  key={command}
                  type="button"
                  onClick={() =>
                    setChatReply(
                      command.includes("pause")
                        ? isReceptionist
                          ? "NemoClaw paused sms.send because customer-facing messages require approval."
                          : "NemoClaw paused shell.execute because remediation commands can change system state."
                        : command.includes("memory")
                          ? memory.length
                            ? memory.map((item) => item.content).join(" ")
                            : "No memory has been written yet."
                          : isReceptionist
                            ? `${agentName} is handling the call, checking availability, and preparing a safe booking summary.`
                            : `${agentName} is reading logs, classifying suspicious behavior, and preparing a safe report.`,
                    )
                  }
                  className="border border-white/10 px-3 py-2 text-left text-xs text-white/58 transition hover:border-white/25 hover:text-white"
                >
                  {command}
                </button>
              ))}
            </div>

            <div className="mt-5 border border-white/10 p-3 text-xs leading-relaxed text-white/62">
              {chatReply}
            </div>
          </div>
        </div>

        <div className="overflow-hidden border border-white/12 bg-[#050505]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
              live NemoClaw audit stream
            </div>
            <div className="text-xs text-white/45">
              {agentId && status !== "stopped" && status !== "completed" ? "streaming" : "waiting"}
            </div>
          </div>
          <div className="min-h-96 p-5 font-mono text-xs leading-relaxed">
            {events.map((event, index) => (
              <div
                key={`${event.id}-${index}`}
                className="grid grid-cols-[112px_1fr] gap-3 border-b border-white/[0.06] py-2 last:border-0"
              >
                <span className="text-white/28">{event.type}</span>
                <span className={eventTone(event)}>{event.message}</span>
              </div>
            ))}
            {!events.length && <div className="text-white/35">Deploy the agent to start logs.</div>}
          </div>
        </div>

        <div className="grid gap-5">
          <div className="border border-white/12 bg-white/[0.025] p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
              active policies
            </div>
            <div className="mt-4 grid gap-2">
              {policies.map(([type, label]) => (
                <div key={label} className="grid grid-cols-[58px_1fr] gap-3 text-xs">
                  <span
                    className={
                      type === "deny"
                        ? "text-red-200"
                        : type === "pause"
                          ? "text-amber-200"
                          : "text-emerald-200"
                    }
                  >
                    {type}
                  </span>
                  <span className="text-white/62">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-white/12 bg-white/[0.025] p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
              sandbox instance
            </div>
            <div className="mt-4 grid gap-3 text-xs text-white/58">
              <div className="grid grid-cols-[92px_1fr] gap-3">
                <span className="text-white/32">Brev</span>
                <span>{brevStatus?.status ?? "checking"}</span>
              </div>
              <div className="grid grid-cols-[92px_1fr] gap-3">
                <span className="text-white/32">OpenHands</span>
                <span>{launchPlan?.openHands.mode ?? "simulated"}</span>
              </div>
              <div className="grid grid-cols-[92px_1fr] gap-3">
                <span className="text-white/32">Instance</span>
                <span>{launchPlan?.instanceName ?? "clawforge-nemoclaw"}</span>
              </div>
              <div className="grid grid-cols-[92px_1fr] gap-3">
                <span className="text-white/32">Image</span>
                <span className="break-all">
                  {launchPlan?.openHands.serverImage ??
                    "ghcr.io/openhands/agent-server:main-python"}
                </span>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/45">
              {brevStatus?.message ?? "Checking Brev CLI and remote sandbox readiness."}
            </p>
            {brevStatus?.status === "not_installed" && (
              <code className="mt-3 block border border-white/10 bg-black p-3 text-xs text-white/58">
                {brevStatus.installCommand}
              </code>
            )}
            {launchPlan && (
              <code className="mt-3 block break-all border border-white/10 bg-black p-3 text-xs text-white/58">
                {launchPlan.command}
              </code>
            )}
            {launchPlan?.integrationManifest && (
              <div className="mt-3 border border-emerald-300/20 bg-emerald-300/[0.045] p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/55">
                  attached integrations
                </div>
                <div className="mt-2 grid gap-1 text-xs text-emerald-100/75">
                  {(launchPlan.integrationManifest.integrations ?? [])
                    .filter(
                      (integration) =>
                        integration.required ||
                        integration.auth_config_id ||
                        integration.connected_account_id,
                    )
                    .slice(0, 6)
                    .map((integration) => (
                      <div key={integration.id} className="flex justify-between gap-3">
                        <span>{integration.label}</span>
                        <span className="text-emerald-100/45">
                          {integration.connected_account_id
                            ? "connected"
                            : integration.auth_config_id
                              ? "auth ready"
                              : integration.status.replaceAll("_", " ")}
                        </span>
                      </div>
                    ))}
                  {launchPlan.integrationManifest.inbox?.email && (
                    <div className="break-all text-emerald-100/55">
                      inbox: {launchPlan.integrationManifest.inbox.email}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={prepareBrevLaunch}
                className="bg-white px-3 py-2 text-xs font-semibold text-black"
              >
                Prepare Brev
              </button>
              <button
                type="button"
                onClick={createBrevSandbox}
                disabled={creatingBrev || brevStatus?.status !== "ready"}
                className="border border-white/25 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {creatingBrev ? "Deploying" : "Deploy NemoClaw instance"}
              </button>
              <span className="border border-amber-300/20 px-3 py-2 text-xs text-amber-100/72">
                about $1.63/hr
              </span>
            </div>
          </div>

          <div className="border border-white/12 bg-white/[0.025] p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
              Agent test chat
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <label className="grid gap-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
                Model family
                <select
                  value={chatProvider}
                  onChange={(event) => {
                    const nextProvider = event.target.value as ProviderMode;
                    setChatProvider(nextProvider);
                    setChatModel(chatModelOptions[nextProvider][0][0]);
                  }}
                  className="h-10 border border-white/12 bg-black px-3 text-sm normal-case tracking-normal text-white outline-none"
                >
                  {chatProviderOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
                Model
                <select
                  value={chatModel}
                  onChange={(event) => setChatModel(event.target.value)}
                  className="h-10 border border-white/12 bg-black px-3 text-sm normal-case tracking-normal text-white outline-none"
                >
                  {chatModelOptions[chatProvider].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              value={sandboxMessage}
              onChange={(event) => setSandboxMessage(event.target.value)}
              className="mt-4 min-h-24 w-full resize-none border border-white/12 bg-black p-3 text-sm text-white outline-none placeholder:text-white/30"
              placeholder="Ask OpenHands to inspect the sandbox..."
            />
            <button
              type="button"
              onClick={sendSandboxMessage}
              className="mt-3 bg-white px-3 py-2 text-xs font-semibold text-black"
            >
              Send to sandbox
            </button>
            <div className="mt-3 border border-white/10 p-3 text-xs leading-relaxed text-white/58">
              {sandboxReply}
            </div>
            {integrationNeeds.length > 0 && (
              <div className="mt-3 grid gap-2">
                {integrationNeeds.map((need) => (
                  <div
                    key={need.id}
                    className="grid gap-3 border border-white/10 bg-black p-3 text-xs sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="font-semibold text-white">{need.label} access needed</div>
                      <div className="mt-1 leading-relaxed text-white/45">{need.reason}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => connectIntegration(need.id)}
                      disabled={connectingIntegration === need.id}
                      className="self-start bg-white px-3 py-2 font-semibold text-black"
                    >
                      {connectingIntegration === need.id ? "Opening" : "Connect"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 text-[11px] leading-relaxed text-white/38">{chatMeta}</div>
          </div>

          <div className="border border-white/12 bg-white/[0.025] p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
              Integrations
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/45">
              Connect AgentPhone, Calendar, and agent inboxes so agents can answer calls, text
              customers, and book appointments. Each integration stays scoped and approval-gated.
            </p>
            <div className="mt-4 grid gap-2">
              {(composioStatus?.auth_configs ?? []).map((config) => (
                <div key={config.id} className="grid grid-cols-[82px_1fr_auto] gap-3 text-xs">
                  <span className="text-white/72">{config.label}</span>
                  <span className="text-white/38">{config.status.replaceAll("_", " ")}</span>
                  {config.connectable && config.status !== "connected" && (
                    <button
                      type="button"
                      onClick={() => connectIntegration(config.id)}
                      disabled={connectingIntegration === config.id}
                      className="text-white underline decoration-white/25 underline-offset-4 disabled:opacity-45"
                    >
                      {connectingIntegration === config.id ? "Opening" : "Connect"}
                    </button>
                  )}
                </div>
              ))}
              {!composioStatus && (
                <div className="text-xs text-white/38">Checking integrations.</div>
              )}
            </div>
            <div className="mt-5 grid gap-3">
              <div className="border border-white/10 bg-black p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Agent inbox</div>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">
                      Give this agent its own email address for confirmations, replies, and OTPs.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={createInbox}
                    disabled={creatingInbox || !!agentInbox}
                    className="bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-45"
                  >
                    {agentInbox ? "Created" : creatingInbox ? "Creating" : "Create inbox"}
                  </button>
                </div>
                {agentInbox && (
                  <div className="mt-3 break-all border border-emerald-300/20 bg-emerald-300/[0.06] p-2 text-xs text-emerald-100">
                    {agentInbox.email}
                  </div>
                )}
              </div>
              <div className="border border-white/10 bg-black p-3">
                <div className="text-sm font-semibold text-white">AgentPhone + Voice</div>
                <p className="mt-1 text-xs leading-relaxed text-white/45">
                  Phone numbers and Vapi voice agents are modeled as required capabilities. Add a
                  Vapi key to enable live voice provisioning.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <span className="border border-white/10 px-2 py-1 text-white/55">
                    Phone number
                  </span>
                  <span className="border border-white/10 px-2 py-1 text-white/55">
                    Voice runtime
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-white/45">
              <div>
                AgentPhone:{" "}
                <span className="text-white/68">
                  {composioStatus?.phone_number ?? "Connect a business number"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => connectIntegration("calendar")}
                className="text-white underline decoration-white/25 underline-offset-4"
              >
                Connect Calendar
              </button>
            </div>
          </div>

          <div className="border border-amber-300/28 bg-amber-300/[0.055] p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-amber-100/68">
              approval required
            </div>
            <p className="mt-3 text-sm leading-relaxed text-amber-50/82">
              <code>{isReceptionist ? "send_text +1-555-0100" : "block_ip 185.92.XX.XX"}</code> is
              paused by policy.
            </p>
            <div className="mt-3 text-xs text-amber-50/68">Status: {approvalStatus}</div>
            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={() => decide("approved")}
                disabled={!agentId || approvalStatus !== "pending"}
                className="bg-white px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45"
              >
                Approve Command
              </button>
              <button
                type="button"
                onClick={() => decide("denied")}
                disabled={!agentId || approvalStatus !== "pending"}
                className="border border-white/25 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Deny Command
              </button>
            </div>
          </div>

          <div className="border border-white/12 bg-white/[0.025] p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/38">
              memory updates
            </div>
            <div className="mt-4 grid gap-3">
              {memory.slice(-4).map((item) => (
                <div key={item.id} className="border border-white/10 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                    {item.type}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-white/62">{item.content}</div>
                </div>
              ))}
              {!memory.length && (
                <div className="text-xs text-white/38">No memory updates yet.</div>
              )}
            </div>
          </div>

          {report && (
            <div className="border border-emerald-300/24 bg-emerald-300/[0.055] p-4 text-sm text-emerald-100">
              Report ready: {report.title}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
