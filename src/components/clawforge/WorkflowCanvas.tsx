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
  type NodeDragEndEvent,
  BackgroundVariant,
  type SelectionMode,
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
  onNodeDelete?: (nodeId: string) => void;
  onNodeDuplicate?: (nodeId: string) => void;
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
    type: "smoothstep",
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

function WorkflowNodeCard({ data, selected, id }: NodeProps<WorkflowNode>) {
  const node = data;
  const statusStyle = STATUS_STYLES[node.status] ?? STATUS_STYLES.idle;
  const kindColor   = KIND_COLORS[node.kind] ?? "#71717a";

  const isRunning = node.status === "running" || node.status === "generating";

  // Subtle hover state - brighten border slightly
  const [isHovered, setIsHovered] = useState(false);

  const borderColor = selected
    ? "rgba(255,255,255,0.50)"
    : isHovered
      ? "rgba(255,255,255,0.25)"
      : statusStyle.border;

  const boxShadow = selected
    ? "0 0 0 2px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.4)"
    : isRunning
      ? statusStyle.glow
        ? `${statusStyle.glow}, 0 0 20px rgba(96,165,250,0.25)`
        : "0 0 20px rgba(96,165,250,0.25)"
      : "none";

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width:  160,
        height: 80,
        background: "#1a1a1a",
        borderTop: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${kindColor}`,
        borderRadius: 6,
        boxShadow,
        animation: statusStyle.anim ?? undefined,
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "10px 12px",
        cursor: "grab",
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
// Custom Canvas Controls (ClawForge styled)
// ---------------------------------------------------------------------------

interface CanvasControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  zoom: number;
}

function CanvasControls({ onZoomIn, onZoomOut, onFitView, zoom }: CanvasControlsProps) {
  const buttonStyle: React.CSSProperties = {
    background: "#1a1a1a",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#ffffff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    fontSize: 16,
    transition: "background 0.15s ease, border-color 0.15s ease",
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        zIndex: 10,
      }}
    >
      <button
        style={buttonStyle}
        onClick={onZoomIn}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#2a2a2a";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#1a1a1a";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
        }}
        title="Zoom in"
      >
        +
      </button>

      <div
        style={{
          background: "#141414",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 4,
          color: "rgba(255,255,255,0.6)",
          fontSize: 10,
          fontWeight: 500,
          padding: "4px 8px",
          textAlign: "center",
          minWidth: 48,
        }}
      >
        {Math.round(zoom * 100)}%
      </div>

      <button
        style={buttonStyle}
        onClick={onZoomOut}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#2a2a2a";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#1a1a1a";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
        }}
        title="Zoom out"
      >
        −
      </button>

      <button
        style={{
          ...buttonStyle,
          marginTop: 4,
        }}
        onClick={onFitView}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#2a2a2a";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#1a1a1a";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
        }}
        title="Fit view"
      >
        ⊡
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context Menu
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
    background: "#1a1a1a",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    padding: "6px 0",
    minWidth: 140,
    zIndex: 100,
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  };

  const itemStyle: React.CSSProperties = {
    padding: "8px 16px",
    color: "#ffffff",
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    transition: "background 0.1s ease",
  };

  useEffect(() => {
    const handleClickOutside = () => onClose();
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [onClose]);

  return (
    <div style={menuStyle}>
      <div
        style={itemStyle}
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate(position.nodeId);
          onClose();
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
      >
        <span style={{ opacity: 0.6 }}>✕</span> Delete
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
  onNodeDelete?: (nodeId: string) => void;
  onNodeDuplicate?: (nodeId: string) => void;
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
}: CanvasInnerProps) {
  const {
    fitView,
    zoomIn,
    zoomOut,
    getZoom,
    setViewport,
    getViewport,
  } = useReactFlow();

  const [zoom, setZoom] = useState(1);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const nodesContainerRef = useRef<HTMLDivElement>(null);

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

  // Handle double-click to expand (could be used for NDV later)
  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // For now, just log - could open node details panel
      console.log("Double-clicked node:", node.id);
    },
    [],
  );

  // Node drag end handler
  const handleNodeDragStop = useCallback(
    (_: MouseEvent | NodeDragEndEvent, node: Node) => {
      // Position changes are handled via handleNodesChange
    },
    [],
  );

  // Delete selected nodes via keyboard
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Delete key - delete selected node
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedNodeId && onNodeDelete) {
          // Prevent delete if modifier keys are held
          if (!event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            onNodeDelete(selectedNodeId);
          }
        }
      }

      // Escape key - close context menu or deselect
      if (event.key === "Escape") {
        setContextMenu(null);
      }

      // Ctrl/Cmd + C - copy (placeholder for clipboard)
      if ((event.ctrlKey || event.metaKey) && event.key === "c") {
        if (selectedNodeId) {
          // Could copy node data to clipboard
          console.log("Copy node:", selectedNodeId);
        }
      }

      // Ctrl/Cmd + V - paste (placeholder)
      if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        console.log("Paste not implemented yet");
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
        fitView({ padding: 0.3, duration: 200 });
      }

      // 1 to fit view
      if (event.key === "1") {
        event.preventDefault();
        fitView({ padding: 0.3, duration: 200 });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, onNodeDelete, onNodeDuplicate, zoomIn, zoomOut, fitView]);

  // Close context menu when clicking on canvas
  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Zoom handlers for custom controls
  const handleZoomIn = useCallback(() => {
    zoomIn();
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut();
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.3, duration: 200 });
  }, [fitView]);

  // Handle context menu delete
  const handleContextMenuDelete = useCallback(
    (nodeId: string) => {
      if (onNodeDelete) {
        onNodeDelete(nodeId);
      }
      setContextMenu(null);
    },
    [onNodeDelete],
  );

  // Handle context menu duplicate
  const handleContextMenuDuplicate = useCallback(
    (nodeId: string) => {
      if (onNodeDuplicate) {
        onNodeDuplicate(nodeId);
      }
      setContextMenu(null);
    },
    [onNodeDuplicate],
  );

  // Custom selection mode for multi-select
  const selectionMode: SelectionMode = useMemo(
    () => SelectionMode.Partial,
    [],
  );

  const nodeTypes: NodeTypes = {
    workflow: WorkflowNodeCard,
  };

  return (
    <div
      ref={nodesContainerRef}
      style={{ width: "100%", height: "100%", minHeight: 400 }}
      onContextMenu={handlePaneContextMenu}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={handlePaneClick}
        onPaneKeyDown={(e) => {
          // Prevent default React Flow pan on space when not needed
        }}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        defaultEdgeOptions={{
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: "rgba(255,255,255,0.35)", strokeWidth: 1.5 },
        }}
        style={{ background: "#0a0a0a" }}
        minZoom={0.15}
        maxZoom={3}
        selectionMode={selectionMode}
        selectNodesOnDrag={false}
        panOnScroll
        zoomOnScroll
        panOnDrag={[1, 2]} // Left and middle mouse buttons
        onMove={() => {
          setZoom(getZoom());
        }}
      >
        <Background
          color="#2a2a2a"
          gap={24}
          size={1}
          variant={BackgroundVariant.Dots}
        />

        {/* ClawForge-styled mini-map */}
        <MiniMap
          nodeColor={(n) => KIND_COLORS[(n.data as WorkflowNode)?.kind] ?? "#71717a"}
          style={{
            background: "#141414",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 8,
          }}
          maskColor="rgba(0,0,0,0.5)"
          position="bottom-left"
        />

        {/* Custom Controls */}
        <CanvasControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
          zoom={zoom}
        />
      </ReactFlow>

      {/* Context Menu */}
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