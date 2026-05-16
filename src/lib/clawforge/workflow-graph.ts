import type { BlueprintResponse, WorkflowStep, ToolDefinition, PolicyDefinition, MemorySchemaItem } from "./types";

export type WorkflowNodeKind =
  | "input"      // trigger / start
  | "tool"       // tool call
  | "model"      // reasoning / classification
  | "policy"     // policy gate
  | "approval"   // human approval gate
  | "memory"     // memory read/write
  | "output";    // final result

export type WorkflowNodeStatus = "idle" | "generating" | "ready" | "running" | "waiting" | "blocked" | "done";

export type WorkflowEdgeType = "execution" | "dependency";

export interface WorkflowNode {
  id: string;
  title: string;
  subtitle: string;
  kind: WorkflowNodeKind;
  status: WorkflowNodeStatus;
  icon: string; // emoji or short label used as visual icon in node
  x?: number;  // canvas position (optional, can be computed)
  y?: number;
}

export interface WorkflowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: WorkflowEdgeType;  // "execution" = solid, "dependency" = dotted
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
    return buildCybersecurityGraph(prompt);
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
    return buildReceptionistGraph(prompt);
  }

  if (
    lowerPrompt.includes("github") ||
    lowerPrompt.includes("issue") ||
    lowerPrompt.includes("pr ") ||
    lowerPrompt.includes("pull request") ||
    lowerPrompt.includes("triage") ||
    lowerPrompt.includes("repository")
  ) {
    return buildGitHubGraph(prompt);
  }

  if (
    lowerPrompt.includes("inbox") ||
    lowerPrompt.includes("email") ||
    lowerPrompt.includes("mail") ||
    lowerPrompt.includes("gmail")
  ) {
    return buildInboxGraph(prompt);
  }

  if (
    lowerPrompt.includes("research") ||
    lowerPrompt.includes("paper") ||
    lowerPrompt.includes("study") ||
    lowerPrompt.includes("survey") ||
    lowerPrompt.includes("literature")
  ) {
    return buildResearchGraph(prompt);
  }

  return buildGenericGraph(prompt);
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
  nodes.push(node("tool-1", "Pattern Detector", "Find anomaly patterns", "tool", "idle", "⚡", 2, 0));
  nodes.push(node("model-0", "Nemotron Classifier", "Classify threat level", "model", "idle", "🧠", 3, 0));
  nodes.push(node("tool-2", "Threat Report", "Generate findings", "tool", "idle", "🛡️", 4, 0));
  nodes.push(node("policy-0", "Policy Check", "Verify compliance", "policy", "idle", "🛡️", 5, 0));
  nodes.push(node("approval-0", "Approval Gate", "Human review", "approval", "idle", "⏸️", 6, 0));
  nodes.push(node("memory-0", "Memory Update", "Persist context", "memory", "idle", "💾", 7, 0));
  nodes.push(node("out-0", "Final Report", "Security summary", "output", "idle", "📄", 8, 0));

  const edgeData: [string, string][] = [
    ["in-0", "tool-0"], ["tool-0", "tool-1"], ["tool-1", "model-0"],
    ["model-0", "tool-2"], ["tool-2", "policy-0"], ["policy-0", "approval-0"],
    ["approval-0", "memory-0"], ["memory-0", "out-0"],
  ];

  edgeData.forEach(([src, tgt], i) => edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }));

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
    ["in-0", "tool-0"], ["tool-0", "model-0"], ["model-0", "tool-1"],
    ["model-0", "tool-2"],   // branch from classifier to draft reply
    ["tool-1", "tool-2"],    // calendar feeds into draft
    ["tool-2", "approval-0"], ["approval-0", "tool-3"], ["tool-3", "tool-4"],
  ];

  edgeData.forEach(([src, tgt], i) => edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }));

  return { nodes, edges };
}

function buildGitHubGraph(_prompt: string): WorkflowGraph {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  nodes.push(node("in-0", "Issues Trigger", "New issue event", "input", "ready", "🔀", 0, 0));
  nodes.push(node("tool-0", "Repo Reader", "Fetch issue data", "tool", "idle", "📄", 1, 0));
  nodes.push(node("model-0", "Triage Classifier", "Categorize issue", "model", "idle", "🧠", 2, 0));
  nodes.push(node("tool-1", "Priority Scorer", "Assign priority", "tool", "idle", "�-filter", 3, 0));
  nodes.push(node("tool-2", "Draft Response", "Write comment", "tool", "idle", "✏️", 4, 0));
  nodes.push(node("approval-0", "Approval Gate", "Human review", "approval", "idle", "⏸️", 5, 0));
  nodes.push(node("tool-3", "Post Comment", "Publish reply", "tool", "idle", "📤", 6, 0));
  nodes.push(node("memory-0", "Memory Update", "Persist context", "memory", "idle", "💾", 7, 0));

  const edgeData: [string, string][] = [
    ["in-0", "tool-0"], ["tool-0", "model-0"], ["model-0", "tool-1"],
    ["model-0", "tool-2"],   // branch from classifier to draft response
    ["tool-1", "tool-2"],    // priority scorer feeds into draft
    ["tool-2", "approval-0"], ["approval-0", "tool-3"], ["tool-3", "memory-0"],
  ];

  edgeData.forEach(([src, tgt], i) => edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }));

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
    ["in-0", "tool-0"], ["tool-0", "model-0"], ["model-0", "tool-1"],
    ["tool-1", "approval-0"], ["approval-0", "tool-2"], ["tool-2", "memory-0"],
  ];

  edgeData.forEach(([src, tgt], i) => edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }));

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
    ["in-0", "tool-0"], ["tool-0", "model-0"], ["model-0", "tool-1"],
    ["tool-1", "tool-2"], ["tool-2", "approval-0"], ["approval-0", "out-0"],
  ];

  edgeData.forEach(([src, tgt], i) => edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }));

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
    ["in-0", "tool-0"], ["tool-0", "tool-1"], ["tool-1", "policy-0"],
    ["policy-0", "memory-0"], ["memory-0", "tool-2"], ["tool-2", "out-0"],
  ];

  edgeData.forEach(([src, tgt], i) => edges.push({ id: makeEdgeId(i), sourceId: src, targetId: tgt, type: "execution" }));

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// buildBlueprintWorkflowGraph
// ---------------------------------------------------------------------------

export function buildBlueprintWorkflowGraph(
  prompt: string,
  blueprint: BlueprintResponse,
): WorkflowGraph {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  let nodeIndex = 0;
  let edgeIndex = 0;

  // ---- Input Trigger ----
  const inputNode = node(
    `in-${nodeIndex}`,
    "Trigger",
    prompt.slice(0, 60),
    "input",
    "ready",
    "⚡",
    nodeIndex,
    0,
  );
  nodes.push(inputNode);
  const inputId = inputNode.id;
  nodeIndex++;

  // ---- Tool nodes from workflow_steps ----
  const stepIds: string[] = [inputId];
  const stepToId = new Map<string, string>();

  blueprint.workflow_steps.forEach((step: WorkflowStep) => {
    const id = `step-${nodeIndex}`;
    stepToId.set(step.id, id);

    // Determine kind based on step content
    let kind: WorkflowNodeKind = "tool";
    let icon = "🔧";
    const lowerTitle = step.title.toLowerCase();
    if (
      lowerTitle.includes("classify") ||
      lowerTitle.includes("analyze") ||
      lowerTitle.includes("reason") ||
      lowerTitle.includes("detect") ||
      lowerTitle.includes("understand")
    ) {
      kind = "model";
      icon = "🧠";
    } else if (
      lowerTitle.includes("read") ||
      lowerTitle.includes("fetch") ||
      lowerTitle.includes("get") ||
      lowerTitle.includes("collect")
    ) {
      icon = "📖";
    } else if (
      lowerTitle.includes("write") ||
      lowerTitle.includes("send") ||
      lowerTitle.includes("post") ||
      lowerTitle.includes("publish")
    ) {
      icon = "📤";
    } else if (lowerTitle.includes("check") || lowerTitle.includes("verify")) {
      icon = "✅";
    }

    const col = nodeIndex;
    nodes.push(node(id, step.title, step.description || step.tool_id || "", kind, "idle", icon, col, 0));
    stepIds.push(id);
    nodeIndex++;
  });

  // ---- Policy nodes ----
  const policyIds: string[] = [];
  blueprint.policies.forEach((policy: PolicyDefinition) => {
    const id = `policy-${nodeIndex}`;
    policyIds.push(id);
    const col = nodeIndex;
    nodes.push(node(
      id,
      policy.name,
      policy.reason || `Effect: ${policy.effect}`,
      "policy",
      "idle",
      "🛡️",
      col,
      0,
    ));
    nodeIndex++;
  });

  // ---- Memory nodes ----
  const memoryIds: string[] = [];
  blueprint.memory_schema.forEach((item: MemorySchemaItem, idx: number) => {
    const id = `memory-${nodeIndex}`;
    memoryIds.push(id);
    const col = nodeIndex;
    const row = idx % 2 === 0 ? 0 : 1; // stagger vertically
    nodes.push(node(
      id,
      item.name,
      item.description,
      "memory",
      "idle",
      "💾",
      col,
      row,
    ));
    nodeIndex++;
  });

  // ---- Tool nodes from blueprint.tools ----
  const toolIds: string[] = [];
  blueprint.tools
    .filter((t: ToolDefinition) => t.enabled && t.permission !== "blocked")
    .forEach((tool: ToolDefinition) => {
      const id = `tool-${nodeIndex}`;
      toolIds.push(id);
      const col = nodeIndex;
      const row = 0;
      let icon = "🔧";
      if (tool.permission === "approval_required") icon = "⏸️";
      else if (tool.risk_level === "high") icon = "⚠️";
      else if (tool.risk_level === "medium") icon = "⚡";

      nodes.push(node(
        id,
        tool.name,
        `${tool.action} — ${tool.purpose}`,
        "tool",
        "idle",
        icon,
        col,
        row,
      ));
      nodeIndex++;
    });

  // ---- Model node from config_preview ----
  const modelNode = node(
    `model-${nodeIndex}`,
    blueprint.model || "Agent Model",
    blueprint.provider,
    "model",
    "idle",
    "🧠",
    nodeIndex,
    0,
  );
  nodes.push(modelNode);
  const modelId = modelNode.id;
  nodeIndex++;

  // ---- Approval Gate ----
  const approvalNode = node(
    `approval-${nodeIndex}`,
    "Approval Gate",
    "Human-in-the-loop",
    "approval",
    "idle",
    "⏸️",
    nodeIndex,
    0,
  );
  nodes.push(approvalNode);
  const approvalId = approvalNode.id;
  nodeIndex++;

  // ---- Output node ----
  const outputNode = node(
    `out-${nodeIndex}`,
    blueprint.agent_name || "Output",
    blueprint.description || "Final result",
    "output",
    "idle",
    "✅",
    nodeIndex,
    0,
  );
  nodes.push(outputNode);
  const outputId = outputNode.id;

  // ---- Build edges ----
  // Connect the main chain: input → workflow steps → policies → model → approval → output
  const chainIds = [inputId, ...stepIds.slice(1), ...policyIds, modelId, approvalId, outputId];
  for (let i = 0; i < chainIds.length - 1; i++) {
    edges.push({
      id: makeEdgeId(edgeIndex++),
      sourceId: chainIds[i],
      targetId: chainIds[i + 1],
      type: "execution",
    });
  }

  // Add dependency edges for memory nodes (dashed) — memory depends on prior steps
  memoryIds.forEach((memId, idx) => {
    const depSource = idx === 0 ? approvalId : memoryIds[idx - 1];
    edges.push({
      id: makeEdgeId(edgeIndex++),
      sourceId: depSource,
      targetId: memId,
      type: "dependency",
    });
    // Memory feeds into output
    edges.push({
      id: makeEdgeId(edgeIndex++),
      sourceId: memId,
      targetId: outputId,
      type: "dependency",
    });
  });

  // Tool nodes branch off (dependency edges)
  toolIds.forEach((toolId) => {
    const lastChain = chainIds[chainIds.length - 2]; // before output
    edges.push({
      id: makeEdgeId(edgeIndex++),
      sourceId: lastChain,
      targetId: toolId,
      type: "dependency",
    });
    edges.push({
      id: makeEdgeId(edgeIndex++),
      sourceId: toolId,
      targetId: outputId,
      type: "dependency",
    });
  });

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Layout helpers (used by WorkflowCanvas when nodes lack coordinates)
// ---------------------------------------------------------------------------

export function computeLayout(graph: WorkflowGraph): WorkflowGraph {
  // Group nodes by kind category for column assignment
  const kindOrder: WorkflowNodeKind[] = [
    "input", "tool", "model", "policy", "approval", "memory", "output",
  ];

  // If all nodes already have x/y, return as-is
  if (graph.nodes.every((n) => n.x !== undefined && n.y !== undefined)) {
    return graph;
  }

  // Assign columns based on kind, then rows within each kind group
  const groups = new Map<WorkflowNodeKind, WorkflowNode[]>();
  for (const kind of kindOrder) {
    groups.set(kind, graph.nodes.filter((n) => n.kind === kind));
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