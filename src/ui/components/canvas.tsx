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
/** Arc tangent at dst, given the actual arc circle center arcC. sweep=1 → CW in screen space. */
function pathEndTangent(
  src: { x: number; y: number },
  dst: { x: number; y: number },
  needsArc: boolean,
  _r: number,
  sweep: number,
  arcC?: { x: number; y: number },
): { x: number; y: number } {
  const dx = dst.x - src.x;
  const dy = dst.y - src.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) return { x: 1, y: 0 };
  if (!needsArc) return { x: dx / d, y: dy / d };
  const cx = arcC?.x ?? (src.x + dst.x) / 2;
  const cy = arcC?.y ?? (src.y + dst.y) / 2;
  // Radius vector at dst. In screen space (Y-down):
  // CW tangent (sweep=1) = (-rv.y, rv.x); CCW (sweep=0) = (rv.y, -rv.x)
  const rvx = dst.x - cx, rvy = dst.y - cy;
  const tx = sweep === 1 ? -rvy : rvy;
  const ty = sweep === 1 ? rvx : -rvx;
  const tl = Math.sqrt(tx * tx + ty * ty);
  return tl < 0.001 ? { x: dx / d, y: dy / d } : { x: tx / tl, y: ty / tl };
}

/**
 * Returns the geometric midpoint of a circular arc given the actual arc circle center.
 * For a short arc (< 180°), the midpoint is in the direction of normalize(vs + vd) from arcC,
 * where vs/vd are unit vectors from arcC to src/dst. This is sweep-independent.
 */
function arcMidpoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  _sweep: number,
  arcC?: { x: number; y: number },
): { x: number; y: number } {
  if (!arcC) {
    // Fallback: chord midpoint
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
  const vsx = x1 - arcC.x, vsy = y1 - arcC.y;
  const vdx = x2 - arcC.x, vdy = y2 - arcC.y;
  const bx = vsx + vdx, by = vsy + vdy;
  const bl = Math.sqrt(bx * bx + by * by);
  if (bl < 0.001) return { x: arcC.x, y: arcC.y + r };
  return { x: arcC.x + r * bx / bl, y: arcC.y + r * by / bl };
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

/**
 * Returns the point where an arc circle (center arcC, radius r) exits a collapsed node's
 * bounding circle (radius clipR, centered at nodeCenter). nodeCenter must lie on the arc circle.
 * otherCenter is the other arc endpoint, used to select the correct intersection.
 */
function arcClipPoint(
  arcC: { x: number; y: number },
  r: number,
  nodeCenter: { x: number; y: number },
  clipR: number,
  otherCenter: { x: number; y: number },
): { x: number; y: number } {
  // |arcC - nodeCenter| = r  (nodeCenter is on the arc circle)
  const dcx = nodeCenter.x - arcC.x;
  const dcy = nodeCenter.y - arcC.y;
  // Standard circle-circle intersection (d = r):
  const a = (r * r + r * r - clipR * clipR) / (2 * r);
  const hh = r * r - a * a;
  if (hh < 0 || r < 0.001) {
    // Degenerate — fall back to straight surface point
    const ddx = otherCenter.x - nodeCenter.x;
    const ddy = otherCenter.y - nodeCenter.y;
    const dd = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dd < 0.001) return nodeCenter;
    return { x: nodeCenter.x + (ddx / dd) * clipR, y: nodeCenter.y + (ddy / dd) * clipR };
  }
  const h = Math.sqrt(hh);
  const mx = arcC.x + a * dcx / r;
  const my = arcC.y + a * dcy / r;
  const px = -dcy / r;
  const py = dcx / r;
  const p1 = { x: mx + h * px, y: my + h * py };
  const p2 = { x: mx - h * px, y: my - h * py };
  const d1sq = (p1.x - otherCenter.x) ** 2 + (p1.y - otherCenter.y) ** 2;
  const d2sq = (p2.x - otherCenter.x) ** 2 + (p2.y - otherCenter.y) ** 2;
  return d1sq < d2sq ? p1 : p2;
}

/**
 * Returns the point where an arc circle (center arcC, radius r) first exits an AABB rectangle
 * (center nodeCenter, half-dims halfW × halfH expanded outward by gap) when travelling from
 * nodeCenter toward otherCenter. Uses angular distance from nodeCenter's angle to pick the
 * "first" exit point in the arc's travel direction (initialSweep: 1=CW, 0=CCW in screen space).
 */
function arcClipRect(
  arcC: { x: number; y: number },
  r: number,
  nodeCenter: { x: number; y: number },
  halfW: number,
  halfH: number,
  gap: number,
  initialSweep: number,
  otherCenter: { x: number; y: number },
): { x: number; y: number } {
  const left = nodeCenter.x - halfW - gap;
  const right = nodeCenter.x + halfW + gap;
  const top = nodeCenter.y - halfH - gap;
  const bottom = nodeCenter.y + halfH + gap;

  const pts: { x: number; y: number }[] = [];
  // Vertical edges
  for (const x of [left, right]) {
    const disc = r * r - (x - arcC.x) ** 2;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const y of [arcC.y + sq, arcC.y - sq]) {
      if (y >= top && y <= bottom) pts.push({ x, y });
    }
  }
  // Horizontal edges
  for (const y of [top, bottom]) {
    const disc = r * r - (y - arcC.y) ** 2;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const x of [arcC.x + sq, arcC.x - sq]) {
      if (x >= left && x <= right) pts.push({ x, y });
    }
  }

  if (pts.length === 0) {
    // Fallback: straight surface direction toward otherCenter
    const ddx = otherCenter.x - nodeCenter.x;
    const ddy = otherCenter.y - nodeCenter.y;
    const dd = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dd < 0.001) return nodeCenter;
    const tx = Math.abs(ddx) > 0.001 ? halfW / Math.abs(ddx) : Infinity;
    const ty = Math.abs(ddy) > 0.001 ? halfH / Math.abs(ddy) : Infinity;
    const t = Math.min(tx, ty);
    return {
      x: nodeCenter.x + ddx * t + (ddx / dd) * gap,
      y: nodeCenter.y + ddy * t + (ddy / dd) * gap,
    };
  }

  // Pick the candidate with the smallest positive angular distance from nodeCenter's angle,
  // travelling in the arc's direction (initialSweep: 1=CW, 0=CCW in screen space).
  const aFrom = Math.atan2(nodeCenter.y - arcC.y, nodeCenter.x - arcC.x);
  const cw = initialSweep === 1;
  function cwDist(from: number, to: number): number {
    // Angular distance travelling CW (decreasing angle in screen space) from `from` to `to`
    let d = from - to;
    if (d < 0) d += 2 * Math.PI;
    return d;
  }
  function ccwDist(from: number, to: number): number {
    let d = to - from;
    if (d < 0) d += 2 * Math.PI;
    return d;
  }
  const angDist = cw ? cwDist : ccwDist;

  let best = pts[0];
  let bestDist = angDist(aFrom, Math.atan2(pts[0].y - arcC.y, pts[0].x - arcC.x));
  for (const p of pts.slice(1)) {
    const d = angDist(aFrom, Math.atan2(p.y - arcC.y, p.x - arcC.x));
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
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
      // Background click: return to select mode and clear everything (same as Escape)
      setEdgeDraw(null);
      setMode("select");
      update((s) => ({ ...s, canvasSelectedNodeId: null, canvasSelectedEdgeId: null }));
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
            { x: 0, y: 0 },
          )}
          {/* Ghost edge line while drawing */}
          {mode === "add-edge" && edgeDraw && mouseCanvas && (() => {
            const gdx = mouseCanvas.x - edgeDraw.x;
            const gdy = mouseCanvas.y - edgeDraw.y;
            const gd = Math.sqrt(gdx * gdx + gdy * gdy);
            const gp = gd < 0.001 ? { x: edgeDraw.x, y: edgeDraw.y } : {
              x: edgeDraw.x + gdx / gd * (LEAF_R + 5),
              y: edgeDraw.y + gdy / gd * (LEAF_R + 5),
            };
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
  worldOffset: { x: number; y: number },
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
                  { x: worldOffset.x + pos.x, y: worldOffset.y + pos.y },
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
                    interaction.onEdgeNodeClick(
                      node.id,
                      worldOffset.x + pos.x,
                      worldOffset.y + pos.y,
                      levelId,
                    );
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
                { x: worldOffset.x + pos.x, y: worldOffset.y + pos.y },
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
                interaction.onEdgeNodeClick(
                  node.id,
                  worldOffset.x + pos.x,
                  worldOffset.y + pos.y,
                  levelId,
                );
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
          src: { x: number; y: number };
          dst: { x: number; y: number };
          d: string;
          needsArc: boolean;
          r: number;
          sweep: number;
          arcC?: { x: number; y: number };
          isSelected: boolean;
        };
        const renderData: EdgeRenderData[] = [];
        for (const edge of levelEdges) {
          const pa = posMap.get(edge.fromId);
          const pb = posMap.get(edge.toId);
          if (!pa || !pb) continue;
          const dx = pb.x - pa.x;
          const dy = pb.y - pa.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const key = [edge.fromId, edge.toId].sort().join("|");
          const needsArc = (groupCount.get(key) ?? 1) > 1;
          const idx = groupIndex.get(edge.id) ?? 0;
          const baseSweep = edge.fromId < edge.toId ? 0 : 1;
          let sweep = idx % 2 === 0 ? baseSweep : 1 - baseSweep;
          // Wider radius per additional pair so bundles of 3+ edges separate visually.
          const r = dist * (0.55 + Math.floor(idx / 2) * 0.45);

          // For arcs, compute the arc-circle center so each arc exits the node boundary at
          // a different point (instead of all sharing the same straight surfacePoint).
          let src: { x: number; y: number };
          let dst: { x: number; y: number };
          let edgeArcC: { x: number; y: number } | undefined;
          if (needsArc) {
            const ux = dx / dist, uy = dy / dist;
            const nx = -uy, ny = ux;
            const hh = Math.max(0, r * r - (dist / 2) * (dist / 2));
            const hv = Math.sqrt(hh);
            const sign = sweep === 1 ? -1 : 1;
            const arcSweep = sweep; // initial sweep used to derive arcC
            edgeArcC = {
              x: (pa.x + pb.x) / 2 + sign * hv * nx,
              y: (pa.y + pb.y) / 2 + sign * hv * ny,
            };
            const isSrcCircle = pa.w === LEAF_W && pa.h === LEAF_H;
            const isDstCircle = pb.w === LEAF_W && pb.h === LEAF_H;
            src = isSrcCircle
              ? arcClipPoint(edgeArcC, r, pa, LEAF_R + 5, pb)
              : arcClipRect(edgeArcC, r, pa, pa.w / 2, pa.h / 2, 5, arcSweep, pb);
            // Destination: pull back by arrowhead length (10px) past the boundary.
            dst = isDstCircle
              ? arcClipPoint(edgeArcC, r, pb, LEAF_R + 5 + 10, pa)
              // For the destination we want the entry point — travel backward (1-arcSweep) from pb.
              : arcClipRect(edgeArcC, r, pb, pb.w / 2, pb.h / 2, 5 + 10, 1 - arcSweep, pa);
            // arcC was computed from pa→pb, but src/dst are clipped points on that same circle.
            // The SVG sweep flag for src→dst must be derived from arcC directly (cross product).
            // In SVG screen coords (Y-down): positive crossZ → CW rotation → sweep=1.
            const crossZ = (src.x - edgeArcC.x) * (dst.y - edgeArcC.y) -
              (src.y - edgeArcC.y) * (dst.x - edgeArcC.x);
            sweep = crossZ > 0 ? 1 : 0;
          } else {
            src = surfacePoint(pa, pb, 5);
            dst = surfacePoint(pb, pa, 5 + 10);
          }

          const d = needsArc
            ? `M${src.x},${src.y} A${r},${r} 0 0,${sweep} ${dst.x},${dst.y}`
            : `M${src.x},${src.y} L${dst.x},${dst.y}`;
          renderData.push({
            edge,
            src,
            dst,
            d,
            needsArc,
            r,
            sweep,
            arcC: edgeArcC,
            isSelected: selectedEdgeId === edge.id,
          });
        }

        return (
          <>
            {/* Pass 1: all edge paths */}
            {renderData.map(({ edge, d, src, dst, needsArc, r, sweep, arcC, isSelected }) => {
              const stroke = isSelected ? "#5070c0" : "#2a2a50";
              const tangent = pathEndTangent(src, dst, needsArc, r, sweep, arcC);
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
            {renderData.map(({ edge, src, dst, needsArc, r, sweep, arcC }) => {
              if (!edge.label) return null;
              const lp = needsArc
                ? arcMidpoint(src.x, src.y, dst.x, dst.y, r, sweep, arcC)
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
