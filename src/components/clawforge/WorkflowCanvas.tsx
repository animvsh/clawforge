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
// Node card
// ---------------------------------------------------------------------------

interface NodeCardProps {
  node: WorkflowNode;
  isActive: boolean;
  isSelected: boolean;
  isDragging: boolean;
  zoom: number;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onPortMouseDown: (e: React.MouseEvent, nodeId: string, handle: "input" | "output") => void;
  onPortMouseUp: (e: React.MouseEvent, nodeId: string, handle: "input" | "output") => void;
}

function NodeCard({
  node,
  isActive,
  isSelected,
  isDragging,
  zoom,
  onMouseDown,
  onPortMouseDown,
  onPortMouseUp,
}: NodeCardProps) {
  const statusStyle = STATUS_STYLES[node.status] ?? STATUS_STYLES.idle;
  const kindColor   = KIND_COLORS[node.kind] ?? "#71717a";

  // Position in canvas (grid) coordinates
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
          ? "0 12px 40px rgba(0,0,0,0.6)"
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
        transform: isDragging ? "scale(1.03)" : "scale(1)",
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
            zIndex: 10,
          }}
          title="Input port"
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
            flexShhrink: 0,
            cursor: "crosshair",
            zIndex: 10,
          }}
          title="Output port"
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
        gap: 2,
        background: "#141414",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        padding: "4px 6px",
        zIndex: 1000,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}
    >
      <button
        onClick={onZoomOut}
        title="Zoom out"
        style={{
          width: 32,
          height: 32,
          background: "transparent",
          border: "none",
          borderRadius: 4,
          color: "rgba(255,255,255,0.55)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 600,
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
          (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)";
        }}
      >
        −
      </button>

      <div
        style={{
          minWidth: 44,
          textAlign: "center",
          fontSize: 11,
          fontWeight: 600,
          color: "rgba(255,255,255,0.65)",
          fontVariantNumeric: "tabular-nums",
          padding: "0 4px",
        }}
      >
        {Math.round(zoom * 100)}%
      </div>

      <button
        onClick={onZoomIn}
        title="Zoom in"
        style={{
          width: 32,
          height: 32,
          background: "transparent",
          border: "none",
          borderRadius: 4,
          color: "rgba(255,255,255,0.55)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 600,
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
          (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)";
        }}
      >
        +
      </button>

      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.10)", margin: "0 4px" }} />

      <button
        onClick={onFitView}
        title="Fit view"
        style={{
          width: 32,
          height: 32,
          background: "transparent",
          border: "none",
          borderRadius: 4,
          color: "rgba(255,255,255,0.55)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 600,
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
          (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)";
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

  // Selected node (internal override if external not provided)
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedNodeId = externalSelectedNodeId ?? internalSelectedId;

  // Drag state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  // The grid position of the node at the moment drag started
  const [dragStartNodePos, setDragStartNodePos] = useState({ x: 0, y: 0 });
  // The mouse position (in container DOM coords) at the moment drag started
  const [dragStartMouse, setDragStartMouse] = useState({ x: 0, y: 0 });

  // Viewport pan/zoom
  // The viewport describes how the canvas coordinate space is mapped to screen space.
  // Canvas point (cx, cy) maps to screen point: screenX = cx * zoom + panX, screenY = cy * zoom + panY
  // Inverse: canvasX = (screenX - panX) / zoom, canvasY = (screenY - panY) / zoom
  const [viewport, setViewport] = useState({ x: 80, y: 40, zoom: 1 });

  // Connection drawing state
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; handle: "input" | "output" } | null>(null);
  const [connectingMouse, setConnectingMouse] = useState({ x: 0, y: 0 }); // screen coords

  // Panning state
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panViewportStart, setPanViewportStart] = useState({ x: 0, y: 0 });

  // -------------------------------------------------------------------------
  // Node positions — merge graph positions with any in-progress drag
  // -------------------------------------------------------------------------

  // Mutable positions during drag (grid coordinates)
  const [dragPositions, setDragPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  const positionedNodes = useMemo(() => {
    const nodes = computeNodePositions(graph);
    return nodes.map((n) => {
      const dragged = dragPositions.get(n.id);
      if (dragged && draggingNodeId !== n.id) {
        return { ...n, x: dragged.x, y: dragged.y };
      }
      return n;
    });
  }, [graph, dragPositions, draggingNodeId]);

  // Keep dragPositions in sync when graph changes
  useEffect(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of graph.nodes) {
      map.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
    }
    setDragPositions(map);
  }, [graph]);

  // Node lookup
  const nodeById = useMemo(
    () => new Map(positionedNodes.map((n) => [n.id, n])),
    [positionedNodes],
  );

  // -------------------------------------------------------------------------
  // Coordinate helpers
  // -------------------------------------------------------------------------

  // Convert container-relative screen coords to canvas grid coords
  function screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
    const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const relX = screenX - rect.left;
    const relY = screenY - rect.top;
    return {
      x: (relX - viewport.x) / viewport.zoom,
      y: (relY - viewport.y) / viewport.zoom,
    };
  }

  // Convert canvas grid coords to container-relative screen coords
  function canvasToScreen(cx: number, cy: number): { x: number; y: number } {
    return {
      x: cx * viewport.zoom + viewport.x,
      y: cy * viewport.zoom + viewport.y,
    };
  }

  // Get port positions in canvas grid coords
  function getPortPositions(node: WorkflowNode) {
    const nx = node.x ?? 0;
    const ny = node.y ?? 0;
    return {
      inputX:  nx * COL_SPACING + 0,
      inputY:  ny * ROW_SPACING + NODE_H / 2,
      outputX: nx * COL_SPACING + NODE_W,
      outputY: ny * ROW_SPACING + NODE_H / 2,
    };
  }

  // -------------------------------------------------------------------------
  // Node mouse down — start drag
  // -------------------------------------------------------------------------

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const node = nodeById.get(nodeId);
    if (!node) return;

    const cx = (node.x ?? 0) * COL_SPACING;
    const cy = (node.y ?? 0) * ROW_SPACING;

    // Record where in canvas grid coords the mouse was when we started dragging
    const canvasPos = screenToCanvas(e.clientX, e.clientY);

    setDraggingNodeId(nodeId);
    setDragStartNodePos({ x: cx, y: cy });
    setDragStartMouse({ x: canvasPos.x, y: canvasPos.y });

    // Select node
    setInternalSelectedId(nodeId);
    onNodeClick?.(nodeId);
  }, [nodeById, onNodeClick]);

  // -------------------------------------------------------------------------
  // Canvas mouse down — start pan (left click on background) or deselect
  // -------------------------------------------------------------------------

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isCanvasBg =
      target === e.currentTarget ||
      target.classList.contains("canvas-inner") ||
      target.tagName === "DIV";

    if (!isCanvasBg) return;

    if (e.button === 0) {
      // Left click on canvas background — start pan
      e.preventDefault();
      setPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setPanViewportStart({ x: viewport.x, y: viewport.y });
      setInternalSelectedId(null);
    } else if (e.button === 1 || e.button === 2) {
      // Middle or right click — also pan
      e.preventDefault();
      setPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setPanViewportStart({ x: viewport.x, y: viewport.y });
    }
  }, [viewport]);

  // -------------------------------------------------------------------------
  // Port mouse down — start connection draw
  // -------------------------------------------------------------------------

  const handlePortMouseDown = useCallback((e: React.MouseEvent, nodeId: string, handle: "input" | "output") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setConnectingFrom({ nodeId, handle });
    setConnectingMouse({ x: e.clientX, y: e.clientY });
  }, []);

  // -------------------------------------------------------------------------
  // Port mouse up — complete connection
  // -------------------------------------------------------------------------

  const handlePortMouseUp = useCallback((e: React.MouseEvent, nodeId: string, handle: "input" | "output") => {
    if (!connectingFrom) return;
    e.stopPropagation();

    // Only connect opposite handle types
    if (connectingFrom.nodeId !== nodeId && connectingFrom.handle !== handle) {
      const sourceId = connectingFrom.handle === "output" ? connectingFrom.nodeId : nodeId;
      const targetId = connectingFrom.handle === "output" ? nodeId : connectingFrom.nodeId;

      const newEdge: WorkflowEdge = {
        id: `edge-${Date.now().toString(36)}`,
        sourceId,
        targetId,
        type: "execution",
      };

      onEdgesChange?.(newEdge);
    }

    setConnectingFrom(null);
  }, [connectingFrom, onEdgesChange]);

  // -------------------------------------------------------------------------
  // Document-level mouse move/up — handle drag, pan, connection drawing
  // -------------------------------------------------------------------------

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (draggingNodeId && dragStartNodePos && dragStartMouse) {
        // Convert current mouse to canvas coords
        const canvasPos = screenToCanvas(e.clientX, e.clientY);

        // New node position: keep the same offset between mouse and node as at drag start
        const newNodeX = Math.max(0, dragStartNodePos.x + (canvasPos.x - dragStartMouse.x));
        const newNodeY = Math.max(0, dragStartNodePos.y + (canvasPos.y - dragStartMouse.y));

        setDragPositions((prev) => {
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
        setConnectingMouse({ x: e.clientX, y: e.clientY });
      }
    }

    function handleMouseUp(e: MouseEvent) {
      if (draggingNodeId) {
        // Commit final position to parent
        const pos = dragPositions.get(draggingNodeId);
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
        setDragStartNodePos({ x: 0, y: 0 });
        setDragStartMouse({ x: 0, y: 0 });
      }

      if (panning) {
        setPanning(false);
      }

      if (connectingFrom) {
        setConnectingFrom(null);
      }
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingNodeId, dragStartNodePos, dragStartMouse, panning, panStart, panViewportStart, connectingFrom, dragPositions, positionedNodes, onNodesChange]);

  // -------------------------------------------------------------------------
  // Wheel — zoom towards cursor
  // -------------------------------------------------------------------------

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.25, Math.min(2.5, viewport.zoom * zoomFactor));

    // To zoom toward mouse: adjust pan so the canvas point under the cursor stays fixed
    // canvasX = (screenX - panX) / zoom   →   panX = screenX - canvasX * zoom
    // We want the same canvasX before and after, so:
    //   panX_new = mouseX - canvasX * zoom_new
    //   canvasX stays: mouseX - panX_old / zoom_old = mouseX - panX_new / zoom_new
    //   panX_new = mouseX - (mouseX - panX_old) * zoom_new / zoom_old
    const newPanX = mouseX - (mouseX - viewport.x) * (newZoom / viewport.zoom);
    const newPanY = mouseY - (mouseY - viewport.y) * (newZoom / viewport.zoom);

    setViewport({ x: newPanX, y: newPanY, zoom: newZoom });
  }, [viewport]);

  // -------------------------------------------------------------------------
  // Zoom in/out/fit
  // -------------------------------------------------------------------------

  const handleZoomIn = useCallback(() => {
    setViewport((v) => {
      const container = containerRef.current;
      if (!container) return v;
      const rect = container.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const newZoom = Math.min(2.5, v.zoom * 1.2);
      const newX = cx - (cx - v.x) * (newZoom / v.zoom);
      const newY = cy - (cy - v.y) * (newZoom / v.zoom);
      return { x: newX, y: newY, zoom: newZoom };
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setViewport((v) => {
      const container = containerRef.current;
      if (!container) return v;
      const rect = container.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const newZoom = Math.max(0.25, v.zoom * 0.8);
      const newX = cx - (cx - v.x) * (newZoom / v.zoom);
      const newY = cy - (cy - v.y) * (newZoom / v.zoom);
      return { x: newX, y: newY, zoom: newZoom };
    });
  }, []);

  const handleFitView = useCallback(() => {
    if (positionedNodes.length === 0) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const containerW = rect.width;
    const containerH = rect.height;

    const padding = 60;

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

    const newZoom = Math.max(0.25, Math.min(2.5, Math.min(containerW / contentW, containerH / contentH)));

    // Center of content in canvas coords
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Set pan so that centerX, centerY maps to container center
    const newX = containerW / 2 - centerX * newZoom;
    const newY = containerH / 2 - centerY * newZoom;

    setViewport({ x: newX, y: newY, zoom: newZoom });
  }, [positionedNodes]);

  // -------------------------------------------------------------------------
  // Edge path in canvas coords
  // -------------------------------------------------------------------------

  function getEdgePath(src: WorkflowNode, tgt: WorkflowNode): string {
    const { outputX, outputY } = getPortPositions(src);
    const { inputX, inputY } = getPortPositions(tgt);

    const cpOffset = Math.abs(inputX - outputX) * 0.5;
    const cx1 = outputX + cpOffset;
    const cy1 = outputY;
    const cx2 = inputX - cpOffset;
    const cy2 = inputY;

    return `M ${outputX} ${outputY} C ${cx1} ${cy1} ${cx2} ${cy2} ${inputX} ${inputY}`;
  }

  // -------------------------------------------------------------------------
  // Connection line path (from port to current mouse in canvas coords)
  // -------------------------------------------------------------------------

  function getConnectionLinePath(fromNode: WorkflowNode, handle: "input" | "output", mouseScreenX: number, mouseScreenY: number): string {
    const { inputX, inputY, outputX, outputY } = getPortPositions(fromNode);
    const sx = handle === "output" ? outputX : inputX;
    const sy = handle === "output" ? outputY : inputY;

    const canvasMouse = screenToCanvas(mouseScreenX, mouseScreenY);
    const mx = canvasMouse.x;
    const my = canvasMouse.y;

    const cpOffset = Math.abs(mx - sx) * 0.5;
    const cx1 = sx + cpOffset;
    const cy1 = sy;
    const cx2 = mx - cpOffset;
    const cy2 = my;

    return `M ${sx} ${sy} C ${cx1} ${cy1} ${cx2} ${cy2} ${mx} ${my}`;
  }

  // -------------------------------------------------------------------------
  // Canvas size
  // -------------------------------------------------------------------------

  const maxX = positionedNodes.reduce((m, n) => Math.max(m, n.x ?? 0), 0);
  const maxY = positionedNodes.reduce((m, n) => Math.max(m, n.y ?? 0), 0);

  const canvasWidth  = Math.max((maxX + 3) * COL_SPACING + NODE_W + 100, 2000);
  const canvasHeight = Math.max((maxY + 3) * ROW_SPACING + NODE_H + 100, 1000);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 400,
        background: "#0a0a0a",
        backgroundImage: "radial-gradient(circle, #2a2a2a 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        overflow: "hidden",
        position: "relative",
        borderRadius: 8,
        cursor: panning ? "grabbing" : "default",
      }}
    >
      {/* Inner div — everything inside uses canvas grid coordinates, no CSS transform.
          Instead, we offset nodes/edges via their left/top and the SVG viewBox. */}
      <div
        className="canvas-inner"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: canvasWidth,
          height: canvasHeight,
        }}
      >
        {/* SVG layer for edges */}
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
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,255,255,0.45)" />
            </marker>
          </defs>

          {/* Render existing edges */}
          {graph.edges.map((edge) => {
            const src = nodeById.get(edge.sourceId);
            const tgt = nodeById.get(edge.targetId);
            if (!src || !tgt) return null;
            return (
              <path
                key={edge.id}
                d={getEdgePath(src, tgt)}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={1.5}
                strokeDasharray={edge.type === "dependency" ? "5 4" : "none"}
                fill="none"
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {/* Temporary connection line */}
          {connectingFrom && (() => {
            const fromNode = nodeById.get(connectingFrom.nodeId);
            if (!fromNode) return null;
            return (
              <path
                d={getConnectionLinePath(fromNode, connectingFrom.handle, connectingMouse.x, connectingMouse.y)}
                stroke="rgba(96,165,250,0.75)"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                fill="none"
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
              isSelected={n.id === selectedNodeId}
              isDragging={n.id === draggingNodeId}
              zoom={viewport.zoom}
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

      {/* Mini zoom label */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          fontSize: 11,
          color: "rgba(255,255,255,0.25)",
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "none",
        }}
      >
        {positionedNodes.length} nodes
      </div>
    </div>
  );
}