import React, { useMemo } from "react";
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  WorkflowNodeStatus,
  WorkflowNodeKind,
} from "@/lib/clawforge/workflow-graph";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COL_SPACING = 200;  // px between columns
const ROW_SPACING = 120;  // px between rows
const NODE_W = 160;
const NODE_H = 80;

const KIND_COLORS: Record<WorkflowNodeKind, string> = {
  input:    "#22c55e",  // green
  tool:      "#71717a",  // gray/zinc
  model:     "#a78bfa",  // purple
  policy:    "#fb923c",  // orange
  approval:  "#fbbf24",  // amber
  memory:    "#22d3ee",  // cyan
  output:    "#10b981",  // emerald
};

const STATUS_STYLES: Record<
  WorkflowNodeStatus,
  { border: string; glow: string | null; anim: string | null }
> = {
  idle:      { border: "rgba(255,255,255,0.10)", glow: null,               anim: null },
  generating:{ border: "rgba(255,255,255,0.30)", glow: null,               anim: "pulse 1.4s ease-in-out infinite" },
  ready:     { border: "rgba(255,255,255,0.20)", glow: null,               anim: null },
  running:   { border: "rgba(96,165,250,0.50)",  glow: "0 0 20px rgba(96,165,250,0.30)", anim: "pulse 1s ease-in-out infinite" },
  waiting:   { border: "rgba(251,191,36,0.50)",  glow: "0 0 20px rgba(251,191,36,0.30)", anim: null },
  blocked:   { border: "rgba(248,113,113,0.50)", glow: "0 0 20px rgba(248,113,113,0.30)", anim: null },
  done:      { border: "rgba(16,185,129,0.30)",  glow: "0 0 12px rgba(16,185,129,0.15)", anim: null },
};

function statusColor(status: WorkflowNodeStatus): string {
  switch (status) {
    case "running":   return "#60a5fa";
    case "waiting":   return "#fbbf24";
    case "blocked":   return "#f87171";
    case "done":      return "#10b981";
    case "generating":return "#e5e7eb";
    default:          return "#a1a1aa";
  }
}

// ---------------------------------------------------------------------------
// Layout computation (used when nodes arrive without coordinates)
// ---------------------------------------------------------------------------

function computeNodePositions(graph: WorkflowGraph): WorkflowNode[] {
  // If nodes already have positions, return them
  if (graph.nodes.some((n) => n.x !== undefined)) {
    return graph.nodes;
  }

  const kindOrder: WorkflowNodeKind[] = [
    "input", "tool", "model", "policy", "approval", "memory", "output",
  ];

  // Group by kind
  const groups = new Map<WorkflowNodeKind, WorkflowNode[]>();
  for (const kind of kindOrder) groups.set(kind, []);
  for (const node of graph.nodes) {
    groups.get(node.kind)?.push(node);
  }

  // Assign x by kind index, y by position within group
  const result: WorkflowNode[] = [];
  for (const node of graph.nodes) {
    const kindIdx = kindOrder.indexOf(node.kind);
    const group   = groups.get(node.kind) ?? [];
    // count how many nodes of this kind come before this one
    const y = group.indexOf(node);
    result.push({ ...node, x: kindIdx, y });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Edge renderer
// ---------------------------------------------------------------------------

interface EdgeProps {
  edge: WorkflowEdge;
  sourceNode: WorkflowNode;
  targetNode: WorkflowNode;
}

function Edge({ edge, sourceNode, targetNode }: EdgeProps) {
  const sx = (sourceNode.x ?? 0) * COL_SPACING + NODE_W;   // right side of source
  const sy = (sourceNode.y ?? 0) * ROW_SPACING + NODE_H / 2;
  const tx = (targetNode.x ?? 0) * COL_SPACING;              // left side of target
  const ty = (targetNode.y ?? 0) * ROW_SPACING + NODE_H / 2;

  const cx1 = sx + (tx - sx) * 0.5;
  const cx2 = sx + (tx - sx) * 0.5;

  const d = `M ${sx} ${sy} C ${cx1} ${sy} ${cx2} ${ty} ${tx} ${ty}`;

  const strokeDasharray = edge.type === "dependency" ? "5 4" : "none";

  return (
    <path
      d={d}
      stroke="rgba(255,255,255,0.35)"
      strokeWidth={1.5}
      strokeDasharray={strokeDasharray}
      fill="none"
    />
  );
}

// ---------------------------------------------------------------------------
// Node renderer
// ---------------------------------------------------------------------------

interface NodeProps {
  node: WorkflowNode;
  isActive: boolean;
  onClick?: (nodeId: string) => void;
}

function WorkflowNodeCard({ node, isActive, onClick }: NodeProps) {
  const statusStyle = STATUS_STYLES[node.status] ?? STATUS_STYLES.idle;
  const kindColor   = KIND_COLORS[node.kind] ?? "#71717a";

  const left = (node.x ?? 0) * COL_SPACING;
  const top  = (node.y ?? 0) * ROW_SPACING;

  return (
    <div
      onClick={() => onClick?.(node.id)}
      style={{
        position: "absolute",
        left,
        top,
        width:  NODE_W,
        height: NODE_H,
        background: "#1a1a1a",
        border: `1px solid ${statusStyle.border}`,
        borderLeft: `3px solid ${kindColor}`,
        borderRadius: 6,
        padding: "10px 12px",
        cursor: "pointer",
        boxShadow: isActive && statusStyle.glow
          ? statusStyle.glow
          : isActive
          ? "0 0 20px rgba(96,165,250,0.25)"
          : "none",
        animation: statusStyle.anim ?? undefined,
        transition: "border-color 0.2s, box-shadow 0.2s",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Top row: icon + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>{node.icon}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#ffffff",
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.title}
        </span>
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.45)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginTop: 2,
        }}
      >
        {node.subtitle}
      </div>

      {/* Status badge + ports */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        {/* Left port */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.2)",
            border: "1.5px solid rgba(255,255,255,0.5)",
            flexShrink: 0,
          }}
        />

        {/* Status badge */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: statusColor(node.status),
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {node.status}
        </div>

        {/* Right port */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.2)",
            border: "1.5px solid rgba(255,255,255,0.5)",
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------

export function WorkflowCanvas({
  graph,
  activeNodeId,
  onNodeClick,
}: {
  graph: WorkflowGraph;
  activeNodeId?: string;
  onNodeClick?: (nodeId: string) => void;
}) {
  const positionedNodes = useMemo(() => computeNodePositions(graph), [graph]);

  // Compute canvas bounds
  const maxX = positionedNodes.reduce((m, n) => Math.max(m, n.x ?? 0), 0);
  const maxY = positionedNodes.reduce((m, n) => Math.max(m, n.y ?? 0), 0);

  const canvasWidth  = (maxX + 2) * COL_SPACING + NODE_W + 40;
  const canvasHeight = (maxY + 2) * ROW_SPACING + NODE_H + 40;

  // Build a quick lookup
  const nodeById = useMemo(
    () => new Map(positionedNodes.map((n) => [n.id, n])),
    [positionedNodes],
  );

  return (
    <div
      style={{
        width: "100%",
        minHeight: 400,
        background: "#0a0a0a",
        backgroundImage: "radial-gradient(circle, #333 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        overflow: "auto",
        position: "relative",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          position: "relative",
          width:  canvasWidth,
          height: canvasHeight,
          minWidth: "100%",
          minHeight: "100%",
        }}
      >
        {/* SVG edge layer */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width:  canvasWidth,
            height: canvasHeight,
            zIndex: 0,
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          {graph.edges.map((edge) => {
            const src = nodeById.get(edge.sourceId);
            const tgt = nodeById.get(edge.targetId);
            if (!src || !tgt) return null;
            return <Edge key={edge.id} edge={edge} sourceNode={src} targetNode={tgt} />;
          })}
        </svg>

        {/* Node layer */}
        <div style={{ position: "absolute", top: 0, left: 0, zIndex: 1 }}>
          {positionedNodes.map((n) => (
            <WorkflowNodeCard
              key={n.id}
              node={n}
              isActive={n.id === activeNodeId}
              onClick={onNodeClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}