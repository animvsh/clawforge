import {
  buildBlueprintWorkflowGraph,
  buildOptimisticWorkflowGraph,
} from "@/lib/clawforge/workflow-graph";
import type { WorkflowGraph, WorkflowNode, WorkflowEdge } from "@/lib/clawforge/workflow-graph";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUp,
  Play,
  Rocket,
  MemoryStick,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClawForgeLogo } from "@/components/clawforge/ClawForgeFrame";
import { AuthPanel } from "@/components/clawforge/AuthPanel";
import { WorkflowCanvas } from "@/components/clawforge/WorkflowCanvas";
import { AgentPromptComposer } from "@/components/clawforge/AgentPromptComposer";
import { saveLaunchInstance } from "@/lib/clawforge/instances";
import { type ClawForgeProject, getProject, updateProject } from "@/lib/clawforge/projects";
import type {
  BlueprintResponse,
  IncidentReport,
  PolicyDefinition,
  RuntimeEvent,
  ToolDefinition,
} from "@/lib/clawforge/types";

export const Route = createFileRoute("/workspace/$projectId")({
  head: () => ({
    meta: [
      { title: "Workspace — ClawForge" },
      {
        name: "description",
        content: "Build, deploy, and run a NemoClaw instance from a single prompt.",
      },
    ],
  }),
  component: WorkspacePage,
});

type NodeState = "idle" | "generating" | "ready" | "running" | "waiting" | "blocked" | "done";

const buildSteps = [
  "Generating agent instructions",
  "Creating NemoClaw policy pack",
  "Building workflow graph",
  "Configuring memory rules",
  "Preparing deployment",
];

const generatedFiles = [
  ["agent.md", "Agent instructions and operating rules"],
  ["nemoclaw.policy.yaml", "Allow, approval, and deny policy pack"],
  ["tools.json", "Tool permission map"],
  ["memory.json", "Shared memory rules"],
  ["workflow.json", "Generated execution graph"],
  ["runtime.json", "Deployment and provider config"],
] as const;

type BrevLaunchState = {
  mode: string;
  instanceName: string;
  command: string;
  status?: {
    ok: boolean;
    status: string;
    message: string;
    cliPath: string | null;
  };
  openHands?: {
    mode: string;
    workspaceUrl: string | null;
    runtimeApiUrl: string | null;
  };
  integrationManifest?: {
    integrations?: Array<{
      id: string;
      label: string;
      status: string;
      required: boolean;
    }>;
    secret_names?: string[];
    capabilities?: Record<string, boolean>;
  };
};

function computeNodeStatus(
  index: number,
  activeIndex: number,
  status: ClawForgeProject["status"],
): "idle" | "generating" | "ready" | "running" | "waiting" | "blocked" | "done" {
  if (status === "waiting_for_approval" && index === 6) return "waiting";
  if (status === "completed") return "done";
  if (status === "running") {
    if (index < activeIndex) return "done";
    if (index === activeIndex) return "running";
    return "ready";
  }
  if (status === "deployed" || status === "ready") return index <= 6 ? "ready" : "idle";
  if (status === "generating") {
    if (index < activeIndex) return "ready";
    if (index === activeIndex) return "generating";
  }
  return "idle";
}

function WorkspacePage() {
  const { projectId } = Route.useParams();
  const [project, setProject] = useState<ClawForgeProject | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintResponse | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<Array<[string, string]>>([
    [
      "assistant",
      "Hello! I'm your NemoClaw assistant. I've loaded your agent based on your prompt. I'll walk you through the workflow as it executes. You can ask me anything about the agent's behavior, modify settings, or trigger actions from here.",
    ],
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [cloudDeploying, setCloudDeploying] = useState(false);
  const [brevLaunch, setBrevLaunch] = useState<BrevLaunchState | null>(null);
  const [instanceChatId, setInstanceChatId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"files" | "policies" | "memory">("files");
  const [error, setError] = useState<string | null>(null);
  const [workflowGraph, setWorkflowGraph] = useState<WorkflowGraph>({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);

  function handleNodesChange(updatedNodes: WorkflowNode[]) {
    setWorkflowGraph(prev => ({ ...prev, nodes: updatedNodes }));
  }

  function handleEdgesChange(newEdge: WorkflowEdge) {
    setWorkflowGraph(prev => ({
      ...prev,
      edges: [...prev.edges, newEdge]
    }));
  }

  const currentStatus = project?.status ?? "draft";
  const projectName = blueprint?.agent_name ?? project?.name ?? "NemoClaw Instance";

  const buildLog = useMemo(() => {
    if (!blueprint) return buildSteps.slice(0, Math.min(activeIndex + 1, buildSteps.length));
    return [
      ...buildSteps,
      `${blueprint.agent_name} blueprint ready`,
      `${blueprint.tools.length} tools mapped`,
      `${blueprint.policies.length} policies generated`,
    ];
  }, [activeIndex, blueprint]);

  const loadBlueprint = useCallback(
    async (nextProject: ClawForgeProject, options: { preserveChat?: boolean } = {}) => {
      setError(null);
      setActiveIndex(0);
      setAgentId(null);
      setReport(null);
      setEvents([]);
      setProject(updateProject(nextProject.id, { status: "generating" }) ?? nextProject);
      if (!options.preserveChat) {
        const promptContext = nextProject.prompt
          ? `\n\nThe user requested: "${nextProject.prompt.slice(0, 200)}${nextProject.prompt.length > 200 ? "…" : ""}"`
          : "";
        setChat([
          ["user", nextProject.prompt],
          [
            "assistant",
            `Hello! I’m your NemoClaw assistant. I’ve analyzed your agent goal and I’m generating the full workflow — tools, policies, memory rules, and deployment config now.${promptContext}\n\nYou can ask me anything about the agent’s behavior, modify settings, or trigger a deploy from here.`,
          ],
        ]);
      }
      try {
        const response = await fetch("/api/blueprints", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: nextProject.prompt, provider: "auto" }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error?.message || "Blueprint failed.");
        setBlueprint(data.blueprint);
        setWorkflowGraph(buildBlueprintWorkflowGraph(nextProject.prompt, data.blueprint));
        setProject(
          updateProject(nextProject.id, {
            name: data.blueprint.agent_name,
            status: "ready",
            blueprintId: data.blueprint.blueprint_id,
          }) ?? nextProject,
        );
        return data.blueprint as BlueprintResponse;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Blueprint failed.");
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    const stored = getProject(projectId);
    if (!stored) return;
    setProject(stored);
    setWorkflowGraph(buildOptimisticWorkflowGraph(stored.prompt));
    if (!stored.blueprintId || stored.status === "draft") {
      void loadBlueprint(stored, { preserveChat: true });
    } else {
      void loadBlueprint(stored, { preserveChat: true });
    }
  }, [loadBlueprint, projectId]);

  useEffect(() => {
    if (currentStatus !== "generating" && currentStatus !== "running") return;
    const timer = window.setInterval(
      () => {
        setActiveIndex((current) => Math.min(current + 1, 50));
      },
      currentStatus === "running" ? 850 : 420,
    );
    return () => window.clearInterval(timer);
  }, [currentStatus]);

  // Sync node statuses from project status and activeIndex
  useEffect(() => {
    setWorkflowGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node, index) => ({
        ...node,
        status: computeNodeStatus(index, activeIndex, currentStatus) as any,
      })),
    }));
  }, [activeIndex, currentStatus]);

  useEffect(() => {
    if (!agentId) return;
    const source = new EventSource(`/api/agents/${agentId}/logs/stream`);
    source.onmessage = (item) => {
      const event = JSON.parse(item.data) as RuntimeEvent;
      setEvents((current) => [...current, event]);
      if (event.type === "approval.requested") {
        setProject(
          updateProject(projectId, { status: "waiting_for_approval", agentId }) ?? project,
        );
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [agentId, project, projectId]);

  function updateShellPolicy(effect: "deny" | "require_approval") {
    setBlueprint((current) => {
      if (!current) return current;
      const permission = effect === "deny" ? "blocked" : "approval_required";
      const tools = current.tools.map(
        (tool): ToolDefinition =>
          tool.action === "shell.execute"
            ? {
                ...tool,
                permission,
                enabled: effect !== "deny",
                purpose:
                  effect === "deny"
                    ? "Shell execution is fully blocked by NemoClaw."
                    : "Runs remediation commands only after approval.",
              }
            : tool,
      );
      const policies = current.policies.map(
        (policy): PolicyDefinition =>
          policy.action === "shell.execute"
            ? {
                ...policy,
                effect,
                name:
                  effect === "deny"
                    ? "Block shell commands"
                    : "Require approval for shell commands",
                reason:
                  effect === "deny"
                    ? "Shell commands are disabled for this NemoClaw instance."
                    : "Shell commands can modify system state.",
              }
            : policy,
      );
      return {
        ...current,
        tools,
        policies,
        config_preview: `${current.config_preview}\nshell_policy: ${effect}`,
      };
    });
    setPanel("policies");
  }

  async function deploy(nextBlueprint = blueprint) {
    if (!nextBlueprint) return;
    setError(null);
    setActiveIndex(0);
    setEvents([]);
    setProject(updateProject(projectId, { status: "deployed" }) ?? project);
    try {
      const response = await fetch("/api/agents/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blueprint_id: nextBlueprint.blueprint_id,
          blueprint: nextBlueprint,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error?.message || "Deploy failed.");
      setAgentId(data.agent_id);
      const chatInstance = saveLaunchInstance({
        projectId,
        prompt: project?.prompt ?? nextBlueprint.goal,
        blueprint: nextBlueprint,
        launch: {
          mode: "created",
          instanceName: `local-${nextBlueprint.agent_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          command: `open /instance/${projectId}`,
          status: {
            status: "ready",
            message: "Local NemoClaw instance is running with a chat web UI.",
          },
          openHands: {
            mode: "simulated",
            workspaceUrl: null,
            runtimeApiUrl: null,
            conversationId: `local_${data.agent_id}`,
          },
        },
      });
      setInstanceChatId(chatInstance.id);
      setProject(
        updateProject(projectId, { status: "running", agentId: data.agent_id }) ?? project,
      );
      setChat((current) => [
        ...current,
        [
          "assistant",
          `${nextBlueprint.agent_name} is running inside NemoClaw. I’ll stream every policy check, tool call, approval request, memory update, and final output.\n\nInstance chat: /instance/${chatInstance.id}`,
        ],
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed.");
    }
  }

  async function prepareBrevLaunch(nextBlueprint = blueprint) {
    if (!nextBlueprint) return null;
    const instanceName = `clawforge-${nextBlueprint.agent_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const response = await fetch("/api/clawforge/brev/launch-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instance_name: instanceName,
        blueprint: nextBlueprint,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error?.message || "Could not prepare Brev launch.");
    }
    setBrevLaunch(data.launch);
    const chatInstance = saveLaunchInstance({
      projectId,
      prompt: project?.prompt ?? nextBlueprint.goal,
      blueprint: nextBlueprint,
      launch: data.launch,
    });
    setInstanceChatId(chatInstance.id);
    const launchEvents = Array.isArray(data.launch?.events) ? data.launch.events : [];
    setEvents((current) => [...current, ...launchEvents]);
    return data.launch as BrevLaunchState;
  }

  async function deployToBrev(nextBlueprint = blueprint) {
    if (!nextBlueprint) return;
    setCloudDeploying(true);
    setError(null);
    try {
      const launchPlan = brevLaunch ?? (await prepareBrevLaunch(nextBlueprint));
      const response = await fetch("/api/clawforge/brev/instances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instance_name:
            launchPlan?.instanceName ?? `clawforge-${nextBlueprint.agent_name.toLowerCase()}`,
          instance_type: "verda_L40S",
          confirmation: "CREATE_BREV_INSTANCE",
          blueprint: nextBlueprint,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || "Brev deploy failed.");
      }
      setBrevLaunch(data.launch);
      const chatInstance = saveLaunchInstance({
        projectId,
        prompt: project?.prompt ?? nextBlueprint.goal,
        blueprint: nextBlueprint,
        launch: data.launch,
      });
      setInstanceChatId(chatInstance.id);
      const launchEvents = Array.isArray(data.launch?.events) ? data.launch.events : [];
      setEvents((current) => [...current, ...launchEvents]);
      const cloudStatus =
        data.launch?.mode === "created"
          ? `Brev cloud instance creation started. The generated NemoClaw startup manifest, integrations, OpenHands connection, and secret names are attached.\n\nInstance chat: /instance/${chatInstance.id}`
          : `${data.launch?.status?.message || "Brev launch returned a setup issue."}\n\nInstance chat preview: /instance/${chatInstance.id}`;
      setChat((current) => [...current, ["assistant", cloudStatus]]);
      setProject(
        updateProject(projectId, {
          status: data.launch?.mode === "created" ? "deployed" : "ready",
        }) ?? project,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Brev deploy failed.";
      setError(message);
      setChat((current) => [...current, ["assistant", message]]);
    } finally {
      setCloudDeploying(false);
    }
  }

  async function decide(decision: "approved" | "denied") {
    if (!agentId) return;
    const response = await fetch("/api/approvals/approval_shell_block_ip/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (response.ok) {
      setProject(updateProject(projectId, { status: "completed" }) ?? project);
      const reportResponse = await fetch(`/api/agents/${agentId}/report`);
      const reportData = await reportResponse.json();
      setReport(reportData.report ?? null);
      setPanel("memory");
      setChat((current) => [
        ...current,
        [
          "assistant",
          decision === "denied"
            ? "Command denied. NemoClaw blocked execution, saved the decision to memory, and continued with a report-only workflow."
            : "Command approved. NemoClaw released the action and logged the approval.",
        ],
      ]);
    }
  }

  async function sendChat(nextMessage = message) {
    const clean = nextMessage.trim();
    if (!clean) return;
    setMessage("");
    const lower = clean.toLowerCase();
    setChat((current) => [...current, ["user", clean]]);
    setChatLoading(true);

    let actionReply = "";
    let action:
      | "deploy"
      | "show_policies"
      | "show_memory"
      | "deny"
      | "approve"
      | "show_files"
      | "explain_pause"
      | "block_shell"
      | "approval_shell"
      | "regenerate"
      | "augment"
      | "brev_plan"
      | "brev_deploy"
      | null = null;

    if (
      lower.includes("deploy") ||
      lower.includes("run test") ||
      lower === "run it" ||
      lower === "run"
    ) {
      if (
        lower.includes("brev") ||
        lower.includes("cloud") ||
        lower.includes("one click") ||
        lower.includes("one-click")
      ) {
        action = "brev_deploy";
        actionReply = "Creating the custom NemoClaw cloud instance on Brev.";
      } else {
        action = "deploy";
        actionReply = "Starting the local NemoClaw deployment now.";
      }
    } else if (
      lower.includes("brev") ||
      lower.includes("cloud launch") ||
      lower.includes("launch plan")
    ) {
      action = "brev_plan";
      actionReply = "Preparing a Brev launch plan for this custom NemoClaw instance.";
    } else if (lower.includes("polic")) {
      action = "show_policies";
      setPanel("policies");
      actionReply = "Opening the NemoClaw policy pack.";
    } else if (lower.includes("memory")) {
      action = "show_memory";
      setPanel("memory");
      actionReply = "Opening shared memory and approval history.";
    } else if (lower.includes("deny")) {
      action = "deny";
      actionReply = "Denying the pending command.";
    } else if (lower.includes("approve")) {
      action = "approve";
      actionReply = "Approving the pending command.";
    } else if (lower.includes("export") || lower.includes("file")) {
      action = "show_files";
      setPanel("files");
      actionReply = "Opening generated NemoClaw files.";
    } else if (
      lower.includes("block shell") ||
      lower.includes("shell commands blocked") ||
      lower.includes("no shell") ||
      lower.includes("disable shell")
    ) {
      action = "block_shell";
      actionReply = "Updating the NemoClaw policy pack so shell execution is blocked.";
    } else if (
      lower.includes("shell") &&
      (lower.includes("approval") || lower.includes("ask") || lower.includes("require"))
    ) {
      action = "approval_shell";
      actionReply = "Updating shell execution so it pauses for human approval.";
    } else if (
      lower.startsWith("create ") ||
      lower.startsWith("build ") ||
      lower.startsWith("generate ") ||
      lower.includes("create a nemoclaw agent") ||
      lower.includes("build a nemoclaw agent")
    ) {
      action = "regenerate";
      actionReply = "Regenerating the NemoClaw instance from your new goal.";
    } else if (
      lower.includes("add slack") ||
      lower.includes("add email") ||
      lower.includes("add calendar") ||
      lower.includes("add phone") ||
      lower.includes("add github") ||
      lower.includes("connect")
    ) {
      action = "augment";
      actionReply = "Updating the goal and rebuilding the integration-aware NemoClaw blueprint.";
    } else if (lower.includes("why")) {
      action = "explain_pause";
      actionReply =
        "NemoClaw paused shell execution because commands can change system state and require human approval.";
    }

    try {
      const response = await fetch("/api/clawforge/openhands/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: clean,
          provider: blueprint?.provider ?? "auto",
          model: blueprint?.model ?? "auto",
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || "OpenHands chat failed.");
      }
      const openHandsReply = data.chat?.reply || "OpenHands inspected the NemoClaw workspace.";
      const openHandsEvents = Array.isArray(data.chat?.events) ? data.chat.events : [];
      setEvents((current) => [...current, ...openHandsEvents]);
      setChat((current) => [
        ...current,
        ["assistant", actionReply ? `${actionReply}\n\n${openHandsReply}` : openHandsReply],
      ]);
    } catch (err) {
      setChat((current) => [
        ...current,
        [
          "assistant",
          actionReply ||
            (err instanceof Error
              ? err.message
              : "OpenHands chat is unavailable, but the local workspace controls still work."),
        ],
      ]);
    } finally {
      setChatLoading(false);
    }

    if (action === "deploy") {
      let activeBlueprint = blueprint;
      if (!activeBlueprint && project) {
        activeBlueprint = await loadBlueprint(project, { preserveChat: true });
      }
      void deploy(activeBlueprint);
    } else if (action === "brev_plan") {
      let activeBlueprint = blueprint;
      if (!activeBlueprint && project) {
        activeBlueprint = await loadBlueprint(project, { preserveChat: true });
      }
      if (activeBlueprint) {
        void prepareBrevLaunch(activeBlueprint)
          .then((launch) => {
            if (!launch) return;
            setChat((current) => [
              ...current,
              [
                "assistant",
                `Brev launch plan is ready for ${launch.instanceName}. Required secrets and integrations are attached to the NemoClaw startup manifest.`,
              ],
            ]);
          })
          .catch((err) => {
            setChat((current) => [
              ...current,
              ["assistant", err instanceof Error ? err.message : "Could not prepare Brev launch."],
            ]);
          });
      }
    } else if (action === "brev_deploy") {
      let activeBlueprint = blueprint;
      if (!activeBlueprint && project) {
        activeBlueprint = await loadBlueprint(project, { preserveChat: true });
      }
      void deployToBrev(activeBlueprint);
    } else if (action === "deny") {
      void decide("denied");
    } else if (action === "approve") {
      void decide("approved");
    } else if (action === "block_shell") {
      updateShellPolicy("deny");
      setChat((current) => [
        ...current,
        [
          "assistant",
          "Shell Executor is now blocked. NemoClaw will deny shell.execute instead of pausing for approval.",
        ],
      ]);
    } else if (action === "approval_shell") {
      updateShellPolicy("require_approval");
      setChat((current) => [
        ...current,
        [
          "assistant",
          "Shell Executor now requires approval. NemoClaw will pause the agent before shell.execute.",
        ],
      ]);
    } else if ((action === "regenerate" || action === "augment") && project) {
      const nextPrompt =
        action === "augment" ? `${project.prompt}\n\nChange request: ${clean}` : clean;
      const updated =
        updateProject(projectId, {
          prompt: nextPrompt,
          status: "generating",
          blueprintId: undefined,
          agentId: undefined,
        }) ?? project;
      setProject(updated);
      const nextBlueprint = await loadBlueprint(updated, { preserveChat: true });
      if (nextBlueprint) {
        setChat((current) => [
          ...current,
          [
            "assistant",
            `${nextBlueprint.agent_name} has been rebuilt from the chat. The canvas, policies, files, and deployment config now reflect the new goal.`,
          ],
        ]);
      }
    }
  }

  if (!project) {
    return (
      <main className="grid min-h-screen place-items-center bg-black px-6 text-white">
        <div className="max-w-md border border-white/12 p-6">
          <ClawForgeLogo />
          <h1 className="mt-8 text-3xl font-semibold">Project not found.</h1>
          <Link to="/dashboard" className="mt-5 inline-flex text-sm text-white/60 hover:text-white">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen overflow-hidden bg-black text-white">
      {/* LEFT: Chat panel */}
      <div className="flex w-[420px] shrink-0 flex-col border-r border-white/10">
        {/* Header */}
        <div className="border-b border-white/10 px-5 py-4">
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">agent chat</div>
          <div className="mt-1 text-lg font-semibold text-white">
            {project?.name ?? "Loading..."}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {chat.map(([role, content], i) => (
            <div key={i} className="flex flex-col gap-3">
              {role === "user" && content && (
                <div className="self-end rounded-xl rounded-br-md border border-white/10 bg-[#1e1e1e] px-4 py-3 text-sm text-white/80 max-w-[85%]">
                  {content}
                </div>
              )}
              {(role === "assistant" || role === "agent") && content && (
                <div className="self-start rounded-xl rounded-bl-md border border-white/10 bg-[#161616] px-4 py-3 text-sm text-white/60 max-w-[85%]">
                  {content}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-white/10 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const msg = message.trim();
              if (!msg) return;
              setChat((prev) => [...prev, [msg, ""]]);
              setMessage("");
              setTimeout(() => {
                setChat((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1][1] = "Got it! I'm processing your request. Watch the workflow on the right — nodes will start lighting up as I execute each step.";
                  return updated;
                });
              }, 1200);
            }}
            className="w-full"
          >
            <AgentPromptComposer
              value={message}
              onChange={setMessage}
              onSubmit={(msg) => {
                const clean = (msg ?? "").trim();
                if (!clean) return;
                setChat((prev) => [...prev, [clean, ""]]);
                setMessage("");
                setTimeout(() => {
                  setChat((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1][1] = "Got it! I'm processing your request. Watch the workflow on the right — nodes will start lighting up as I execute each step.";
                    return updated;
                  });
                }, 1200);
              }}
              ctaLabel="Send"
              showPlanToggle={false}
              onAttach={undefined}
              placeholder="Ask about your agent…"
              suggestions={[]}
            />
          </form>
        </div>
      </div>

      {/* RIGHT: Canvas + panels */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar (project name + actions) */}
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
          <div className="flex min-w-0 items-center gap-5">
            <ClawForgeLogo />
            <div className="hidden min-w-0 border-l border-white/10 pl-5 md:block">
              <div className="truncate text-sm font-medium text-white">{projectName}</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/35">
                NemoClaw instance / {currentStatus.replaceAll("_", " ")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCanvas((v) => !v)}
              className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/50 transition hover:text-white md:hidden"
            >
              {showCanvas ? "Chat" : "Canvas"}
            </button>
            <Link
              to="/dashboard"
              className="hidden rounded-full border border-white/12 px-4 py-2 text-sm text-white/50 transition hover:text-white sm:inline-flex"
            >
              Projects
            </Link>
            <button
              type="button"
              onClick={() => void deploy()}
              disabled={
                !blueprint ||
                currentStatus === "running" ||
                currentStatus === "waiting_for_approval"
              }
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {agentId ? "Run agent" : "Deploy"}
            </button>
            <button
              type="button"
              onClick={() => void deployToBrev()}
              disabled={!blueprint || cloudDeploying}
              className="hidden items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/28 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 md:inline-flex"
            >
              <Rocket className="h-4 w-4" aria-hidden="true" />
              {cloudDeploying ? "Launching" : "Brev"}
            </button>
            <AuthPanel />
          </div>
        </header>

        {/* Canvas area — hidden on mobile unless toggled */}
        <div className={`flex-1 overflow-hidden ${showCanvas ? "block" : "hidden md:block"}`}>
          <div className="flex h-full">
            {/* Main canvas */}
            <div className="flex-1 overflow-hidden">
              {workflowGraph.nodes.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-white/42">
                  Initializing workflow...
                </div>
              ) : (
                <WorkflowCanvas
                  graph={workflowGraph}
                  activeNodeId={workflowGraph.nodes[activeIndex]?.id}
                  selectedNodeId={selectedNodeId}
                  onNodeClick={(nodeId) => setSelectedNodeId(nodeId)}
                  onNodesChange={handleNodesChange}
                  onEdgesChange={handleEdgesChange}
                  className="h-full"
                />
              )}
            </div>

            {/* Right sidebar: node detail + panels */}
            <aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-black p-5">
              {/* Node detail */}
              {selectedNodeId && (() => {
                const node = workflowGraph.nodes.find((n) => n.id === selectedNodeId);
                if (!node) return null;
                const kindColors: Record<string, string> = {
                  sentinel: "border-l-blue-400",
                  executor: "border-l-purple-400",
                  monitor: "border-l-emerald-400",
                  memory: "border-l-amber-400",
                  input: "border-l-cyan-400",
                };
                const kindColor = kindColors[node.kind] ?? "border-l-white/20";
                return (
                  <div className={`mb-5 border border-white/12 bg-white/[0.03] p-4 border-l-4 ${kindColor}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-white/34 px-2 py-0.5 border border-white/14 rounded-full">
                            {node.kind}
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-medium text-white">{node.title}</h3>
                        <p className="mt-1 text-xs text-white/42">{node.subtitle}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedNodeId(null)}
                        className="text-white/28 hover:text-white transition text-lg leading-none"
                        aria-label="Close node detail"
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-white/38">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                      Status: {node.status}
                    </div>
                  </div>
                );
              })()}

              {/* Panel tabs */}
              <div className="grid grid-cols-3 gap-px border border-white/12 bg-white/10 text-xs">
                {(["files", "policies", "memory"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPanel(item)}
                    className={`bg-black px-3 py-3 capitalize transition ${
                      panel === item ? "text-white" : "text-white/38 hover:text-white"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              {/* Files panel */}
              <div className="mt-5 border border-white/12 bg-white/[0.025] p-4">
                {panel === "files" && (
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                      generated files
                    </div>
                    <div className="mt-4 space-y-3">
                      {generatedFiles.map(([name, body]) => (
                        <div key={name} className="border-b border-white/8 pb-3">
                          <div className="font-mono text-sm text-white">{name}</div>
                          <div className="mt-1 text-xs text-white/42">{body}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {panel === "policies" && (
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                      policy pack
                    </div>
                    <div className="mt-4 space-y-3">
                      {(blueprint?.policies ?? []).map((policy) => (
                        <div key={policy.id} className="border-b border-white/8 pb-3">
                          <div className="text-sm text-white">{policy.name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-white/34">
                            {policy.effect} · {policy.action}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {panel === "memory" && (
                  <div>
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/35">
                      <MemoryStick className="h-4 w-4" aria-hidden="true" />
                      memory
                    </div>
                    <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/55">
                      <p>User decision history is shared inside this workspace.</p>
                      <p>Future unknown IP remediation requires explicit approval.</p>
                      <p>Report-only workflow preferred after denied shell commands.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Brev cloud info */}
              <div className="mt-4 border border-white/12 bg-white/[0.025] p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/35">
                  <Rocket className="h-4 w-4" aria-hidden="true" />
                  brev cloud
                </div>
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/55">
                  <p>
                    {brevLaunch?.instanceName ?? "Custom NemoClaw instance will launch on Brev."}
                  </p>
                  <p>
                    {brevLaunch?.status?.message ??
                      "One-click deploy attaches blueprint, integrations, OpenHands, and startup config."}
                  </p>
                  {brevLaunch?.command && (
                    <code className="block overflow-hidden text-ellipsis whitespace-nowrap border-t border-white/8 pt-3 text-xs text-white/38">
                      {brevLaunch.command}
                    </code>
                  )}
                  {instanceChatId && (
                    <Link
                      to="/instance/$instanceId"
                      params={{ instanceId: instanceChatId }}
                      className="inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/88"
                    >
                      Open instance chat
                    </Link>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Mobile: chat below canvas (hidden when canvas is shown) */}
        <div className={`border-t border-white/10 md:hidden ${showCanvas ? "hidden" : "block"}`}>
          <div className="flex h-64 flex-col">
            <div className="border-b border-white/10 px-4 py-2">
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">chat</div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {chat.map(([role, content], i) => (
                <div key={i} className="flex flex-col gap-2">
                  {role === "user" && content && (
                    <div className="self-end rounded-xl rounded-br-md border border-white/10 bg-[#1e1e1e] px-3 py-2 text-xs text-white/80 max-w-[80%]">
                      {content}
                    </div>
                  )}
                  {(role === "assistant" || role === "agent") && content && (
                    <div className="self-start rounded-xl rounded-bl-md border border-white/10 bg-[#161616] px-3 py-2 text-xs text-white/60 max-w-[80%]">
                      {content}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendChat();
              }}
              className="flex items-center gap-2 border-t border-white/10 p-2"
            >
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/25"
                placeholder="Ask about your agent..."
              />
              <button
                type="submit"
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-black"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
