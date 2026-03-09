/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import {
  type Edge,
  findNode,
  findParentOf,
  type Panel,
  type Tab,
  type TreeNode,
  type Updater,
  type WorkspaceState,
} from "../workspace.ts";
import { EdgeInspector, NodeInspector } from "./inspector.tsx";
import { Dropdown } from "./dropdown.tsx";
import { SmallBtn } from "./widgets.tsx";
import { type BBox, boundingBox, centerNodes, type ForceNode } from "../lib/force.ts";
import {
  createJANK,
  createSDF,
  createTOPOGRID,
  DEFAULT_JANK_CONFIG,
  DEFAULT_SDF_CONFIG,
  type LayoutAlgorithm,
} from "../lib/algorithms/index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extensible canvas interaction mode. Add new modes here as needed. */
type CanvasMode = "select" | "add-edge";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Radius of collapsed leaf/composite nodes (circles) */
const LEAF_R = 26;
/** Force-body diameter (used for repulsion body sizing) */
const LEAF_W = LEAF_R * 2;
const LEAF_H = LEAF_R * 2;
/** Padding inside expanded group bounding boxes */
const GROUP_PADDING = 32;
/** Height of the label strip at the top of an expanded group rect */
const LABEL_H = 22;
const DRAG_THRESHOLD_SQ = 16; // 4px

// ---------------------------------------------------------------------------
// Edge helpers
// ---------------------------------------------------------------------------

/** Unit vector of the path's direction of travel at its endpoint (dst).
 *  For straight paths this is the chord direction; for arcs it is the circle tangent. */
function pathEndTangent(
  src: { x: number; y: number },
  dst: { x: number; y: number },
  needsArc: boolean,
  r: number,
  sweep: number,
): { x: number; y: number } {
  const dx = dst.x - src.x;
  const dy = dst.y - src.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) return { x: 1, y: 0 };
  if (!needsArc) return { x: dx / d, y: dy / d };
  // Compute circle center; sweep=1 → center to the right of src→dst (-n̂)
  const ux = dx / d, uy = dy / d;
  const nx = -uy, ny = ux; // left normal
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  const sign = sweep === 1 ? -1 : 1;
  const cx = (src.x + dst.x) / 2 + sign * h * nx;
  const cy = (src.y + dst.y) / 2 + sign * h * ny;
  // Radius vector at dst; CW tangent = (rv.y, -rv.x); CCW = (-rv.y, rv.x)
  const rvx = dst.x - cx, rvy = dst.y - cy;
  const tx = sweep === 1 ? rvy : -rvy;
  const ty = sweep === 1 ? -rvx : rvx;
  const tl = Math.sqrt(tx * tx + ty * ty);
  return tl < 0.001 ? { x: ux, y: uy } : { x: tx / tl, y: ty / tl };
}

/** Returns the geometric midpoint of a circular arc defined by endpoints and sweep flag. */
function arcMidpoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  sweep: number,
): { x: number; y: number } {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) return { x: mx, y: my };
  const ux = dx / d;
  const uy = dy / d;
  // Left normal of the direction P1→P2
  const nx = -uy;
  const ny = ux;
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  // Arc midpoint is offset from chord midpoint by (r - h) in the arc's bulge direction.
  // sweep=0 → arc bulges in -n̂ direction; sweep=1 → +n̂
  const sign = sweep === 0 ? -1 : 1;
  const offset = r - h;
  return { x: mx + sign * offset * nx, y: my + sign * offset * ny };
}

/** Returns the point on `from`'s boundary in the direction of `to`, offset outward by `gap` px. */
function surfacePoint(from: ForceNode, to: ForceNode, gap = 0): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return { x: from.x, y: from.y };
  const ux = dx / dist;
  const uy = dy / dist;
  if (from.w === LEAF_W && from.h === LEAF_H) {
    // collapsed circle node
    return { x: from.x + ux * (LEAF_R + gap), y: from.y + uy * (LEAF_R + gap) };
  }
  // expanded rectangle: ray-AABB clip
  const tx = Math.abs(ux) > 0.001 ? (from.w / 2) / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 0.001 ? (from.h / 2) / Math.abs(uy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: from.x + ux * (t + gap), y: from.y + uy * (t + gap) };
}

// ---------------------------------------------------------------------------
// Layout state types
// ---------------------------------------------------------------------------

interface LevelState {
  nodes: ForceNode[];
  settled: boolean;
  ticks: number;
  /** Tight bbox of child nodes in local coords (after simulation tick). Null until first tick. */
  bbox: BBox | null;
}

/** parentId → LevelState. Root level keyed by "". */
type LayoutMap = Map<string, LevelState>;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function getEdgesAtLevel(edges: Edge[], nodeIds: string[]): { a: string; b: string }[] {
  const idSet = new Set(nodeIds);
  return edges
    .filter((e) => idSet.has(e.fromId) && idSet.has(e.toId))
    .map((e) => ({ a: e.fromId, b: e.toId }));
}

function postOrderExpanded(treeNodes: TreeNode[], expanded: Set<string>): string[] {
  const result: string[] = [];
  function visit(nodes: TreeNode[]): void {
    for (const n of nodes) {
      if (expanded.has(n.id) && n.kind === "composite") {
        visit(n.children);
        result.push(n.id);
      }
    }
  }
  visit(treeNodes);
  return result;
}

/**
 * Build or rebuild a level's node list.
 * Always recomputes w/h from current expansion state so that collapsing a node
 * immediately gives it the correct (small) body size.
 */
function buildLevel(
  prev: LevelState | undefined,
  ids: string[],
  _treeNodes: TreeNode[],
  expandedSet: Set<string>,
  pinnedPositions: Record<string, { x: number; y: number; pinned?: boolean }>,
  levelEdges: { a: string; b: string }[],
  algorithm: LayoutAlgorithm,
): LevelState {
  const prevMap = new Map(prev?.nodes.map((n) => [n.id, n]) ?? []);
  const defaults = new Map(Object.entries(pinnedPositions));
  const rawPositions = algorithm.initNodes(ids, levelEdges, LEAF_W, LEAF_H, defaults);

  const nodes: ForceNode[] = rawPositions.map((fn): ForceNode => {
    const existing = prevMap.get(fn.id);
    const isExpanded = expandedSet.has(fn.id);
    const w = isExpanded ? (existing?.w ?? LEAF_W * 3) : LEAF_W;
    const h = isExpanded ? (existing?.h ?? LEAF_H * 3) : LEAF_H;
    if (existing && algorithm.preservesPositions) return { ...existing, w, h };
    return { ...fn, w, h };
  });

  return { nodes, settled: false, ticks: 0, bbox: null };
}

function syncLayout(
  prev: LayoutMap,
  treeNodes: TreeNode[],
  canvasExpandedNodes: string[],
  pinnedPositions: Record<string, { x: number; y: number; pinned?: boolean }>,
  allEdges: Edge[],
  algorithm: LayoutAlgorithm,
): LayoutMap {
  const expandedSet = new Set(canvasExpandedNodes);
  const next = new Map<string, LevelState>();

  const rootIds = treeNodes.map((n) => n.id);
  const rootEdges = getEdgesAtLevel(allEdges, rootIds);
  next.set(
    "",
    buildLevel(
      prev.get(""),
      rootIds,
      treeNodes,
      expandedSet,
      pinnedPositions,
      rootEdges,
      algorithm,
    ),
  );

  for (const nodeId of canvasExpandedNodes) {
    const node = findNode(treeNodes, nodeId);
    if (!node || node.kind !== "composite") continue;
    const childIds = node.children.map((c) => c.id);
    const levelEdges = getEdgesAtLevel(allEdges, childIds);
    next.set(
      nodeId,
      buildLevel(
        prev.get(nodeId),
        childIds,
        treeNodes,
        expandedSet,
        pinnedPositions,
        levelEdges,
        algorithm,
      ),
    );
  }

  return next;
}

function invalidateAncestors(layout: LayoutMap, levelId: string, treeNodes: TreeNode[]): void {
  if (levelId === "") return;
  const parentNode = findParentOf(treeNodes, levelId);
  const parentLevelId = parentNode?.id ?? "";
  const parentLevel = layout.get(parentLevelId);
  if (parentLevel) layout.set(parentLevelId, { ...parentLevel, settled: false });
  invalidateAncestors(layout, parentLevelId, treeNodes);
}

function stepLayout(
  prev: LayoutMap,
  treeNodes: TreeNode[],
  canvasExpandedNodes: string[],
  edges: Edge[],
  algorithm: LayoutAlgorithm,
): LayoutMap {
  const expandedSet = new Set(canvasExpandedNodes);
  const next = new Map(prev);

  for (const nodeId of postOrderExpanded(treeNodes, expandedSet)) {
    const level = next.get(nodeId);
    if (!level || level.settled) continue;

    const node = findNode(treeNodes, nodeId);
    if (!node) continue;

    const childIds = node.children.map((c) => c.id);
    const levelEdges = getEdgesAtLevel(edges, childIds);
    const { nodes: ticked, settled } = algorithm.tick(level.nodes, levelEdges, level.ticks);
    const centered = centerNodes(ticked);
    const bb = boundingBox(centered, GROUP_PADDING);
    next.set(nodeId, { nodes: centered, settled, ticks: level.ticks + 1, bbox: bb });

    const gw = Math.max(bb.w, LEAF_W * 2 + GROUP_PADDING);
    const gh = Math.max(bb.h + LABEL_H, LEAF_H * 2 + GROUP_PADDING);

    const parentNode = findParentOf(treeNodes, nodeId);
    const parentLevelId = parentNode?.id ?? "";
    const parentLevel = next.get(parentLevelId);
    if (parentLevel) {
      const prevFn = parentLevel.nodes.find((fn) => fn.id === nodeId);
      const sizeChanged = prevFn && (prevFn.w !== gw || prevFn.h !== gh);
      next.set(parentLevelId, {
        ...parentLevel,
        nodes: parentLevel.nodes.map((fn) => fn.id === nodeId ? { ...fn, w: gw, h: gh } : fn),
        settled: sizeChanged ? false : parentLevel.settled,
      });
    }
  }

  const rootLevel = next.get("");
  if (rootLevel && !rootLevel.settled) {
    const rootEdges = getEdgesAtLevel(edges, treeNodes.map((n) => n.id));
    const { nodes: ticked, settled } = algorithm.tick(
      rootLevel.nodes,
      rootEdges,
      rootLevel.ticks,
    );
    const bb = boundingBox(ticked, GROUP_PADDING);
    next.set("", { nodes: ticked, settled, ticks: rootLevel.ticks + 1, bbox: bb });
  }

  return next;
}

// ---------------------------------------------------------------------------
// makeCanvasAlgorithm — create an algorithm instance from a persisted ID
// ---------------------------------------------------------------------------

function makeCanvasAlgorithm(id: WorkspaceState["canvasAlgorithm"]): LayoutAlgorithm {
  if (id === "TOPOGRID") return createTOPOGRID({ hSpacing: 160, vSpacing: 130 });
  if (id === "SDF") return createSDF(DEFAULT_SDF_CONFIG);
  return createJANK(DEFAULT_JANK_CONFIG);
}

// ---------------------------------------------------------------------------
// findPath — returns path from root to targetId inclusive
// ---------------------------------------------------------------------------

function findPath(nodes: TreeNode[], targetId: string): TreeNode[] {
  for (const node of nodes) {
    if (node.id === targetId) return [node];
    if (node.kind === "composite") {
      const child = findPath(node.children, targetId);
      if (child.length > 0) return [node, ...child];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Canvas inspector — uses synthetic panel to reuse existing inspector components
// ---------------------------------------------------------------------------

function CanvasInspector(
  { ws, update, onExpand, onCollapse }: {
    ws: WorkspaceState;
    update: Updater;
    onExpand: (id: string) => void;
    onCollapse: (id: string) => void;
  },
) {
  const fakePanel: Panel = {
    id: "__canvas__",
    type: "tree",
    expandedNodes: [],
    selectedNodeId: ws.canvasSelectedNodeId,
    selectedEdgeId: ws.canvasSelectedEdgeId,
    inspectorSplit: 0.5,
  };
  const fakeTab: Tab = { id: "__canvas_tab__", name: "Canvas", panels: [fakePanel] };

  const canvasUpdate: Updater = (fn) => {
    update((s) => {
      const synth = { ...s, tabs: [...s.tabs, fakeTab] };
      const result = fn(synth);
      const resultPanel = result.tabs
        .find((t) => t.id === "__canvas_tab__")
        ?.panels.find((p) => p.id === "__canvas__");
      return {
        ...result,
        tabs: result.tabs.filter((t) => t.id !== "__canvas_tab__"),
        canvasSelectedNodeId: resultPanel?.selectedNodeId ?? null,
        canvasSelectedEdgeId: resultPanel?.selectedEdgeId ?? null,
      };
    });
  };

  if (ws.canvasSelectedEdgeId) {
    const edge = ws.edges.find((e) => e.id === ws.canvasSelectedEdgeId);
    if (edge) {
      return (
        <div style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
          <EdgeInspector
            edge={edge}
            panel={fakePanel}
            tab={fakeTab}
            ws={ws}
            update={canvasUpdate}
          />
        </div>
      );
    }
  }

  if (ws.canvasSelectedNodeId) {
    const node = findNode(ws.treeNodes, ws.canvasSelectedNodeId);
    if (node) {
      const isExpanded = ws.canvasExpandedNodes.includes(node.id);
      const expandAction = node.kind === "composite"
        ? isExpanded
          ? <SmallBtn label="Collapse" onClick={() => onCollapse(node.id)} />
          : <SmallBtn label="Expand" onClick={() => onExpand(node.id)} />
        : undefined;
      return (
        <NodeInspector
          node={node}
          panel={fakePanel}
          tab={fakeTab}
          ws={ws}
          update={canvasUpdate}
          extraActions={expandAction}
        />
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// CanvasTopBar — always visible in top-right
// Contains canvas-wide controls (layout selector) + breadcrumb navigation.
// ---------------------------------------------------------------------------

function CanvasTopBar(
  { ws, update, mode, onSetMode }: {
    ws: WorkspaceState;
    update: Updater;
    mode: CanvasMode;
    onSetMode: (m: CanvasMode) => void;
  },
) {
  function selectNode(id: string) {
    update((s) => ({ ...s, canvasSelectedNodeId: id, canvasSelectedEdgeId: null }));
  }

  const selected = ws.canvasSelectedNodeId;
  const items: { node: TreeNode; dimmed: boolean }[] = [];

  if (selected) {
    const path = findPath(ws.treeNodes, selected);
    for (const node of path) items.push({ node, dimmed: node.id !== selected });
  } else {
    for (const node of ws.treeNodes) items.push({ node, dimmed: true });
  }

  const pillStyle =
    "display:flex; align-items:center; gap:6px; background:rgba(13,13,30,0.85); border:1px solid #2a2a4a; border-radius:4px; padding:4px 10px; font-size:11px;";

  return (
    <div style="position:absolute; top:8px; right:8px; display:flex; align-items:center; gap:4px; z-index:2; pointer-events:auto;">
      {/* Mode selector */}
      <div style={pillStyle}>
        <span style="color:#404466; user-select:none;">mode</span>
        <Dropdown
          items={[
            { value: "select", label: "Select" },
            { value: "add-edge", label: "Add Edges" },
          ]}
          selectedValue={mode}
          placeholder="mode"
          onSelect={(v) => onSetMode(v as CanvasMode)}
          width={90}
        />
      </div>
      {/* Canvas-wide controls */}
      <div style={pillStyle}>
        <span style="color:#404466; user-select:none;">layout</span>
        <Dropdown
          items={[
            { value: "JANK", label: "JANK" },
            { value: "TOPOGRID", label: "TOPOGRID" },
            { value: "SDF", label: "SDF" },
          ]}
          selectedValue={ws.canvasAlgorithm}
          placeholder="layout"
          onSelect={(id) =>
            update((s) => ({ ...s, canvasAlgorithm: id as WorkspaceState["canvasAlgorithm"] }))}
          width={90}
        />
      </div>

      {/* Breadcrumb */}
      {items.length > 0 && (
        <div style={pillStyle}>
          {items.map(({ node, dimmed }, i) => (
            <>
              {i > 0 && (
                <span key={`sep-${node.id}`} style="color:#222244; user-select:none;">
                  /
                </span>
              )}
              <span
                key={node.id}
                style={`cursor:pointer; user-select:none; color:${dimmed ? "#404466" : "#a0b4e0"};`}
                onClick={() => selectNode(node.id)}
              >
                {node.label}
              </span>
            </>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas component
// ---------------------------------------------------------------------------

interface View {
  scale: number;
  tx: number;
  ty: number;
}

interface DragState {
  nodeId: string;
  levelId: string;
  startClientX: number;
  startClientY: number;
  origX: number;
  origY: number;
  hasMoved: boolean;
  onClickFn: (() => void) | null;
}

interface PanState {
  startX: number;
  startY: number;
  origTx: number;
  origTy: number;
}

/** All add-edge interaction state bundled for passing into renderLevel. */
interface InteractionState {
  mode: CanvasMode;
  edgeDrawFromId: string | null;
  /** levelId of the currently-selected edge source node, if any. */
  edgeDrawLevelId: string | null;
  hoveredNodeId: string | null;
  onEdgeNodeClick: (id: string, x: number, y: number, levelId: string) => void;
  onNodeHover: (id: string | null) => void;
}

export function Canvas({ ws, update }: { ws: WorkspaceState; update: Updater }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 400, ty: 300 });
  const [layout, setLayout] = useState<LayoutMap>(() =>
    syncLayout(
      new Map(),
      ws.treeNodes,
      ws.canvasExpandedNodes,
      ws.canvasNodePositions,
      ws.edges,
      makeCanvasAlgorithm(ws.canvasAlgorithm),
    )
  );

  const [mode, setMode] = useState<CanvasMode>("select");
  const [edgeDraw, setEdgeDraw] = useState<
    { fromId: string; x: number; y: number; levelId: string } | null
  >(null);
  const [mouseCanvas, setMouseCanvas] = useState<{ x: number; y: number } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const wsRef = useRef(ws);
  wsRef.current = ws;
  const viewRef = useRef(view);
  viewRef.current = view;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Sync layout when tree, edges, expanded nodes, or algorithm change
  useEffect(() => {
    setLayout((prev) =>
      syncLayout(
        prev,
        ws.treeNodes,
        ws.canvasExpandedNodes,
        ws.canvasNodePositions,
        ws.edges,
        makeCanvasAlgorithm(ws.canvasAlgorithm),
      )
    );
  }, [ws.treeNodes, ws.canvasExpandedNodes, ws.edges, ws.canvasAlgorithm]);

  // ResizeObserver — initialise view centre on first size observation
  const viewInitRef = useRef(false);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (!viewInitRef.current && width > 0 && height > 0) {
        setView((v) => ({ ...v, tx: width / 2, ty: height / 2 }));
        viewInitRef.current = true;
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Wheel zoom — non-passive, excluded when cursor is over inspector/breadcrumb
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // Let the inspector scroll naturally
      if (inspectorRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setView((v) => {
        const newScale = Math.max(0.1, Math.min(10, v.scale * factor));
        const canvasX = (mx - v.tx) / v.scale;
        const canvasY = (my - v.ty) / v.scale;
        return { scale: newScale, tx: mx - canvasX * newScale, ty: my - canvasY * newScale };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // RAF simulation loop
  useEffect(() => {
    let rafId = 0;
    function frame() {
      setLayout((prev) => {
        let allSettled = true;
        for (const lvl of prev.values()) {
          if (!lvl.settled) {
            allSettled = false;
            break;
          }
        }
        if (allSettled) return prev;
        const { treeNodes, canvasExpandedNodes, edges, canvasAlgorithm } = wsRef.current!;
        return stepLayout(
          prev,
          treeNodes,
          canvasExpandedNodes,
          edges,
          makeCanvasAlgorithm(canvasAlgorithm),
        );
      });
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Drag / pan gesture refs
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);

  function onDocMouseMove(e: MouseEvent) {
    if (dragRef.current) {
      const drag = dragRef.current;
      const screenDx = e.clientX - drag.startClientX;
      const screenDy = e.clientY - drag.startClientY;
      if (!drag.hasMoved && screenDx * screenDx + screenDy * screenDy > DRAG_THRESHOLD_SQ) {
        drag.hasMoved = true;
      }
      if (drag.hasMoved) {
        const scale = viewRef.current!.scale;
        const dx = screenDx / scale;
        const dy = screenDy / scale;
        setLayout((prev) => {
          const next = new Map(prev);
          const level = next.get(drag.levelId);
          if (!level) return prev;
          next.set(drag.levelId, {
            ...level,
            nodes: level.nodes.map((n) =>
              n.id === drag.nodeId
                ? { ...n, x: drag.origX + dx, y: drag.origY + dy, vx: 0, vy: 0, pinned: true }
                : n
            ),
            settled: false,
          });
          invalidateAncestors(next, drag.levelId, wsRef.current!.treeNodes);
          return next;
        });
      }
    }
    if (panRef.current) {
      const pan = panRef.current;
      setView((v) => ({
        ...v,
        tx: pan.origTx + (e.clientX - pan.startX),
        ty: pan.origTy + (e.clientY - pan.startY),
      }));
    }
  }

  function onDocMouseUp() {
    if (dragRef.current) {
      if (!dragRef.current.hasMoved) dragRef.current.onClickFn?.();
      dragRef.current = null;
    }
    panRef.current = null;
    document.removeEventListener("mousemove", onDocMouseMove as EventListener);
    document.removeEventListener("mouseup", onDocMouseUp);
  }

  function startDrag(
    e: MouseEvent,
    nodeId: string,
    levelId: string,
    origX: number,
    origY: number,
    onClickFn: (() => void) | null,
  ) {
    e.stopPropagation();
    dragRef.current = {
      nodeId,
      levelId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX,
      origY,
      hasMoved: false,
      onClickFn,
    };
    document.addEventListener("mousemove", onDocMouseMove as EventListener);
    document.addEventListener("mouseup", onDocMouseUp);
  }

  function onSvgMouseDown(e: MouseEvent) {
    if (modeRef.current === "add-edge") {
      // Background click in add-edge mode: cancel source selection
      setEdgeDraw(null);
      return;
    }
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origTx: viewRef.current!.tx,
      origTy: viewRef.current!.ty,
    };
    document.addEventListener("mousemove", onDocMouseMove as EventListener);
    document.addEventListener("mouseup", onDocMouseUp);
  }

  function onSvgMouseMove(e: MouseEvent) {
    if (modeRef.current !== "add-edge") return;
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const v = viewRef.current!;
    setMouseCanvas({
      x: (e.clientX - rect.left - v.tx) / v.scale,
      y: (e.clientY - rect.top - v.ty) / v.scale,
    });
  }

  function addEdge(fromId: string, toId: string) {
    update((s) => ({
      ...s,
      edges: [...s.edges, {
        id: crypto.randomUUID(),
        fromId,
        toId,
        label: "",
        data: {},
        version: 1,
      }],
    }));
  }

  function onEdgeNodeClick(id: string, x: number, y: number, levelId: string) {
    if (!edgeDraw) {
      setEdgeDraw({ fromId: id, x, y, levelId });
    } else if (id === edgeDraw.fromId) {
      // Re-click source: cancel selection
      setEdgeDraw(null);
    } else {
      addEdge(edgeDraw.fromId, id);
      setEdgeDraw(null);
    }
    setHoveredNodeId(null);
  }

  function selectNode(nodeId: string) {
    update((s) => ({
      ...s,
      canvasSelectedNodeId: s.canvasSelectedNodeId === nodeId ? null : nodeId,
      canvasSelectedEdgeId: null,
    }));
  }

  function selectEdge(edgeId: string) {
    update((s) => ({ ...s, canvasSelectedEdgeId: edgeId, canvasSelectedNodeId: null }));
  }

  function expandNode(nodeId: string) {
    update((s) => ({
      ...s,
      canvasExpandedNodes: s.canvasExpandedNodes.includes(nodeId)
        ? s.canvasExpandedNodes
        : [...s.canvasExpandedNodes, nodeId],
    }));
  }

  function collapseNode(nodeId: string) {
    update((s) => {
      const toRemove = new Set<string>();
      const collect = (n: TreeNode) => {
        toRemove.add(n.id);
        for (const c of n.children) collect(c);
      };
      const node = findNode(s.treeNodes, nodeId);
      if (node) collect(node);
      return {
        ...s,
        canvasExpandedNodes: s.canvasExpandedNodes.filter((id) => !toRemove.has(id)),
        canvasSelectedNodeId: toRemove.has(s.canvasSelectedNodeId ?? "")
          ? null
          : s.canvasSelectedNodeId,
      };
    });
  }

  const expandedSet = new Set(ws.canvasExpandedNodes);
  const selectedNodeId = ws.canvasSelectedNodeId;
  const selectedEdgeId = ws.canvasSelectedEdgeId;
  const hasSelection = selectedNodeId !== null || selectedEdgeId !== null;

  const interaction: InteractionState = {
    mode,
    edgeDrawFromId: edgeDraw?.fromId ?? null,
    edgeDrawLevelId: edgeDraw?.levelId ?? null,
    hoveredNodeId,
    onEdgeNodeClick,
    onNodeHover: setHoveredNodeId,
  };

  return (
    <div
      ref={containerRef}
      // deno-lint-ignore no-explicit-any
      tabIndex={0 as any}
      style="position:absolute; inset:0; overflow:hidden; background:#0d0d1e; outline:none;"
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setMode("select");
          setEdgeDraw(null);
        }
      }}
    >
      <svg
        ref={svgRef}
        style={`width:100%; height:100%; display:block;${
          mode === "add-edge" ? " cursor:crosshair;" : ""
        }`}
        onMouseDown={onSvgMouseDown}
        onMouseMove={onSvgMouseMove}
      >
        <g transform={`translate(${view.tx}, ${view.ty}) scale(${view.scale})`}>
          {renderLevel(
            ws.treeNodes,
            "",
            layout,
            expandedSet,
            ws,
            selectedNodeId,
            selectedEdgeId,
            selectNode,
            selectEdge,
            expandNode,
            collapseNode,
            startDrag,
            interaction,
          )}
          {/* Ghost edge line while drawing */}
          {mode === "add-edge" && edgeDraw && mouseCanvas && (() => {
            const srcLevel = layout.get(edgeDraw.levelId);
            const srcNode = srcLevel?.nodes.find((n) => n.id === edgeDraw.fromId);
            const mouseNode = {
              x: mouseCanvas.x,
              y: mouseCanvas.y,
              w: 0,
              h: 0,
              vx: 0,
              vy: 0,
              pinned: false,
              id: "",
            };
            const gp = srcNode
              ? surfacePoint(srcNode, mouseNode, 5)
              : { x: edgeDraw.x, y: edgeDraw.y };
            return (
              <line
                x1={gp.x}
                y1={gp.y}
                x2={mouseCanvas.x}
                y2={mouseCanvas.y}
                stroke="#5070c0"
                stroke-width={1.5}
                stroke-dasharray="6 4"
                style="pointer-events:none;"
              />
            );
          })()}
        </g>
      </svg>

      {/* Top-right bar: canvas-wide controls + breadcrumb */}
      <CanvasTopBar ws={ws} update={update} mode={mode} onSetMode={setMode} />

      {/* Inspector overlay — bottom-right */}
      {hasSelection && (
        <div
          ref={inspectorRef}
          style="position:absolute; bottom:0; right:0; width:290px; max-height:65%; background:#10102a; border-top:1px solid #2a2a4a; border-left:1px solid #2a2a4a; display:flex; flex-direction:column; overflow:hidden;"
        >
          <CanvasInspector
            ws={ws}
            update={update}
            onExpand={expandNode}
            onCollapse={collapseNode}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recursive SVG rendering
// ---------------------------------------------------------------------------

type StartDragFn = (
  e: MouseEvent,
  nodeId: string,
  levelId: string,
  origX: number,
  origY: number,
  onClickFn: (() => void) | null,
) => void;

function renderLevel(
  nodes: TreeNode[],
  levelId: string,
  layout: LayoutMap,
  expandedSet: Set<string>,
  ws: WorkspaceState,
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
  onSelectNode: (id: string) => void,
  onSelectEdge: (id: string) => void,
  onExpand: (id: string) => void,
  onCollapse: (id: string) => void,
  startDrag: StartDragFn,
  interaction: InteractionState,
): unknown {
  const level = layout.get(levelId);
  if (!level) return null;

  const isRootLevel = levelId === "";
  const posMap = new Map(level.nodes.map((n) => [n.id, n]));
  const nodeIds = nodes.map((n) => n.id);
  const levelEdgeKeys = getEdgesAtLevel(ws.edges, nodeIds);
  const levelEdges = ws.edges.filter((e) =>
    levelEdgeKeys.some((le) => le.a === e.fromId && le.b === e.toId)
  );

  return (
    <>
      {/* Shapes first (nodes and expanded group boxes) */}
      {nodes.map((node) => {
        const pos = posMap.get(node.id);
        if (!pos) return null;
        const isSelected = selectedNodeId === node.id;
        const isExpanded = expandedSet.has(node.id) && node.kind === "composite";

        if (isExpanded) {
          // Root-level expanded: no bounding box rect — children float freely
          if (isRootLevel) {
            return (
              <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
                {renderLevel(
                  node.children,
                  node.id,
                  layout,
                  expandedSet,
                  ws,
                  selectedNodeId,
                  selectedEdgeId,
                  onSelectNode,
                  onSelectEdge,
                  onExpand,
                  onCollapse,
                  startDrag,
                  interaction,
                )}
              </g>
            );
          }

          // Nested expanded: draw tight bounding box around children
          const childLevel = layout.get(node.id);
          const bb = childLevel?.bbox;
          // Rect coordinates in local space (relative to pos.x, pos.y)
          const rx = bb ? bb.minX : -pos.w / 2;
          const ry = bb ? bb.minY - LABEL_H : -pos.h / 2;
          const rw = bb ? bb.w : pos.w;
          const rh = bb ? bb.h + LABEL_H : pos.h;

          return (
            <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
              <rect
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                fill="#0f0f28"
                stroke={isSelected ? "#4060b0" : "#1e1e44"}
                stroke-width={isSelected ? 2 : 1}
                rx={8}
                ry={8}
                style="cursor:pointer;"
                onMouseDown={(e: MouseEvent) => {
                  if (interaction.mode === "add-edge" && nodes.length > 1) {
                    e.stopPropagation();
                    interaction.onEdgeNodeClick(node.id, pos.x, pos.y, levelId);
                    return;
                  }
                  startDrag(e, node.id, levelId, pos.x, pos.y, () => onSelectNode(node.id));
                }}
                onDblClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  onCollapse(node.id);
                }}
              />
              <text
                x={rx + 10}
                y={ry + LABEL_H - 6}
                fill={isSelected ? "#8090c0" : "#444466"}
                font-size="11"
                style="user-select:none; pointer-events:none;"
              >
                {node.label}
              </text>
              {renderLevel(
                node.children,
                node.id,
                layout,
                expandedSet,
                ws,
                selectedNodeId,
                selectedEdgeId,
                onSelectNode,
                onSelectEdge,
                onExpand,
                onCollapse,
                startDrag,
                interaction,
              )}
            </g>
          );
        }

        // Collapsed node — always rendered as a circle (leaf or collapsed composite)
        const isComposite = node.kind === "composite";
        const r = LEAF_R;
        const hasChildren = isComposite && node.children.length > 0;

        // Edge-draw visual state
        const isEdgeSource = node.id === interaction.edgeDrawFromId;
        const hasSourceSelected = interaction.edgeDrawFromId !== null;
        const sameLevel = interaction.edgeDrawLevelId === levelId;
        // Candidate: can be clicked as from/to; requires sibling(s) and, once source is chosen,
        // must be at the same level as the source.
        const isCandidate = interaction.mode === "add-edge" && nodes.length > 1 &&
          !isEdgeSource && (!hasSourceSelected || sameLevel);
        // Inactive: source is selected but this node cannot be a target.
        const isInactive = interaction.mode === "add-edge" && hasSourceSelected &&
          !isEdgeSource && !isCandidate;
        const isHovered = interaction.hoveredNodeId === node.id && isCandidate;

        const fill = isEdgeSource || isHovered || isSelected
          ? "#1e2a4a"
          : isComposite
          ? "#141430"
          : "#111125";
        const stroke = isEdgeSource || isSelected
          ? "#5070c0"
          : isHovered
          ? "#6080e0"
          : isCandidate
          ? "#3050a0"
          : isComposite
          ? "#303060"
          : "#252545";
        const strokeWidth = isEdgeSource || isSelected || isHovered ? 2 : isCandidate ? 1.5 : 1;
        const nodeCursor = interaction.mode === "add-edge"
          ? (isCandidate || isEdgeSource ? "crosshair" : "default")
          : "pointer";

        return (
          <g
            key={node.id}
            transform={`translate(${pos.x}, ${pos.y})`}
            style={`cursor:${nodeCursor};${isInactive ? " opacity:0.3;" : ""}`}
            onMouseDown={(e: MouseEvent) => {
              if (interaction.mode === "add-edge" && (isCandidate || isEdgeSource)) {
                e.stopPropagation();
                interaction.onEdgeNodeClick(node.id, pos.x, pos.y, levelId);
                return;
              }
              if (interaction.mode === "select") {
                startDrag(e, node.id, levelId, pos.x, pos.y, () => onSelectNode(node.id));
              }
            }}
            onMouseEnter={() => {
              if (isCandidate) interaction.onNodeHover(node.id);
            }}
            onMouseLeave={() => {
              if (isCandidate) interaction.onNodeHover(null);
            }}
            onDblClick={(e: MouseEvent) => {
              e.stopPropagation();
              if (isComposite) onExpand(node.id);
            }}
          >
            <circle
              cx={0}
              cy={0}
              r={r}
              fill={fill}
              stroke={stroke}
              stroke-width={strokeWidth}
            />
            <text
              x={0}
              y={hasChildren ? -3 : 3}
              text-anchor="middle"
              fill={isSelected ? "#a0b4e0" : "#777799"}
              font-size="9"
              style="user-select:none; pointer-events:none;"
            >
              {node.label}
            </text>
            {hasChildren && (
              <text
                x={0}
                y={10}
                text-anchor="middle"
                fill={isSelected ? "#6070a0" : "#3a3a60"}
                font-size="8"
                style="user-select:none; pointer-events:none;"
              >
                ({node.children.length})
              </text>
            )}
          </g>
        );
      })}

      {/* Edges last — on top of all shapes */}
      {(() => {
        // Group edges by unordered node pair (canonical key = minId|maxId).
        // Each group gets indices 0,1,2... — used to alternate arc sweep so
        // parallel and bidirectional edges separate visually.
        const groupIndex = new Map<string, number>();
        const groupCount = new Map<string, number>();
        for (const e of levelEdges) {
          const key = [e.fromId, e.toId].sort().join("|");
          groupIndex.set(e.id, groupCount.get(key) ?? 0);
          groupCount.set(key, (groupCount.get(key) ?? 0) + 1);
        }

        // Pre-compute path data for each edge so we can do two render passes:
        // pass 1 — all paths (so no arc draws over another edge's label),
        // pass 2 — all labels on top.
        type EdgeRenderData = {
          edge: (typeof levelEdges)[0];
          pa: ForceNode;
          pb: ForceNode;
          src: { x: number; y: number };
          dst: { x: number; y: number };
          d: string;
          needsArc: boolean;
          r: number;
          sweep: number;
          isSelected: boolean;
        };
        const renderData: EdgeRenderData[] = [];
        for (const edge of levelEdges) {
          const pa = posMap.get(edge.fromId);
          const pb = posMap.get(edge.toId);
          if (!pa || !pb) continue;
          const src = surfacePoint(pa, pb, 5);
          // Destination: pull back by arrowhead length so stroke ends at arrowhead base,
          // not tip — prevents the line from visually extending through the arrowhead.
          const dst = surfacePoint(pb, pa, 5 + 10);
          const dx = pb.x - pa.x;
          const dy = pb.y - pa.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const key = [edge.fromId, edge.toId].sort().join("|");
          const needsArc = (groupCount.get(key) ?? 1) > 1;
          const idx = groupIndex.get(edge.id) ?? 0;
          const baseSweep = edge.fromId < edge.toId ? 0 : 1;
          const sweep = idx % 2 === 0 ? baseSweep : 1 - baseSweep;
          const r = dist * (0.5 + Math.floor(idx / 2) * 0.35);
          const d = needsArc
            ? `M${src.x},${src.y} A${r},${r} 0 0,${sweep} ${dst.x},${dst.y}`
            : `M${src.x},${src.y} L${dst.x},${dst.y}`;
          renderData.push({
            edge,
            pa,
            pb,
            src,
            dst,
            d,
            needsArc,
            r,
            sweep,
            isSelected: selectedEdgeId === edge.id,
          });
        }

        return (
          <>
            {/* Pass 1: all edge paths */}
            {renderData.map(({ edge, d, src, dst, needsArc, r, sweep, isSelected }) => {
              const stroke = isSelected ? "#5070c0" : "#2a2a50";
              const tangent = pathEndTangent(src, dst, needsArc, r, sweep);
              const perp = { x: -tangent.y, y: tangent.x };
              const tip = { x: dst.x + tangent.x * 10, y: dst.y + tangent.y * 10 };
              const arrowPoints = `${tip.x},${tip.y} ${dst.x + perp.x * 3.5},${
                dst.y + perp.y * 3.5
              } ${dst.x - perp.x * 3.5},${dst.y - perp.y * 3.5}`;
              return (
                <g key={edge.id}>
                  {/* Wide transparent hit-area */}
                  <path
                    d={d}
                    stroke="transparent"
                    stroke-width={8}
                    fill="none"
                    style="cursor:pointer;"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      onSelectEdge(edge.id);
                    }}
                  />
                  {/* Visible path */}
                  <path
                    d={d}
                    stroke={stroke}
                    stroke-width={isSelected ? 2 : 1}
                    fill="none"
                    style="pointer-events:none;"
                  />
                  {/* Arrowhead polygon */}
                  <polygon
                    points={arrowPoints}
                    fill={stroke}
                    style="pointer-events:none;"
                  />
                </g>
              );
            })}
            {/* Pass 2: all labels on top of all paths */}
            {renderData.map(({ edge, src, dst, needsArc, r, sweep }) => {
              if (!edge.label) return null;
              const lp = needsArc
                ? arcMidpoint(src.x, src.y, dst.x, dst.y, r, sweep)
                : { x: (src.x + dst.x) / 2, y: (src.y + dst.y) / 2 };
              return (
                <text
                  key={`${edge.id}-label`}
                  x={lp.x}
                  y={lp.y - 4}
                  text-anchor="middle"
                  fill="#556"
                  font-size="10"
                  stroke="#0d0d1e"
                  stroke-width="4"
                  stroke-linejoin="round"
                  style="pointer-events:none; user-select:none; paint-order:stroke;"
                >
                  {edge.label}
                </text>
              );
            })}
          </>
        );
      })()}
    </>
  );
}
