import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
  SelectionMode,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
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
// Constants (from n8n canvas patterns)
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
  idle:       { border: "rgba(255,255,255,0.08)", glow: null,                          anim: null },
  generating: { border: "rgba(255,255,255,0.15)", glow: null,                          anim: "pulse 1.4s ease-in-out infinite" },
  ready:      { border: "rgba(255,255,255,0.12)", glow: null,                          anim: null },
  running:    { border: "rgba(255,255,255,0.35)",  glow: "0 0 16px rgba(255,255,255,0.08)", anim: "pulse 1s ease-in-out infinite" },
  waiting:    { border: "rgba(251,191,36,0.40)",  glow: null,                          anim: null },
  blocked:    { border: "rgba(248,113,113,0.40)", glow: null,                          anim: null },
  done:       { border: "rgba(16,185,129,0.25)",  glow: null,                          anim: null },
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
  onNodeDelete?: (nodeId: string) => void;
  onNodeDuplicate?: (nodeId: string) => void;
  onConnectStart?: (event: React.MouseEvent, params: { nodeId: string | null; handleId: string | null }) => void;
  onConnectEnd?: (event: React.MouseEvent) => void;
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Node data type for React Flow
// ---------------------------------------------------------------------------

interface FlowNodeData extends Record<string, unknown> {
  id: string;
  title: string;
  subtitle: string;
  kind: WorkflowNodeKind;
  status: WorkflowNodeStatus;
  icon: string;
  x?: number;
  y?: number;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Data mapping helpers
// ---------------------------------------------------------------------------

function graphNodesToFlowNodes(
  graph: WorkflowGraph,
  selectedNodeId?: string,
  activeNodeId?: string,
): Node[] {
  return graph.nodes.map((node) => {
    const x = node.x !== undefined ? node.x * COL_SPACING : 0;
    const y = node.y !== undefined ? node.y * ROW_SPACING : 0;
    const data: FlowNodeData = {
      id: node.id,
      title: node.title,
      subtitle: node.subtitle,
      kind: node.kind,
      status: node.status,
      icon: node.icon,
      x: node.x,
      y: node.y,
      disabled: node.status === "blocked",
    };
    return {
      id: node.id,
      type: "workflow",
      position: { x, y },
      data,
      selected: node.id === selectedNodeId,
      draggable: true,
      selectable: true,
      connectable: node.status !== "blocked",
    };
  });
}

function graphEdgesToFlowEdges(graph: WorkflowGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    type: edge.type === "dependency" ? "step" : "smoothstep",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: "rgba(255,255,255,0.25)",
    },
    style: {
      stroke: "rgba(255,255,255,0.2)",
      strokeWidth: 2,
      strokeDasharray: edge.type === "dependency" ? "5,5" : undefined,
    },
    data: {
      source: edge.sourceId,
      target: edge.targetId,
      status: undefined as WorkflowNodeStatus | "success" | undefined,
      sourceNode: graph.nodes.find(n => n.id === edge.sourceId),
      targetNode: graph.nodes.find(n => n.id === edge.targetId),
    },
  }));
}

// ---------------------------------------------------------------------------
// Layout computation
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
// WorkflowNodeCard component (n8n-inspired)
// ---------------------------------------------------------------------------

function WorkflowNodeCard({ data, selected }: NodeProps) {
  const node = data as FlowNodeData;
  const statusStyle = STATUS_STYLES[node.status] ?? STATUS_STYLES.idle;
  const kindColor   = KIND_COLORS[node.kind] ?? "#71717a";

  const isRunning = node.status === "running" || node.status === "generating";
  const isWaiting = node.status === "waiting";
  const isDone = node.status === "done";
  const isDisabled = node.status === "blocked";

  const [isHovered, setIsHovered] = useState(false);

  const borderColor = selected
    ? "rgba(255,255,255,0.50)"
    : isHovered
      ? "rgba(255,255,255,0.25)"
      : statusStyle.border;

  // n8n-style shadow on selection and hover
  const boxShadow = selected
    ? "0 0 0 1px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.4)"
    : isRunning
      ? `0 0 12px rgba(96,165,250,0.2), 0 0 20px rgba(96,165,250,0.1)`
      : isHovered
        ? "0 2px 8px rgba(0,0,0,0.35)"
        : "0 1px 3px rgba(0,0,0,0.2)";

  return (
    <div
      className={["canvas-node", selected && "selected", isHovered && "hovered", isRunning && "running", isWaiting && "waiting", isDone && "done", isDisabled && "disabled"].filter(Boolean).join(" ")}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid="canvas-node"
      data-node-name={node.title}
      data-node-type={node.kind}
      style={{
        width: 170,
        minHeight: 76,
        background: "#18181b",
        borderTop: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${kindColor}`,
        borderRadius: 4,
        boxShadow,
        animation: statusStyle.anim ?? undefined,
        transition: "border-color 0.12s ease, box-shadow 0.12s ease",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "10px 12px",
        cursor: "grab",
        position: "relative",
      }}
    >
      {/* Output handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          width: 11,
          height: 11,
          background: "#18181b",
          border: "2px solid rgba(255,255,255,0.4)",
          borderRadius: "50%",
          right: -6,
        }}
      />

      {/* Input handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          width: 11,
          height: 11,
          background: "#18181b",
          border: "2px solid rgba(255,255,255,0.4)",
          borderRadius: "50%",
          left: -6,
        }}
      />

      {/* Top row: icon + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, flexShrink: 0, opacity: 0.9 }}>{node.icon}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#ffffff",
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
          }}
        >
          {node.title}
        </span>
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.4)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginTop: 1,
          fontWeight: 400,
          letterSpacing: 0,
        }}
      >
        {node.subtitle}
      </div>

      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: statusColor(node.status),
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            padding: "2px 5px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 3,
          }}
        >
          {node.status}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Edge component (n8n-inspired)
// ---------------------------------------------------------------------------

interface CustomEdgeData extends Record<string, unknown> {
  source: string;
  target: string;
  status?: WorkflowNodeStatus | "success";
  sourceNode?: WorkflowNode;
  targetNode?: WorkflowNode;
}

function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: CustomEdgeData;
  selected?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  // n8n-style: delayed hover effect (600ms timeout)
  const delayedHoveredRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [delayedHovered, setDelayedHovered] = useState(false);

  useEffect(() => {
    if (isHovered) {
      if (delayedHoveredRef.current) clearTimeout(delayedHoveredRef.current);
      setDelayedHovered(true);
    } else {
      delayedHoveredRef.current = setTimeout(() => {
        setDelayedHovered(false);
      }, 600);
    }
    return () => {
      if (delayedHoveredRef.current) clearTimeout(delayedHoveredRef.current);
    };
  }, [isHovered]);

  // Get edge path using bezier
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.5,
  });

  // n8n-style edge coloring by status (edge status can be different from node status)
  let edgeColor = "rgba(255,255,255,0.2)";
  const edgeStatus = data?.status as WorkflowNodeStatus | undefined | "success";
  if (edgeStatus === "done" || edgeStatus === "success") edgeColor = "#10b981";
  else if (edgeStatus === "running") edgeColor = "#60a5fa";
  else if (edgeStatus === "waiting") edgeColor = "#fbbf24";

  const strokeWidth = selected ? 3 : 2;
  const opacity = delayedHovered ? 1 : 0.7;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: edgeColor,
          strokeWidth,
          opacity,
          transition: "stroke 0.3s ease, opacity 0.3s ease",
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all" as const,
            fontSize: 10,
            color: "rgba(255,255,255,0.5)",
            background: "rgba(0,0,0,0.6)",
            padding: "2px 6px",
            borderRadius: 3,
            opacity: delayedHovered ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}
          className="nodrag nopan"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Optional edge label */}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Connection Line (n8n-inspired)
// ---------------------------------------------------------------------------

function ConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromPosition: Position;
  toPosition: Position;
}) {
  const [isVisible, setIsVisible] = useState(false);

  // n8n-style: delay visibility 300ms to prevent flicker
  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsVisible(true);
    }, 300);
    return () => clearTimeout(timeout);
  }, []);

  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
    sourcePosition: fromPosition,
    targetPosition: toPosition,
    curvature: 0.5,
  });

  return (
    <BaseEdge
      path={path}
      style={{
        stroke: "rgba(255,255,255,0.4)",
        strokeWidth: 2,
        strokeDasharray: "5,5",
        opacity: isVisible ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Canvas Controls (n8n-inspired)
// ---------------------------------------------------------------------------

interface CanvasControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onResetZoom: () => void;
  onTidyUp: () => void;
  zoom: number;
  readOnly?: boolean;
}

function CanvasControls({
  onZoomIn,
  onZoomOut,
  onFitView,
  onResetZoom,
  onTidyUp,
  zoom,
  readOnly,
}: CanvasControlsProps) {
  const buttonStyle: React.CSSProperties = {
    background: "#18181b",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 4,
    color: "#ffffff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    fontSize: 14,
    transition: "background 0.12s ease, border-color 0.12s ease",
    fontFamily: "InterVariable, system-ui, sans-serif",
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        zIndex: 10,
      }}
    >
      {/* Zoom to fit (shortcut: 1) */}
      <button
        style={buttonStyle}
        onClick={onFitView}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#27272a";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#18181b";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
        }}
        title="Zoom to fit (1)"
        data-testid="zoom-to-fit"
      >
        ⊡
      </button>

      {/* Zoom in (shortcut: +) */}
      <button
        style={buttonStyle}
        onClick={onZoomIn}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#27272a";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#18181b";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
        }}
        title="Zoom in (+)"
        data-testid="zoom-in-button"
      >
        +
      </button>

      {/* Zoom level indicator */}
      <div
        style={{
          background: "#18181b",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 4,
          color: "rgba(255,255,255,0.6)",
          fontSize: 10,
          fontWeight: 500,
          fontFamily: "InterVariable, system-ui, sans-serif",
          padding: "4px 6px",
          textAlign: "center",
          minWidth: 44,
        }}
      >
        {Math.round(zoom * 100)}%
      </div>

      {/* Zoom out (shortcut: -) */}
      <button
        style={buttonStyle}
        onClick={onZoomOut}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#27272a";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#18181b";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
        }}
        title="Zoom out (-)"
        data-testid="zoom-out-button"
      >
        −
      </button>

      {/* Reset zoom (shortcut: 0) */}
      {zoom !== 1 && (
        <button
          style={buttonStyle}
          onClick={onResetZoom}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#27272a";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#18181b";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          }}
          title="Reset zoom (0)"
          data-testid="reset-zoom-button"
        >
          ↺
        </button>
      )}

      {/* Tidy up layout (shortcut: Shift+Alt+T) */}
      {!readOnly && (
        <button
          style={{ ...buttonStyle, marginTop: 2 }}
          onClick={onTidyUp}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#27272a";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#18181b";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          }}
          title="Tidy up (Shift+Alt+T)"
          data-testid="tidy-up-button"
        >
          ⬜
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context Menu (n8n-inspired)
// ---------------------------------------------------------------------------

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

interface ContextMenuProps {
  position: ContextMenuState;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onClose: () => void;
}

function ContextMenu({ position, onDelete, onDuplicate, onClose }: ContextMenuProps) {
  const menuStyle: React.CSSProperties = {
    position: "absolute",
    left: position.x,
    top: position.y,
    background: "#18181b",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 4,
    padding: "4px 0",
    minWidth: 140,
    zIndex: 100,
    boxShadow: "0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
  };

  const itemStyle: React.CSSProperties = {
    padding: "7px 14px",
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    transition: "background 0.08s ease",
    fontWeight: 400,
    fontFamily: "InterVariable, system-ui, sans-serif",
  };

  useEffect(() => {
    const handleClickOutside = () => onClose();
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [onClose]);

  return (
    <div style={menuStyle} data-testid="context-menu">
      <div
        style={itemStyle}
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate(position.nodeId);
          onClose();
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        data-testid="context-menu-item-duplicate"
      >
        <span style={{ opacity: 0.6 }}>⧉</span> Duplicate
      </div>
      <div
        style={{
          ...itemStyle,
          color: "#f87171",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(position.nodeId);
          onClose();
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248,113,113,0.15)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        data-testid="context-menu-item-delete"
      >
        <span style={{ opacity: 0.6 }}>✕</span> Delete
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner canvas (n8n patterns adapted to React Flow)
// ---------------------------------------------------------------------------

interface CanvasInnerProps {
  graph: WorkflowGraph;
  activeNodeId?: string;
  selectedNodeId?: string;
  onNodeClick?: (nodeId: string) => void;
  onNodesChange?: (nodes: WorkflowNode[]) => void;
  onEdgesChange?: (edge: WorkflowEdge) => void;
  onNodeDelete?: (nodeId: string) => void;
  onNodeDuplicate?: (nodeId: string) => void;
  onConnectStart?: (event: React.MouseEvent, params: { nodeId: string | null; handleId: string | null }) => void;
  onConnectEnd?: (event: React.MouseEvent) => void;
  readOnly?: boolean;
}

function CanvasInner({
  graph,
  activeNodeId,
  selectedNodeId,
  onNodeClick,
  onNodesChange,
  onEdgesChange,
  onNodeDelete,
  onNodeDuplicate,
  onConnectStart,
  onConnectEnd,
  readOnly,
}: CanvasInnerProps) {
  const {
    fitView,
    zoomIn,
    zoomOut,
    getZoom,
    setViewport,
  } = useReactFlow();

  const [zoom, setZoom] = useState(1);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);

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

  // Track zoom changes
  useEffect(() => {
    const interval = setInterval(() => {
      const currentZoom = getZoom();
      if (Math.abs(currentZoom - zoom) > 0.01) {
        setZoom(currentZoom);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [getZoom, zoom]);

  // Sync when graph changes
  useEffect(() => {
    const layouted = computeDefaultPositions(graph);
    const layoutedGraphAdjusted = { ...graph, nodes: layouted };
    setNodes(graphNodesToFlowNodes(layoutedGraphAdjusted, selectedNodeId, activeNodeId));
    setEdges(graphEdgesToFlowEdges(layoutedGraphAdjusted));
    setTimeout(() => {
      fitView({ padding: 0.3, duration: 200 });
    }, 50);
  }, [graph, selectedNodeId, activeNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync selected state
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
      })),
    );
  }, [selectedNodeId]);

  // Handle nodes change (n8n pattern)
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChangeInternal>[0]) => {
      onNodesChangeInternal(changes);

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
            return { ...(n.data as FlowNodeData), x, y };
          }
          return n.data as FlowNodeData;
        });
        onNodesChange(updated as WorkflowNode[]);
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

  // Handle connection (n8n pattern: onConnect)
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Check if edge already exists
      const exists = edges.some(
        (e) => e.source === connection.source && e.target === connection.target,
      );
      if (exists) return;

      const newEdge: WorkflowEdge = {
        id: `edge-${Date.now().toString(36)}`,
        sourceId: connection.source,
        targetId: connection.target,
        type: "execution",
      };
      onEdgesChange?.(newEdge);
    },
    [onEdgesChange, edges],
  );

  // Handle connect start (n8n pattern: onConnectStart)
  const handleConnectStart = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event: any, params: { nodeId: string | null; handleId: string | null }) => {
      if (params.nodeId) {
        setConnectingNodeId(params.nodeId);
        onConnectStart?.(event as React.MouseEvent, params);
      }
    },
    [onConnectStart],
  );

  // Handle connect end (n8n pattern: onConnectEnd)
  const handleConnectEnd = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event: any) => {
      setConnectingNodeId(null);
      onConnectEnd?.(event as React.MouseEvent);
    },
    [onConnectEnd],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

  // Handle node context menu (right-click)
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      });
    },
    [],
  );

  // Handle pane context menu
  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      setContextMenu(null);
    },
    [],
  );

  // Handle node double-click
  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      console.log("Double-clicked node:", node.id);
    },
    [],
  );

  // Keyboard shortcuts (n8n pattern)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Delete key
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedNodeId && onNodeDelete && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          onNodeDelete(selectedNodeId);
        }
      }

      // Escape - close context menu
      if (event.key === "Escape") {
        setContextMenu(null);
      }

      // Ctrl/Cmd + D - duplicate
      if ((event.ctrlKey || event.metaKey) && event.key === "d") {
        if (selectedNodeId && onNodeDuplicate) {
          event.preventDefault();
          onNodeDuplicate(selectedNodeId);
        }
      }

      // + or = for zoom in
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      }

      // - for zoom out
      if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      }

      // 0 to reset zoom
      if (event.key === "0") {
        event.preventDefault();
        setViewport({ x: 0, y: 0, zoom: 1 });
        setZoom(1);
      }

      // 1 to fit view
      if (event.key === "1") {
        event.preventDefault();
        fitView({ padding: 0.3, duration: 200 });
      }

      // Shift+Alt+T for tidy up
      if (event.shiftKey && event.altKey && event.key === "T") {
        if (!readOnly) {
          event.preventDefault();
          // Tidy up would trigger layout here
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, onNodeDelete, onNodeDuplicate, zoomIn, zoomOut, fitView, setViewport, readOnly]);

  // Close context menu when clicking on canvas
  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    zoomIn();
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut();
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.3, duration: 200 });
  }, [fitView]);

  const handleResetZoom = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 });
    setZoom(1);
  }, [setViewport]);

  const handleTidyUp = useCallback(() => {
    // Trigger layout tidy up - would recompute positions
    console.log("Tidy up triggered");
  }, []);

  // Context menu handlers
  const handleContextMenuDelete = useCallback(
    (nodeId: string) => {
      if (onNodeDelete) {
        onNodeDelete(nodeId);
      }
      setContextMenu(null);
    },
    [onNodeDelete],
  );

  const handleContextMenuDuplicate = useCallback(
    (nodeId: string) => {
      if (onNodeDuplicate) {
        onNodeDuplicate(nodeId);
      }
      setContextMenu(null);
    },
    [onNodeDuplicate],
  );

  // Selection mode for multi-select
  const selectionMode = useMemo(
    () => SelectionMode.Partial,
    [],
  );

  const nodeTypes: NodeTypes = {
    workflow: WorkflowNodeCard,
  };

  return (
    <div
      style={{ width: "100%", height: "100%", minHeight: 400 }}
      onContextMenu={handlePaneContextMenu}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          type: "smoothstep",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: "rgba(255,255,255,0.25)",
          },
          style: { stroke: "rgba(255,255,255,0.2)", strokeWidth: 2 },
        }}
        connectionLineComponent={ConnectionLine}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        style={{ background: "#0a0a0a" }}
        minZoom={0.15}
        maxZoom={3}
        selectionMode={selectionMode}
        selectNodesOnDrag={false}
        panOnScroll
        zoomOnScroll
        panOnDrag={[1, 2]}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        onMove={() => {
          setZoom(getZoom());
        }}
        elevateNodesOnSelect
      >
        <Background
          color="#404040"
          gap={20}
          size={1}
          variant={BackgroundVariant.Dots}
          style={{ opacity: 0.6 }}
        />

        <MiniMap
          nodeColor={(n) => {
            const data = n.data as FlowNodeData;
            return KIND_COLORS[data?.kind] ?? "#71717a";
          }}
          style={{
            background: "#18181b",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4,
            padding: 4,
          }}
          maskColor="rgba(0,0,0,0.6)"
          position="bottom-left"
          pannable
          zoomable
        />

        <CanvasControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
          onResetZoom={handleResetZoom}
          onTidyUp={handleTidyUp}
          zoom={zoom}
          readOnly={readOnly}
        />
      </ReactFlow>

      {contextMenu && (
        <ContextMenu
          position={contextMenu}
          onDelete={handleContextMenuDelete}
          onDuplicate={handleContextMenuDuplicate}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
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