import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
// Layout computation
// ---------------------------------------------------------------------------

function computeNodePositions(graph: WorkflowGraph): WorkflowNode[] {
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

  const result: WorkflowNode[] = [];
  for (const node of graph.nodes) {
    const kindIdx = kindOrder.indexOf(node.kind);
    const group   = groups.get(node.kind) ?? [];
    const y = group.indexOf(node);
    result.push({ ...node, x: kindIdx, y });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Port positions helper
// ---------------------------------------------------------------------------

function getPortPositions(node: WorkflowNode) {
  const nx = node.x ?? 0;
  const ny = node.y ?? 0;
  return {
    inputX:  nx * COL_SPACING,
    inputY:  ny * ROW_SPACING + NODE_H / 2,
    outputX: nx * COL_SPACING + NODE_W,
    outputY: ny * ROW_SPACING + NODE_H / 2,
  };
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
  const { outputX, outputY } = getPortPositions(sourceNode);
  const { inputX, inputY } = getPortPositions(targetNode);

  const cx1 = outputX + (inputX - outputX) * 0.5;
  const cx2 = outputX + (inputX - outputX) * 0.5;

  const d = `M ${outputX} ${outputY} C ${cx1} ${outputY} ${cx2} ${inputY} ${inputX} ${inputY}`;

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
// Connection line (while drawing)
// ---------------------------------------------------------------------------

interface ConnectionLineProps {
  fromNode: WorkflowNode;
  handle: "input" | "output";
  mouseX: number;
  mouseY: number;
  zoom: number;
  panX: number;
  panY: number;
}

function ConnectionLine({ fromNode, handle, mouseX, mouseY, zoom, panX, panY }: ConnectionLineProps) {
  const { inputX, inputY, outputX, outputY } = getPortPositions(fromNode);

  const sx = handle === "output" ? outputX : inputX;
  const sy = handle === "output" ? outputY : inputY;

  // Convert mouse screen coords to canvas coords
  const cx = (mouseX - panX) / zoom;
  const cy = (mouseY - panY) / zoom;

  const cx1 = sx + (cx - sx) * 0.5;
  const cx2 = sx + (cx - sx) * 0.5;

  const d = `M ${sx} ${sy} C ${cx1} ${sy} ${cx2} ${cy} ${cx} ${cy}`;

  return (
    <path
      d={d}
      stroke="rgba(255,255,255,0.6)"
      strokeWidth={1.5}
      strokeDasharray="5 4"
      fill="none"
    />
  );
}

// ---------------------------------------------------------------------------
// Node card
// ---------------------------------------------------------------------------

interface NodeCardProps {
  node: WorkflowNode;
  isActive: boolean;
  isSelected: boolean;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onPortMouseDown: (e: React.MouseEvent, nodeId: string, handle: "input" | "output") => void;
  onPortMouseUp: (e: React.MouseEvent, nodeId: string, handle: "input" | "output") => void;
}

function NodeCard({
  node,
  isActive,
  isSelected,
  isDragging,
  onMouseDown,
  onPortMouseDown,
  onPortMouseUp,
}: NodeCardProps) {
  const statusStyle = STATUS_STYLES[node.status] ?? STATUS_STYLES.idle;
  const kindColor   = KIND_COLORS[node.kind] ?? "#71717a";

  const left = (node.x ?? 0) * COL_SPACING;
  const top  = (node.y ?? 0) * ROW_SPACING;

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, node.id)}
      style={{
        position: "absolute",
        left,
        top,
        width:  NODE_W,
        height: NODE_H,
        background: "#1a1a1a",
        border: isSelected
          ? `1px solid rgba(96,165,250,0.70)`
          : `1px solid ${statusStyle.border}`,
        borderLeft: `3px solid ${kindColor}`,
        borderRadius: 6,
        cursor: isDragging ? "grabbing" : "grab",
        boxShadow: isDragging
          ? "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)"
          : isActive && statusStyle.glow
          ? statusStyle.glow
          : isActive
          ? "0 0 20px rgba(96,165,250,0.25)"
          : isSelected
          ? "0 0 20px rgba(96,165,250,0.30)"
          : "none",
        animation: statusStyle.anim ?? undefined,
        transition: isDragging ? "none" : "border-color 0.2s, box-shadow 0.2s",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "10px 12px",
        transform: isDragging ? "scale(1.02)" : "scale(1)",
        zIndex: isDragging ? 100 : isSelected ? 10 : 1,
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
        {/* Left port (input) */}
        <div
          onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(e, node.id, "input"); }}
          onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(e, node.id, "input"); }}
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.2)",
            border: "1.5px solid rgba(255,255,255,0.5)",
            flexShrink: 0,
            cursor: "crosshair",
            position: "relative",
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = "rgba(96,165,250,0.6)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(96,165,250,0.9)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.2)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.5)";
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

        {/* Right port (output) */}
        <div
          onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(e, node.id, "output"); }}
          onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(e, node.id, "output"); }}
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.2)",
            border: "1.5px solid rgba(255,255,255,0.5)",
            flexShrink: 0,
            cursor: "crosshair",
            position: "relative",
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = "rgba(96,165,250,0.6)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(96,165,250,0.9)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.2)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.5)";
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas controls
// ---------------------------------------------------------------------------

interface CanvasControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
}

function CanvasControls({ zoom, onZoomIn, onZoomOut, onFitView }: CanvasControlsProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 8,
        padding: "4px 6px",
        zIndex: 1000,
      }}
    >
      <button
        onClick={onZoomOut}
        style={{
          width: 36,
          height: 36,
          background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
          color: "rgba(255,255,255,0.50)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 600,
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#2a2a2a";
          (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a";
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.50)";
        }}
      >
        −
      </button>

      <div
        style={{
          minWidth: 48,
          textAlign: "center",
          fontSize: 12,
          fontWeight: 600,
          color: "rgba(255,255,255,0.70)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {Math.round(zoom * 100)}%
      </div>

      <button
        onClick={onZoomIn}
        style={{
          width: 36,
          height: 36,
          background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
          color: "rgba(255,255,255,0.50)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 600,
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#2a2a2a";
          (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a";
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.50)";
        }}
      >
        +
      </button>

      <button
        onClick={onFitView}
        style={{
          width: 36,
          height: 36,
          background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
          color: "rgba(255,255,255,0.50)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 600,
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#2a2a2a";
          (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a";
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.50)";
        }}
      >
        ⊡
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main canvas component
// ---------------------------------------------------------------------------

export function WorkflowCanvas({
  graph,
  activeNodeId,
  selectedNodeId: externalSelectedNodeId,
  onNodeClick,
  onNodesChange,
  onEdgesChange,
}: WorkflowCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; handle: "input" | "output" } | null>(null);
  const [connectingMousePos, setConnectingMousePos] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panViewportStart, setPanViewportStart] = useState({ x: 0, y: 0 });

  // Internal node positions state (mutable during drag)
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(() => new Map());

  const positionedNodes = useMemo(() => {
    const nodes = computeNodePositions(graph);
    return nodes.map((n) => {
      const pos = nodePositions.get(n.id);
      if (pos && draggingNodeId !== n.id) {
        return { ...n, x: pos.x, y: pos.y };
      }
      return n;
    });
  }, [graph, nodePositions, draggingNodeId]);

  // Sync node positions from external changes
  useEffect(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of positionedNodes) {
      map.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
    }
    setNodePositions(map);
  }, [graph]);

  // Node lookup
  const nodeById = useMemo(
    () => new Map(positionedNodes.map((n) => [n.id, n])),
    [positionedNodes],
  );

  // -------------------------------------------------------------------------
  // Mouse handlers
  // -------------------------------------------------------------------------

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start pan on middle or right mouse button, or if target is canvas background
    const target = e.target as HTMLElement;
    if (target === e.currentTarget || target.classList.contains("canvas-bg")) {
      if (e.button === 1 || e.button === 2) {
        // Middle or right click - start pan
        e.preventDefault();
        setPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        setPanViewportStart({ x: viewport.x, y: viewport.y });
      } else if (e.button === 0) {
        // Left click on background - start pan and deselect
        setPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        setPanViewportStart({ x: viewport.x, y: viewport.y });
        setSelectedNodeId(null);
      }
    }
  }, [viewport]);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const node = nodeById.get(nodeId);
    if (!node) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nodeLeft = (node.x ?? 0) * COL_SPACING;
    const nodeTop = (node.y ?? 0) * ROW_SPACING;

    // Account for viewport transform
    const mouseX = (e.clientX - rect.left - viewport.x) / viewport.zoom;
    const mouseY = (e.clientY - rect.top - viewport.y) / viewport.zoom;

    setDraggingNodeId(nodeId);
    setDragOffset({
      x: mouseX - nodeLeft,
      y: mouseY - nodeTop,
    });
    setSelectedNodeId(nodeId);
    onNodeClick?.(nodeId);
  }, [nodeById, viewport, onNodeClick]);

  const handlePortMouseDown = useCallback((e: React.MouseEvent, nodeId: string, handle: "input" | "output") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setConnectingFrom({ nodeId, handle });
    setConnectingMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handlePortMouseUp = useCallback((e: React.MouseEvent, nodeId: string, handle: "input" | "output") => {
    if (!connectingFrom) return;
    e.stopPropagation();

    // Only connect opposite types
    if (connectingFrom.nodeId !== nodeId && connectingFrom.handle !== handle) {
      // Create edge
      const sourceId = connectingFrom.handle === "output" ? connectingFrom.nodeId : nodeId;
      const targetId = connectingFrom.handle === "output" ? nodeId : connectingFrom.nodeId;

      const newEdge: WorkflowEdge = {
        id: `edge-${sourceId}-${targetId}-${Date.now()}`,
        sourceId,
        targetId,
        type: "data",
      };

      onEdgesChange?.(newEdge);
    }

    setConnectingFrom(null);
  }, [connectingFrom, onEdgesChange]);

  // -------------------------------------------------------------------------
  // Document-level mouse move/up for dragging and panning
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingNodeId) {
        const node = nodeById.get(draggingNodeId);
        if (!node) return;

        // Calculate new position in grid coordinates
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert to canvas coordinates then to grid
        const canvasX = (mouseX - viewport.x) / viewport.zoom;
        const canvasY = (mouseY - viewport.y) / viewport.zoom;

        const newNodeX = Math.max(0, canvasX - dragOffset.x);
        const newNodeY = Math.max(0, canvasY - dragOffset.y);

        setNodePositions((prev) => {
          const next = new Map(prev);
          next.set(draggingNodeId, { x: newNodeX, y: newNodeY });
          return next;
        });
      } else if (panning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        setViewport((v) => ({
          ...v,
          x: panViewportStart.x + dx,
          y: panViewportStart.y + dy,
        }));
      } else if (connectingFrom) {
        setConnectingMousePos({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (draggingNodeId) {
        // Finalize node position and call onNodesChange
        const pos = nodePositions.get(draggingNodeId);
        if (pos) {
          const updatedNodes = positionedNodes.map((n) => {
            if (n.id === draggingNodeId) {
              return { ...n, x: pos.x, y: pos.y };
            }
            return n;
          });
          onNodesChange?.(updatedNodes);
        }
        setDraggingNodeId(null);
        setDragOffset({ x: 0, y: 0 });
      }

      if (panning) {
        setPanning(false);
      }

      if (connectingFrom) {
        setConnectingFrom(null);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingNodeId, dragOffset, panning, panStart, panViewportStart, connectingFrom, nodePositions, positionedNodes, viewport, onNodesChange]);

  // -------------------------------------------------------------------------
  // Wheel zoom
  // -------------------------------------------------------------------------

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.25, Math.min(2.0, viewport.zoom + delta));

    // Zoom towards mouse position
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Adjust pan to zoom towards cursor
    const zoomRatio = newZoom / viewport.zoom;
    const newX = mouseX - (mouseX - viewport.x) * zoomRatio;
    const newY = mouseY - (mouseY - viewport.y) * zoomRatio;

    setViewport({ x: newX, y: newY, zoom: newZoom });
  }, [viewport]);

  // -------------------------------------------------------------------------
  // Canvas controls handlers
  // -------------------------------------------------------------------------

  const handleZoomIn = useCallback(() => {
    setViewport((v) => ({ ...v, zoom: Math.min(2.0, v.zoom + 0.1) }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setViewport((v) => ({ ...v, zoom: Math.max(0.25, v.zoom - 0.1) }));
  }, []);

  const handleFitView = useCallback(() => {
    if (positionedNodes.length === 0) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const containerW = rect.width;
    const containerH = rect.height;

    const padding = 50;

    // Compute bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of positionedNodes) {
      const nx = (node.x ?? 0) * COL_SPACING;
      const ny = (node.y ?? 0) * ROW_SPACING;
      minX = Math.min(minX, nx);
      minY = Math.min(minY, ny);
      maxX = Math.max(maxX, nx + NODE_W);
      maxY = Math.max(maxY, ny + NODE_H);
    }

    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;

    const zoomX = containerW / contentW;
    const zoomY = containerH / contentH;
    const newZoom = Math.max(0.25, Math.min(2.0, Math.min(zoomX, zoomY)));

    // Center the content
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const newX = containerW / 2 - centerX * newZoom;
    const newY = containerH / 2 - centerY * newZoom;

    setViewport({ x: newX, y: newY, zoom: newZoom });
  }, [positionedNodes]);

  // -------------------------------------------------------------------------
  // Compute canvas size for SVG
  // -------------------------------------------------------------------------

  const maxX = positionedNodes.reduce((m, n) => Math.max(m, n.x ?? 0), 0);
  const maxY = positionedNodes.reduce((m, n) => Math.max(m, n.y ?? 0), 0);

  const canvasWidth  = (maxX + 2) * COL_SPACING + NODE_W + 200;
  const canvasHeight = (maxY + 2) * ROW_SPACING + NODE_H + 200;

  // -------------------------------------------------------------------------
  // Context menu prevention
  // -------------------------------------------------------------------------

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const effectiveSelectedId = externalSelectedNodeId ?? selectedNodeId;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 400,
        background: "#0a0a0a",
        backgroundImage: "radial-gradient(circle, #333 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        overflow: "hidden",
        position: "relative",
        borderRadius: 8,
        cursor: panning ? "grabbing" : "default",
      }}
    >
      {/* Transform layer for viewport pan/zoom */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "0 0",
          transform: `scale(${viewport.zoom}) translate(${viewport.x}px, ${viewport.y}px)`,
          width: canvasWidth,
          height: canvasHeight,
        }}
      >
        {/* SVG edge layer */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: canvasWidth,
            height: canvasHeight,
            zIndex: 0,
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          {/* Existing edges */}
          {graph.edges.map((edge) => {
            const src = nodeById.get(edge.sourceId);
            const tgt = nodeById.get(edge.targetId);
            if (!src || !tgt) return null;
            return <Edge key={edge.id} edge={edge} sourceNode={src} targetNode={tgt} />;
          })}

          {/* Connection line being drawn */}
          {connectingFrom && (() => {
            const fromNode = nodeById.get(connectingFrom.nodeId);
            if (!fromNode) return null;
            return (
              <ConnectionLine
                fromNode={fromNode}
                handle={connectingFrom.handle}
                mouseX={connectingMousePos.x}
                mouseY={connectingMousePos.y}
                zoom={viewport.zoom}
                panX={viewport.x}
                panY={viewport.y}
              />
            );
          })()}
        </svg>

        {/* Node layer */}
        <div style={{ position: "absolute", top: 0, left: 0, zIndex: 1 }}>
          {positionedNodes.map((n) => (
            <NodeCard
              key={n.id}
              node={n}
              isActive={n.id === activeNodeId}
              isSelected={n.id === effectiveSelectedId}
              isDragging={n.id === draggingNodeId}
              onMouseDown={handleNodeMouseDown}
              onPortMouseDown={handlePortMouseDown}
              onPortMouseUp={handlePortMouseUp}
            />
          ))}
        </div>
      </div>

      {/* Canvas controls */}
      <CanvasControls
        zoom={viewport.zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
      />
    </div>
  );
}
