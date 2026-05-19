/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import {
  collectSubtreeIds,
  type Edge,
  findNode,
  findParentOf,
  findPath,
  isRef,
  type TreeNode,
} from "@marlinspike/graph";
import {
  getActiveTab,
  getFocusedRootNodes,
  getWorkspaceRootId,
  type Panel,
  type Updater,
  type WorkspaceState,
} from "../workspace.ts";
import { EdgeInspector, NodeInspector } from "./inspector.tsx";
import { ConstraintInspector } from "./constraints-panel.tsx";
import type { DiagnosticMap } from "../../graph/diagnostics.ts";
import { Dropdown } from "./dropdown.tsx";
import { SmallBtn } from "./widgets.tsx";
import { type BBox, boundingBox, centerNodes, type ForceNode } from "@marlinspike/layout";
import { rectPortPositions } from "@marlinspike/layout";
import { hitTest, renderScene, renderWith, svgRenderer } from "@marlinspike/canvas";
import type { CanvasNode, CanvasScene, RenderGroup, RenderPrimitive } from "@marlinspike/canvas";
import {
  buildCanvasScene,
  type BuildSceneOptions,
  type CanvasInteractionState,
  marlinIdeTheme,
  type MarlinNodeState,
} from "../lib/canvas-adapter.ts";
import { CLASSIC_CONSTANTS } from "../lib/classic-theme.ts";
import {
  createFIELD,
  createJANK,
  createPORT,
  createSDF,
  createTOPOGRID,
  DEFAULT_FIELD_CONFIG,
  DEFAULT_JANK_CONFIG,
  DEFAULT_PORT_CONFIG,
  DEFAULT_SDF_CONFIG,
  type LayoutAlgorithm,
  topoCharge,
} from "@marlinspike/layout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extensible canvas interaction mode. Add new modes here as needed. */
type CanvasMode = "select" | "add-node" | "add-edge";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Radius of collapsed leaf/composite nodes (circles) */
const LEAF_R = CLASSIC_CONSTANTS.leafRadius;
/** Force-body diameter (used for repulsion body sizing) */
const LEAF_W = LEAF_R * 2;
const LEAF_H = LEAF_R * 2;
/** Padding inside expanded group bounding boxes */
const GROUP_PADDING = CLASSIC_CONSTANTS.groupPadding;
/** Height of the label strip at the top of an expanded group rect */
const LABEL_H = CLASSIC_CONSTANTS.labelH;
const DRAG_THRESHOLD_SQ = 16; // 4px

// ---------------------------------------------------------------------------
// Scene lookup
// ---------------------------------------------------------------------------

/** Find a node by ID in a flat scene. */
function findSceneNode<S>(
  nodes: CanvasNode<S>[],
  id: string,
): CanvasNode<S> | undefined {
  return nodes.find((n) => n.id === id);
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
    // Port positions are relative to the rect center, which coincides with
    // the child-level origin (0,0) — no offset needed.
    pinMap.set(childId, { x: pp.x, y: pp.y });
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

/** Collect child IDs that correspond to ports on the parent node (same logic as pinPortNodes). */
function getPortChildIds(parentNode: TreeNode): Set<string> {
  const result = new Set<string>();
  if (!parentNode.ports || parentNode.ports.length === 0) return result;
  const childByLabel = new Map(parentNode.children.map((c) => [c.label, c.id]));
  const childByOutputPort = new Map<string, string>();
  for (const child of parentNode.children) {
    const outputPort = child.data.outputPort as string | undefined;
    if (outputPort) childByOutputPort.set(outputPort, child.id);
  }
  const claimed = new Set<string>();
  // Output ports
  for (const port of parentNode.ports) {
    if (port.direction !== "out") continue;
    const childId = childByOutputPort.get(port.name) ?? childByLabel.get(port.name);
    if (childId && !claimed.has(childId)) {
      claimed.add(childId);
      result.add(childId);
    }
  }
  // Input ports
  for (const port of parentNode.ports) {
    if (port.direction === "out") continue;
    const childId = childByLabel.get(port.name);
    if (childId && !claimed.has(childId)) {
      claimed.add(childId);
      result.add(childId);
    }
  }
  return result;
}

/**
 * Build or rebuild a level's node list.
 * Always recomputes w/h from current expansion state so that collapsing a node
 * immediately gives it the correct (small) body size.
 *
 * `portChildIds` — IDs of children that will be hard-pinned to port boundary
 * positions by pinPortNodes. For PORT algorithm these are excluded from the
 * topogrid so they don't waste layer columns; they're placed at the origin
 * and will be repositioned on the first tick.
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
  portChildIds?: Set<string>,
): LevelState {
  const prevMap = new Map(prev?.nodes.map((n) => [n.id, n]) ?? []);
  const defaults = new Map(Object.entries(pinnedPositions));

  // For PORT: exclude port-pinned children from topogrid so they don't occupy
  // layer columns. They get hard-pinned by pinPortNodes on first tick.
  let layoutIds = ids;
  let layoutEdges = levelEdges;
  if (portChildIds && portChildIds.size > 0 && algorithm.id === "PORT") {
    layoutIds = ids.filter((id) => !portChildIds.has(id));
    layoutEdges = levelEdges.filter(
      (e) => !portChildIds.has(e.a) && !portChildIds.has(e.b),
    );
  }

  const rawPositions = algorithm.initNodes(layoutIds, layoutEdges, LEAF_W, LEAF_H, defaults);

  // Add back port-child nodes at origin (they'll be pinned by pinPortNodes)
  if (portChildIds && portChildIds.size > 0 && algorithm.id === "PORT") {
    for (const id of ids) {
      if (portChildIds.has(id) && !rawPositions.some((n) => n.id === id)) {
        rawPositions.push({ id, x: 0, y: 0, vx: 0, vy: 0, pinned: false, w: LEAF_W, h: LEAF_H });
      }
    }
  }

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
    // Identify port-child nodes that will be hard-pinned by pinPortNodes
    const portChildren = getPortChildIds(node);
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
        portChildren,
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

/** Augment edges with pseudo-edges for ref→target relationships (PORT only). */
function injectRefPseudoEdges(
  edges: { a: string; b: string }[],
  forceNodes: ForceNode[],
  levelTreeNodes: TreeNode[],
): { a: string; b: string }[] {
  const fnIds = new Set(forceNodes.map((n) => n.id));
  const labelToId = new Map<string, string>();
  for (const tn of levelTreeNodes) {
    if (fnIds.has(tn.id)) labelToId.set(tn.label, tn.id);
  }

  const extra: { a: string; b: string }[] = [];
  for (const tn of levelTreeNodes) {
    if (!fnIds.has(tn.id) || !isRef(tn) || !tn.ref) continue;
    const targetId = labelToId.get(tn.ref);
    if (targetId && targetId !== tn.id) {
      extra.push({ a: tn.id, b: targetId });
    }
  }
  return extra.length > 0 ? [...edges, ...extra] : edges;
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

    // Inject ref pseudo-edges for PORT so disconnected ref subgraphs attract
    const tickEdges = algorithm.id === "PORT"
      ? injectRefPseudoEdges(levelEdges, nodesWithPins, node.children)
      : levelEdges;

    const { nodes: ticked, settled } = algorithm.tick(nodesWithPins, tickEdges, level.ticks);
    const centered = centerNodes(ticked);
    // Re-pin port children after centering — centerNodes shifts all nodes,
    // which moves port children away from their correct boundary positions.
    const repinned = pinPortNodes(centered, node, next, treeNodes);
    // Compute bounding box from interior (non-anchored) nodes only. When all
    // children are port-pinned, use empty list → fallback box. Port children
    // derive positions FROM parent dimensions; they must not determine them.
    const interior = repinned.filter((n) => !n.anchor);
    const bb = boundingBox(interior.length > 0 ? interior : [], GROUP_PADDING);
    next.set(nodeId, { nodes: repinned, settled, ticks: level.ticks + 1, bbox: bb });

    // Ensure expanded groups with ports are large enough for port children.
    const nodeTreeNode = findNode(treeNodes, nodeId);
    const ports = nodeTreeNode?.ports ?? [];
    const nIn = ports.filter((p) => p.direction === "in" || p.direction === "inout").length;
    const nOut = ports.filter((p) => p.direction === "out").length;
    const nPorts = ports.length;
    const minPortW = nPorts > 0 ? LEAF_W * 4 + GROUP_PADDING : LEAF_W * 2 + GROUP_PADDING;
    // Height must fit the tallest column of ports (each needs LEAF_H + gap)
    const maxPerSide = Math.max(nIn, nOut);
    const minPortH = maxPerSide > 0
      ? maxPerSide * (LEAF_H + 10) + LABEL_H + GROUP_PADDING
      : LEAF_H * 2 + GROUP_PADDING;
    const gw = Math.max(bb.w, minPortW);
    const gh = Math.max(bb.h + LABEL_H, minPortH);

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
      // When parent dimensions change, also unsettle this child level so
      // pinPortNodes runs again with the correct parent dimensions.
      if (sizeChanged) {
        const childLevel = next.get(nodeId);
        if (childLevel) next.set(nodeId, { ...childLevel, settled: false });
      }
    }
  }

  const rootLevel = next.get("");
  if (rootLevel && !rootLevel.settled) {
    const rootEdges = getEdgesAtLevel(edges, treeNodes.map((n) => n.id));
    const rootTickEdges = algorithm.id === "PORT"
      ? injectRefPseudoEdges(rootEdges, rootLevel.nodes, treeNodes)
      : rootEdges;
    const { nodes: ticked, settled } = algorithm.tick(
      rootLevel.nodes,
      rootTickEdges,
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
  if (id === "PORT") return createPORT(DEFAULT_PORT_CONFIG);
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
          { value: "PORT", label: "PORT" },
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
  const renderRootRef = useRef<RenderGroup | null>(null);
  const sceneRef = useRef<CanvasScene<MarlinNodeState> | null>(null);
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

  // Compute per-entity style overrides from constraint.style
  const styleOverridesMap = new Map<
    string,
    import("@marlinspike/canvas").NodeStyleProps
  >();
  for (const app of ws.constraintApplications) {
    const constraint = ws.constraints.find((c) => c.id === app.constraintId);
    if (constraint?.style) {
      const existing = styleOverridesMap.get(app.entityId);
      styleOverridesMap.set(
        app.entityId,
        existing ? { ...existing, ...constraint.style } : constraint.style,
      );
    }
  }
  // Derive shapeMap for layout system (needs "circle"|"rect" for ForceNode.shape)
  const shapeMap = new Map<string, "circle" | "rect">();
  for (const [id, props] of styleOverridesMap) {
    if (props.geometry === "rect" || props.geometry === "circle") {
      shapeMap.set(id, props.geometry);
    }
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
        if (panRef.current) {
          panRef.current = null;
          document.body.style.cursor = "";
        }
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05;
        setView((v) => {
          const newScale = Math.max(0.1, Math.min(5, v.scale * factor));
          if (newScale === v.scale) return v; // skip re-render when clamped
          const canvasX = (mx - v.tx) / v.scale;
          const canvasY = (my - v.ty) / v.scale;
          return { scale: newScale, tx: mx - canvasX * newScale, ty: my - canvasY * newScale };
        });
      } else {
        // Two-finger scroll → pan
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
        const newScale = Math.max(0.1, Math.min(5, state.origView.scale * factor));

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
    const canvasPos = clientToCanvas(e.clientX, e.clientY);
    const hit = hitTest(renderRootRef.current!, canvasPos);
    const node = hit ? findSceneNode(sceneRef.current!.nodes, hit.id) : undefined;

    if (modeRef.current === "add-edge") {
      if (hit && node) {
        // Clicked a node — use as edge source/target
        onEdgeNodeClick(hit.id, node.x, node.y, node.state!.levelId);
      } else {
        // Background click: return to select mode
        setEdgeDraw(null);
        setMode("select");
        update((s) => ({ ...s, canvasSelected: null }));
      }
      return;
    }
    if (modeRef.current === "add-node") {
      if (node && node.state?.isContainerBackground) {
        // Clicked inside expanded container — add child relative to container
        addNode(hit!.id, canvasPos.x - node.x, canvasPos.y - node.y);
      } else {
        addNode(null, canvasPos.x, canvasPos.y);
      }
      return;
    }

    // Select mode
    if (hit && node) {
      // Start drag on node
      dragRef.current = {
        nodeId: hit.id,
        levelId: node.state!.levelId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: node.x,
        origY: node.y,
        hasMoved: false,
        onClickFn: () => selectNode(hit.id),
      };
    } else if (hit && !node) {
      // Clicked an edge
      selectEdge(hit.id);
    } else {
      // Background click — start pan
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origTx: viewRef.current!.tx,
        origTy: viewRef.current!.ty,
        hasMoved: false,
      };
      document.body.style.cursor = "none";
    }
  }

  function onSvgMouseMove(e: MouseEvent) {
    if (modeRef.current === "add-edge") {
      const el = svgRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const v = viewRef.current!;
      const mx = (e.clientX - rect.left - v.tx) / v.scale;
      const my = (e.clientY - rect.top - v.ty) / v.scale;
      setMouseCanvas({ x: mx, y: my });
      // Hover detection for edge-draw candidates
      const hit = hitTest(renderRootRef.current!, { x: mx, y: my });
      const node = hit ? findSceneNode(sceneRef.current!.nodes, hit.id) : undefined;
      setHoveredNodeId(node ? hit!.id : null);
    }
  }

  function onSvgDblClick(e: MouseEvent) {
    const canvasPos = clientToCanvas(e.clientX, e.clientY);
    const hit = hitTest(renderRootRef.current!, canvasPos);
    if (!hit) return;
    const node = findSceneNode(sceneRef.current!.nodes, hit.id);
    if (!node) return;
    if (node.state?.isContainerBackground) {
      collapseNode(hit.id);
    } else if (node.state?.isComposite) {
      expandNode(hit.id);
    }
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

  // Build canvas scene via adapter
  const canvasInteraction: CanvasInteractionState = {
    mode,
    edgeDrawFromId: edgeDraw?.fromId ?? null,
    edgeDrawLevelId: edgeDraw?.levelId ?? null,
    hoveredNodeId,
  };
  const sceneOpts: BuildSceneOptions = {
    nodes: focusedRootNodes,
    edges: ws.edges,
    layout: layout as unknown as import("../lib/canvas-adapter.ts").LayoutMap,
    expandedSet,
    selectedId,
    interaction: canvasInteraction,
    diagnostics,
    highlightEntityIds: highlightEntityIds ?? new Set(),
    allTreeNodes: ws.treeNodes,
    focusId: ws.focusId,
    showRefEdges: ws.canvasShowRefEdges,
    styleOverrides: styleOverridesMap,
  };
  const canvasScene = buildCanvasScene(sceneOpts);
  const renderRoot: RenderGroup = renderScene(canvasScene, marlinIdeTheme);

  // Append ghost edge (UI-layer, changes every mouse move)
  const ghost = ghostEdgePrimitive(mode, edgeDraw, mouseCanvas);
  if (ghost) renderRoot.children.push(ghost);

  const [svgContent] = renderWith(svgRenderer, renderRoot);
  // Update refs so event handlers can access current values
  renderRootRef.current = renderRoot;
  sceneRef.current = canvasScene;

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
        onDblClick={onSvgDblClick}
      >
        <g
          transform={`translate(${view.tx}, ${view.ty}) scale(${view.scale})`}
          style="pointer-events:none;"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
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
// Ghost edge primitive (UI-layer — changes every mouse move during edge-draw)
// ---------------------------------------------------------------------------

/** Produce a render primitive for the ghost edge shown while drawing a new edge. */
function ghostEdgePrimitive(
  mode: string,
  edgeDraw: { fromId: string; x: number; y: number; levelId: string } | null,
  mouseCanvas: { x: number; y: number } | null,
): RenderPrimitive | null {
  if (mode !== "add-edge" || !edgeDraw || !mouseCanvas) return null;
  const gdx = mouseCanvas.x - edgeDraw.x;
  const gdy = mouseCanvas.y - edgeDraw.y;
  const gd = Math.sqrt(gdx * gdx + gdy * gdy);
  const gp = gd < 0.001
    ? { x: edgeDraw.x, y: edgeDraw.y }
    : { x: edgeDraw.x + gdx / gd * (LEAF_R + 5), y: edgeDraw.y + gdy / gd * (LEAF_R + 5) };
  return {
    kind: "path",
    d: `M${gp.x},${gp.y} L${mouseCanvas.x},${mouseCanvas.y}`,
    stroke: "#5070c0",
    strokeWidth: 1.5,
    fill: "none",
    strokeDash: "6 4",
  };
}
