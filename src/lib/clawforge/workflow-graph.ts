import type { BlueprintResponse, PolicyDefinition, ToolDefinition } from "./types";

export type WorkflowNodeKind =
  | "input" // trigger / start
  | "tool" // tool call
  | "model" // reasoning / classification
  | "policy" // policy gate
  | "approval" // human approval gate
  | "memory" // memory read/write
  | "output"; // final result

export type WorkflowNodeStatus =
  | "idle"
  | "generating"
  | "ready"
  | "running"
  | "waiting"
  | "blocked"
  | "done";

export type WorkflowEdgeType = "execution" | "dependency";

export interface WorkflowNode {
  id: string;
  title: string;
  subtitle: string;
  activity?: string;
  kind: WorkflowNodeKind;
  status: WorkflowNodeStatus;
  icon: string; // emoji or short label used as visual icon in node
  x?: number; // canvas position (optional, can be computed)
  y?: number;
}

export interface WorkflowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: WorkflowEdgeType; // "execution" = solid, "dependency" = dotted
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;
const COL_SPACING = 200;
const ROW_SPACING = 120;

function makeNodeId(kind: string, idx: number): string {
  return `${kind}-${idx}`;
}

function makeEdgeId(idx: number): string {
  return `edge-${idx}`;
}

function node(
  id: string,
  title: string,
  subtitle: string,
  kind: WorkflowNodeKind,
  status: WorkflowNodeStatus,
  icon: string,
  x: number,
  y: number,
): WorkflowNode {
  return { id, title, subtitle, kind, status, icon, x, y };
}

function iconForAction(action = "", name = "") {
  const text = `${action} ${name}`.toLowerCase();
  if (/phone|call|voice/.test(text)) return "☎️";
  if (/sms|text|message|slack|discord|telegram|alert/.test(text)) return "💬";
  if (/calendar|schedule|appointment|booking/.test(text)) return "📅";
  if (/gmail|email|inbox|mail/.test(text)) return "✉️";
  if (/github|repo|pull|issue/.test(text)) return "⌘";
  if (/linear|jira|ticket/.test(text)) return "☑";
  if (/sheet|spreadsheet/.test(text)) return "▦";
  if (/doc|drive|file|report|brief|write/.test(text)) return "📄";
  if (/log|security|threat|incident|siem/.test(text)) return "🛡";
  if (/shell|command|execute/.test(text)) return "⌁";
  if (/search|research|source/.test(text)) return "⌕";
  return "◆";
}

function kindForStep(stepTitle: string, tool?: ToolDefinition): WorkflowNodeKind {
  const text = `${stepTitle} ${tool?.name ?? ""} ${tool?.action ?? ""}`.toLowerCase();
  if (/classif|reason|decide|intent|summar|analy/.test(text)) return "model";
  return "tool";
}

function activityForTool(tool?: ToolDefinition) {
  if (!tool) return "Mapped from the requested workflow";
  if (tool.permission === "approval_required") return "Added with human approval required";
  if (tool.permission === "blocked") return "Added as blocked by policy";
  if (tool.permission === "read_only") return "Added as a read-only tool";
  return "Added as an allowed tool";
}

function nodeStatusForTool(tool?: ToolDefinition): WorkflowNodeStatus {
  return tool?.permission === "blocked" ? "blocked" : "idle";
}

function compactRows(graph: WorkflowGraph): WorkflowGraph {
  const perRow = graph.nodes.length > 7 ? 3 : 4;
  return {
    ...graph,
    nodes: graph.nodes.map((item, index) => ({
      ...item,
      x: index % perRow,
      y: Math.floor(index / perRow),
    })),
  };
}

// ---------------------------------------------------------------------------
// buildOptimisticWorkflowGraph
// ---------------------------------------------------------------------------

export function buildOptimisticWorkflowGraph(prompt: string): WorkflowGraph {
  const lowerPrompt = prompt.toLowerCase();

  // Detect category via keyword matching
  if (
    lowerPrompt.includes("cyber") ||
    lowerPrompt.includes("security") ||
    lowerPrompt.includes("threat") ||
    lowerPrompt.includes("log") ||
    lowerPrompt.includes("monitor") ||
    lowerPrompt.includes("siem") ||
    lowerPrompt.includes("firewall") ||
    lowerPrompt.includes("intrusion")
  ) {
    return compactRows(buildCybersecurityGraph(prompt));
  }

  if (
    lowerPrompt.includes("receptionist") ||
    lowerPrompt.includes("phone") ||
    lowerPrompt.includes("call") ||
    lowerPrompt.includes("booking") ||
    lowerPrompt.includes("calendar") ||
    lowerPrompt.includes("schedule") ||
    lowerPrompt.includes("appointment")
  ) {
    return compactRows(buildReceptionistGraph(prompt));
  }

  if (
    lowerPrompt.includes("github") ||
    lowerPrompt.includes("issue") ||
    lowerPrompt.includes("pr ") ||
    lowerPrompt.includes("pull request") ||
    lowerPrompt.includes("triage") ||
    lowerPrompt.includes("repository")
  ) {
    return compactRows(buildGitHubGraph(prompt));
  }

  if (
    lowerPrompt.includes("inbox") ||
    lowerPrompt.includes("email") ||
    lowerPrompt.includes("mail") ||
    lowerPrompt.includes("gmail")
  ) {
    return compactRows(buildInboxGraph(prompt));
  }

  if (
    lowerPrompt.includes("research") ||
    lowerPrompt.includes("paper") ||
    lowerPrompt.includes("study") ||
    lowerPrompt.includes("survey") ||
    lowerPrompt.includes("literature")
  ) {
    return compactRows(buildResearchGraph(prompt));
  }

  return compactRows(buildGenericGraph(prompt));
}

// ---------------------------------------------------------------------------
// Category-specific graph builders
// ---------------------------------------------------------------------------

function buildCybersecurityGraph(_prompt: string): WorkflowGraph {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  // Column assignments: 0=input, 1=tool, 2=tool, 3=model, 4=policy, 5=approval, 6=memory, 7=output
  nodes.push(node("in-0", "Security Trigger", "Event or schedule", "input", "ready", "🛡️", 0, 0));
  nodes.push(node("tool-0", "Log Reader", "Ingest system logs", "tool", "idle", "👁️", 1, 0));
  nodes.push(
    node("tool-1", "Pattern Detector", "Find anomaly patterns", "tool", "idle", "⚡", 2, 0),
  );
  nodes.push(
    node("model-0", "Nemotron Classifier", "Classify threat level", "model", "idle", "🧠", 3, 0),
  );
  nodes.push(node("tool-2", "Threat Report", "Generate findings", "tool", "idle", "🛡️", 4, 0));
  nodes.push(node("policy-0", "Policy Check", "Verify compliance", "policy", "idle", "🛡️", 5, 0));
  nodes.push(node("approval-0", "Approval Gate", "Human review", "approval", "idle", "⏸️", 6, 0));
  nodes.push(node("memory-0", "Memory Update", "Persist context", "memory", "idle", "💾", 7, 0));
  nodes.push(node("out-0", "Final Report", "Security summary", "output", "idle", "📄", 8, 0));

  const edgeData: [string, string][] = [
    ["in-0", "tool-0"],
    ["tool-0", "tool-1"],
    ["tool-1", "model-0"],
    ["model-0", "tool-2"],
    ["tool-2", "policy-0"],
    ["policy-0", "approval-0"],
    ["approval-0", "memory-0"],
    ["memory-0", "out-0"],
  ];

  edgeData.forEach(([src, tgt], i) =>
    edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }),
  );

  return { nodes, edges };
}

function buildReceptionistGraph(_prompt: string): WorkflowGraph {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  nodes.push(node("in-0", "Call Trigger", "Inbound call", "input", "ready", "📞", 0, 0));
  nodes.push(node("tool-0", "Voice Transcript", "Speech-to-text", "tool", "idle", "🎤", 1, 0));
  nodes.push(node("model-0", "Intent Classifier", "Understand goal", "model", "idle", "🧠", 2, 0));
  nodes.push(node("tool-1", "Calendar Check", "Check availability", "tool", "idle", "📅", 3, 0));
  nodes.push(node("tool-2", "Draft Reply", "Compose response", "tool", "idle", "💬", 4, 0));
  nodes.push(node("approval-0", "Approval Gate", "Human review", "approval", "idle", "⏸️", 5, 0));
  nodes.push(node("tool-3", "Send Message", "Deliver reply", "tool", "idle", "📤", 6, 0));
  nodes.push(node("tool-4", "CRM Update", "Record interaction", "tool", "idle", "🗄️", 7, 0));

  const edgeData: [string, string][] = [
    ["in-0", "tool-0"],
    ["tool-0", "model-0"],
    ["model-0", "tool-1"],
    ["model-0", "tool-2"], // branch from classifier to draft reply
    ["tool-1", "tool-2"], // calendar feeds into draft
    ["tool-2", "approval-0"],
    ["approval-0", "tool-3"],
    ["tool-3", "tool-4"],
  ];

  edgeData.forEach(([src, tgt], i) =>
    edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }),
  );

  return { nodes, edges };
}

function buildGitHubGraph(_prompt: string): WorkflowGraph {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  nodes.push(node("in-0", "Issues Trigger", "New issue event", "input", "ready", "🔀", 0, 0));
  nodes.push(node("tool-0", "Repo Reader", "Fetch issue data", "tool", "idle", "📄", 1, 0));
  nodes.push(node("model-0", "Triage Classifier", "Categorize issue", "model", "idle", "🧠", 2, 0));
  nodes.push(
    node("tool-1", "Priority Scorer", "Assign priority", "tool", "idle", "�-filter", 3, 0),
  );
  nodes.push(node("tool-2", "Draft Response", "Write comment", "tool", "idle", "✏️", 4, 0));
  nodes.push(node("approval-0", "Approval Gate", "Human review", "approval", "idle", "⏸️", 5, 0));
  nodes.push(node("tool-3", "Post Comment", "Publish reply", "tool", "idle", "📤", 6, 0));
  nodes.push(node("memory-0", "Memory Update", "Persist context", "memory", "idle", "💾", 7, 0));

  const edgeData: [string, string][] = [
    ["in-0", "tool-0"],
    ["tool-0", "model-0"],
    ["model-0", "tool-1"],
    ["model-0", "tool-2"], // branch from classifier to draft response
    ["tool-1", "tool-2"], // priority scorer feeds into draft
    ["tool-2", "approval-0"],
    ["approval-0", "tool-3"],
    ["tool-3", "memory-0"],
  ];

  edgeData.forEach(([src, tgt], i) =>
    edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }),
  );

  return { nodes, edges };
}

function buildInboxGraph(_prompt: string): WorkflowGraph {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  nodes.push(node("in-0", "Email Trigger", "Inbound email", "input", "ready", "📧", 0, 0));
  nodes.push(node("tool-0", "Email Reader", "Parse message", "tool", "idle", "👁️", 1, 0));
  nodes.push(node("model-0", "Summarizer", "Summarize intent", "model", "idle", "🧠", 2, 0));
  nodes.push(node("tool-1", "Draft Reply", "Compose response", "tool", "idle", "✏️", 3, 0));
  nodes.push(node("approval-0", "Approval Gate", "Human review", "approval", "idle", "⏸️", 4, 0));
  nodes.push(node("tool-2", "Send Email", "Deliver reply", "tool", "idle", "📤", 5, 0));
  nodes.push(node("memory-0", "Memory Update", "Persist context", "memory", "idle", "💾", 6, 0));

  const edgeData: [string, string][] = [
    ["in-0", "tool-0"],
    ["tool-0", "model-0"],
    ["model-0", "tool-1"],
    ["tool-1", "approval-0"],
    ["approval-0", "tool-2"],
    ["tool-2", "memory-0"],
  ];

  edgeData.forEach(([src, tgt], i) =>
    edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }),
  );

  return { nodes, edges };
}

function buildResearchGraph(_prompt: string): WorkflowGraph {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  nodes.push(node("in-0", "Research Topic", "Defined goal", "input", "ready", "🔍", 0, 0));
  nodes.push(node("tool-0", "Source Collector", "Gather sources", "tool", "idle", "📚", 1, 0));
  nodes.push(node("model-0", "Summarizer", "Synthesize content", "model", "idle", "🧠", 2, 0));
  nodes.push(node("tool-1", "Brief Generator", "Create document", "tool", "idle", "📝", 3, 0));
  nodes.push(node("tool-2", "Citation Check", "Verify references", "tool", "idle", "✅", 4, 0));
  nodes.push(node("approval-0", "Approval Gate", "Human review", "approval", "idle", "⏸️", 5, 0));
  nodes.push(node("out-0", "Export", "Final output", "output", "idle", "⬇️", 6, 0));

  const edgeData: [string, string][] = [
    ["in-0", "tool-0"],
    ["tool-0", "model-0"],
    ["model-0", "tool-1"],
    ["tool-1", "tool-2"],
    ["tool-2", "approval-0"],
    ["approval-0", "out-0"],
  ];

  edgeData.forEach(([src, tgt], i) =>
    edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }),
  );

  return { nodes, edges };
}

function buildGenericGraph(_prompt: string): WorkflowGraph {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  nodes.push(node("in-0", "User Goal", "Defined objective", "input", "ready", "🎯", 0, 0));
  nodes.push(node("tool-0", "Task Planner", "Break into steps", "tool", "idle", "📋", 1, 0));
  nodes.push(node("tool-1", "Tool Mapper", "Map to tools", "tool", "idle", "🔧", 2, 0));
  nodes.push(node("policy-0", "Policy Gate", "Compliance check", "policy", "idle", "🛡️", 3, 0));
  nodes.push(node("memory-0", "Memory Rules", "Apply context", "memory", "idle", "💾", 4, 0));
  nodes.push(node("tool-2", "Deployment Config", "Prepare execution", "tool", "idle", "🚀", 5, 0));
  nodes.push(node("out-0", "Agent Output", "Final result", "output", "idle", "✅", 6, 0));

  const edgeData: [string, string][] = [
    ["in-0", "tool-0"],
    ["tool-0", "tool-1"],
    ["tool-1", "policy-0"],
    ["policy-0", "memory-0"],
    ["memory-0", "tool-2"],
    ["tool-2", "out-0"],
  ];

  edgeData.forEach(([src, tgt], i) =>
    edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }),
  );

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// buildBlueprintWorkflowGraph
// ---------------------------------------------------------------------------

export function buildBlueprintWorkflowGraph(
  prompt: string,
  blueprint: BlueprintResponse,
): WorkflowGraph {
  const approvalCount = blueprint.policies.filter(
    (policy: PolicyDefinition) => policy.effect === "require_approval",
  ).length;
  const blockedCount = blueprint.policies.filter(
    (policy: PolicyDefinition) => policy.effect === "deny",
  ).length;
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const toolById = new Map(blueprint.tools.map((tool) => [tool.id, tool]));
  const lowerPrompt = prompt.toLowerCase();
  const inputTitle =
    blueprint.template_id === "phone_receptionist"
      ? "Inbound Call"
      : blueprint.template_id === "github_triage"
        ? "GitHub Activity"
        : blueprint.template_id === "inbox_approval"
          ? "New Inbox Item"
          : blueprint.template_id === "research_sandbox"
            ? "Research Goal"
            : /log|security|incident/.test(lowerPrompt)
              ? "Security Event"
              : "User Goal";

  nodes.push(
    node(
      "input-0",
      inputTitle,
      "Generated from the prompt",
      "input",
      "ready",
      iconForAction("", inputTitle),
      0,
      0,
    ),
  );

  const workflowSteps = blueprint.workflow_steps.length
    ? blueprint.workflow_steps
    : blueprint.tools
        .filter((tool) => tool.enabled)
        .slice(0, 6)
        .map((tool, index) => ({
          id: `generated_step_${index}`,
          title: tool.name,
          description: tool.purpose,
          tool_id: tool.id,
        }));

  workflowSteps.slice(0, 7).forEach((step, index) => {
    const tool = step.tool_id ? toolById.get(step.tool_id) : undefined;
    const kind = kindForStep(step.title, tool);
    nodes.push({
      ...node(
        makeNodeId(kind, index),
        tool?.name ?? step.title,
        tool
          ? `${tool.permission.replaceAll("_", " ")} · ${tool.risk_level} risk`
          : step.description,
        kind,
        nodeStatusForTool(tool),
        iconForAction(tool?.action, tool?.name ?? step.title),
        index + 1,
        index % 2,
      ),
      activity: activityForTool(tool),
    });
  });

  const requiredIntegrations = blueprint.integration_requirements.filter(
    (integration) => integration.status === "required",
  );
  requiredIntegrations.slice(0, 4).forEach((integration, index) => {
    nodes.push({
      ...node(
        `integration-${index}`,
        integration.label,
        "Connect before this tool runs",
        "tool",
        "idle",
        iconForAction(integration.id, integration.label),
        nodes.length,
        index % 2,
      ),
      activity: `Detected from the goal: ${integration.purpose}`,
    });
  });

  nodes.push({
    ...node(
      "policy-0",
      "NemoClaw Policy",
      `${approvalCount} approval gates, ${blockedCount} blocked actions`,
      "policy",
      "idle",
      "🛡",
      nodes.length,
      0,
    ),
    activity: "Policy pack generated from risky actions",
  });

  if (approvalCount > 0) {
    nodes.push({
      ...node(
        "approval-0",
        "Human Approval",
        "Pause before external or risky actions",
        "approval",
        "idle",
        "⏸",
        nodes.length,
        0,
      ),
      activity: "Added because this agent can affect the outside world",
    });
  }

  nodes.push({
    ...node(
      "memory-0",
      "Shared Memory",
      `${blueprint.memory_schema.length} memory rules`,
      "memory",
      "idle",
      "▣",
      nodes.length,
      0,
    ),
    activity: "Stores decisions and workspace context",
  });
  nodes.push({
    ...node(
      "output-0",
      blueprint.agent_name || "NemoClaw Agent",
      "Live agent + final output",
      "output",
      "idle",
      "✓",
      nodes.length,
      0,
    ),
    activity: "Ready to deploy after review",
  });

  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push({
      id: makeEdgeId(index),
      sourceId: nodes[index].id,
      targetId: nodes[index + 1].id,
      type: "execution",
    });
  }

  return compactRows({ nodes, edges });
}

// ---------------------------------------------------------------------------
// Layout helpers (used by WorkflowCanvas when nodes lack coordinates)
// ---------------------------------------------------------------------------

export function computeLayout(graph: WorkflowGraph): WorkflowGraph {
  // Group nodes by kind category for column assignment
  const kindOrder: WorkflowNodeKind[] = [
    "input",
    "tool",
    "model",
    "policy",
    "approval",
    "memory",
    "output",
  ];

  // If all nodes already have x/y, return as-is
  if (graph.nodes.every((n) => n.x !== undefined && n.y !== undefined)) {
    return graph;
  }

  // Assign columns based on kind, then rows within each kind group
  const groups = new Map<WorkflowNodeKind, WorkflowNode[]>();
  for (const kind of kindOrder) {
    groups.set(
      kind,
      graph.nodes.filter((n) => n.kind === kind),
    );
  }

  const nodes = graph.nodes.map((n) => {
    if (n.x !== undefined && n.y !== undefined) return n;

    const kindCol = kindOrder.indexOf(n.kind);
    const group = groups.get(n.kind) ?? [];
    const rowIdx = group.filter((g) => kindOrder.indexOf(g.kind) <= kindCol).length - 1;
    return { ...n, x: kindCol, y: rowIdx };
  });

  return { nodes, edges: graph.edges };
}

// ---------------------------------------------------------------------------
// Interactive canvas helpers
// ---------------------------------------------------------------------------

export function updateNodePosition(
  graph: WorkflowGraph,
  nodeId: string,
  x: number,
  y: number,
): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
  };
}

export function addEdge(
  graph: WorkflowGraph,
  sourceId: string,
  targetId: string,
  type: WorkflowEdgeType = "execution",
): WorkflowGraph {
  const newEdge: WorkflowEdge = {
    id: Date.now().toString(36),
    sourceId,
    targetId,
    type,
  };
  return {
    ...graph,
    edges: [...graph.edges, newEdge],
  };
}

export function removeEdge(graph: WorkflowGraph, edgeId: string): WorkflowGraph {
  return {
    ...graph,
    edges: graph.edges.filter((e) => e.id !== edgeId),
  };
}

export function removeNode(graph: WorkflowGraph, nodeId: string): WorkflowGraph {
  return {
    nodes: graph.nodes.filter((n) => n.id !== nodeId),
    edges: graph.edges.filter((e) => e.sourceId !== nodeId && e.targetId !== nodeId),
  };
}
