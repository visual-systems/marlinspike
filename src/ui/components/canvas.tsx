/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import {
  collectSubtreeIds,
  type Edge,
  findNode,
  findParentOf,
  findPath,
  getActiveTab,
  getFocusedRootNodes,
  getWorkspaceRootId,
  isRef,
  type Panel,
  type Port,
  type TreeNode,
  type Updater,
  type WorkspaceState,
} from "../workspace.ts";
import { EdgeInspector, NodeInspector } from "./inspector.tsx";
import { ConstraintInspector } from "./constraints-panel.tsx";
import type { DiagnosticMap } from "../../graph/diagnostics.ts";
import { Dropdown } from "./dropdown.tsx";
import { SmallBtn } from "./widgets.tsx";
import { type BBox, boundingBox, centerNodes, type ForceNode } from "../lib/force.ts";
import {
  circlePortPositions,
  type PortPosition,
  rectPortPositions,
  resolveNodePorts,
} from "../lib/port-layout.ts";
import { lineClosestPoint, lineSdfDist } from "../lib/sdf-force.ts";
import { topoCharge } from "../lib/topo-charge.ts";
import { NodePorts } from "./port-rendering.tsx";
import {
  createFIELD,
  createJANK,
  createSDF,
  createTOPOGRID,
  DEFAULT_FIELD_CONFIG,
  DEFAULT_JANK_CONFIG,
  DEFAULT_SDF_CONFIG,
  type LayoutAlgorithm,
} from "../lib/algorithms/index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extensible canvas interaction mode. Add new modes here as needed. */
type CanvasMode = "select" | "add-node" | "add-edge";

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
// Ref helpers
// ---------------------------------------------------------------------------

/** Collect all node labels in the tree (flat). */
function collectAllLabels(roots: TreeNode[]): Set<string> {
  const labels = new Set<string>();
  (function walk(ns: TreeNode[]) {
    for (const n of ns) {
      labels.add(n.label);
      walk(n.children);
    }
  })(roots);
  return labels;
}

/** Dashed outline for explicit aliases, URI refs, broken/imported refs — NOT scope-inferred. */
function refNeedsDash(node: TreeNode, allLabels: Set<string>): boolean {
  if (!isRef(node) || !node.ref) return false;
  // Explicit top-level alias (def name target) — no data.fn
  if (!node.data.fn) return true;
  // URI reference (spike://...)
  if (node.ref.startsWith("spike://")) return true;
  // Broken or imported: target not found in tree
  if (!allLabels.has(node.ref)) return true;
  return false;
}

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

/** Half-height of a collapsed rect node (rect uses LEAF_R as half-width, 0.7*LEAF_R as half-height). */
const RECT_HALF_H = LEAF_R * 0.7;

/** Returns the point on `from`'s boundary in the direction of `to`, offset outward by `gap` px. */
function surfacePoint(
  from: ForceNode,
  to: ForceNode,
  gap = 0,
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return { x: from.x, y: from.y };
  const ux = dx / dist;
  const uy = dy / dist;
  if (from.w === LEAF_W && from.h === LEAF_H) {
    if (from.shape === "rect") {
      // collapsed rect node: ray-AABB clip with rect dimensions
      const tx = Math.abs(ux) > 0.001 ? LEAF_R / Math.abs(ux) : Infinity;
      const ty = Math.abs(uy) > 0.001 ? RECT_HALF_H / Math.abs(uy) : Infinity;
      const t = Math.min(tx, ty);
      return { x: from.x + ux * (t + gap), y: from.y + uy * (t + gap) };
    }
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
 * Find a bend midpoint for a straight edge if a non-incident node obstructs it.
 * Returns undefined for a straight line, or {x, y} of the quadratic bezier control point.
 */
function edgeBendPoint(
  src: { x: number; y: number },
  dst: { x: number; y: number },
  levelNodes: ForceNode[],
  edgeNodeIds: [string, string],
  clearance: number,
): { x: number; y: number } | undefined {
  let bestDist = clearance;
  let bestT = 0.5;
  let bestGx = 0;
  let bestGy = 0;
  let bestBendMag = 0;

  for (const n of levelNodes) {
    if (n.id === edgeNodeIds[0] || n.id === edgeNodeIds[1]) continue;
    const d = lineSdfDist(n.x, n.y, src.x, src.y, dst.x, dst.y);
    if (d >= clearance || d >= bestDist) continue;
    const { t, cx, cy } = lineClosestPoint(n.x, n.y, src.x, src.y, dst.x, dst.y);
    const ex = cx - n.x;
    const ey = cy - n.y;
    const len = Math.sqrt(ex * ex + ey * ey);
    if (len < 1e-9) continue;
    bestDist = d;
    bestT = t;
    bestGx = ex / len;
    bestGy = ey / len;
    bestBendMag = clearance - d;
  }

  if (bestBendMag === 0) return undefined;
  return {
    x: src.x + bestT * (dst.x - src.x) + bestGx * bestBendMag,
    y: src.y + bestT * (dst.y - src.y) + bestGy * bestBendMag,
  };
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
 * Pin port-nodes at their boundary positions on the parent composite.
 * Instead of using soft anchor springs (which create a tug-of-war with edge
 * topology), port-nodes are hard-placed at the boundary each tick. Interior
 * nodes feel edge springs from these fixed port-nodes, naturally settling near
 * their connected ports without distorting the layout.
 */
function pinPortNodes(
  nodes: ForceNode[],
  parentNode: TreeNode,
  layout: LayoutMap,
  treeNodes: TreeNode[],
): ForceNode[] {
  if (!parentNode.ports || parentNode.ports.length === 0) return nodes;

  // Find the parent's ForceNode in its own parent level to get current w/h
  const grandparent = findParentOf(treeNodes, parentNode.id);
  const parentLevelId = grandparent?.id ?? "";
  const parentLevel = layout.get(parentLevelId);
  const parentFn = parentLevel?.nodes.find((fn) => fn.id === parentNode.id);
  if (!parentFn) return nodes;

  const halfW = parentFn.w / 2;
  const halfH = parentFn.h / 2;
  const portPositions = rectPortPositions(parentNode.ports, halfW, halfH, LABEL_H);

  // Build separate lookups for input and output port pinning.
  // Output ports prefer children with data.outputPort (map-key terminals that
  // collided with param names, e.g. normalise's "divide-b-a" → port "b").
  // Input ports match children by label. When port names overlap (normalise has
  // both input "b" and output "b"), each child is claimed at most once.
  const childByLabel = new Map(parentNode.children.map((c) => [c.label, c.id]));
  const childByOutputPort = new Map<string, string>();
  for (const child of parentNode.children) {
    const outputPort = child.data.outputPort as string | undefined;
    if (outputPort) childByOutputPort.set(outputPort, child.id);
  }
  const claimed = new Set<string>(); // child IDs already pinned
  const pinMap = new Map<string, { x: number; y: number }>();
  const toPin = (childId: string, pp: { x: number; y: number }) => {
    claimed.add(childId);
    // Port positions are relative to the rect center; child level is centered
    // at (0, 0) but the rect center is offset by -LABEL_H/2 in y. Shift
    // y by +LABEL_H/2 to convert to child level coordinate space.
    pinMap.set(childId, { x: pp.x, y: pp.y + LABEL_H / 2 });
  };
  // Pin output ports first (prefer data.outputPort, fall back to label match)
  for (const pp of portPositions) {
    if (pp.direction !== "out") continue;
    const byData = childByOutputPort.get(pp.portName);
    const byLabel = childByLabel.get(pp.portName);
    const childId = byData ?? byLabel;
    if (childId && !claimed.has(childId)) toPin(childId, pp);
  }
  // Pin input ports (label match, skip already-claimed children)
  for (const pp of portPositions) {
    if (pp.direction === "out") continue;
    const childId = childByLabel.get(pp.portName);
    if (childId && !claimed.has(childId)) toPin(childId, pp);
  }

  if (pinMap.size === 0) return nodes;
  return nodes.map((fn) => {
    const pin = pinMap.get(fn.id);
    if (!pin) return fn;
    // Set anchor as a marker so boundingBox excludes port-nodes
    return { ...fn, x: pin.x, y: pin.y, vx: 0, vy: 0, pinned: true, anchor: pin };
  });
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
  shapeMap?: Map<string, "circle" | "rect">,
): LevelState {
  const prevMap = new Map(prev?.nodes.map((n) => [n.id, n]) ?? []);
  const defaults = new Map(Object.entries(pinnedPositions));
  const rawPositions = algorithm.initNodes(ids, levelEdges, LEAF_W, LEAF_H, defaults);

  // Compute topological charge for FIELD algorithm (static per topology)
  const charges = topoCharge(ids, levelEdges);

  const nodes: ForceNode[] = rawPositions.map((fn): ForceNode => {
    const existing = prevMap.get(fn.id);
    const isExpanded = expandedSet.has(fn.id);
    const w = isExpanded ? (existing?.w ?? LEAF_W * 3) : LEAF_W;
    const h = isExpanded ? (existing?.h ?? LEAF_H * 3) : LEAF_H;
    const charge = charges.get(fn.id);
    const shape = shapeMap?.get(fn.id);
    if (existing && algorithm.preservesPositions) return { ...existing, w, h, charge, shape };
    return { ...fn, w, h, charge, shape };
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
  shapeMap?: Map<string, "circle" | "rect">,
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
      shapeMap,
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
        shapeMap,
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

    // Pin port-nodes at their boundary positions before ticking
    const nodesWithPins = pinPortNodes(level.nodes, node, next, treeNodes);

    const { nodes: ticked, settled } = algorithm.tick(nodesWithPins, levelEdges, level.ticks);
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
  if (id === "FIELD") return createFIELD(DEFAULT_FIELD_CONFIG);
  return createJANK(DEFAULT_JANK_CONFIG);
}

// ---------------------------------------------------------------------------
// Canvas inspector — uses synthetic panel to reuse existing inspector components
// ---------------------------------------------------------------------------

function CanvasInspector(
  { ws, update, onExpand, onCollapse, diagnostics }: {
    ws: WorkspaceState;
    update: Updater;
    onExpand: (id: string) => void;
    onCollapse: (id: string) => void;
    diagnostics: DiagnosticMap;
  },
) {
  const fakePanel: Panel = {
    id: "__canvas__",
    type: "tree",
    expandedNodes: [],
    selected: ws.canvasSelected,
    inspectorSplit: 0.5,
  };
  const canvasUpdate: Updater = (fn) => {
    update((s) => {
      const synth = { ...s, panels: [...s.panels, fakePanel] };
      const result = fn(synth);
      const resultPanel = result.panels.find((p) => p.id === "__canvas__");
      const newPanels = result.panels.filter((p) => p.id !== "__canvas__");
      return {
        ...result,
        panels: newPanels,
        canvasSelected: resultPanel?.selected ?? null,
      };
    });
  };

  // These two functions use outer `update` (not canvasUpdate) so canvasSelected
  // is not overridden by the fake-panel mechanism.
  function canvasInspectConstraint(constraintId: string) {
    update((s) => ({
      ...s,
      canvasSelected: { type: "constraint" as const, id: constraintId },
      panels: s.panels.map((p) =>
        p.type === "constraints"
          ? { ...p, selected: { type: "constraint" as const, id: constraintId } }
          : p
      ),
    }));
  }

  function canvasInspectEntity(entityId: string) {
    const type = findNode(ws.treeNodes, entityId) ? "node" as const : "edge" as const;
    update((s) => ({ ...s, canvasSelected: { type, id: entityId } }));
  }

  if (ws.canvasSelected?.type === "edge") {
    const sel = ws.canvasSelected;
    const edge = ws.edges.find((e) => e.id === sel.id);
    if (edge) {
      return (
        <div style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
          <EdgeInspector
            key={edge.id}
            edge={edge}
            panel={fakePanel}
            ws={ws}
            update={canvasUpdate}
            onInspectConstraint={canvasInspectConstraint}
          />
        </div>
      );
    }
  }

  if (ws.canvasSelected?.type === "node") {
    const sel = ws.canvasSelected;
    const node = findNode(ws.treeNodes, sel.id);
    if (node) {
      const isExpanded = ws.canvasExpandedNodes.includes(node.id);
      const isEmptyRef = isRef(node) && node.children.length === 0;
      const canExpand = node.kind === "composite" && !isEmptyRef;
      // Ref nodes targeting composites show "Go to" instead of "Expand"
      const refTarget = isEmptyRef && node.ref
        ? (findNode(ws.treeNodes, node.ref) ??
          ws.treeNodes.flatMap(function flat(n: TreeNode): TreeNode[] {
            return [n, ...n.children.flatMap(flat)];
          }).find((n) => n.label === node.ref))
        : undefined;
      const canNavigate = refTarget?.kind === "composite" && refTarget.children.length > 0;
      const expandAction = canNavigate
        ? <SmallBtn label="Go to" onClick={() => onExpand(node.id)} />
        : canExpand
        ? isExpanded
          ? <SmallBtn label="Collapse" onClick={() => onCollapse(node.id)} />
          : <SmallBtn label="Expand" onClick={() => onExpand(node.id)} />
        : undefined;
      return (
        <NodeInspector
          node={node}
          panel={fakePanel}
          ws={ws}
          update={canvasUpdate}
          extraActions={expandAction}
          onInspectConstraint={canvasInspectConstraint}
        />
      );
    }
  }

  if (ws.canvasSelected?.type === "constraint") {
    const sel = ws.canvasSelected;
    const constraint = ws.constraints.find((c) => c.id === sel.id);
    if (constraint) {
      return (
        <ConstraintInspector
          key={constraint.id}
          constraint={constraint}
          panel={fakePanel}
          ws={ws}
          update={canvasUpdate}
          diagnostics={diagnostics}
          onInspectEntity={canvasInspectEntity}
        />
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// ToggleDropdown — overlay toggle menu (reference edges, etc.)
// ---------------------------------------------------------------------------

function ToggleDropdown({ ws, update }: { ws: WorkspaceState; update: Updater }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close, { once: true });
    // Close when another dropdown opens (Dropdown uses stopPropagation,
    // so the document click listener won't fire for those clicks).
    document.addEventListener("dropdown-open", close, { once: true });
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("dropdown-open", close);
    };
  }, [open]);

  return (
    <div style="position:relative; flex-shrink:0;">
      <span
        style={[
          "cursor:pointer; user-select:none; font-size:14px; padding:2px 6px;",
          `color:${ws.canvasShowRefEdges ? "#9080b0" : "#404466"};`,
        ].join("")}
        title="View toggles"
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          // Signal other dropdowns to close before we open
          document.dispatchEvent(new Event("dropdown-open"));
          queueMicrotask(() => setOpen((prev) => !prev));
        }}
      >
        ⚙
      </span>
      {open && (
        <div
          style={[
            "position:absolute; top:100%; right:0; min-width:160px;",
            "background:#0d0d1e; border:1px solid #252538; z-index:200;",
            "display:flex; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.5);",
          ].join("")}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <ToggleRow
            label="Reference edges"
            checked={ws.canvasShowRefEdges}
            onToggle={() => update((s) => ({ ...s, canvasShowRefEdges: !s.canvasShowRefEdges }))}
          />
        </div>
      )}
    </div>
  );
}

function ToggleRow(
  { label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void },
) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={[
        "padding:5px 8px; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:6px;",
        `color:${hovered ? "#aaa" : "#666"};`,
      ].join("")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onToggle}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" style="flex-shrink:0;">
        <circle
          cx="5"
          cy="5"
          r="4"
          stroke={checked ? "#9080b0" : "#333"}
          stroke-width="1"
          fill="none"
        />
        {checked && <circle cx="5" cy="5" r="2.5" fill="#9080b0" />}
      </svg>
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CanvasTopBar — always visible in top-right
// Contains canvas-wide controls (layout selector) + breadcrumb navigation.
// ---------------------------------------------------------------------------

function CanvasTopBar(
  { ws, update, mode, onSetMode, onExecute, onFitView }: {
    ws: WorkspaceState;
    update: Updater;
    mode: CanvasMode;
    onSetMode: (m: CanvasMode) => void;
    onExecute?: () => void;
    onFitView: () => void;
  },
) {
  function selectNode(id: string) {
    update((s) => ({ ...s, canvasSelected: { type: "node" as const, id } }));
  }

  const selectedNodeId = ws.canvasSelected?.type === "node" ? ws.canvasSelected.id : null;
  const items: { node: TreeNode; dimmed: boolean }[] = [];

  const focusNode = ws.focusId ? (findNode(ws.treeNodes, ws.focusId) ?? null) : null;
  const focusedRoots = getFocusedRootNodes(ws);
  if (selectedNodeId) {
    const path = findPath(focusedRoots, selectedNodeId);
    if (focusNode) items.push({ node: focusNode, dimmed: true });
    for (const node of path) items.push({ node, dimmed: node.id !== selectedNodeId });
  } else if (focusNode) {
    items.push({ node: focusNode, dimmed: false });
  }

  // Home hint: when at root with nothing selected, show a link to the home workspace
  const activeTab = getActiveTab(ws);
  const homeId = activeTab.homeWorkspaceId ?? activeTab.rootNodeId;
  const atProfileRoot = ws.focusId === ws.profileRootId;
  const homeNode = atProfileRoot && !selectedNodeId ? findNode(ws.treeNodes, homeId) ?? null : null;

  const pillStyle =
    "display:flex; align-items:center; gap:6px; background:rgba(13,13,30,0.85); border:1px solid #2a2a4a; border-radius:4px; padding:4px 10px; font-size:11px;";
  const dividerStyle = "width:1px; height:14px; background:#2a2a4a; flex-shrink:0;";

  return (
    <div style="position:absolute; top:8px; right:8px; display:flex; align-items:center; gap:6px; font-size:11px; z-index:2; pointer-events:auto;">
      {onExecute && (
        <>
          <SmallBtn label="Execute" onClick={onExecute} />
          <div style={dividerStyle} />
        </>
      )}
      <span style="color:#404466; user-select:none;">mode</span>
      <Dropdown
        items={[
          { value: "select", label: "Select" },
          { value: "add-node", label: "Add Nodes" },
          { value: "add-edge", label: "Add Edges" },
        ]}
        selectedValue={mode}
        placeholder="mode"
        onSelect={(v) => onSetMode(v as CanvasMode)}
        width={100}
      />
      <div style={dividerStyle} />
      <span style="color:#404466; user-select:none;">layout</span>
      <Dropdown
        items={[
          { value: "JANK", label: "JANK" },
          { value: "TOPOGRID", label: "TOPOGRID" },
          { value: "SDF", label: "SDF" },
          { value: "FIELD", label: "FIELD" },
        ]}
        selectedValue={ws.canvasAlgorithm}
        placeholder="layout"
        onSelect={(id) =>
          update((s) => ({ ...s, canvasAlgorithm: id as WorkspaceState["canvasAlgorithm"] }))}
        width={90}
      />
      <ToggleDropdown ws={ws} update={update} />
      <span
        title="Fit to screen"
        onClick={onFitView}
        style={pillStyle + " cursor:pointer; color:#666;"}
      >
        Fit
      </span>

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

      {/* Home hint — shown at profile root when nothing is selected */}
      {homeNode && (
        <div
          style={pillStyle + " cursor:pointer; color:#50c070; gap:4px;"}
          title={`Go to ${homeNode.label}`}
          onClick={() => update((s) => ({ ...s, focusId: homeId }))}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" style="flex-shrink:0;">
            <circle cx="4" cy="4" r="4" fill="#50c070" />
          </svg>
          <span>{homeNode.label}</span>
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
  hasMoved: boolean;
}

interface TouchState {
  /** Captured touch points at gesture start, keyed by identifier. */
  points: Map<number, { x: number; y: number }>;
  origView: View;
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
  /** Convert a client-space mouse position to canvas (SVG world) coordinates. */
  clientToCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  /** Create a new leaf node. parentId=null → root level; otherwise child of that composite. */
  onAddNode: (parentId: string | null, localX: number, localY: number) => void;
}

export function Canvas(
  { ws: wsProp, update, diagnostics = {}, highlightEntityIds, onExecute }: {
    ws: WorkspaceState;
    update: Updater;
    diagnostics?: DiagnosticMap;
    highlightEntityIds?: Set<string>;
    onExecute?: () => void;
  },
) {
  // Receive fresh ws via CustomEvent — see "Hono JSX DOM workaround" in client.tsx.
  const [wsFromEvent, setWsFromEvent] = useState<WorkspaceState | null>(null);
  useEffect(() => {
    const handler = (e: Event) => setWsFromEvent((e as CustomEvent).detail);
    globalThis.addEventListener("ws-updated", handler);
    return () => globalThis.removeEventListener("ws-updated", handler);
  }, []);
  const ws = wsFromEvent ?? wsProp;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 400, ty: 300 });
  const focusedRootNodes = getFocusedRootNodes(ws);
  const focusNode = ws.focusId ? findNode(ws.treeNodes, ws.focusId) : null;
  if (focusedRootNodes.length === 0) {
    console.warn("[canvas] empty focusedRootNodes", {
      focusId: ws.focusId?.slice(0, 8) ?? null,
      focusNodeExists: !!focusNode,
      focusNodeLabel: focusNode?.label,
      focusNodeChildren: focusNode?.children.length,
      treeRootCount: ws.treeNodes.length,
      profileRootId: ws.profileRootId.slice(0, 8),
      activeTabRootNodeId: getActiveTab(ws).rootNodeId.slice(0, 8),
    });
  }

  // Compute node shapes driven by constraint data.rendering.shape
  const shapeMap = new Map<string, "circle" | "rect">();
  for (const app of ws.constraintApplications) {
    const constraint = ws.constraints.find((c) => c.id === app.constraintId);
    const shape = (constraint?.data?.rendering as { shape?: string } | undefined)?.shape;
    if (shape === "circle" || shape === "rect") shapeMap.set(app.entityId, shape);
  }
  const focusedEdges = focusNode
    ? (() => {
      const ids = collectSubtreeIds(focusNode);
      return ws.edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId));
    })()
    : ws.edges;

  const [layout, setLayout] = useState<LayoutMap>(() =>
    syncLayout(
      new Map(),
      focusedRootNodes,
      ws.canvasExpandedNodes,
      ws.canvasNodePositions,
      focusedEdges,
      makeCanvasAlgorithm(ws.canvasAlgorithm),
      shapeMap,
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

  // Sync layout when tree, edges, expanded nodes, algorithm, or focus change
  useEffect(() => {
    const rootNodes = getFocusedRootNodes(ws);
    const focusNodeSync = ws.focusId ? findNode(ws.treeNodes, ws.focusId) : null;
    const edges = focusNodeSync
      ? (() => {
        const ids = collectSubtreeIds(focusNodeSync);
        return ws.edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId));
      })()
      : ws.edges;
    setLayout((prev) =>
      syncLayout(
        prev,
        rootNodes,
        ws.canvasExpandedNodes,
        ws.canvasNodePositions,
        edges,
        makeCanvasAlgorithm(ws.canvasAlgorithm),
        shapeMap,
      )
    );
  }, [ws.treeNodes, ws.canvasExpandedNodes, ws.edges, ws.canvasAlgorithm, ws.focusId]);

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

  // Wheel: two-finger scroll → pan; pinch (ctrlKey) → zoom. Non-passive so we can preventDefault.
  const scrollCursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // Let the inspector scroll naturally
      if (inspectorRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      if (e.ctrlKey) {
        // Pinch-to-zoom via trackpad (browser sets ctrlKey for pinch gestures)
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
      } else {
        // Two-finger scroll → pan (inverted: dragging canvas behind viewport)
        document.body.style.cursor = "none";
        if (scrollCursorTimer.current) clearTimeout(scrollCursorTimer.current);
        scrollCursorTimer.current = setTimeout(() => {
          document.body.style.cursor = "";
        }, 300);
        setView((v) => ({ ...v, tx: v.tx + e.deltaX, ty: v.ty + e.deltaY }));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Touch pan / pinch-to-zoom — non-passive so we can preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      e.preventDefault();
      const points = new Map<number, { x: number; y: number }>();
      for (const t of Array.from(e.touches)) {
        points.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      touchRef.current = { points, origView: { ...viewRef.current! } };
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const state = touchRef.current;
      if (!state || !el) return;
      const rect = el.getBoundingClientRect();
      const cur = new Map<number, { x: number; y: number }>();
      for (const t of Array.from(e.touches)) {
        cur.set(t.identifier, { x: t.clientX, y: t.clientY });
      }

      if (cur.size === 1) {
        // Single-touch pan
        const [id] = cur.keys();
        const orig = state.points.get(id);
        const now = cur.get(id)!;
        if (!orig) return;
        const sdx = now.x - orig.x;
        const sdy = now.y - orig.y;
        setView(() => ({
          scale: state.origView.scale,
          tx: state.origView.tx + sdx,
          ty: state.origView.ty + sdy,
        }));
      } else if (cur.size >= 2) {
        // Two-touch pinch + pan
        const [idA, idB] = cur.keys();
        const origA = state.points.get(idA);
        const origB = state.points.get(idB);
        const nowA = cur.get(idA)!;
        const nowB = cur.get(idB)!;
        if (!origA || !origB) return;

        // Pivot = current midpoint in container-local coords
        const midX = (nowA.x + nowB.x) / 2 - rect.left;
        const midY = (nowA.y + nowB.y) / 2 - rect.top;

        // Scale from original distance ratio
        const origDist = Math.hypot(origB.x - origA.x, origB.y - origA.y);
        const nowDist = Math.hypot(nowB.x - nowA.x, nowB.y - nowA.y);
        if (origDist < 1) return;
        const factor = nowDist / origDist;
        const newScale = Math.max(0.1, Math.min(10, state.origView.scale * factor));

        // Pan: shift from original midpoint to current midpoint
        const origMidX = (origA.x + origB.x) / 2 - rect.left;
        const origMidY = (origA.y + origB.y) / 2 - rect.top;

        // Keep the canvas point under the original midpoint fixed, then apply pan delta
        const canvasX = (origMidX - state.origView.tx) / state.origView.scale;
        const canvasY = (origMidY - state.origView.ty) / state.origView.scale;
        const panDx = midX - origMidX;
        const panDy = midY - origMidY;

        setView(() => ({
          scale: newScale,
          tx: midX - canvasX * newScale + panDx,
          ty: midY - canvasY * newScale + panDy,
        }));
      }
    }

    function onTouchEnd(e: TouchEvent) {
      e.preventDefault();
      if (e.touches.length === 0) {
        touchRef.current = null;
        return;
      }
      // Finger lifted mid-gesture: restart from current positions
      const points = new Map<number, { x: number; y: number }>();
      for (const t of Array.from(e.touches)) {
        points.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      touchRef.current = { points, origView: { ...viewRef.current! } };
    }

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    el.addEventListener("touchcancel", onTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
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
        const { treeNodes, canvasExpandedNodes, edges, canvasAlgorithm, focusId } = wsRef.current!;
        const rootNodes = getFocusedRootNodes(wsRef.current!);
        const focusNodeRaf = focusId ? findNode(treeNodes, focusId) : null;
        const filteredEdges = focusNodeRaf
          ? (() => {
            const ids = collectSubtreeIds(focusNodeRaf);
            return edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId));
          })()
          : edges;
        return stepLayout(
          prev,
          rootNodes,
          canvasExpandedNodes,
          filteredEdges,
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
  const touchRef = useRef<TouchState | null>(null);

  // Refs that always point to the latest render's handler logic, so the stable
  // document listeners (registered once in a useEffect) never go stale.
  const gestureHandlersRef = useRef<{ onMove: (e: MouseEvent) => void; onUp: () => void }>(null!);
  if (!gestureHandlersRef.current) {
    gestureHandlersRef.current = { onMove: () => {}, onUp: () => {} };
  }

  gestureHandlersRef.current.onMove = function onDocMouseMove(e: MouseEvent) {
    if (!dragRef.current && !panRef.current) return;
    // If all mouse buttons are released (e.g. mouse left the window before mouseup),
    // treat it as a mouseup to prevent stale listener accumulation.
    if (e.buttons === 0) {
      gestureHandlersRef.current!.onUp();
      return;
    }
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
      const sdx = e.clientX - pan.startX;
      const sdy = e.clientY - pan.startY;
      if (sdx * sdx + sdy * sdy > DRAG_THRESHOLD_SQ) pan.hasMoved = true;
      setView((v) => ({ ...v, tx: pan.origTx + sdx, ty: pan.origTy + sdy }));
    }
  };

  gestureHandlersRef.current.onUp = function onDocMouseUp() {
    if (!dragRef.current && !panRef.current) return;
    if (dragRef.current) {
      if (!dragRef.current.hasMoved) dragRef.current.onClickFn?.();
      dragRef.current = null;
    }
    if (panRef.current && !panRef.current.hasMoved && modeRef.current === "select") {
      update((s) => ({ ...s, canvasSelected: null }));
    }
    panRef.current = null;
    document.body.style.cursor = "";
  };

  // Register document-level gesture listeners ONCE — stable references that
  // delegate to gestureHandlersRef, so they never go stale across re-renders.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      gestureHandlersRef.current!.onMove(e);
    }
    function onUp() {
      gestureHandlersRef.current!.onUp();
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

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
  }

  function clientToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const v = viewRef.current!;
    return { x: (clientX - rect.left - v.tx) / v.scale, y: (clientY - rect.top - v.ty) / v.scale };
  }

  function fitView() {
    const el = svgRef.current;
    if (!el) return;
    const rootLevel = layout.get("");
    if (!rootLevel || rootLevel.nodes.length === 0) return;
    const bb = boundingBox(rootLevel.nodes, 40);
    const rect = el.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;
    const scale = Math.min((vw * 0.8) / bb.w, (vh * 0.8) / bb.h, 2);
    const cx = (bb.minX + bb.maxX) / 2;
    const cy = (bb.minY + bb.maxY) / 2;
    setView({ scale, tx: vw / 2 - cx * scale, ty: vh / 2 - cy * scale });
  }

  function addNode(parentId: string | null, localX: number, localY: number) {
    const id = crypto.randomUUID();
    const newNode: TreeNode = { id, label: "", kind: "leaf", children: [], data: {}, version: 1 };
    // When focused, "root canvas level" maps to inside the focused node
    const effectiveParentId = parentId ?? ws.focusId ?? getWorkspaceRootId(ws);
    {
      update((s) => {
        function addChild(nodes: TreeNode[]): TreeNode[] {
          return nodes.map((n) =>
            n.id === effectiveParentId
              ? { ...n, kind: "composite", children: [...n.children, newNode] }
              : { ...n, children: addChild(n.children) }
          );
        }
        return {
          ...s,
          treeNodes: addChild(s.treeNodes),
          canvasNodePositions: {
            ...s.canvasNodePositions,
            [id]: { x: localX, y: localY, pinned: true },
          },
          canvasSelected: { type: "node", id },
          canvasExpandedNodes: s.canvasExpandedNodes.includes(effectiveParentId)
            ? s.canvasExpandedNodes
            : [...s.canvasExpandedNodes, effectiveParentId],
        };
      });
    }
  }

  function onSvgMouseDown(e: MouseEvent) {
    if (modeRef.current === "add-edge") {
      // Background click: return to select mode and clear everything (same as Escape)
      setEdgeDraw(null);
      setMode("select");
      update((s) => ({ ...s, canvasSelected: null }));
      return;
    }
    if (modeRef.current === "add-node") {
      const { x, y } = clientToCanvas(e.clientX, e.clientY);
      addNode(null, x, y);
      return;
    }
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origTx: viewRef.current!.tx,
      origTy: viewRef.current!.ty,
      hasMoved: false,
    };
    document.body.style.cursor = "none";
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
    // IDs are globally unique — safe to compare without checking type
    update((s) => ({
      ...s,
      canvasSelected: s.canvasSelected?.id === nodeId
        ? null
        : { type: "node" as const, id: nodeId },
    }));
  }

  function selectEdge(edgeId: string) {
    // IDs are globally unique — safe to compare without checking type
    update((s) => ({
      ...s,
      canvasSelected: s.canvasSelected?.id === edgeId
        ? null
        : { type: "edge" as const, id: edgeId },
    }));
  }

  function expandNode(nodeId: string) {
    const node = findNode(ws.treeNodes, nodeId);
    if (!node) return;
    // Ref nodes pointing at composites: navigate focus to the target
    // instead of expanding (avoids cloning children and ID collisions).
    if (isRef(node) && node.children.length === 0 && node.ref) {
      // Resolve target by ID first, then by label as fallback
      const target = findNode(ws.treeNodes, node.ref) ??
        ws.treeNodes.flatMap(function flat(n: TreeNode): TreeNode[] {
          return [n, ...n.children.flatMap(flat)];
        }).find((n) => n.label === node.ref);
      if (target && target.kind === "composite" && target.children.length > 0) {
        update((s) => ({ ...s, focusId: target.id, selectedId: null }));
        return;
      }
      return; // empty ref with no resolvable composite target — do nothing
    }
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
        // IDs are globally unique — safe to compare without checking type
        canvasSelected: s.canvasSelected && toRemove.has(s.canvasSelected.id)
          ? null
          : s.canvasSelected,
      };
    });
  }

  const expandedSet = new Set(ws.canvasExpandedNodes);
  // IDs are globally unique — a single selectedId covers both node and edge selection
  const selectedId = ws.canvasSelected?.id ?? null;
  const hasSelection = ws.canvasSelected != null;

  const interaction: InteractionState = {
    mode,
    edgeDrawFromId: edgeDraw?.fromId ?? null,
    edgeDrawLevelId: edgeDraw?.levelId ?? null,
    hoveredNodeId,
    onEdgeNodeClick,
    onNodeHover: setHoveredNodeId,
    clientToCanvas,
    onAddNode: addNode,
  };

  return (
    <div
      ref={containerRef}
      // deno-lint-ignore no-explicit-any
      tabIndex={0 as any}
      style="position:absolute; inset:0; overflow:hidden; background:#0d0d1e; outline:none; touch-action:none;"
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setMode("select");
          setEdgeDraw(null);
          update((s) => ({ ...s, canvasSelected: null }));
        }
      }}
    >
      <svg
        ref={svgRef}
        style={`width:100%; height:100%; display:block;${
          mode === "add-edge" || mode === "add-node" ? " cursor:crosshair;" : ""
        }`}
        onMouseDown={onSvgMouseDown}
        onMouseMove={onSvgMouseMove}
      >
        <g transform={`translate(${view.tx}, ${view.ty}) scale(${view.scale})`}>
          {renderLevel(
            focusedRootNodes,
            "",
            layout,
            expandedSet,
            ws,
            selectedId,
            selectNode,
            selectEdge,
            expandNode,
            collapseNode,
            startDrag,
            interaction,
            { x: 0, y: 0 },
            diagnostics,
            highlightEntityIds ?? new Set(),
          )}
          {/* Reference edges — cross-level dotted edges from ref nodes to targets */}
          {ws.canvasShowRefEdges && (() => {
            const worldPos = new Map<
              string,
              { node: TreeNode; wx: number; wy: number; w: number; h: number }
            >();
            collectWorldPositions(
              focusedRootNodes,
              "",
              layout,
              expandedSet,
              { x: 0, y: 0 },
              worldPos,
            );
            // Build label→id index for non-ref nodes (fallback target resolution)
            const labelToId = new Map<string, string>();
            for (const [id, { node }] of worldPos) {
              if (node.type !== "ref") labelToId.set(node.label, id);
            }
            // Build parent map + full node-id→id index for ancestor walking
            const parentOf = new Map<string, string>();
            const allNodeIds = new Set<string>();
            function indexTree(nodes: TreeNode[], parentId: string | null) {
              for (const n of nodes) {
                allNodeIds.add(n.id);
                if (parentId) parentOf.set(n.id, parentId);
                indexTree(n.children, n.id);
              }
            }
            indexTree(focusedRootNodes, null);
            /** Find the nearest visible ancestor of `nodeId` in worldPos. */
            function nearestVisibleAncestor(nodeId: string): string | undefined {
              let cur = parentOf.get(nodeId);
              while (cur) {
                if (worldPos.has(cur)) return cur;
                cur = parentOf.get(cur);
              }
              return undefined;
            }
            const refEdges: Array<{
              fromId: string;
              toId: string;
              d: string;
              dx: number;
              dy: number;
              indirect: boolean;
            }> = [];
            for (const [id, { node, wx, wy, w, h }] of worldPos) {
              if (node.type !== "ref" || !node.ref) continue;
              // Resolve target: direct id → label match → nearest visible ancestor
              let targetId = worldPos.has(node.ref) ? node.ref : labelToId.get(node.ref);
              let indirect = false;
              if (!targetId) {
                // Target not visible — try to find by id in full tree, then walk up
                const exactId = allNodeIds.has(node.ref) ? node.ref : undefined;
                const labelId = !exactId
                  ? [...allNodeIds].find((nid) => {
                    const wp = worldPos.get(nid);
                    return !wp && parentOf.has(nid); // exists in tree but not visible
                  })
                  : undefined;
                const hiddenId = exactId ?? labelId;
                if (hiddenId) {
                  targetId = nearestVisibleAncestor(hiddenId);
                  indirect = true;
                }
              }
              if (!targetId || targetId === id) continue;
              const t = worldPos.get(targetId)!;
              // Compute surface points — cast to ForceNode (surfacePoint only reads x/y/w/h)
              const pa = { x: wx, y: wy, w, h } as ForceNode;
              const pb = { x: t.wx, y: t.wy, w: t.w, h: t.h } as ForceNode;
              const src = surfacePoint(pa, pb, 5);
              const dst = surfacePoint(pb, pa, 5);
              const dx = dst.x - src.x, dy = dst.y - src.y;
              refEdges.push({
                fromId: id,
                toId: targetId,
                d: `M${src.x},${src.y} L${dst.x},${dst.y}`,
                dx,
                dy,
                indirect,
              });
            }
            return refEdges.map(({ fromId, toId, d, dx, dy, indirect: ind }) => {
              const len = Math.sqrt(dx * dx + dy * dy);
              const ux = len > 0 ? dx / len : 1, uy = len > 0 ? dy / len : 0;
              const parts = d.split("L");
              const end = parts[1].split(",").map(Number);
              const color = ind ? "#403860" : "#605080";
              return (
                <g key={`ref-${fromId}-${toId}`} style="pointer-events:none;">
                  <path
                    d={d}
                    stroke={color}
                    stroke-width={1}
                    stroke-dasharray={ind ? "2,4" : "4,3"}
                    fill="none"
                    opacity={ind ? 0.6 : 1}
                  />
                  <circle
                    cx={end[0] + ux * 5}
                    cy={end[1] + uy * 5}
                    r={ind ? 2 : 3}
                    fill={color}
                    opacity={ind ? 0.6 : 1}
                  />
                </g>
              );
            });
          })()}
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
      <CanvasTopBar
        ws={ws}
        update={update}
        mode={mode}
        onSetMode={setMode}
        onExecute={onExecute}
        onFitView={fitView}
      />

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
            diagnostics={diagnostics}
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

/**
 * Collect world-space positions and TreeNode references for all visible nodes
 * across all expanded levels. Used for cross-level reference edge rendering.
 */
function collectWorldPositions(
  nodes: TreeNode[],
  levelId: string,
  layout: LayoutMap,
  expandedSet: Set<string>,
  worldOffset: { x: number; y: number },
  out: Map<string, { node: TreeNode; wx: number; wy: number; w: number; h: number }>,
): void {
  const level = layout.get(levelId);
  if (!level) return;
  const posMap = new Map(level.nodes.map((n) => [n.id, n]));
  for (const node of nodes) {
    const pos = posMap.get(node.id);
    if (!pos) continue;
    const wx = worldOffset.x + pos.x;
    const wy = worldOffset.y + pos.y;
    out.set(node.id, { node, wx, wy, w: pos.w, h: pos.h });
    if (expandedSet.has(node.id) && node.kind === "composite") {
      collectWorldPositions(node.children, node.id, layout, expandedSet, { x: wx, y: wy }, out);
    }
  }
}

function renderLevel(
  nodes: TreeNode[],
  levelId: string,
  layout: LayoutMap,
  expandedSet: Set<string>,
  ws: WorkspaceState,
  selectedId: string | null,
  onSelectNode: (id: string) => void,
  onSelectEdge: (id: string) => void,
  onExpand: (id: string) => void,
  onCollapse: (id: string) => void,
  startDrag: StartDragFn,
  interaction: InteractionState,
  worldOffset: { x: number; y: number },
  diagnostics: DiagnosticMap,
  highlightEntityIds: Set<string>,
): unknown {
  const level = layout.get(levelId);
  if (!level) return null;

  const posMap = new Map(level.nodes.map((n) => [n.id, n]));
  const nodeIds = nodes.map((n) => n.id);
  const levelEdgeKeys = getEdgesAtLevel(ws.edges, nodeIds);
  const levelEdges = ws.edges.filter((e) =>
    levelEdgeKeys.some((le) => le.a === e.fromId && le.b === e.toId)
  );

  // All labels in the tree — used to distinguish scope-inferred refs from broken/imported.
  const allLabels = collectAllLabels(ws.treeNodes);

  // Determine which children are input params or output terminals based on
  // the parent's ports. Used to tint nodes with port colors when focused.
  // When levelId is "" (top-level focused view), use the focused node as parent
  const parentNode = (levelId ? findNode(ws.treeNodes, levelId) : null) ??
    (ws.focusId ? findNode(ws.treeNodes, ws.focusId) : null);
  const inputPortNames = new Set(
    (parentNode?.ports ?? []).filter((p) => p.direction === "in").map((p) => p.name),
  );
  const outputPortNames = new Set(
    (parentNode?.ports ?? []).filter((p) => p.direction === "out").map((p) => p.name),
  );
  // A node is an "output terminal" if its label or data.outputPort matches an output port
  const isInputParam = (n: TreeNode) => inputPortNames.has(n.label);
  const isOutputTerminal = (n: TreeNode) =>
    outputPortNames.has(n.label) || outputPortNames.has(n.data.outputPort as string);

  // Effective ports for collapsed nodes — own ports or resolved from ref target.
  const effectivePortsMap = new Map<string, Port[]>();
  for (const node of nodes) {
    if (expandedSet.has(node.id) && node.kind === "composite") continue;
    const ports = resolveNodePorts(node, ws.treeNodes);
    if (ports.length > 0) effectivePortsMap.set(node.id, ports);
  }

  return (
    <>
      {/* Shapes first (nodes and expanded group boxes) */}
      {nodes.map((node) => {
        const pos = posMap.get(node.id);
        if (!pos) return null;
        const isSelected = selectedId === node.id;
        const isExpanded = expandedSet.has(node.id) && node.kind === "composite";

        if (isExpanded) {
          // Expanded: draw tight bounding box around children
          const childLevel = layout.get(node.id);
          const bb = childLevel?.bbox;
          // Rect coordinates in local space (relative to pos.x, pos.y)
          const rx = bb ? bb.minX : -pos.w / 2;
          const ry = bb ? bb.minY - LABEL_H : -pos.h / 2;
          const rw = bb ? bb.w : pos.w;
          const rh = bb ? bb.h + LABEL_H : pos.h;

          // Constraint visual state for expanded group rect
          const groupDiags = diagnostics[node.id] ?? [];
          const groupHasError = groupDiags.some((d) => d.severity === "error");
          const groupHasWarning = !groupHasError &&
            groupDiags.some((d) => d.severity === "warning");
          const groupIsHighlighted = highlightEntityIds.has(node.id);
          const groupStroke = groupHasError
            ? "#c04040"
            : groupHasWarning
            ? "#c08020"
            : isSelected
            ? "#4060b0"
            : groupIsHighlighted
            ? "#50c070"
            : "#1e1e44";
          const groupStrokeWidth = isSelected || groupHasError || groupHasWarning ||
              groupIsHighlighted
            ? 2
            : 1;
          const groupIsRef = isRef(node);
          const groupStrokeDash = refNeedsDash(node, allLabels) ? "6,3" : undefined;

          return (
            <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
              <rect
                x={rx}
                y={ry}
                width={rw}
                height={rh}
                fill={groupHasError ? "#1a0f0f" : groupIsRef ? "#0f0f24" : "#0f0f28"}
                stroke={groupIsRef && !isSelected ? "#605080" : groupStroke}
                stroke-width={groupStrokeWidth}
                stroke-dasharray={groupStrokeDash}
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
                  if (interaction.mode === "add-node") {
                    e.stopPropagation();
                    const cp = interaction.clientToCanvas(e.clientX, e.clientY);
                    interaction.onAddNode(
                      node.id,
                      cp.x - (worldOffset.x + pos.x),
                      cp.y - (worldOffset.y + pos.y),
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
                fill={isSelected ? "#8090c0" : groupHasError ? "#c07070" : "#444466"}
                font-size="11"
                style="user-select:none; pointer-events:none;"
              >
                {node.label}
              </text>
              {(groupHasError || groupHasWarning) && (
                <circle
                  cx={rx + rw - 8}
                  cy={ry + 8}
                  r={5}
                  fill={groupHasError ? "#c04040" : "#c08020"}
                  stroke="#0d0d1e"
                  stroke-width={1}
                  style="pointer-events:none;"
                />
              )}
              {node.ports && node.ports.length > 0 && (
                <g transform={`translate(${rx + rw / 2}, ${ry + rh / 2})`}>
                  <NodePorts
                    ports={rectPortPositions(node.ports, rw / 2, rh / 2, LABEL_H)}
                    showLabels
                  />
                </g>
              )}
              {renderLevel(
                node.children,
                node.id,
                layout,
                expandedSet,
                ws,
                selectedId,
                onSelectNode,
                onSelectEdge,
                onExpand,
                onCollapse,
                startDrag,
                interaction,
                { x: worldOffset.x + pos.x, y: worldOffset.y + pos.y },
                diagnostics,
                highlightEntityIds,
              )}
            </g>
          );
        }

        // Collapsed node — rendered as a circle by default, or rect if constraint specifies
        const isComposite = node.kind === "composite";
        const isRefNode = isRef(node);
        const isRect = pos?.shape === "rect";
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

        // Constraint visual state — fill persists even when selected (stroke shows selection)
        const nodeDiags = diagnostics[node.id] ?? [];
        const hasError = nodeDiags.some((d) => d.severity === "error");
        const hasWarning = !hasError && nodeDiags.some((d) => d.severity === "warning");
        const isHighlighted = highlightEntityIds.has(node.id);
        const isInput = isInputParam(node);
        const isOutput = isOutputTerminal(node);

        const fill = isEdgeSource || isHovered
          ? "#1e2a4a"
          : hasError
          ? "#2a1a1a"
          : isSelected
          ? "#1e2a4a"
          : isRefNode
          ? "#141428"
          : isComposite
          ? "#141430"
          : isInput
          ? "#101828"
          : isOutput
          ? "#181410"
          : "#111125";
        const stroke = isEdgeSource
          ? "#5070c0"
          : isHovered
          ? "#6080e0"
          : hasError
          ? "#c04040"
          : hasWarning
          ? "#c08020"
          : isSelected
          ? "#5070c0"
          : isCandidate
          ? "#3050a0"
          : isHighlighted
          ? "#50c070"
          : isRefNode
          ? "#605080"
          : isInput
          ? "#4080c0"
          : isOutput
          ? "#c06040"
          : isComposite
          ? "#303060"
          : "#252545";
        const strokeDash = refNeedsDash(node, allLabels) ? "3,2" : undefined;
        const strokeWidth = isEdgeSource || isSelected || isHovered
          ? 2
          : isCandidate
          ? 1.5
          : hasError || hasWarning || isHighlighted
          ? 1.5
          : 1;
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
              if (interaction.mode === "add-node") {
                e.stopPropagation();
                const cp = interaction.clientToCanvas(e.clientX, e.clientY);
                interaction.onAddNode(
                  node.id,
                  cp.x - (worldOffset.x + pos.x),
                  cp.y - (worldOffset.y + pos.y),
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
            {isRect
              ? (
                <rect
                  x={-r}
                  y={-r * 0.7}
                  width={r * 2}
                  height={r * 1.4}
                  rx={4}
                  fill={fill}
                  stroke={stroke}
                  stroke-width={strokeWidth}
                  stroke-dasharray={strokeDash}
                />
              )
              : (
                <circle
                  cx={0}
                  cy={0}
                  r={r}
                  fill={fill}
                  stroke={stroke}
                  stroke-width={strokeWidth}
                  stroke-dasharray={strokeDash}
                />
              )}
            {(hasError || hasWarning) && (
              <circle
                cx={r - 2}
                cy={-(isRect ? r * 0.7 - 2 : r - 2)}
                r={5}
                fill={hasError ? "#c04040" : "#c08020"}
                stroke="#0d0d1e"
                stroke-width={1}
                style="pointer-events:none;"
              />
            )}
            {/* Home workspace indicator — small green dot at top-right */}
            {levelId === "" &&
              node.id ===
                (getActiveTab(ws).homeWorkspaceId ?? getActiveTab(ws).rootNodeId) &&
              (
                <circle
                  cx={r - 2}
                  cy={-(isRect ? r * 0.7 - 2 : r - 2)}
                  r={4}
                  fill="#50c070"
                  stroke="#0d0d1e"
                  stroke-width={1}
                  style="pointer-events:none;"
                />
              )}
            {/* Ref indicator — shows target label beneath the node */}
            {isRefNode && (() => {
              const refTarget = node.ref;
              const targetNode = refTarget ? findNode(ws.treeNodes, refTarget) : null;
              const targetLabel = targetNode?.label ?? refTarget ?? "?";
              return (
                <text
                  x={0}
                  y={isRect ? r * 0.7 + 9 : r + 9}
                  text-anchor="middle"
                  fill="#605080"
                  font-size="7"
                  style="user-select:none; pointer-events:none;"
                >
                  {"↗ "}
                  {targetLabel}
                </text>
              );
            })()}
            {(() => {
              const ePorts = effectivePortsMap.get(node.id);
              if (!ePorts || ePorts.length === 0) return null;
              return (
                <NodePorts
                  ports={circlePortPositions(ePorts, r)}
                  showLabels={false}
                />
              );
            })()}
            <text
              x={0}
              y={hasChildren ? -3 : 3}
              text-anchor="middle"
              fill={isSelected ? "#a0b4e0" : isRefNode ? "#9080b0" : "#777799"}
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

        // Port-aware edge routing: pre-compute port positions and edge-to-port mappings.
        const nodeById = new Map(nodes.map((n) => [n.id, n]));
        const nodePortPositions = new Map<string, PortPosition[]>();
        for (const [nodeId, ports] of effectivePortsMap) {
          const pos = posMap.get(nodeId);
          if (!pos) continue;
          const isRect = pos.shape === "rect";
          nodePortPositions.set(
            nodeId,
            isRect
              ? rectPortPositions(ports, LEAF_R, RECT_HALF_H, 0)
              : circlePortPositions(ports, LEAF_R),
          );
        }

        function portSurfacePoint(
          node: { x: number; y: number },
          portPositions: PortPosition[] | undefined,
          portName: string | undefined,
          gap: number,
        ): { x: number; y: number } | undefined {
          if (!portPositions || !portName) return undefined;
          const pp = portPositions.find((p) => p.portName === portName);
          if (!pp) return undefined;
          return {
            x: node.x + pp.x + pp.nx * gap,
            y: node.y + pp.y + pp.ny * gap,
          };
        }

        function resolveEdgePorts(
          edge: Edge,
        ): { srcPort?: string; dstPort?: string } {
          let srcPort: string | undefined;
          let dstPort: string | undefined;

          // Source port: node's data.outputPort or label matching an output port
          const srcNode = nodeById.get(edge.fromId);
          const srcPorts = effectivePortsMap.get(edge.fromId);
          if (srcNode && srcPorts) {
            const op = srcNode.data.outputPort as string | undefined;
            if (op) {
              srcPort = op;
            } else {
              const outPort = srcPorts.find((p) =>
                p.direction === "out" && p.name === srcNode.label
              );
              if (outPort) srcPort = outPort.name;
            }
          }

          // Destination port: match source label against argOrder → input port index
          const dstNode = nodeById.get(edge.toId);
          const dstPorts = effectivePortsMap.get(edge.toId);
          if (dstNode && dstPorts && srcNode) {
            const inPorts = dstPorts.filter((p) => p.direction === "in" || p.direction === "inout");
            const argOrder = dstNode.data.argOrder as string[] | undefined;
            if (argOrder) {
              const argIdx = argOrder.indexOf(srcNode.label);
              if (argIdx >= 0 && argIdx < inPorts.length) {
                dstPort = inPorts[argIdx].name;
              }
            }
            if (!dstPort) {
              // Fallback: match source label to input port name
              const match = inPorts.find((p) => p.name === srcNode.label);
              if (match) dstPort = match.name;
            }
          }

          return { srcPort, dstPort };
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
          isHighlighted: boolean;
          bend?: { x: number; y: number };
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
            const isSrcCollapsed = pa.w === LEAF_W && pa.h === LEAF_H;
            const isDstCollapsed = pb.w === LEAF_W && pb.h === LEAF_H;
            const isSrcRect = isSrcCollapsed && pa.shape === "rect";
            const isDstRect = isDstCollapsed && pb.shape === "rect";
            src = isSrcCollapsed && !isSrcRect
              ? arcClipPoint(edgeArcC, r, pa, LEAF_R + 5, pb)
              : arcClipRect(
                edgeArcC,
                r,
                pa,
                isSrcRect ? LEAF_R : pa.w / 2,
                isSrcRect ? RECT_HALF_H : pa.h / 2,
                5,
                arcSweep,
                pb,
              );
            // Destination: pull back by arrowhead length (10px) past the boundary.
            dst = isDstCollapsed && !isDstRect
              ? arcClipPoint(edgeArcC, r, pb, LEAF_R + 5 + 10, pa)
              // For the destination we want the entry point — travel backward (1-arcSweep) from pb.
              : arcClipRect(
                edgeArcC,
                r,
                pb,
                isDstRect ? LEAF_R : pb.w / 2,
                isDstRect ? RECT_HALF_H : pb.h / 2,
                5 + 10,
                1 - arcSweep,
                pa,
              );
            // arcC was computed from pa→pb, but src/dst are clipped points on that same circle.
            // The SVG sweep flag for src→dst must be derived from arcC directly (cross product).
            // In SVG screen coords (Y-down): positive crossZ → CW rotation → sweep=1.
            const crossZ = (src.x - edgeArcC.x) * (dst.y - edgeArcC.y) -
              (src.y - edgeArcC.y) * (dst.x - edgeArcC.x);
            sweep = crossZ > 0 ? 1 : 0;
          } else {
            const { srcPort, dstPort } = resolveEdgePorts(edge);
            src = portSurfacePoint(pa, nodePortPositions.get(edge.fromId), srcPort, 5) ??
              surfacePoint(pa, pb, 5);
            dst = portSurfacePoint(pb, nodePortPositions.get(edge.toId), dstPort, 15) ??
              surfacePoint(pb, pa, 5 + 10);
          }

          // For straight edges, check if we need to bend around an obstructing node
          const bend = !needsArc
            ? edgeBendPoint(src, dst, level.nodes, [edge.fromId, edge.toId], LEAF_R + 20)
            : undefined;

          const d = needsArc
            ? `M${src.x},${src.y} A${r},${r} 0 0,${sweep} ${dst.x},${dst.y}`
            : bend
            ? `M${src.x},${src.y} Q${bend.x},${bend.y} ${dst.x},${dst.y}`
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
            isSelected: selectedId === edge.id,
            isHighlighted: highlightEntityIds.has(edge.id),
            bend,
          });
        }

        return (
          <>
            {/* Pass 1: all edge paths */}
            {renderData.map(
              (
                { edge, d, src, dst, needsArc, r, sweep, arcC, isSelected, isHighlighted, bend },
              ) => {
                const stroke = isSelected ? "#5070c0" : isHighlighted ? "#50c070" : "#2a2a50";
                const tangent = bend
                  ? (() => {
                    const dx = dst.x - bend.x, dy = dst.y - bend.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    return len > 1e-9 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
                  })()
                  : pathEndTangent(src, dst, needsArc, r, sweep, arcC);
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
              },
            )}
            {/* Pass 2: all labels on top of all paths */}
            {renderData.map(({ edge, src, dst, needsArc, r, sweep, arcC, bend }) => {
              if (!edge.label) return null;
              const lp = needsArc
                ? arcMidpoint(src.x, src.y, dst.x, dst.y, r, sweep, arcC)
                : bend
                ? { x: (src.x + 2 * bend.x + dst.x) / 4, y: (src.y + 2 * bend.y + dst.y) / 4 }
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
