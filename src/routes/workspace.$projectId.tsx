import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUp,
  Check,
  CircleAlert,
  FileText,
  MessagesSquare,
  Rocket,
  Shield,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClawForgeLogo } from "@/components/clawforge/ClawForgeFrame";
import { AuthPanel } from "@/components/clawforge/AuthPanel";
import { WorkflowCanvas } from "@/components/clawforge/WorkflowCanvas";
import { useClawForgeAuth } from "@/lib/clawforge/auth";
import { listProjectInstances, saveLaunchInstance } from "@/lib/clawforge/instances";
import {
  chatModelOptions,
  matchModelCommand,
  modelKey,
  optionForModel,
  parseModelKey,
  recommendModelForTemplate,
} from "@/lib/clawforge/models";
import { type ClawForgeProject, getProject, updateProject } from "@/lib/clawforge/projects";
import {
  buildBlueprintWorkflowGraph,
  buildOptimisticWorkflowGraph,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeStatus,
} from "@/lib/clawforge/workflow-graph";
import type {
  BlueprintResponse,
  IncidentReport,
  MemoryItem,
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
type ChatAction =
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
  | "model";

type ChatRole = "user" | "assistant" | "progress";
type ChatMessage = [ChatRole, string];
type DeploymentPhase =
  | "idle"
  | "planning"
  | "packaging"
  | "provisioning"
  | "runtime"
  | "memory"
  | "chat"
  | "ready"
  | "failed";

type IntegrationNeed = {
  id: string;
  label: string;
  purpose: string;
  required: boolean;
  status: string;
  connectable: boolean;
  connected: boolean;
  reason: string;
  action_label: string;
};

const integrationCommandLabels: Record<string, string> = {
  calendar: "Calendar",
  googlecalendar: "Calendar",
  gmail: "Email",
  email: "Email",
  github: "GitHub",
  linear: "Linear",
  slack: "Slack",
  sheets: "Sheets",
  google_sheets: "Sheets",
  googlesheets: "Sheets",
  docs: "Docs",
  google_docs: "Docs",
  drive: "Drive",
  google_drive: "Drive",
  slides: "Slides",
  google_slides: "Slides",
  jira: "Jira",
  calendly: "Calendly",
  hubspot: "CRM",
  crm: "CRM",
};

type ProgressRow = {
  label: string;
  detail: string;
  done: boolean;
  active: boolean;
  failed: boolean;
};

type WorkspacePanel = "logs" | "agent" | "tools" | "memory" | "instance";

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

const deploymentPhaseOrder: DeploymentPhase[] = [
  "idle",
  "planning",
  "packaging",
  "provisioning",
  "runtime",
  "memory",
  "chat",
  "ready",
  "failed",
];

function deploymentPhaseIndex(phase: DeploymentPhase) {
  return deploymentPhaseOrder.indexOf(phase);
}

function deploymentRuntimeEvent(message: string, severity: RuntimeEvent["severity"] = "info") {
  return {
    id: `deploy_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    agent_id: "brev-deploy",
    type: "agent.thinking" as const,
    message,
    timestamp: new Date().toISOString(),
    severity,
  };
}

function workspaceRuntimeEvent(
  message: string,
  type: RuntimeEvent["type"] = "agent.thinking",
  severity: RuntimeEvent["severity"] = "info",
  agentId = "workspace",
): RuntimeEvent {
  return {
    id: `workspace_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    agent_id: agentId,
    type,
    message,
    timestamp: new Date().toISOString(),
    severity,
  };
}

function memoryFromSchema(
  blueprint: BlueprintResponse | null,
  agentId = "workspace",
): MemoryItem[] {
  if (!blueprint) return [];
  return blueprint.memory_schema.map((item) => ({
    id: `schema_${blueprint.blueprint_id}_${item.id}`,
    agent_id: agentId,
    type: item.type,
    content: `${item.name}: ${item.description}`,
    created_at: new Date().toISOString(),
  }));
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

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
  events?: RuntimeEvent[];
};

type ClarificationQuestion = {
  question: string;
  suggestions: string[];
};

function nodeState(
  index: number,
  activeIndex: number,
  status: ClawForgeProject["status"],
  node?: WorkflowNode,
  nodeCount: number = workflowNodes.length,
): NodeState {
  if (status === "waiting_for_approval") {
    if (node?.kind === "approval") return "waiting";
    return index < activeIndex ? "done" : "ready";
  }
  if (status === "completed") return "done";
  if (status === "running") {
    if (index < activeIndex) return "done";
    if (index === activeIndex) return "running";
    return "ready";
  }
  if (status === "deployed")
    return index <= Math.min(activeIndex, nodeCount - 1) ? "done" : "ready";
  if (status === "ready") return "ready";
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

function findWorkflowNodeIndex(
  nodes: WorkflowNode[],
  predicate: (node: WorkflowNode) => boolean,
  fallback = 0,
) {
  const index = nodes.findIndex(predicate);
  return index >= 0 ? index : Math.min(fallback, Math.max(nodes.length - 1, 0));
}

function currentWorkflowIndex(nodes: WorkflowNode[]) {
  const liveIndex = nodes.findIndex((node) =>
    ["generating", "running", "waiting", "blocked"].includes(node.status),
  );
  if (liveIndex >= 0) return liveIndex;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (nodes[index]?.status === "done" || nodes[index]?.status === "ready") return index;
  }
  return 0;
}

function focusWorkflowNode(
  graph: WorkflowGraph,
  index: number,
  status: WorkflowNodeStatus,
  activity: string,
  options: { doneBefore?: boolean; readyAfter?: boolean; clearFutureActivity?: boolean } = {},
) {
  if (graph.nodes.length === 0) return graph;
  const targetIndex = Math.min(Math.max(index, 0), graph.nodes.length - 1);
  return {
    ...graph,
    nodes: graph.nodes.map((node, nodeIndex) => {
      if (nodeIndex === targetIndex) {
        return { ...node, status, activity };
      }
      if (options.doneBefore && nodeIndex < targetIndex) {
        return { ...node, status: "done" as const };
      }
      if (options.readyAfter && nodeIndex > targetIndex) {
        return {
          ...node,
          status: node.status === "idle" ? ("ready" as const) : node.status,
          activity: options.clearFutureActivity ? undefined : node.activity,
        };
      }
      return node;
    }),
  };
}

function chatActionWorkflowTarget(nodes: WorkflowNode[], action: ChatAction, prompt: string) {
  const lowerPrompt = prompt.toLowerCase();
  const lastIndex = Math.max(nodes.length - 1, 0);
  if (action === "regenerate" || action === "augment") {
    return {
      index: findWorkflowNodeIndex(
        nodes,
        (node) => node.kind === "model" || node.kind === "tool",
        1,
      ),
      status: "generating" as const,
      activity: action === "augment" ? "Applying chat edit" : "Building from chat goal",
    };
  }
  if (action === "brev_plan") {
    return {
      index: findWorkflowNodeIndex(
        nodes,
        (node) => /deploy|runtime|config|launch/i.test(`${node.title} ${node.subtitle}`),
        lastIndex,
      ),
      status: "running" as const,
      activity: "Preparing cloud launch plan",
    };
  }
  if (action === "brev_deploy") {
    return {
      index: findWorkflowNodeIndex(
        nodes,
        (node) =>
          node.kind === "output" || /deploy|runtime|launch/i.test(`${node.title} ${node.subtitle}`),
        lastIndex,
      ),
      status: "running" as const,
      activity: lowerPrompt.includes("run") ? "Running deploy check" : "Deploying from chat",
    };
  }
  if (action === "block_shell" || action === "approval_shell" || action === "show_policies") {
    return {
      index: findWorkflowNodeIndex(
        nodes,
        (node) => node.kind === "policy",
        Math.floor(nodes.length / 2),
      ),
      status: action === "block_shell" ? ("blocked" as const) : ("running" as const),
      activity:
        action === "block_shell"
          ? "shell.execute is blocked"
          : action === "approval_shell"
            ? "shell.execute requires approval"
            : "Showing policy gates",
    };
  }
  if (action === "approve" || action === "deny") {
    return {
      index: findWorkflowNodeIndex(
        nodes,
        (node) => node.kind === "approval",
        Math.floor(nodes.length / 2),
      ),
      status: "waiting" as const,
      activity: action === "approve" ? "Resolving approval" : "Recording denial",
    };
  }
  if (action === "show_memory") {
    return {
      index: findWorkflowNodeIndex(nodes, (node) => node.kind === "memory", lastIndex),
      status: "running" as const,
      activity: "Opening shared memory",
    };
  }
  if (action === "model") {
    return {
      index: findWorkflowNodeIndex(nodes, (node) => node.kind === "model", 0),
      status: "generating" as const,
      activity: "Switching reasoning model",
    };
  }
  if (action === "show_files") {
    return {
      index: findWorkflowNodeIndex(nodes, (node) => node.kind === "output", lastIndex),
      status: "ready" as const,
      activity: "Showing generated files",
    };
  }
  return {
    index: findWorkflowNodeIndex(nodes, (node) => node.kind === "model", 0),
    status: "running" as const,
    activity: "Thinking through request",
  };
}

function runtimeWorkflowTarget(nodes: WorkflowNode[], event: RuntimeEvent, fallbackIndex: number) {
  const message = event.message.toLowerCase();
  const metadataText = Object.values(event.metadata ?? {})
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const text = `${message} ${metadataText}`;
  const lastIndex = Math.max(nodes.length - 1, 0);

  if (event.type === "agent.started") {
    return { index: 0, status: "running" as const, activity: "Runtime started" };
  }
  if (event.type === "agent.thinking") {
    return {
      index: findWorkflowNodeIndex(nodes, (node) => node.kind === "model", fallbackIndex),
      status: "running" as const,
      activity: "Thinking",
    };
  }
  if (event.type === "tool.called") {
    return {
      index: findWorkflowNodeIndex(
        nodes,
        (node) =>
          node.kind === "tool" &&
          (text.includes(node.title.toLowerCase()) ||
            text.includes(node.subtitle.toLowerCase()) ||
            node.title
              .toLowerCase()
              .split(/\s+/)
              .some((part) => part.length > 4 && text.includes(part))),
        findWorkflowNodeIndex(nodes, (node) => node.kind === "tool", fallbackIndex),
      ),
      status: "running" as const,
      activity: "Tool call active",
    };
  }
  if (event.type === "policy.checked" || event.type === "policy.blocked") {
    return {
      index: findWorkflowNodeIndex(nodes, (node) => node.kind === "policy", fallbackIndex),
      status: event.type === "policy.blocked" ? ("blocked" as const) : ("running" as const),
      activity: event.type === "policy.blocked" ? "Blocked by policy" : "Policy check active",
    };
  }
  if (event.type === "approval.requested" || event.type === "approval.resolved") {
    return {
      index: findWorkflowNodeIndex(nodes, (node) => node.kind === "approval", fallbackIndex),
      status: event.type === "approval.requested" ? ("waiting" as const) : ("done" as const),
      activity:
        event.type === "approval.requested" ? "Waiting on human approval" : "Approval resolved",
    };
  }
  if (event.type === "memory.updated") {
    return {
      index: findWorkflowNodeIndex(nodes, (node) => node.kind === "memory", fallbackIndex),
      status: "running" as const,
      activity: "Saving memory",
    };
  }
  if (event.type === "report.created" || event.type === "agent.completed") {
    return { index: lastIndex, status: "done" as const, activity: "Final output ready" };
  }
  if (event.type === "agent.error") {
    return {
      index: Math.min(Math.max(fallbackIndex, 0), lastIndex),
      status: "blocked" as const,
      activity: "Runtime needs attention",
    };
  }
  return {
    index: Math.min(Math.max(fallbackIndex, 0), lastIndex),
    status: "running" as const,
    activity: "Runtime update",
  };
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

function integrationIdFromText(text: string) {
  const lower = text.toLowerCase();
  if (!/\b(connect|authorize|auth|link|sign in|signin|refresh)\b/.test(lower)) return null;
  if (/\bgoogle calendar|calendar|availability|booking\b/.test(lower)) return "calendar";
  if (/\bgmail|email|inbox\b/.test(lower)) return "email";
  if (/\bgithub|repo|repository|pull request|pr\b/.test(lower)) return "github";
  if (/\blinear|ticket|tickets\b/.test(lower)) return "linear";
  if (/\bslack|channel\b/.test(lower)) return "slack";
  if (/\bgoogle sheets|googlesheets|spreadsheet|sheets?\b/.test(lower)) return "google_sheets";
  if (/\bgoogle docs|googledocs|docs?|document\b/.test(lower)) return "google_docs";
  if (/\bgoogle drive|drive\b/.test(lower)) return "google_drive";
  if (/\bgoogle slides|googleslides|slides?|deck\b/.test(lower)) return "google_slides";
  if (/\bjira|atlassian\b/.test(lower)) return "jira";
  if (/\bcalendly\b/.test(lower)) return "calendly";
  if (/\bhubspot|crm\b/.test(lower)) return "crm";
  return null;
}

function preparingActivityForNode(node: WorkflowNode, index: number) {
  if (node.kind === "input") return "Reading the prompt";
  if (node.kind === "model") return "Choosing the reasoning step";
  if (node.kind === "policy") return "Writing safety rules";
  if (node.kind === "approval") return "Adding a human checkpoint";
  if (node.kind === "memory") return "Defining shared memory";
  if (node.kind === "output") return "Preparing the deployable agent";
  return node.activity ?? `Adding step ${index + 1}`;
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
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [cloudDeploying, setCloudDeploying] = useState(false);
  const [deploymentPhase, setDeploymentPhase] = useState<DeploymentPhase>("idle");
  const [deploymentEvents, setDeploymentEvents] = useState<RuntimeEvent[]>([]);
  const [brevLaunch, setBrevLaunch] = useState<BrevLaunchState | null>(null);
  const [instanceChatId, setInstanceChatId] = useState<string | null>(null);
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [integrationNeeds, setIntegrationNeeds] = useState<IntegrationNeed[]>([]);
  const [connectingIntegrationId, setConnectingIntegrationId] = useState<string | null>(null);
  const [panel, setPanel] = useState<WorkspacePanel>("logs");
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderMode>("auto");
  const [model, setModel] = useState("auto");
  const [modelTouched, setModelTouched] = useState(false);
  const [workflowGraph, setWorkflowGraph] = useState<WorkflowGraph>({ nodes: [], edges: [] });
  const workflowGraphRef = useRef<WorkflowGraph>({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const currentStatus = project?.status ?? "draft";
  const projectName = blueprint?.agent_name ?? project?.name ?? "NemoClaw Instance";
  const selectedModel = optionForModel(provider, model);
  const recommendedModel = recommendModelForTemplate(blueprint?.template_id);
  const activeWorkflowNodeId = useMemo(() => {
    if (workflowGraph.nodes.length === 0) return undefined;
    if (currentStatus === "waiting_for_approval") {
      return workflowGraph.nodes.find((node) => node.kind === "approval")?.id;
    }
    if (currentStatus === "completed") return workflowGraph.nodes.at(-1)?.id;
    return workflowGraph.nodes[Math.min(activeIndex, workflowGraph.nodes.length - 1)]?.id;
  }, [activeIndex, currentStatus, workflowGraph.nodes]);
  const buildLog = useMemo(() => {
    if (!blueprint) return buildSteps.slice(0, Math.min(activeIndex + 1, buildSteps.length));
    return [
      ...buildSteps,
      `${blueprint.agent_name} blueprint ready`,
      `${blueprint.tools.length} tools mapped`,
      `${blueprint.policies.length} policies generated`,
    ];
  }, [activeIndex, blueprint]);
  const selectedWorkflowNode = useMemo(
    () => workflowGraph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, workflowGraph.nodes],
  );
  const visibleWorkflowGraph = useMemo(() => {
    const shouldReveal =
      currentStatus === "generating" || (!blueprint && workflowGraph.nodes.length > 0);
    if (!shouldReveal) return workflowGraph;
    const visible = new Set(
      workflowGraph.nodes.slice(0, Math.max(activeIndex + 1, 1)).map((node) => node.id),
    );
    return {
      nodes: workflowGraph.nodes.filter((node) => visible.has(node.id)),
      edges: workflowGraph.edges.filter(
        (edge) => visible.has(edge.sourceId) && visible.has(edge.targetId),
      ),
    };
  }, [activeIndex, blueprint, currentStatus, workflowGraph]);
  const liveLogEvents = useMemo(() => {
    const fallbackEvents =
      events.length || deploymentEvents.length
        ? []
        : buildLog.map((item, index) => ({
            id: `build_${index}`,
            agent_id: "workspace",
            type: "agent.thinking" as const,
            message: item,
            timestamp: new Date(Date.now() + index * 1000).toISOString(),
            severity: "info" as const,
          }));
    const byId = new Map<string, RuntimeEvent>();
    for (const event of [...fallbackEvents, ...deploymentEvents, ...events]) {
      byId.set(event.id, event);
    }
    return [...byId.values()].sort(
      (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
    );
  }, [buildLog, deploymentEvents, events]);
  const sharedMemoryItems = useMemo(() => {
    const byId = new Map<string, MemoryItem>();
    for (const item of memoryFromSchema(blueprint, agentId ?? "workspace")) byId.set(item.id, item);
    for (const item of memoryItems) byId.set(item.id, item);
    return [...byId.values()].sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );
  }, [agentId, blueprint, memoryItems]);
  const clarificationQuestions = useMemo(
    () => (project && !blueprint ? setupQuestionsForPrompt(project.prompt) : []),
    [blueprint, project],
  );
  const deploySteps = useMemo(() => {
    const mode = brevLaunch?.mode ?? "";
    const failed = mode.includes("failed") || brevLaunch?.status?.ok === false;
    const cloudReady = mode === "created" || mode === "already_running";
    const phase = failed ? "failed" : cloudReady ? "ready" : deploymentPhase;
    const phaseIndex = deploymentPhaseIndex(phase);
    const isDryRun = mode === "dry_run";
    const row = (
      rowPhase: DeploymentPhase,
      label: string,
      detail: string,
      readyDetail = detail,
    ): ProgressRow => {
      const rowIndex = deploymentPhaseIndex(rowPhase);
      return {
        label,
        detail: cloudReady || (phase !== "failed" && phaseIndex > rowIndex) ? readyDetail : detail,
        done: cloudReady || (phase !== "failed" && phaseIndex > rowIndex),
        active:
          !cloudReady &&
          phase !== "failed" &&
          (phase === rowPhase ||
            (isDryRun && rowPhase === "planning") ||
            (phase === "idle" && rowPhase === "planning" && Boolean(blueprint))),
        failed: phase === "failed" && (rowPhase === "provisioning" || rowPhase === "runtime"),
      };
    };
    return [
      {
        label: "Plan",
        detail: isDryRun
          ? "Launch plan generated. Deploy to start the Brev runtime."
          : blueprint
            ? "Agent files, policies, memory, and integrations generated"
            : "Generating agent files, policies, memory, and integrations",
        done: Boolean(blueprint),
        active: Boolean(blueprint) && !brevLaunch && !cloudDeploying && deploymentPhase === "idle",
        failed: false,
      },
      row(
        "packaging",
        "Package",
        "Waiting to bundle the generated NemoClaw files",
        "Generated files bundled for Brev",
      ),
      row(
        "provisioning",
        "Brev",
        brevLaunch?.instanceName
          ? `Connecting to ${brevLaunch.instanceName}`
          : "Waiting for deploy",
        cloudReady
          ? `Attached to ${brevLaunch?.instanceName ?? "Brev"}`
          : `Launch target: ${brevLaunch?.instanceName ?? "Brev"}`,
      ),
      row(
        "runtime",
        "Runtime",
        "Starting the NemoClaw API and checking health",
        "NemoClaw runtime health check passed",
      ),
      row(
        "memory",
        "Memory",
        "Attaching self-hosted mem0 on the Brev instance",
        "Self-hosted mem0 runtime attached",
      ),
      row(
        "chat",
        "Chat",
        instanceChatId ? `/instance/${instanceChatId}` : "Creating the agent chat link",
        instanceChatId ? `/instance/${instanceChatId}` : "Agent chat link created",
      ),
    ];
  }, [blueprint, brevLaunch, cloudDeploying, deploymentPhase, instanceChatId]);
  const progressCard = useMemo(() => {
    const isDeployView = cloudDeploying || Boolean(brevLaunch) || Boolean(instanceChatId);
    if (isDeployView) {
      return {
        title: "Deploy progress",
        rows: deploySteps,
        footer: instanceChatId
          ? `Ready at /instance/${instanceChatId}`
          : cloudDeploying
            ? "Creating runtime and checking health..."
            : brevLaunch?.status?.message || "Deploy when ready.",
      };
    }
    return {
      title: currentStatus === "generating" ? "Building live" : "Build progress",
      rows: buildSteps.map((step, index) => ({
        label: step.replace(/^Creating /, "").replace(/^Configuring /, ""),
        detail:
          index === 0
            ? "Reading the goal"
            : index === 1
              ? "Writing sandbox rules"
              : index === 2
                ? "Adding canvas nodes"
                : index === 3
                  ? "Preparing shared memory"
                  : "Preparing Brev deployment",
        done: Boolean(blueprint) || index < activeIndex,
        active: currentStatus === "generating" && index === activeIndex,
        failed: false,
      })),
      footer: blueprint
        ? `${blueprint.agent_name} is ready to deploy.`
        : currentStatus === "generating"
          ? "Nodes appear as the instance is forged."
          : "Start with a prompt or edit request.",
    };
  }, [
    activeIndex,
    blueprint,
    brevLaunch,
    cloudDeploying,
    currentStatus,
    deploySteps,
    instanceChatId,
  ]);

  function addChat(role: ChatRole, body: string) {
    setChat((current) => [...current, [role, body]]);
  }

  function addRuntimeLog(
    body: string,
    type: RuntimeEvent["type"] = "agent.thinking",
    severity: RuntimeEvent["severity"] = "info",
  ) {
    const event = workspaceRuntimeEvent(body, type, severity, agentId ?? "workspace");
    setEvents((current) => [...current, event]);
    syncWorkflowFromRuntimeEvents([event]);
    return event;
  }

  function addProgress(body: string) {
    addChat("progress", body);
    addRuntimeLog(body, "agent.thinking");
  }

  function addMemory(content: string, type: MemoryItem["type"] = "context") {
    const memory: MemoryItem = {
      id: `memory_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      agent_id: agentId ?? "workspace",
      type,
      content,
      created_at: new Date().toISOString(),
    };
    setMemoryItems((current) => [memory, ...current.filter((item) => item.id !== memory.id)]);
    addRuntimeLog(`Memory saved: ${content}`, "memory.updated", "success");
    return memory;
  }

  function queueProgress(steps: string[], interval = 850) {
    if (typeof window === "undefined") return () => {};
    const timers = steps.map((step, index) =>
      window.setTimeout(() => addProgress(step), (index + 1) * interval),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }

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

  useEffect(() => {
    workflowGraphRef.current = workflowGraph;
  }, [workflowGraph]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.length, chatLoading, integrationNeeds.length]);

  function focusWorkflowFromChat(
    action: ChatAction,
    prompt: string,
    options = { doneBefore: true },
  ) {
    if (workflowGraph.nodes.length === 0) return;
    const target = chatActionWorkflowTarget(workflowGraph.nodes, action, prompt);
    const nextGraph = focusWorkflowNode(
      workflowGraph,
      target.index,
      target.status,
      target.activity,
      {
        doneBefore: options.doneBefore,
        readyAfter: true,
      },
    );
    workflowGraphRef.current = nextGraph;
    setActiveIndex(target.index);
    setWorkflowGraph(nextGraph);
  }

  const syncWorkflowFromRuntimeEvents = useCallback((nextEvents: RuntimeEvent[]) => {
    if (nextEvents.length === 0) return;
    let nextGraph = workflowGraphRef.current;
    let nextActiveIndex = currentWorkflowIndex(nextGraph.nodes);
    for (const event of nextEvents) {
      const target = runtimeWorkflowTarget(nextGraph.nodes, event, nextActiveIndex);
      nextActiveIndex = target.index;
      nextGraph = focusWorkflowNode(nextGraph, target.index, target.status, target.activity, {
        doneBefore: true,
        readyAfter: true,
      });
    }
    workflowGraphRef.current = nextGraph;
    setActiveIndex(nextActiveIndex);
    setWorkflowGraph(nextGraph);
  }, []);

  const loadBlueprint = useCallback(
    async (nextProject: ClawForgeProject, options: { preserveChat?: boolean } = {}) => {
      setError(null);
      setActiveIndex(0);
      setAgentId(null);
      setReport(null);
      setEvents([]);
      setMemoryItems([]);
      setDeploymentPhase("idle");
      setDeploymentEvents([]);
      setBrevLaunch(null);
      setInstanceChatId(null);
      const optimisticGraph = buildOptimisticWorkflowGraph(nextProject.prompt);
      setWorkflowGraph(
        focusWorkflowNode(optimisticGraph, 0, "generating", "Reading chat goal", {
          readyAfter: true,
        }),
      );
      setSelectedNodeId(null);
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
        setWorkflowGraph(
          focusWorkflowNode(optimisticGraph, 0, "waiting", "Needs setup details", {
            readyAfter: true,
          }),
        );
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
        void refreshIntegrationNeeds(nextProject.prompt, data.blueprint);
        const blueprintGraph = buildBlueprintWorkflowGraph(nextProject.prompt, data.blueprint);
        const stagedGraph = {
          ...blueprintGraph,
          nodes: blueprintGraph.nodes.map((node, index) => ({
            ...node,
            status: index === 0 ? ("generating" as const) : ("idle" as const),
            activity: index === 0 ? preparingActivityForNode(node, index) : node.activity,
          })),
        };
        setActiveIndex(0);
        setWorkflowGraph(stagedGraph);
        workflowGraphRef.current = stagedGraph;
        const recommended = recommendModelForTemplate(data.blueprint.template_id);
        if (!modelTouched) {
          setProvider(recommended.provider);
          setModel(recommended.model);
        }
        for (let index = 0; index < blueprintGraph.nodes.length; index += 1) {
          setEvents((current) => [
            ...current,
            workspaceRuntimeEvent(
              `${preparingActivityForNode(blueprintGraph.nodes[index], index)}: ${blueprintGraph.nodes[index]?.title}`,
              "agent.thinking",
            ),
          ]);
          const nextGraph = {
            ...blueprintGraph,
            nodes: blueprintGraph.nodes.map((node, nodeIndex) => ({
              ...node,
              status:
                nodeIndex < index
                  ? ("ready" as const)
                  : nodeIndex === index
                    ? ("generating" as const)
                    : ("idle" as const),
              activity:
                nodeIndex === index ? preparingActivityForNode(node, nodeIndex) : node.activity,
            })),
          };
          workflowGraphRef.current = nextGraph;
          setWorkflowGraph(nextGraph);
          setActiveIndex(index);
          await wait(index === 0 ? 520 : 680);
        }
        const readyGraph = {
          ...blueprintGraph,
          nodes: blueprintGraph.nodes.map((node, index) => ({
            ...node,
            status: "ready" as const,
            activity:
              index === blueprintGraph.nodes.length - 1
                ? "Blueprint ready from chat"
                : node.activity,
          })),
        };
        workflowGraphRef.current = readyGraph;
        setActiveIndex(blueprintGraph.nodes.length - 1);
        setWorkflowGraph(readyGraph);
        setProject(
          updateProject(nextProject.id, {
            name: data.blueprint.agent_name,
            status: "ready",
            blueprintId: data.blueprint.blueprint_id,
          }) ?? nextProject,
        );
        setEvents((current) => [
          ...current,
          workspaceRuntimeEvent(
            `${data.blueprint.agent_name} blueprint ready with ${data.blueprint.tools.length} tools and ${data.blueprint.policies.length} policies.`,
            "agent.thinking",
            "success",
          ),
        ]);
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
    if (!auth.isAuthenticated || !project) return;
    const [latest] = listProjectInstances(projectId);
    if (!latest) return;
    setInstanceChatId((current) => current ?? latest.id);
    setBrevLaunch(
      (current) =>
        current ?? {
          mode: latest.mode,
          instanceName: latest.instanceName,
          command: latest.command ?? "",
          status: latest.message
            ? {
                ok: latest.status === "created",
                status: latest.status,
                message: latest.message,
                cliPath: null,
              }
            : undefined,
          openHands: latest.openHands,
          integrationManifest: latest.integrationManifest,
          events: latest.events as RuntimeEvent[] | undefined,
        },
    );
    if (latest.events?.length) {
      setDeploymentEvents((current) =>
        current.length ? current : (latest.events as RuntimeEvent[]),
      );
      setEvents((current) => (current.length ? current : (latest.events as RuntimeEvent[])));
    }
  }, [auth.isAuthenticated, project, projectId]);

  useEffect(() => {
    if (currentStatus !== "generating" && currentStatus !== "running") return;
    const nodeCount = Math.max(workflowGraph.nodes.length, 1);
    const timer = window.setInterval(
      () => {
        setActiveIndex((current) => Math.min(current + 1, nodeCount - 1));
      },
      currentStatus === "running" ? 1100 : 900,
    );
    return () => window.clearInterval(timer);
  }, [currentStatus, workflowGraph.nodes.length]);

  useEffect(() => {
    if (workflowGraph.nodes.length === 0) return;
    if (
      currentStatus !== "generating" &&
      currentStatus !== "running" &&
      currentStatus !== "deployed" &&
      currentStatus !== "waiting_for_approval" &&
      currentStatus !== "completed"
    ) {
      return;
    }
    setWorkflowGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node, index) => ({
        ...node,
        status: nodeState(index, activeIndex, currentStatus, node, current.nodes.length),
      })),
    }));
  }, [activeIndex, currentStatus, workflowGraph.nodes.length]);

  useEffect(() => {
    if (!agentId) return;
    const source = new EventSource(`/api/agents/${agentId}/logs/stream`);
    source.onmessage = (item) => {
      const event = JSON.parse(item.data) as RuntimeEvent;
      setEvents((current) => [...current, event]);
      syncWorkflowFromRuntimeEvents([event]);
      if (event.type === "approval.requested") {
        setProject(
          updateProject(projectId, { status: "waiting_for_approval", agentId }) ?? project,
        );
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [agentId, project, projectId, syncWorkflowFromRuntimeEvents]);

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
    setWorkflowGraph((current) => {
      const policyIndex = findWorkflowNodeIndex(
        current.nodes,
        (node) => node.kind === "policy",
        Math.floor(current.nodes.length / 2),
      );
      return focusWorkflowNode(
        current,
        policyIndex,
        effect === "deny" ? "blocked" : "done",
        effect === "deny" ? "shell.execute blocked" : "approval gate updated",
        { doneBefore: true, readyAfter: true },
      );
    });
  }

  async function deploy(nextBlueprint = blueprint) {
    nextBlueprint = blueprintWithModel(nextBlueprint);
    if (!nextBlueprint) return;
    setError(null);
    setActiveIndex(0);
    setEvents([]);
    focusWorkflowFromChat("brev_deploy", nextBlueprint.goal);
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
      syncWorkflowFromRuntimeEvents([
        {
          id: `workspace_deploy_${Date.now()}`,
          agent_id: data.agent_id,
          type: "agent.started",
          message: `${nextBlueprint.agent_name} deployed into NemoClaw.`,
          timestamp: new Date().toISOString(),
          severity: "success",
        },
      ]);
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
    setDeploymentPhase("planning");
    focusWorkflowFromChat("brev_plan", nextBlueprint.goal);
    const instanceName = `clawforge-${nextBlueprint.agent_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const planEvent = deploymentRuntimeEvent(
      `Preparing Brev launch plan for ${nextBlueprint.agent_name}.`,
    );
    setDeploymentEvents((current) => [...current, planEvent]);
    setEvents((current) => [...current, planEvent]);
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
    const readyEvent = deploymentRuntimeEvent(
      `Launch plan ready for ${data.launch?.instanceName ?? instanceName}.`,
      "success",
    );
    setDeploymentEvents((current) => [...current, readyEvent]);
    setEvents((current) => [...current, readyEvent]);
    setInstanceChatId(null);
    const launchEvents = Array.isArray(data.launch?.events) ? data.launch.events : [];
    setDeploymentEvents((current) => [...current, ...launchEvents]);
    setEvents((current) => [...current, ...launchEvents]);
    syncWorkflowFromRuntimeEvents(launchEvents);
    return data.launch as BrevLaunchState;
  }

  async function deployToBrev(nextBlueprint = blueprint) {
    nextBlueprint = blueprintWithModel(nextBlueprint);
    if (!nextBlueprint) return;
    setCloudDeploying(true);
    setDeploymentPhase("planning");
    setDeploymentEvents([]);
    setError(null);
    focusWorkflowFromChat("brev_deploy", nextBlueprint.goal);
    setPanel("instance");
    const runEvents: RuntimeEvent[] = [];
    const recordDeploy = (
      phase: DeploymentPhase,
      message: string,
      severity: RuntimeEvent["severity"] = "info",
    ) => {
      const event = deploymentRuntimeEvent(message, severity);
      runEvents.push(event);
      setDeploymentPhase(phase);
      setDeploymentEvents((current) => [...current, event]);
      setEvents((current) => [...current, event]);
      return event;
    };
    addProgress(
      "Deploying: checking Brev, packaging the instance, attaching memory, and creating the chat link...",
    );
    recordDeploy("planning", `Deploy plan started for ${nextBlueprint.agent_name}.`);
    try {
      await wait(250);
      const launchPlan = brevLaunch ?? (await prepareBrevLaunch(nextBlueprint));
      addProgress(
        `Deploying: launch plan ready for ${launchPlan?.instanceName ?? nextBlueprint.agent_name}.`,
      );
      recordDeploy(
        "packaging",
        "Packaging generated NemoClaw files, policy YAML, memory config, and integration manifest.",
      );
      await wait(350);
      recordDeploy(
        "provisioning",
        `Connecting to Brev target ${launchPlan?.instanceName ?? "mad-coral-donkey"} and preparing the remote runtime.`,
      );
      const response = await fetch("/api/clawforge/brev/instances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instance_name:
            launchPlan?.instanceName ?? `clawforge-${nextBlueprint.agent_name.toLowerCase()}`,
          instance_type: "massedcompute_L40S",
          confirmation: "CREATE_BREV_INSTANCE",
          blueprint: nextBlueprint,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || "Brev deploy failed.");
      }
      recordDeploy(
        "runtime",
        "Brev responded. Verifying NemoClaw runtime health and startup logs.",
      );
      setBrevLaunch(data.launch);
      const createdOnBrev =
        data.launch?.mode === "created" || data.launch?.mode === "already_running";
      const launchEvents = Array.isArray(data.launch?.events) ? data.launch.events : [];
      runEvents.push(...launchEvents);
      setDeploymentEvents((current) => [...current, ...launchEvents]);
      setEvents((current) => [...current, ...launchEvents]);
      syncWorkflowFromRuntimeEvents(launchEvents);
      await wait(350);
      if (createdOnBrev) {
        recordDeploy(
          "memory",
          "Self-hosted mem0 is attached to this NemoClaw instance on Brev.",
          "success",
        );
        addMemory(
          `${nextBlueprint.agent_name} has a shared memory boundary attached to the Brev-hosted NemoClaw instance.`,
          "context",
        );
      } else {
        recordDeploy(
          "failed",
          data.launch?.status?.message || "Brev runtime did not become healthy yet.",
          "warning",
        );
      }
      await wait(250);
      const chatInstance = data.launch
        ? saveLaunchInstance({
            projectId,
            prompt: project?.prompt ?? nextBlueprint.goal,
            blueprint: nextBlueprint,
            launch: {
              ...data.launch,
              events: runEvents,
            },
          })
        : null;
      setInstanceChatId(chatInstance?.id ?? null);
      if (chatInstance?.id) {
        recordDeploy(
          createdOnBrev ? "chat" : "failed",
          `Agent chat link created at /instance/${chatInstance.id}.`,
          createdOnBrev ? "success" : "warning",
        );
        addProgress(`Deploying: instance chat created at /instance/${chatInstance.id}.`);
      }
      if (createdOnBrev) {
        await wait(250);
        recordDeploy(
          "ready",
          `${nextBlueprint.agent_name} is live on Brev with memory and chat attached.`,
          "success",
        );
      }
      if (chatInstance && data.launch) {
        saveLaunchInstance({
          projectId,
          prompt: project?.prompt ?? nextBlueprint.goal,
          blueprint: nextBlueprint,
          launch: {
            ...data.launch,
            events: runEvents,
          },
        });
      }
      const cloudStatus =
        createdOnBrev && chatInstance
          ? `${data.launch?.mode === "already_running" ? "Attached to the running Brev NemoClaw instance." : "Brev cloud instance creation started."} The generated startup manifest, integrations, NemoClaw chat runtime, and secret names are attached.\n\nInstance chat: /instance/${chatInstance.id}`
          : `${data.launch?.status?.message || "Brev launch returned a setup issue."}\n\nI created the instance chat for this generated NemoClaw manifest so you can inspect and test it now. Refresh Brev login, then press Deploy again to attach the same flow to a live Brev instance.${chatInstance ? `\n\nInstance chat: /instance/${chatInstance.id}` : ""}`;
      setChat((current) => [...current, ["assistant", cloudStatus]]);
      await refreshIntegrationNeeds(project?.prompt ?? nextBlueprint.goal, nextBlueprint, {
        announce: true,
      });
      setProject(
        updateProject(projectId, {
          status: createdOnBrev ? "deployed" : "ready",
        }) ?? project,
      );
      if (createdOnBrev) {
        const nextIndex = Math.max(workflowGraphRef.current.nodes.length - 1, 0);
        const nextGraph = focusWorkflowNode(
          workflowGraphRef.current,
          nextIndex,
          "done",
          data.launch?.mode === "already_running"
            ? "Cloud instance attached"
            : "Cloud instance created",
          {
            doneBefore: true,
          },
        );
        workflowGraphRef.current = nextGraph;
        setActiveIndex(nextIndex);
        setWorkflowGraph(nextGraph);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Brev deploy failed.";
      const failureEvent = deploymentRuntimeEvent(message, "error");
      setDeploymentPhase("failed");
      setDeploymentEvents((current) => [...current, failureEvent]);
      setEvents((current) => [...current, failureEvent]);
      setError(message);
      setWorkflowGraph((current) =>
        focusWorkflowNode(
          current,
          currentWorkflowIndex(current.nodes),
          "blocked",
          "Deploy needs attention",
          { doneBefore: false },
        ),
      );
      setChat((current) => [...current, ["assistant", message]]);
    } finally {
      setCloudDeploying(false);
    }
  }

  async function decide(decision: "approved" | "denied") {
    if (!agentId) return;
    focusWorkflowFromChat(decision === "approved" ? "approve" : "deny", decision);
    const response = await fetch("/api/approvals/approval_shell_block_ip/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (response.ok) {
      const approvalData = (await response.json().catch(() => null)) as {
        memory_item?: MemoryItem;
      } | null;
      if (approvalData?.memory_item) {
        setMemoryItems((current) => [approvalData.memory_item as MemoryItem, ...current]);
      } else {
        addMemory(
          decision === "denied"
            ? "User denied shell execution for this run. Future risky actions should pause before execution."
            : "User approved the restricted action for this run. The approval is logged for future audits.",
          "approval",
        );
      }
      setProject(updateProject(projectId, { status: "completed" }) ?? project);
      syncWorkflowFromRuntimeEvents([
        {
          id: `workspace_approval_${decision}_${Date.now()}`,
          agent_id: agentId,
          type: "approval.resolved",
          message:
            decision === "approved" ? "Approval granted by user." : "Approval denied by user.",
          timestamp: new Date().toISOString(),
          severity: decision === "approved" ? "success" : "warning",
        },
        {
          id: `workspace_memory_${decision}_${Date.now()}`,
          agent_id: agentId,
          type: "memory.updated",
          message: `Saved ${decision} approval decision to workspace memory.`,
          timestamp: new Date().toISOString(),
          severity: "success",
        },
        {
          id: `workspace_report_${decision}_${Date.now()}`,
          agent_id: agentId,
          type: "report.created",
          message: "Final report generated.",
          timestamp: new Date().toISOString(),
          severity: "success",
        },
      ]);
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

  async function refreshIntegrationNeeds(
    promptText = message || project?.prompt || blueprint?.goal || "",
    nextBlueprint = blueprint,
    options: { announce?: boolean } = {},
  ) {
    if (!promptText && !nextBlueprint) return [];
    try {
      const response = await fetch("/api/clawforge/integrations/needs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          blueprint: nextBlueprint,
          user_id: auth.email ?? "clawforge-demo-user",
        }),
      });
      const data = await response.json();
      const needs = Array.isArray(data.integrations?.connection_needs)
        ? (data.integrations.connection_needs as IntegrationNeed[])
        : [];
      setIntegrationNeeds(needs);
      if (options.announce && needs.length > 0) {
        setPanel("tools");
        addProgress(
          `Integrations: ${needs
            .slice(0, 3)
            .map((need) => need.label)
            .join(
              ", ",
            )} ${needs.length > 3 ? `and ${needs.length - 3} more ` : ""}will be requested before the agent uses those tools.`,
        );
      }
      return needs;
    } catch {
      setIntegrationNeeds([]);
      return [];
    }
  }

  async function connectIntegration(need: IntegrationNeed) {
    await connectIntegrationById(need.id, need.label);
  }

  async function connectIntegrationById(integrationId: string, label?: string) {
    const integrationLabel =
      label ??
      integrationNeeds.find((need) => need.id === integrationId)?.label ??
      integrationCommandLabels[integrationId] ??
      "Integration";
    setConnectingIntegrationId(integrationId);
    addProgress(`Integrations: opening secure connection for ${integrationLabel}...`);
    try {
      const response = await fetch("/api/clawforge/integrations/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          integration_id: integrationId,
          user_id: auth.email ?? "clawforge-demo-user",
          callback_url: window.location.href,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || `Could not connect ${integrationLabel}.`);
      }
      const url = data.connect?.redirect_url as string | undefined;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        addRuntimeLog(
          `Integration link created for ${integrationLabel}. Waiting for the user to finish account connection.`,
          "tool.called",
          "success",
        );
        addChat(
          "assistant",
          `I opened the ${integrationLabel} connection flow. Once it finishes, come back here and say “refresh connections” so I can update the agent’s tool access.`,
        );
        const refreshOnReturn = () => {
          if (document.visibilityState === "visible") {
            void refreshIntegrationNeeds(project?.prompt ?? blueprint?.goal ?? message, blueprint);
          }
        };
        window.addEventListener("focus", refreshOnReturn, { once: true });
        document.addEventListener("visibilitychange", refreshOnReturn, { once: true });
      } else {
        addRuntimeLog(
          `${integrationLabel} needs admin setup before the agent can use that integration.`,
          "policy.checked",
          "warning",
        );
        addChat(
          "assistant",
          data.connect?.message ??
            `${integrationLabel} needs admin setup before it can be connected.`,
        );
      }
      const connectedAccountId = data.connect?.connected_account_id as string | undefined;
      if (connectedAccountId) {
        setIntegrationNeeds((current) =>
          current.map((item) =>
            item.id === integrationId
              ? {
                  ...item,
                  connected: false,
                  status: "ready_to_connect",
                  action_label: "Finish",
                  reason: `${integrationLabel} has a connection session ready for this workspace.`,
                }
              : item,
          ),
        );
      }
      await refreshIntegrationNeeds(project?.prompt ?? blueprint?.goal ?? message, blueprint, {
        announce: false,
      });
    } catch (err) {
      addChat(
        "assistant",
        err instanceof Error ? err.message : `${integrationLabel} connection needs attention.`,
      );
    } finally {
      setConnectingIntegrationId(null);
    }
  }

  async function streamWorkspaceChat({
    clean,
    actionReply,
    requestedModel,
  }: {
    clean: string;
    actionReply: string;
    requestedModel: ReturnType<typeof matchModelCommand>;
  }) {
    let assistantIndex = -1;
    let assistantBody = actionReply ? `${actionReply}\n\n` : "";
    setChat((current) => {
      assistantIndex = current.length;
      return [...current, ["assistant", assistantBody || ""]];
    });

    const updateAssistant = (nextBody: string) => {
      assistantBody = nextBody;
      setChat((current) =>
        current.map((item, index) =>
          index === assistantIndex ? (["assistant", assistantBody] as ChatMessage) : item,
        ),
      );
    };

    const response = await fetch("/api/clawforge/nemoclaw/chat/stream", {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: clean,
        provider: requestedModel?.provider ?? provider,
        model: requestedModel?.model ?? model,
        blueprint: blueprintWithModel(blueprint),
      }),
    });
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error?.message || "NemoClaw chat stream failed.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalChat: { reply?: string; events?: RuntimeEvent[] } | null = null;

    const consumeBlock = (block: string) => {
      const eventName = block.match(/^event:\s*(.+)$/m)?.[1]?.trim() ?? "message";
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) return;
      const payload = JSON.parse(data) as {
        message?: string;
        text?: string;
        event?: RuntimeEvent;
        integrations?: { connection_needs?: IntegrationNeed[] };
        chat?: { reply?: string; events?: RuntimeEvent[] };
      };

      if (eventName === "progress" && payload.message) {
        addProgress(payload.message);
      } else if (eventName === "runtime" && payload.event) {
        setEvents((current) => [...current, payload.event as RuntimeEvent]);
        syncWorkflowFromRuntimeEvents([payload.event as RuntimeEvent]);
      } else if (eventName === "integrations" && payload.integrations) {
        const needs = Array.isArray(payload.integrations.connection_needs)
          ? payload.integrations.connection_needs
          : [];
        setIntegrationNeeds(needs);
        if (needs.length > 0) setPanel("tools");
      } else if (eventName === "delta" && payload.text) {
        updateAssistant(`${assistantBody}${payload.text}`);
      } else if (eventName === "chat" && payload.chat) {
        finalChat = payload.chat;
      } else if (eventName === "error" && payload.message) {
        throw new Error(payload.message);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) consumeBlock(block);
      }
      if (done) break;
    }
    if (buffer.trim()) consumeBlock(buffer);

    if (finalChat?.events?.length) {
      setEvents((current) => [...current, ...(finalChat?.events ?? [])]);
      syncWorkflowFromRuntimeEvents(finalChat.events);
    }
    if (!assistantBody.trim()) {
      updateAssistant(finalChat?.reply || "NemoClaw inspected the workspace.");
    }
  }

  async function sendChat(nextMessage = message) {
    const clean = nextMessage.trim();
    if (!clean) return;
    setMessage("");
    const lower = clean.toLowerCase();
    const requestedModel = matchModelCommand(clean);
    const requestedIntegrationId = integrationIdFromText(clean);
    setChat((current) => [...current, ["user", clean]]);
    setChatLoading(true);
    addProgress(
      "Thinking: reading your request, updating the agent plan, and checking required tools...",
    );
    void refreshIntegrationNeeds(clean, blueprintWithModel(blueprint), { announce: true });

    if (lower.includes("refresh connection") || lower.includes("refresh integration")) {
      const needs = await refreshIntegrationNeeds(
        project?.prompt ?? blueprint?.goal ?? clean,
        blueprint,
        {
          announce: true,
        },
      );
      setPanel("tools");
      setChat((current) => [
        ...current,
        [
          "assistant",
          needs.length
            ? "I refreshed the connected tools. The Tools tab now shows what still needs access."
            : "I refreshed the connected tools. This agent does not need any more external account access right now.",
        ],
      ]);
      setChatLoading(false);
      return;
    }

    if (requestedIntegrationId) {
      setPanel("tools");
      focusWorkflowFromChat("augment", clean, { doneBefore: true });
      await connectIntegrationById(
        requestedIntegrationId,
        integrationCommandLabels[requestedIntegrationId],
      );
      setChatLoading(false);
      return;
    }

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
      addProgress("Thinking: merging your answers into the workflow and safety policy...");
      const optimisticGraph = buildOptimisticWorkflowGraph(nextPrompt);
      const remainingQuestions = setupQuestionsForPrompt(nextPrompt);
      if (remainingQuestions.length > 0) {
        setWorkflowGraph(
          focusWorkflowNode(optimisticGraph, 0, "waiting", "Still needs setup details", {
            readyAfter: true,
          }),
        );
        setChat((current) => [...current, ["assistant", clarificationMessage(remainingQuestions)]]);
        setChatLoading(false);
        return;
      }
      setWorkflowGraph(
        focusWorkflowNode(optimisticGraph, 1, "generating", "Merging setup details", {
          doneBefore: true,
          readyAfter: true,
        }),
      );
      setActiveIndex(1);
      setChat((current) => [
        ...current,
        [
          "assistant",
          "Perfect. I have enough to build this now. I’m generating the tools, safety policy, memory rules, and Brev deployment plan.",
        ],
      ]);
      const nextBlueprint = await loadBlueprint(updated, { preserveChat: true });
      if (nextBlueprint) {
        void refreshIntegrationNeeds(nextPrompt, nextBlueprint, { announce: true });
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
    let action: ChatAction | null = null;

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
      addProgress("Deploying: preparing Brev and the instance chat link...");
    } else if (
      lower.includes("brev") ||
      lower.includes("cloud launch") ||
      lower.includes("launch plan")
    ) {
      action = "brev_plan";
      actionReply = "Preparing the cloud workspace for this custom NemoClaw instance.";
      addProgress("Planning: generating the Brev launch manifest and required connections...");
    } else if (lower.includes("polic")) {
      action = "show_policies";
      setPanel("agent");
      actionReply = "Opening the agent safety plan.";
    } else if (lower.includes("memory")) {
      action = "show_memory";
      setPanel("memory");
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
      lower.startsWith("change ") ||
      lower.startsWith("update ") ||
      lower.startsWith("edit ") ||
      lower.includes("make it ") ||
      lower.includes("create a nemoclaw agent") ||
      lower.includes("build a nemoclaw agent")
    ) {
      action = "regenerate";
      actionReply = "Regenerating the NemoClaw instance from your new goal.";
      addProgress("Building: creating a new workflow graph, policies, memory, and tool map...");
    } else if (
      lower.includes("add slack") ||
      lower.includes("add email") ||
      lower.includes("add calendar") ||
      lower.includes("add phone") ||
      lower.includes("add github") ||
      lower.includes("remove ") ||
      lower.includes("change ") ||
      lower.includes("update ") ||
      lower.includes("edit ") ||
      lower.includes("connect")
    ) {
      action = "augment";
      actionReply = "Updating the goal and rebuilding the integration-aware NemoClaw blueprint.";
      addProgress("Building: applying the requested change and recalculating integrations...");
    } else if (lower.includes("why")) {
      action = "explain_pause";
      actionReply =
        "NemoClaw paused shell execution because commands can change system state and require human approval.";
    }

    if (action) {
      focusWorkflowFromChat(action, clean, {
        doneBefore: action !== "regenerate" && action !== "augment" && action !== "model",
      });
    } else if (workflowGraph.nodes.length > 0) {
      focusWorkflowFromChat("augment", clean, { doneBefore: true });
    }

    try {
      await streamWorkspaceChat({ clean, actionReply, requestedModel });
    } catch (err) {
      setChat((current) => [
        ...current,
        [
          "assistant",
          actionReply ||
            (err instanceof Error
              ? err.message
              : "NemoClaw chat is unavailable, but the local workspace controls still work."),
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
        void refreshIntegrationNeeds(nextPrompt, nextBlueprint, { announce: true });
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

  function handleWorkflowNodesChange(nodes: WorkflowNode[]) {
    setWorkflowGraph((current) => ({ ...current, nodes }));
  }

  function handleWorkflowEdgesChange(edge: WorkflowEdge) {
    setWorkflowGraph((current) =>
      current.edges.some((item) => item.id === edge.id)
        ? current
        : { ...current, edges: [...current.edges, edge] },
    );
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
            {instanceChatId && (
              <Link
                to="/instance/$instanceId"
                params={{ instanceId: instanceChatId }}
                className="hidden rounded-full border border-white/12 px-4 py-2 text-sm text-white/70 transition hover:border-white/28 hover:text-white md:inline-flex"
              >
                Open agent chat
              </Link>
            )}
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
            <h1 className="mt-4 max-w-[13ch] text-3xl font-semibold leading-[1.02] tracking-tight md:text-4xl">
              Build a NemoClaw.
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/48">
              Describe the work. I’ll ask what’s missing, wire the tools, then deploy it.
            </p>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5 pb-6">
            {chat.map(([role, body], index) => (
              <div
                key={`${role}-${index}`}
                className={`whitespace-pre-wrap text-sm leading-relaxed ${
                  role === "progress"
                    ? "max-w-full border-l border-white/12 py-1 pl-3 text-xs text-white/38"
                    : role === "user"
                      ? "ml-auto max-w-[92%] border border-white/14 bg-white p-4 text-black"
                      : "max-w-[92%] border border-white/12 bg-white/[0.035] p-4 text-white/68"
                }`}
              >
                {role === "progress" ? (
                  <span className="inline-flex items-start gap-2">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white/45"
                      aria-hidden="true"
                    />
                    <span>{body}</span>
                  </span>
                ) : (
                  body
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="max-w-full border-l border-white/12 py-1 pl-3 text-xs text-white/38">
                <span className="inline-flex items-start gap-2">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-300"
                    aria-hidden="true"
                  />
                  <span>
                    ClawForge is thinking through tools, policy, memory, and deployment...
                  </span>
                </span>
              </div>
            )}

            {integrationNeeds.length > 0 && (
              <div className="rounded-[20px] border border-white/12 bg-white/[0.035] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <CircleAlert className="h-4 w-4 text-amber-200" aria-hidden="true" />
                  Connect tools before they run
                </div>
                <div className="mt-3 space-y-2">
                  {integrationNeeds.slice(0, 5).map((need) => (
                    <div
                      key={need.id}
                      className="flex items-center justify-between gap-3 border-t border-white/8 pt-2 first:border-t-0 first:pt-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-white/75">
                          {need.label}
                        </div>
                        <div className="truncate text-[11px] text-white/34">{need.purpose}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void connectIntegration(need)}
                        disabled={!need.connectable || connectingIntegrationId === need.id}
                        className="shrink-0 rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-white/62 transition hover:border-white/28 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {connectingIntegrationId === need.id
                          ? "Opening"
                          : need.connected
                            ? "Connected"
                            : need.action_label}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-white/12 bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-sm text-white">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {progressCard.title}
              </div>
              <div className="mt-4 grid gap-3 text-xs">
                {progressCard.rows.map((step) => (
                  <div key={step.label} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                        step.failed
                          ? "border-red-300/60 text-red-200"
                          : step.done
                            ? "border-emerald-300/60 text-emerald-200"
                            : step.active
                              ? "border-amber-200/60 text-amber-100"
                              : "border-white/14 text-white/30"
                      }`}
                    >
                      {step.done ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : null}
                    </span>
                    <div>
                      <div className="text-white/68">{step.label}</div>
                      <div className="text-white/34">{step.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-white/8 pt-3 text-[11px] text-white/30">
                {progressCard.footer}
              </div>
            </div>
            <div ref={chatEndRef} />
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

              <div className="relative h-[560px] overflow-hidden rounded-[10px] border border-white/12 bg-[#050505] shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
                {visibleWorkflowGraph.nodes.length > 0 ? (
                  <>
                    <WorkflowCanvas
                      graph={visibleWorkflowGraph}
                      activeNodeId={activeWorkflowNodeId}
                      selectedNodeId={selectedNodeId ?? undefined}
                      onNodeClick={setSelectedNodeId}
                      onNodesChange={handleWorkflowNodesChange}
                      onEdgesChange={handleWorkflowEdgesChange}
                    />
                    <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/70 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-white/45 backdrop-blur">
                      drag nodes · connect handles · scroll to zoom
                    </div>
                    {selectedWorkflowNode && (
                      <div className="absolute bottom-4 left-4 max-w-sm border border-white/12 bg-black/88 p-4 backdrop-blur-xl">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">
                          {selectedWorkflowNode.kind} · {selectedWorkflowNode.status}
                        </div>
                        <h3 className="mt-2 text-base font-semibold text-white">
                          {selectedWorkflowNode.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-white/52">
                          {selectedWorkflowNode.subtitle}
                        </p>
                        {selectedWorkflowNode.activity && (
                          <p className="mt-3 border-t border-white/10 pt-3 text-xs uppercase tracking-[0.16em] text-white/42">
                            {selectedWorkflowNode.activity}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="grid h-full place-items-center p-8 text-center">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                        waiting for prompt
                      </div>
                      <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/52">
                        The NemoClaw workflow graph appears here once the workspace starts building.
                      </p>
                    </div>
                  </div>
                )}
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
              <div className="grid grid-cols-5 gap-px border border-white/12 bg-white/10 text-xs">
                {(["logs", "agent", "tools", "memory", "instance"] as const).map((item) => (
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
                      {liveLogEvents.map((event) => (
                        <div key={event.id} className="border-b border-white/8 pb-2">
                          <span className="text-white/28">
                            [
                            {Number.isNaN(new Date(event.timestamp).getTime())
                              ? event.timestamp.slice(-8, -3)
                              : new Date(event.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}
                            ]
                          </span>{" "}
                          <span
                            className={`mr-1 uppercase ${
                              event.severity === "error"
                                ? "text-red-200"
                                : event.severity === "warning"
                                  ? "text-amber-200"
                                  : event.severity === "success"
                                    ? "text-emerald-200"
                                    : "text-white/34"
                            }`}
                          >
                            {event.type.replace(".", "/")}
                          </span>{" "}
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
                      Workflow
                    </div>
                    <div className="mt-4 space-y-3">
                      {(blueprint?.workflow_steps ?? []).map((step, index) => (
                        <div key={step.id} className="border-b border-white/8 pb-3">
                          <div className="text-sm text-white/76">
                            {index + 1}. {step.title}
                          </div>
                          <div className="mt-1 text-xs leading-relaxed text-white/42">
                            {step.description}
                          </div>
                        </div>
                      ))}
                      {!blueprint?.workflow_steps.length && (
                        <p className="text-sm text-white/42">
                          Workflow steps appear once the blueprint is ready.
                        </p>
                      )}
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
                    <div className="mt-5 border-t border-white/8 pt-4">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                        Required integrations
                      </div>
                      <div className="mt-4 space-y-3">
                        {integrationNeeds.map((need) => (
                          <div key={need.id} className="border border-white/10 bg-black/40 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-white">{need.label}</div>
                                <p className="mt-1 text-xs leading-relaxed text-white/45">
                                  {need.purpose}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void connectIntegration(need)}
                                disabled={
                                  !need.connectable ||
                                  need.connected ||
                                  connectingIntegrationId === need.id
                                }
                                className="shrink-0 rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-white/62 transition hover:border-white/28 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                {need.connected
                                  ? "Connected"
                                  : connectingIntegrationId === need.id
                                    ? "Opening"
                                    : need.action_label}
                              </button>
                            </div>
                            <div className="mt-3 text-[10px] uppercase tracking-[0.14em] text-white/30">
                              {need.required ? "required" : "optional"} ·{" "}
                              {need.status.replaceAll("_", " ")}
                            </div>
                          </div>
                        ))}
                        {!integrationNeeds.length && (
                          <p className="text-sm text-white/45">
                            No external account connections are required for this agent yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {panel === "memory" && (
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                      shared memory
                    </div>
                    <h3 className="mt-4 text-xl font-semibold text-white">Workspace memory</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/52">
                      These memories are attached to this NemoClaw workspace. Approval decisions,
                      tool context, deployment state, and learned preferences show up here.
                    </p>
                    <div className="mt-5 space-y-3">
                      {sharedMemoryItems.map((item) => (
                        <div key={item.id} className="border border-white/10 bg-black/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm leading-relaxed text-white/72">
                              {item.content}
                            </div>
                            <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-white/30">
                              {item.type}
                            </span>
                          </div>
                          <div className="mt-3 text-[10px] uppercase tracking-[0.14em] text-white/28">
                            {new Date(item.created_at).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      ))}
                      {!sharedMemoryItems.length && (
                        <p className="text-sm text-white/45">
                          Memory rules and runtime memories appear after the blueprint is generated.
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
                          Deployment
                        </div>
                        <div className="mt-3 space-y-2">
                          {deploySteps.map((step) => (
                            <div key={step.label} className="flex items-start gap-2">
                              <span
                                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                                  step.failed
                                    ? "bg-red-300"
                                    : step.done
                                      ? "bg-emerald-300"
                                      : step.active
                                        ? "animate-pulse bg-amber-200"
                                        : "bg-white/18"
                                }`}
                                aria-hidden="true"
                              />
                              <div>
                                <div className="text-white/65">{step.label}</div>
                                <div className="text-xs text-white/34">{step.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="border-t border-white/8 pt-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-white/32">
                          Required connections
                        </div>
                        <div className="mt-2 space-y-2">
                          {(brevLaunch?.integrationManifest?.integrations ?? [])
                            .filter((integration) => integration.required)
                            .map((integration) => (
                              <div
                                key={integration.id}
                                className="flex items-center justify-between gap-3"
                              >
                                <span>{integration.label}</span>
                                {integrationNeeds.find((need) => need.id === integration.id) ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const need = integrationNeeds.find(
                                        (item) => item.id === integration.id,
                                      );
                                      if (need) void connectIntegration(need);
                                    }}
                                    className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-white/58 transition hover:border-white/28 hover:text-white"
                                  >
                                    Connect
                                  </button>
                                ) : (
                                  <span className="text-white/34">{integration.status}</span>
                                )}
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
                          {cloudDeploying ? "Deploying..." : "Deploy and create chat link"}
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
