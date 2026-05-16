import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type NodeProps,
  type Handle,
  Position,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
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

const COL_SPACING = 200;
const ROW_SPACING = 120;

const KIND_COLORS: Record<WorkflowNodeKind, string> = {
  input:    "#22c55e",
  tool:      "#71717a",
  model:     "#a78bfa",
  policy:    "#fb923c",
  approval:  "#fbbf24",
  memory:    "#22d3ee",
  output:    "#10b981",
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
// Types
// ---------------------------------------------------------------------------

interface WorkflowCanvasProps {
  graph: WorkflowGraph;
  activeNodeId?: string;
  selectedNodeId?: string;
  onNodeClick?: (nodeId: string) => void;
  onNodesChange?: (nodes: WorkflowNode[]) => void;
  onEdgesChange?: (edge: WorkflowEdge) => void;
}

// ---------------------------------------------------------------------------
// Data mapping helpers
// ---------------------------------------------------------------------------

function graphNodesToFlowNodes(
  graph: WorkflowGraph,
  selectedNodeId?: string,
  activeNodeId?: string,
): Node<WorkflowNode>[] {
  return graph.nodes.map((node) => {
    const x = node.x !== undefined ? node.x * COL_SPACING : 0;
    const y = node.y !== undefined ? node.y * ROW_SPACING : 0;
    return {
      id: node.id,
      type: "workflow",
      position: { x, y },
      data: node,
      selected: node.id === selectedNodeId,
    };
  });
}

function graphEdgesToFlowEdges(graph: WorkflowGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    type: edge.type === "dependency" ? "default" : "default",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      stroke: "rgba(255,255,255,0.35)",
      strokeWidth: 1.5,
      strokeDasharray: edge.type === "dependency" ? "5 4" : undefined,
    },
  }));
}

// ---------------------------------------------------------------------------
// Layout computation (for nodes without x/y)
// ---------------------------------------------------------------------------

function computeDefaultPositions(graph: WorkflowGraph): WorkflowNode[] {
  if (graph.nodes.some((n) => n.x !== undefined)) {
    return graph.nodes;
  }

  const kindOrder: WorkflowNodeKind[] = [
    "input", "tool", "model", "policy", "approval", "memory", "output",
  ];

  const groups = new Map<WorkflowNodeKind, WorkflowNode[]>();
  for (const kind of kindOrder) groups.set(kind, []);
  for (const node of graph.nodes) {
    groups.get(node.kind)?.push(node);
  }

  return graph.nodes.map((n) => {
    if (n.x !== undefined && n.y !== undefined) return n;
    const kindCol = kindOrder.indexOf(n.kind);
    const group = groups.get(n.kind) ?? [];
    const y = group.indexOf(n);
    return { ...n, x: kindCol, y };
  });
}

// ---------------------------------------------------------------------------
// WorkflowNodeCard component
// ---------------------------------------------------------------------------

function WorkflowNodeCard({ data }: NodeProps<WorkflowNode>) {
  const node = data;
  const statusStyle = STATUS_STYLES[node.status] ?? STATUS_STYLES.idle;
  const kindColor   = KIND_COLORS[node.kind] ?? "#71717a";

  const isRunning = node.status === "running" || node.status === "generating";

  return (
    <div
      style={{
        width:  160,
        height: 80,
        background: "#1a1a1a",
        border: `1px solid ${statusStyle.border}`,
        borderLeft: `3px solid ${kindColor}`,
        borderRadius: 6,
        boxShadow: isRunning
          ? statusStyle.glow
            ? `${statusStyle.glow}, 0 0 20px rgba(96,165,250,0.25)`
            : "0 0 20px rgba(96,165,250,0.25)"
          : "none",
        animation: statusStyle.anim ?? undefined,
        transition: "border-color 0.2s, box-shadow 0.2s",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "10px 12px",
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

      {/* Status badge + handles */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        {/* Left handle (target / input) */}
        <Handle
          type="target"
          position={Position.Left}
          style={{
            width: 10,
            height: 10,
            background: "rgba(255,255,255,0.2)",
            border: "1.5px solid rgba(255,255,255,0.5)",
            borderRadius: "50%",
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

        {/* Right handle (source / output) */}
        <Handle
          type="source"
          position={Position.Right}
          style={{
            width: 10,
            height: 10,
            background: "rgba(255,255,255,0.2)",
            border: "1.5px solid rgba(255,255,255,0.5)",
            borderRadius: "50%",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner canvas (needs ReactFlow context)
// ---------------------------------------------------------------------------

interface CanvasInnerProps {
  graph: WorkflowGraph;
  activeNodeId?: string;
  selectedNodeId?: string;
  onNodeClick?: (nodeId: string) => void;
  onNodesChange?: (nodes: WorkflowNode[]) => void;
  onEdgesChange?: (edge: WorkflowEdge) => void;
}

function CanvasInner({
  graph,
  activeNodeId,
  selectedNodeId,
  onNodeClick,
  onNodesChange,
  onEdgesChange,
}: CanvasInnerProps) {
  const { fitView } = useReactFlow();

  // Apply default layout to nodes without positions
  const layoutedGraph = useMemo(() => {
    const nodesWithLayout = computeDefaultPositions(graph);
    return { ...graph, nodes: nodesWithLayout };
  }, [graph]);

  const initialNodes = useMemo(
    () => graphNodesToFlowNodes(layoutedGraph, selectedNodeId, activeNodeId),
    [layoutedGraph, selectedNodeId, activeNodeId],
  );

  const initialEdges = useMemo(
    () => graphEdgesToFlowEdges(layoutedGraph),
    [layoutedGraph],
  );

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(initialEdges);

  // Sync when graph changes (e.g. new nodes added)
  useEffect(() => {
    const layouted = computeDefaultPositions(graph);
    const layoutedGraphAdjusted = { ...graph, nodes: layouted };
    setNodes(graphNodesToFlowNodes(layoutedGraphAdjusted, selectedNodeId, activeNodeId));
    setEdges(graphEdgesToFlowEdges(layoutedGraphAdjusted));
    // Fit view after graph changes
    setTimeout(() => {
      fitView({ padding: 0.3, duration: 200 });
    }, 50);
  }, [graph, selectedNodeId, activeNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync active/selected state changes without re-mapping all positions
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
      })),
    );
  }, [selectedNodeId]);

  // Keep nodes in sync with parent
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChangeInternal>[0]) => {
      onNodesChangeInternal(changes);
      // Extract position changes and sync back to parent as WorkflowNode[]
      const positionChanges = changes.filter(
        (c): c is { type: "position"; id: string; position: { x: number; y: number }; draggable: boolean } =>
          c.type === "position",
      );
      if (positionChanges.length > 0 && onNodesChange) {
        const updated = nodes.map((n) => {
          const change = positionChanges.find((c) => c.id === n.id);
          if (change) {
            const x = Math.round(change.position.x / COL_SPACING);
            const y = Math.round(change.position.y / ROW_SPACING);
            return { ...n.data, x, y };
          }
          return n.data;
        });
        onNodesChange(updated);
      }
    },
    [onNodesChange, onNodesChangeInternal, nodes],
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChangeInternal>[0]) => {
      onEdgesChangeInternal(changes);
    },
    [onEdgesChangeInternal],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const newEdge: WorkflowEdge = {
        id: `edge-${Date.now().toString(36)}`,
        sourceId: connection.source,
        targetId: connection.target,
        type: "execution",
      };
      onEdgesChange?.(newEdge);
    },
    [onEdgesChange],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

  const nodeTypes: NodeTypes = {
    workflow: WorkflowNodeCard,
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onConnect={handleConnect}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      defaultEdgeOptions={{
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "rgba(255,255,255,0.35)", strokeWidth: 1.5 },
      }}
      style={{ background: "#0a0a0a" }}
      minZoom={0.25}
      maxZoom={2.5}
    >
      <Background color="#2a2a2a" gap={24} size={1} />
      <Controls
        style={{
          background: "#141414",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
        }}
      />
      <MiniMap
        nodeColor={(n) => KIND_COLORS[(n.data as WorkflowNode)?.kind] ?? "#71717a"}
        style={{ background: "#141414" }}
        maskColor="rgba(0,0,0,0.6)"
      />
    </ReactFlow>
  );
}

// ---------------------------------------------------------------------------
// Wrapper (provides ReactFlow context)
// ---------------------------------------------------------------------------

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <div style={{ width: "100%", height: "100%", minHeight: 400 }}>
        <CanvasInner {...props} />
      </div>
    </ReactFlowProvider>
  );
}
