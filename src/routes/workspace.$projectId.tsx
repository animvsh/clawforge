import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUp,
  Check,
  FileText,
  MessagesSquare,
  Rocket,
  Shield,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClawForgeLogo } from "@/components/clawforge/ClawForgeFrame";
import { AuthPanel } from "@/components/clawforge/AuthPanel";
import { useClawForgeAuth } from "@/lib/clawforge/auth";
import { saveLaunchInstance } from "@/lib/clawforge/instances";
import {
  chatModelOptions,
  matchModelCommand,
  modelKey,
  optionForModel,
  parseModelKey,
  recommendModelForTemplate,
} from "@/lib/clawforge/models";
import { type ClawForgeProject, getProject, updateProject } from "@/lib/clawforge/projects";
import type {
  BlueprintResponse,
  IncidentReport,
  PolicyDefinition,
  ProviderMode,
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

const workflowNodes = [
  ["system_logs", "System Logs", "Input inside sandbox", "input"],
  ["log_reader", "Log Reader", "Allowed tool", "tool"],
  ["pattern_detector", "Pattern Detector", "Find suspicious behavior", "agent"],
  ["nemotron", "NVIDIA Nemotron", "Classify severity", "model"],
  ["report_writer", "Report Writer", "Write local report", "tool"],
  ["policy_check", "NemoClaw Policy", "Check risky action", "policy"],
  ["approval", "Human Approval", "Pause before action", "approval"],
  ["memory", "Memory Update", "Save user decision", "memory"],
  ["report", "Final Report", "Complete safely", "output"],
] as const;

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
    pipedream?: {
      configured: boolean;
      connections?: Array<{
        id: string;
        label: string;
        app: string;
        required: boolean;
        status: string;
      }>;
    };
    secret_names?: string[];
    capabilities?: Record<string, boolean>;
  };
};

type ClarificationQuestion = {
  question: string;
  suggestions: string[];
};

function nodeState(
  index: number,
  activeIndex: number,
  status: ClawForgeProject["status"],
): NodeState {
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

function stateClass(state: NodeState) {
  if (state === "done") return "border-emerald-300/35 bg-emerald-300/[0.06] text-emerald-100";
  if (state === "running")
    return "border-blue-300/45 bg-blue-300/[0.07] text-blue-100 shadow-[0_0_40px_rgba(59,130,246,0.12)]";
  if (state === "waiting") return "border-amber-300/55 bg-amber-300/[0.08] text-amber-100";
  if (state === "blocked") return "border-red-300/45 bg-red-300/[0.08] text-red-100";
  if (state === "generating") return "border-white/32 bg-white/[0.05] text-white";
  if (state === "ready") return "border-white/18 bg-white/[0.025] text-white/74";
  return "border-white/10 bg-black text-white/42";
}

function setupQuestionsForPrompt(prompt: string): ClarificationQuestion[] {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();
  const questions: ClarificationQuestion[] = [];
  const words = clean.split(/\s+/).filter(Boolean);
  const hasConcreteAction =
    /(monitor|watch|read|answer|book|schedule|triage|summarize|research|write|detect|send|create|call|route|classif)/.test(
      lower,
    );
  const hasToolOrData =
    /(phone|call|sms|calendar|email|gmail|slack|github|linear|ticket|log|file|browser|search|crm|sheet|doc)/.test(
      lower,
    );
  const hasSafety =
    /(ask|approval|approve|deny|block|before|safe|policy|guardrail|permission|human)/.test(lower);

  if (words.length < 8 || /^(build|create|make)\s+(an?\s+)?(agent|assistant)$/i.test(clean)) {
    questions.push({
      question: "What should the agent do first, and what should it produce at the end?",
      suggestions: [
        "Read incoming requests and create a summary.",
        "Monitor logs and create an incident report.",
        "Answer calls and book appointments.",
      ],
    });
  }
  if (!hasConcreteAction) {
    questions.push({
      question: "What work should the agent perform step by step?",
      suggestions: [
        "Read, decide, draft, ask approval, then act.",
        "Collect context, classify risk, then write the output.",
        "Answer, gather details, then hand off.",
      ],
    });
  }
  if (!hasToolOrData) {
    questions.push({
      question:
        "Which tools or accounts should it use, like phone, calendar, email, GitHub, Slack, logs, files, docs, or sheets?",
      suggestions: [
        "Phone, calendar, and email.",
        "GitHub, Linear, and Slack.",
        "Docs, Sheets, and Drive.",
      ],
    });
  }
  if (!hasSafety) {
    questions.push({
      question: "What actions should require your approval or be completely blocked?",
      suggestions: [
        "Ask before sending messages or changing records.",
        "Block shell commands and data export.",
        "Ask before booking or cancelling anything.",
      ],
    });
  }
  if (
    /(receptionist|phone|call|sms)/.test(lower) &&
    !/(calendar|hours|availability|sms|text|forward|route|voicemail)/.test(lower)
  ) {
    questions.push({
      question:
        "For the receptionist, should it book calendar events, send SMS, route calls, or just take messages?",
      suggestions: [
        "Book appointments and send confirmations.",
        "Take messages and forward urgent calls.",
        "Check availability but ask before booking.",
      ],
    });
  }

  return questions.slice(0, 3);
}

function clarificationMessage(questions: ClarificationQuestion[]) {
  return [
    "I need a little more detail before I forge the NemoClaw instance.",
    "",
    ...questions.map((question, index) => `${index + 1}. ${question.question}`),
    "",
    "Reply in one message. I’ll use your answers to build the workspace, tools, policies, memory, and Brev deploy plan.",
  ].join("\n");
}

function suggestedAnswerText(question: ClarificationQuestion, suggestion: string) {
  return `${question.question} ${suggestion}`;
}

function WorkspacePage() {
  const { projectId } = Route.useParams();
  const auth = useClawForgeAuth();
  const [project, setProject] = useState<ClawForgeProject | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintResponse | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<Array<[string, string]>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [cloudDeploying, setCloudDeploying] = useState(false);
  const [brevLaunch, setBrevLaunch] = useState<BrevLaunchState | null>(null);
  const [instanceChatId, setInstanceChatId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"logs" | "agent" | "tools" | "instance">("logs");
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderMode>("auto");
  const [model, setModel] = useState("auto");
  const [modelTouched, setModelTouched] = useState(false);

  const currentStatus = project?.status ?? "draft";
  const projectName = blueprint?.agent_name ?? project?.name ?? "NemoClaw Instance";
  const selectedModel = optionForModel(provider, model);
  const recommendedModel = recommendModelForTemplate(blueprint?.template_id);
  const clarificationQuestions = useMemo(
    () => (project && !blueprint ? setupQuestionsForPrompt(project.prompt) : []),
    [blueprint, project],
  );

  function blueprintWithModel(nextBlueprint = blueprint): BlueprintResponse | null {
    if (!nextBlueprint) return null;
    const nextProvider = provider === "auto" ? recommendedModel.provider : provider;
    const nextModel = model === "auto" ? recommendedModel.model : model;
    return {
      ...nextBlueprint,
      provider: nextProvider,
      model: nextModel,
      fallback_provider: nextProvider === "nemotron" ? "minimax" : nextBlueprint.fallback_provider,
      config_preview: nextBlueprint.config_preview.replace(/^model: .*$/m, `model: ${nextModel}`),
    };
  }

  function selectModel(value: string, touched = true) {
    const selected = parseModelKey(value);
    if (!selected) return;
    setProvider(selected.provider);
    setModel(selected.model);
    if (touched) setModelTouched(true);
  }

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
        setChat([
          ["user", nextProject.prompt],
          [
            "assistant",
            "I’ll build the agent, choose the tools it needs, add safety checks, and show the plan on the canvas.",
          ],
        ]);
      }
      const setupQuestions = setupQuestionsForPrompt(nextProject.prompt);
      if (setupQuestions.length > 0) {
        setBlueprint(null);
        setEvents([]);
        setActiveIndex(0);
        setProject(updateProject(nextProject.id, { status: "draft" }) ?? nextProject);
        setChat((current) => {
          const hasClarification = current.some(([role, text]) => {
            return role === "assistant" && text.includes("I need a little more detail");
          });
          return hasClarification
            ? current
            : [...current, ["assistant", clarificationMessage(setupQuestions)]];
        });
        return null;
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
        const recommended = recommendModelForTemplate(data.blueprint.template_id);
        if (!modelTouched) {
          setProvider(recommended.provider);
          setModel(recommended.model);
        }
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
    [modelTouched],
  );

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const stored = getProject(projectId);
    if (!stored) return;
    setProject(stored);
    if (!stored.blueprintId || stored.status === "draft") {
      void loadBlueprint(stored);
    } else {
      void loadBlueprint(stored);
    }
  }, [auth.isAuthenticated, loadBlueprint, projectId]);

  useEffect(() => {
    if (currentStatus !== "generating" && currentStatus !== "running") return;
    const timer = window.setInterval(
      () => {
        setActiveIndex((current) => Math.min(current + 1, workflowNodes.length - 1));
      },
      currentStatus === "running" ? 850 : 420,
    );
    return () => window.clearInterval(timer);
  }, [currentStatus]);

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
    setPanel("agent");
  }

  async function deploy(nextBlueprint = blueprint) {
    nextBlueprint = blueprintWithModel(nextBlueprint);
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
    nextBlueprint = blueprintWithModel(nextBlueprint);
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
    setInstanceChatId(null);
    const launchEvents = Array.isArray(data.launch?.events) ? data.launch.events : [];
    setEvents((current) => [...current, ...launchEvents]);
    return data.launch as BrevLaunchState;
  }

  async function deployToBrev(nextBlueprint = blueprint) {
    nextBlueprint = blueprintWithModel(nextBlueprint);
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
          instance_type: "l40s-48gb.1x",
          confirmation: "CREATE_BREV_INSTANCE",
          blueprint: nextBlueprint,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || "Brev deploy failed.");
      }
      setBrevLaunch(data.launch);
      const createdOnBrev = data.launch?.mode === "created";
      const chatInstance = createdOnBrev
        ? saveLaunchInstance({
            projectId,
            prompt: project?.prompt ?? nextBlueprint.goal,
            blueprint: nextBlueprint,
            launch: data.launch,
          })
        : null;
      setInstanceChatId(chatInstance?.id ?? null);
      const launchEvents = Array.isArray(data.launch?.events) ? data.launch.events : [];
      setEvents((current) => [...current, ...launchEvents]);
      const cloudStatus =
        createdOnBrev && chatInstance
          ? `Brev cloud instance creation started. The generated NemoClaw startup manifest, integrations, OpenHands connection, and secret names are attached.\n\nInstance chat: /instance/${chatInstance.id}`
          : `${data.launch?.status?.message || "Brev launch returned a setup issue."}\n\nI did not create a chat link because no live Brev instance exists yet. Refresh Brev login, then press Deploy again.`;
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
      setPanel("agent");
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
    const requestedModel = matchModelCommand(clean);
    setChat((current) => [...current, ["user", clean]]);
    setChatLoading(true);

    const pendingClarification =
      project && !blueprint && setupQuestionsForPrompt(project.prompt).length > 0;
    if (pendingClarification && !requestedModel) {
      const nextPrompt = `${project.prompt}\n\nAdditional setup details: ${clean}`;
      const updated =
        updateProject(projectId, {
          prompt: nextPrompt,
          status: "generating",
          blueprintId: undefined,
          agentId: undefined,
        }) ?? project;
      setProject(updated);
      const remainingQuestions = setupQuestionsForPrompt(nextPrompt);
      if (remainingQuestions.length > 0) {
        setChat((current) => [...current, ["assistant", clarificationMessage(remainingQuestions)]]);
        setChatLoading(false);
        return;
      }
      setChat((current) => [
        ...current,
        [
          "assistant",
          "Perfect. I have enough to build this now. I’m generating the tools, safety policy, memory rules, and Brev deployment plan.",
        ],
      ]);
      const nextBlueprint = await loadBlueprint(updated, { preserveChat: true });
      if (nextBlueprint) {
        setChat((current) => [
          ...current,
          [
            "assistant",
            `${nextBlueprint.agent_name} is ready on the canvas. Review the workflow, then press Deploy when you want the Brev-hosted NemoClaw instance.`,
          ],
        ]);
      }
      setChatLoading(false);
      return;
    }

    let actionReply = "";
    let action:
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
      | "model"
      | null = null;

    if (requestedModel) {
      action = "model";
      selectModel(modelKey(requestedModel));
      actionReply = `Switched this agent to ${requestedModel.label}. ${requestedModel.note}`;
    } else if (
      lower.includes("deploy") ||
      lower.includes("run test") ||
      lower === "run it" ||
      lower === "run"
    ) {
      action = "brev_deploy";
      actionReply = "Deploying the custom NemoClaw instance.";
    } else if (
      lower.includes("brev") ||
      lower.includes("cloud launch") ||
      lower.includes("launch plan")
    ) {
      action = "brev_plan";
      actionReply = "Preparing the cloud workspace for this custom NemoClaw instance.";
    } else if (lower.includes("polic")) {
      action = "show_policies";
      setPanel("agent");
      actionReply = "Opening the agent safety plan.";
    } else if (lower.includes("memory")) {
      action = "show_memory";
      setPanel("agent");
      actionReply = "Opening the agent memory and approval history.";
    } else if (lower.includes("deny")) {
      action = "deny";
      actionReply = "Denying the pending command.";
    } else if (lower.includes("approve")) {
      action = "approve";
      actionReply = "Approving the pending command.";
    } else if (lower.includes("export") || lower.includes("file")) {
      action = "show_files";
      setPanel("agent");
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
          provider: requestedModel?.provider ?? provider,
          model: requestedModel?.model ?? model,
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

    if (action === "brev_plan") {
      let activeBlueprint = blueprint;
      if (!activeBlueprint && project) {
        activeBlueprint = await loadBlueprint(project, { preserveChat: true });
      }
      if (activeBlueprint) {
        void prepareBrevLaunch(blueprintWithModel(activeBlueprint))
          .then((launch) => {
            if (!launch) return;
            setChat((current) => [
              ...current,
              [
                "assistant",
                `The cloud workspace plan is ready for ${launch.instanceName}. Required connections and memory settings are attached.`,
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
      void deployToBrev(blueprintWithModel(activeBlueprint));
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

  function answerClarification(question: ClarificationQuestion, suggestion: string) {
    void sendChat(suggestedAnswerText(question, suggestion));
  }

  if (!auth.isAuthenticated) {
    return (
      <main className="min-h-screen bg-black text-white">
        <AuthPanel forceOpen locked />
      </main>
    );
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
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/84 px-5 py-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4">
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
            <Link
              to="/dashboard"
              className="hidden rounded-full border border-white/12 px-4 py-2 text-sm text-white/50 transition hover:text-white sm:inline-flex"
            >
              Projects
            </Link>
            <button
              type="button"
              onClick={() => void deployToBrev()}
              disabled={!blueprint || cloudDeploying}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Rocket className="h-4 w-4" aria-hidden="true" />
              {cloudDeploying ? "Launching" : "Deploy"}
            </button>
            <AuthPanel />
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-73px)] lg:grid-cols-[34%_66%]">
        <aside className="flex min-h-[560px] flex-col border-b border-white/10 bg-[#050505] lg:sticky lg:top-[73px] lg:h-[calc(100vh-73px)] lg:border-b-0 lg:border-r">
          <div className="border-b border-white/10 p-5">
            <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">chat</div>
            <h1 className="mt-4 max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-tight md:text-5xl">
              Build the instance.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/48">
              Tell ClawForge what the agent should do. The canvas updates as it builds.
            </p>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5 pb-6">
            {chat.map(([role, body], index) => (
              <div
                key={`${role}-${index}`}
                className={`max-w-[92%] border p-4 text-sm leading-relaxed ${
                  role === "user"
                    ? "ml-auto border-white/14 bg-white text-black"
                    : "border-white/12 bg-white/[0.035] text-white/68"
                }`}
              >
                {body}
              </div>
            ))}

            <div className="border border-white/12 bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-sm text-white">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Forging NemoClaw instance
              </div>
              <div className="mt-4 grid gap-2 text-xs text-white/54">
                {buildLog.map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 border-t border-white/10 bg-[#050505]/96 p-4 backdrop-blur-xl">
            <div className="mb-3 flex flex-wrap gap-2">
              {["Show safety", "Deploy", "Run test", "Use Nemotron Super"].map((chip) => (
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
            {clarificationQuestions.length > 0 && (
              <div className="mb-3 rounded-[22px] border border-white/12 bg-white/[0.035] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <MessagesSquare className="h-4 w-4" aria-hidden="true" />A few setup details
                </div>
                <div className="mt-3 space-y-3">
                  {clarificationQuestions.map((question, index) => (
                    <div
                      key={question.question}
                      className="border-t border-white/8 pt-3 first:border-t-0 first:pt-0"
                    >
                      <div className="text-xs leading-relaxed text-white/64">
                        {index + 1}. {question.question}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {question.suggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => answerClarification(question, suggestion)}
                            className="rounded-full border border-white/10 px-3 py-1.5 text-left text-[11px] leading-snug text-white/48 transition hover:border-white/28 hover:text-white"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendChat();
              }}
              className="overflow-hidden rounded-[26px] border border-white/14 bg-[#20201e] shadow-[0_18px_70px_rgba(0,0,0,0.35)] transition focus-within:border-white/32"
            >
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-16 w-full bg-transparent px-5 pt-4 text-sm text-white outline-none placeholder:text-white/25"
                placeholder={chatLoading ? "Thinking..." : "Ask ClawForge to build or change it..."}
                disabled={chatLoading}
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <label className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-black/38 px-3 py-2 text-xs text-white/48">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
                  <span className="sr-only">Model</span>
                  <select
                    aria-label="Choose chat model"
                    value={modelKey(selectedModel)}
                    onChange={(event) => selectModel(event.target.value)}
                    className="max-w-[150px] bg-transparent text-xs text-white outline-none"
                  >
                    {chatModelOptions.map((option) => (
                      <option key={modelKey(option)} value={modelKey(option)} className="bg-black">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="hidden min-w-0 flex-1 truncate text-xs text-white/32 sm:block">
                  {modelTouched ? selectedModel.note : `Recommended: ${recommendedModel.label}`}
                </span>
                <button
                  type="submit"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-black transition hover:bg-white/88 disabled:opacity-50"
                  aria-label="Send workspace message"
                  disabled={chatLoading}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </form>
          </div>
        </aside>

        <section className="min-w-0 bg-black">
          <div className="grid gap-px border-b border-white/10 bg-white/10 md:grid-cols-4">
            {[
              ["Status", currentStatus.replaceAll("_", " ")],
              ["Model", selectedModel.shortLabel],
              ["Cloud", brevLaunch?.mode ? brevLaunch.mode.replace("_", " ") : "ready"],
              ["Memory", "Shared"],
            ].map(([label, value]) => (
              <div key={label} className="bg-black p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/32">{label}</div>
                <div className="mt-2 truncate text-sm capitalize text-white/72">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid min-h-[calc(100vh-230px)] gap-px bg-white/10 xl:grid-cols-[1fr_320px]">
            <div className="bg-[#060606] p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                    canvas
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Visual workflow</h2>
                </div>
                {error && <div className="text-sm text-red-200">{error}</div>}
              </div>

              <div className="relative grid gap-4 md:grid-cols-3">
                {workflowNodes.map(([id, title, body, kind], index) => {
                  const state = nodeState(index, activeIndex, currentStatus);
                  return (
                    <div
                      key={id}
                      className={`relative min-h-[150px] border p-4 transition ${stateClass(state)}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">
                          {kind}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.16em]">{state}</div>
                      </div>
                      <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-white/46">{body}</p>
                      {index < workflowNodes.length - 1 && (
                        <div
                          className="pointer-events-none absolute -right-4 top-1/2 hidden h-px w-4 bg-white/18 md:block"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 border border-white/12 bg-black p-5">
                {currentStatus === "waiting_for_approval" ? (
                  <>
                    <div className="mb-4 flex items-center gap-2 text-sm font-medium text-amber-100">
                      <Shield className="h-4 w-4" aria-hidden="true" />
                      NemoClaw Approval Required
                    </div>
                    <p className="text-sm leading-relaxed text-white/58">
                      SentinelClaw wants to run <code>block_ip 185.92.xx.xx</code>. Shell execution
                      can change system state, so NemoClaw paused the agent.
                    </p>
                    <div className="mt-5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void decide("approved")}
                        className="bg-white px-4 py-2 text-sm font-semibold text-black"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void decide("denied")}
                        className="border border-white/14 px-4 py-2 text-sm text-white/70"
                      >
                        Deny
                      </button>
                    </div>
                  </>
                ) : report ? (
                  <>
                    <div className="mb-4 flex items-center gap-2 text-sm font-medium text-emerald-100">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      Final report
                    </div>
                    <h3 className="text-xl font-semibold text-white">{report.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/58">
                      {report.safety_result}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
                      <Shield className="h-4 w-4" aria-hidden="true" />
                      Deployment
                    </div>
                    <p className="text-sm leading-relaxed text-white/58">
                      Press Deploy to create the agent workspace, attach memory, and open the live
                      chat.
                    </p>
                  </>
                )}
              </div>
            </div>

            <aside className="bg-black p-5">
              <div className="grid grid-cols-4 gap-px border border-white/12 bg-white/10 text-xs">
                {(["logs", "agent", "tools", "instance"] as const).map((item) => (
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

              <div className="mt-5 border border-white/12 bg-white/[0.025] p-4">
                {panel === "logs" && (
                  <div>
                    <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
                      <Workflow className="h-4 w-4" aria-hidden="true" />
                      Live logs
                    </div>
                    <div className="max-h-[54vh] space-y-2 overflow-y-auto font-mono text-xs text-white/56">
                      {(events.length
                        ? events
                        : buildLog.map((item, index) => ({
                            id: item,
                            message: item,
                            timestamp: `00:0${index + 1}`,
                          }))
                      ).map((event) => (
                        <div key={event.id} className="border-b border-white/8 pb-2">
                          <span className="text-white/28">[{event.timestamp.slice(-8, -3)}]</span>{" "}
                          {event.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {panel === "agent" && (
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                      agent
                    </div>
                    <h3 className="mt-4 text-xl font-semibold text-white">{projectName}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/55">
                      {blueprint?.description ??
                        "ClawForge is generating the agent plan from your prompt."}
                    </p>
                    <div className="mt-5 grid gap-3 text-sm text-white/55">
                      <div className="border-b border-white/8 pb-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/32">
                          Goal
                        </div>
                        <div className="mt-1">{blueprint?.goal ?? project.prompt}</div>
                      </div>
                      <div className="border-b border-white/8 pb-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/32">
                          Model
                        </div>
                        <div className="mt-1">{selectedModel.label}</div>
                      </div>
                    </div>
                    <div className="mt-5 text-[11px] uppercase tracking-[0.24em] text-white/35">
                      Safety
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
                    <div className="mt-5 text-[11px] uppercase tracking-[0.24em] text-white/35">
                      Files
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
                {panel === "tools" && (
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                      tools
                    </div>
                    <div className="mt-4 space-y-3">
                      {(blueprint?.tools ?? []).map((tool) => (
                        <div key={tool.id} className="border border-white/10 bg-black/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-medium text-white">{tool.name}</div>
                            <div className="text-[10px] uppercase tracking-[0.14em] text-white/34">
                              {tool.permission.replaceAll("_", " ")}
                            </div>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-white/48">
                            {tool.purpose}
                          </p>
                          <div className="mt-3 text-[10px] uppercase tracking-[0.14em] text-white/30">
                            {tool.risk_level} risk · {tool.enabled ? "enabled" : "disabled"}
                          </div>
                        </div>
                      ))}
                      {!blueprint?.tools.length && (
                        <p className="text-sm text-white/45">
                          Tools appear once the blueprint is ready.
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {panel === "instance" && (
                  <div>
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/35">
                      <Rocket className="h-4 w-4" aria-hidden="true" />
                      instance
                    </div>
                    <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/55">
                      <p>
                        {brevLaunch?.instanceName ?? "Deploy to create the live NemoClaw instance."}
                      </p>
                      <p>
                        {brevLaunch?.status?.message ??
                          "The instance includes tools, safety checks, shared memory, and a chat link."}
                      </p>
                      <div className="border-t border-white/8 pt-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/32">
                          Required connections
                        </div>
                        <div className="mt-2 space-y-2">
                          {(brevLaunch?.integrationManifest?.integrations ?? [])
                            .filter((integration) => integration.required)
                            .map((integration) => (
                              <div key={integration.id} className="flex justify-between gap-3">
                                <span>{integration.label}</span>
                                <span className="text-white/34">{integration.status}</span>
                              </div>
                            ))}
                          {!brevLaunch?.integrationManifest?.integrations?.some(
                            (integration) => integration.required,
                          ) && <span className="text-white/38">No required connections yet.</span>}
                        </div>
                      </div>
                      <div className="border-t border-white/8 pt-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/32">
                          Tool access
                        </div>
                        <div className="mt-2 space-y-2">
                          {(brevLaunch?.integrationManifest?.pipedream?.connections ?? []).map(
                            (connection) => (
                              <div key={connection.id} className="flex justify-between gap-3">
                                <span>{connection.label}</span>
                                <span className="text-white/34">
                                  {connection.status.replaceAll("_", " ")}
                                </span>
                              </div>
                            ),
                          )}
                          {!brevLaunch?.integrationManifest?.pipedream?.connections?.length && (
                            <span className="text-white/38">
                              Tool access appears after the deploy plan is prepared.
                            </span>
                          )}
                        </div>
                      </div>
                      {instanceChatId ? (
                        <Link
                          to="/instance/$instanceId"
                          params={{ instanceId: instanceChatId }}
                          className="inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/88"
                        >
                          Talk to agent
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void deployToBrev()}
                          disabled={!blueprint || cloudDeploying}
                          className="inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/88 disabled:opacity-45"
                        >
                          Deploy and create chat link
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
