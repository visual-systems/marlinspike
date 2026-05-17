/**
 * Canvas adapter — maps workspace state to a flat CanvasScene for rendering
 * via @marlinspike/canvas.
 *
 * The adapter flattens the IDE's hierarchical tree into world-space positioned
 * elements. Expanded containers become a background rect node (behind) plus
 * child nodes at world-space coordinates. Array order = z-order.
 *
 * Uses the generic CanvasNode<MarlinNodeState> to carry IDE-specific
 * visual state through to theme resolvers with full type safety.
 */

import type { Edge, Port, TreeNode } from "@marlinspike/graph";
import { findNode, isRef } from "@marlinspike/graph";
import type {
  CanvasEdge,
  CanvasNode,
  CanvasScene,
  CanvasTheme,
  EdgeStyle,
  NodeStyle,
  PortStyle,
  RenderPrimitive,
} from "@marlinspike/canvas";
import { surfacePoint } from "@marlinspike/canvas";
import type { CanvasPort } from "@marlinspike/canvas";
import type { PortPosition } from "./port-layout.ts";
import type { ForceNode } from "./force.ts";
import { rectPortPositions, resolveNodePorts } from "./port-layout.ts";
import type { DiagnosticMap } from "../../graph/diagnostics.ts";

// ---------------------------------------------------------------------------
// Constants (matching canvas.tsx values)
// ---------------------------------------------------------------------------

const LEAF_R = 26;
const LABEL_H = 22;

// ---------------------------------------------------------------------------
// Consumer state type
// ---------------------------------------------------------------------------

/** IDE-specific visual state carried on each CanvasNode. */
export interface MarlinNodeState {
  levelId: string;
  isRef: boolean;
  isComposite: boolean;
  hasChildren: boolean;
  isInput: boolean;
  isOutput: boolean;
  isEdgeSource: boolean;
  isCandidate: boolean;
  isInactive: boolean;
  isHovered: boolean;
  hasError: boolean;
  hasWarning: boolean;
  childrenCount: number;
  edgePortDots: Array<{ x: number; y: number; out: boolean }>;
  refTarget?: string;
  /** True for the background rect of an expanded container (not a real tree node). */
  isContainerBackground: boolean;
  /** Original label for container backgrounds (since node.label is "" to suppress default). */
  containerLabel?: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Layout state for a single level. */
export interface LevelLayout {
  nodes: ForceNode[];
}

/** parentId → LevelLayout. Root level keyed by "". */
export type LayoutMap = Map<string, LevelLayout>;

/** Interaction state passed to the adapter for visual encoding. */
export interface CanvasInteractionState {
  mode: "select" | "add-node" | "add-edge";
  edgeDrawFromId: string | null;
  edgeDrawLevelId: string | null;
  hoveredNodeId: string | null;
}

/** Options for building the scene. */
export interface BuildSceneOptions {
  nodes: TreeNode[];
  edges: Edge[];
  layout: LayoutMap;
  expandedSet: Set<string>;
  selectedId: string | null;
  interaction: CanvasInteractionState;
  diagnostics: DiagnosticMap;
  highlightEntityIds: Set<string>;
  allTreeNodes: TreeNode[];
  focusId: string | null;
  showRefEdges?: boolean;
}

// ---------------------------------------------------------------------------
// Scene builder helpers
// ---------------------------------------------------------------------------

/** Collect all labels in the tree (for ref dash determination). */
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

/** Determine if a ref node should have a dashed stroke. */
function refNeedsDash(node: TreeNode, allLabels: Set<string>): boolean {
  if (!isRef(node) || !node.ref) return false;
  if (!node.data.fn) return true;
  if (node.ref.startsWith("spike://")) return true;
  if (!allLabels.has(node.ref)) return true;
  return false;
}

function getEdgesAtLevel(edges: Edge[], nodeIds: string[]): Edge[] {
  const idSet = new Set(nodeIds);
  return edges.filter((e) => idSet.has(e.fromId) && idSet.has(e.toId));
}

// ---------------------------------------------------------------------------
// Flat scene builder
// ---------------------------------------------------------------------------

/**
 * Build a flat CanvasScene from workspace state.
 *
 * Walks the hierarchy and emits all nodes in world-space coordinates.
 * Expanded containers become a background rect + children as top-level nodes.
 * Array order = z-order (backgrounds before children).
 */
export function buildCanvasScene(opts: BuildSceneOptions): CanvasScene<MarlinNodeState> {
  const allLabels = collectAllLabels(opts.allTreeNodes);
  const allNodes: CanvasNode<MarlinNodeState>[] = [];
  const allEdges: CanvasEdge[] = [];

  // Determine port role colors (input/output params of focused composite)
  const parentNode = opts.focusId ? findNode(opts.allTreeNodes, opts.focusId) : null;
  const inputPortNames = new Set(
    (parentNode?.ports ?? []).filter((p: Port) => p.direction === "in").map((p: Port) => p.name),
  );
  const outputPortNames = new Set(
    (parentNode?.ports ?? []).filter((p: Port) => p.direction === "out").map((p: Port) => p.name),
  );

  // Index tree for ref-edge ancestor traversal
  const parentOf = new Map<string, string>();
  const allTreeNodeIds = new Set<string>();
  function indexTree(nodes: TreeNode[], parentId: string | null) {
    for (const n of nodes) {
      allTreeNodeIds.add(n.id);
      if (parentId) parentOf.set(n.id, parentId);
      indexTree(n.children, n.id);
    }
  }
  indexTree(opts.nodes, null);

  // Track world positions for ref edge resolution
  const worldPos = new Map<
    string,
    { node: TreeNode; wx: number; wy: number; w: number; h: number; shape: "circle" | "rect" }
  >();

  // Map labels to node IDs for ref resolution (non-ref nodes only)
  const labelToId = new Map<string, string>();

  function emitLevel(
    treeNodes: TreeNode[],
    levelId: string,
    worldOffset: { x: number; y: number },
  ): void {
    const level = opts.layout.get(levelId);
    if (!level) return;

    const posMap = new Map(level.nodes.map((n) => [n.id, n]));
    const nodeIds = treeNodes.map((n) => n.id);
    const levelEdges = getEdgesAtLevel(opts.edges, nodeIds);

    // Effective ports for collapsed nodes
    const effectivePortsMap = new Map<string, Port[]>();
    for (const node of treeNodes) {
      if (opts.expandedSet.has(node.id) && node.kind === "composite") continue;
      const ports = resolveNodePorts(node, opts.allTreeNodes);
      if (ports.length > 0) effectivePortsMap.set(node.id, ports);
    }

    // Edge-derived port dots (need world-space positions for surfacePoint)
    const edgePortDots = new Map<string, { x: number; y: number; out: boolean }[]>();
    for (const edge of levelEdges) {
      const pa = posMap.get(edge.fromId);
      const pb = posMap.get(edge.toId);
      if (!pa || !pb) continue;
      if (effectivePortsMap.has(edge.fromId)) {
        const bp = surfacePoint(
          pa as unknown as CanvasNode<unknown>,
          pb as unknown as CanvasNode<unknown>,
          0,
        );
        if (!edgePortDots.has(edge.fromId)) edgePortDots.set(edge.fromId, []);
        edgePortDots.get(edge.fromId)!.push({ x: bp.x - pa.x, y: bp.y - pa.y, out: true });
      }
      if (effectivePortsMap.has(edge.toId)) {
        const bp = surfacePoint(
          pb as unknown as CanvasNode<unknown>,
          pa as unknown as CanvasNode<unknown>,
          0,
        );
        if (!edgePortDots.has(edge.toId)) edgePortDots.set(edge.toId, []);
        edgePortDots.get(edge.toId)!.push({ x: bp.x - pb.x, y: bp.y - pb.y, out: false });
      }
    }

    for (const node of treeNodes) {
      const pos = posMap.get(node.id);
      if (!pos) continue;

      const wx = worldOffset.x + pos.x;
      const wy = worldOffset.y + pos.y;
      const isExpanded = opts.expandedSet.has(node.id) && node.kind === "composite";
      const isSelected = opts.selectedId === node.id;
      const isHighlighted = opts.highlightEntityIds.has(node.id);
      const isRefNode = isRef(node);
      const isDashed = refNeedsDash(node, allLabels);
      const isComposite = node.kind === "composite";
      const hasChildren = isComposite && node.children.length > 0;
      const isInput = inputPortNames.has(node.label);
      const isOutput = outputPortNames.has(node.label) ||
        outputPortNames.has(node.data.outputPort as string);
      const nodeShape: "circle" | "rect" = isExpanded
        ? "rect"
        : (pos.shape === "rect" ? "rect" : "circle");

      // Track world position for ref edge resolution
      worldPos.set(node.id, { node, wx, wy, w: pos.w, h: pos.h, shape: nodeShape });
      if (node.type !== "ref") labelToId.set(node.label, node.id);

      // Edge-draw interaction state
      const isEdgeSource = node.id === opts.interaction.edgeDrawFromId;
      const hasSourceSelected = opts.interaction.edgeDrawFromId !== null;
      const sameLevel = opts.interaction.edgeDrawLevelId === levelId;
      const isCandidate = opts.interaction.mode === "add-edge" && treeNodes.length > 1 &&
        !isEdgeSource && (!hasSourceSelected || sameLevel);
      const isInactive = opts.interaction.mode === "add-edge" && hasSourceSelected &&
        !isEdgeSource && !isCandidate;
      const isHovered = opts.interaction.hoveredNodeId === node.id && isCandidate;

      // Diagnostics
      const nodeDiags = opts.diagnostics[node.id] ?? [];
      const hasError = nodeDiags.some((d) => d.severity === "error");
      const hasWarning = !hasError && nodeDiags.some((d) => d.severity === "warning");

      const baseState: MarlinNodeState = {
        levelId,
        isRef: isRefNode,
        isComposite,
        hasChildren,
        isInput,
        isOutput,
        isEdgeSource,
        isCandidate,
        isInactive,
        isHovered,
        hasError,
        hasWarning,
        childrenCount: hasChildren ? node.children.length : 0,
        edgePortDots: edgePortDots.get(node.id) ?? [],
        refTarget: isRefNode && node.ref
          ? (findNode(opts.allTreeNodes, node.ref)?.label ?? node.ref)
          : undefined,
        isContainerBackground: false,
      };

      if (isExpanded) {
        // Resolve ports for the container
        let ports: CanvasPort[] | undefined;
        if (node.ports && node.ports.length > 0) {
          const positions = rectPortPositions(node.ports, pos.w / 2, pos.h / 2, LABEL_H);
          ports = positions.map((p: PortPosition) => ({
            name: p.portName,
            direction: p.direction,
            type: p.type,
            x: p.x,
            y: p.y,
            nx: p.nx,
            ny: p.ny,
          }));
        }

        // Emit container background (z-order: before children)
        allNodes.push({
          id: node.id,
          x: wx,
          y: wy,
          w: pos.w,
          h: pos.h,
          shape: "rect",
          label: "", // suppresses default centered label
          selected: isSelected,
          highlighted: isHighlighted,
          dashed: isDashed,
          ports,
          state: {
            ...baseState,
            isContainerBackground: true,
            containerLabel: node.label,
          },
        });

        // Recurse into children (they'll be emitted after the background)
        emitLevel(node.children, node.id, { x: wx, y: wy });
      } else {
        allNodes.push({
          id: node.id,
          x: wx,
          y: wy,
          w: pos.w,
          h: pos.h,
          shape: nodeShape,
          label: node.label,
          selected: isSelected,
          highlighted: isHighlighted,
          dashed: isDashed,
          state: baseState,
        });
      }
    }

    // Emit edges for this level (world-space: fromId/toId reference world-space nodes)
    for (const e of levelEdges) {
      allEdges.push({
        id: e.id,
        fromId: e.fromId,
        toId: e.toId,
        label: e.label,
        selected: opts.selectedId === e.id,
        highlighted: opts.highlightEntityIds.has(e.id),
      });
    }
  }

  // Emit all levels starting from root
  emitLevel(opts.nodes, "", { x: 0, y: 0 });

  // Emit ref edges as regular edges
  function nearestVisibleAncestor(nodeId: string): string | undefined {
    let cur = parentOf.get(nodeId);
    while (cur) {
      if (worldPos.has(cur)) return cur;
      cur = parentOf.get(cur);
    }
    return undefined;
  }

  if (opts.showRefEdges) {
    let refIdx = 0;
    for (const [id, { node }] of worldPos) {
      if (node.type !== "ref" || !node.ref) continue;

      let targetId = worldPos.has(node.ref) ? node.ref : labelToId.get(node.ref);
      let indirect = false;

      if (!targetId) {
        const exactId = allTreeNodeIds.has(node.ref) ? node.ref : undefined;
        if (exactId) {
          targetId = nearestVisibleAncestor(exactId);
          indirect = true;
        }
      }
      if (!targetId || targetId === id) continue;

      allEdges.push({
        id: `ref-edge-${refIdx++}`,
        fromId: id,
        toId: targetId,
        interactive: false,
        kind: indirect ? "ref-indirect" : "ref-direct",
      });
    }
  }

  return { nodes: allNodes, edges: allEdges };
}

// ---------------------------------------------------------------------------
// Marlinspike IDE theme — typed state access, no casting
// ---------------------------------------------------------------------------

function resolveNodeStyle(node: CanvasNode<MarlinNodeState>): NodeStyle {
  const s = node.state!;
  const { selected, highlighted } = node;

  // Container backgrounds have distinct styling
  if (s.isContainerBackground) {
    let fill = s.isRef ? "#0f0f24" : "#0f0f28";
    if (s.hasError) fill = "#1a0f0f";

    let stroke = "#1e1e44";
    if (s.hasError) stroke = "#c04040";
    else if (s.hasWarning) stroke = "#c08020";
    else if (selected) stroke = "#4060b0";
    else if (highlighted) stroke = "#50c070";
    else if (s.isRef) stroke = "#605080";

    let strokeWidth = 1;
    if (selected || s.hasError || s.hasWarning || highlighted) strokeWidth = 2;

    return {
      fill,
      stroke,
      strokeWidth,
      labelFill: "transparent", // label rendered via decorations
      labelFont: "sans-serif",
      labelSize: 11,
    };
  }

  // Fill
  let fill = "#111125";
  if (s.isEdgeSource || s.isHovered) fill = "#1e2a4a";
  else if (s.hasError) fill = "#2a1a1a";
  else if (selected) fill = "#1e2a4a";
  else if (s.isRef) fill = "#141428";
  else if (s.isComposite) fill = "#141430";
  else if (s.isInput) fill = "#101828";
  else if (s.isOutput) fill = "#181410";

  // Stroke
  let stroke = "#252545";
  if (s.isEdgeSource) stroke = "#5070c0";
  else if (s.isHovered) stroke = "#6080e0";
  else if (s.hasError) stroke = "#c04040";
  else if (s.hasWarning) stroke = "#c08020";
  else if (selected) stroke = "#5070c0";
  else if (s.isCandidate) stroke = "#3050a0";
  else if (highlighted) stroke = "#50c070";
  else if (s.isRef) stroke = "#605080";
  else if (s.isInput) stroke = "#4080c0";
  else if (s.isOutput) stroke = "#c06040";
  else if (s.isComposite) stroke = "#303060";

  // Stroke width
  let strokeWidth = 1;
  if (s.isEdgeSource || selected || s.isHovered) strokeWidth = 2;
  else if (s.isCandidate || s.hasError || s.hasWarning || highlighted) strokeWidth = 1.5;

  // Label
  const labelFill = selected ? "#a0b4e0" : s.isRef ? "#9080b0" : "#777799";

  return {
    fill,
    stroke,
    strokeWidth,
    labelFill,
    labelFont: "sans-serif",
    labelSize: 9,
    opacity: s.isInactive ? 0.3 : undefined,
  };
}

function resolveEdgeStyle(edge: CanvasEdge): EdgeStyle {
  // Ref edges
  if (edge.kind === "ref-direct") {
    return {
      stroke: "#605080",
      strokeWidth: 1,
      arrowSize: 10,
      labelFill: "#556",
      labelFont: "sans-serif",
      labelSize: 10,
      strokeDash: "4,3",
      endCap: "dot",
    };
  }
  if (edge.kind === "ref-indirect") {
    return {
      stroke: "#403860",
      strokeWidth: 1,
      arrowSize: 10,
      labelFill: "#556",
      labelFont: "sans-serif",
      labelSize: 10,
      strokeDash: "2,4",
      opacity: 0.6,
      endCap: "dot",
    };
  }

  const stroke = edge.selected ? "#5070c0" : edge.highlighted ? "#50c070" : "#2a2a50";
  const strokeWidth = edge.selected ? 2 : 1;
  return {
    stroke,
    strokeWidth,
    arrowSize: 10,
    labelFill: "#556",
    labelFont: "sans-serif",
    labelSize: 10,
  };
}

function resolvePortStyle(port: CanvasPort, _node: CanvasNode<MarlinNodeState>): PortStyle {
  const isOut = port.direction === "out";
  return {
    fill: isOut ? "#cc8844" : "#6688cc",
    stroke: "none",
    radius: 3,
  };
}

/** Produce decorations: diagnostic badges, ref indicators, children count, port dots, container labels. */
function resolveDecorations(node: CanvasNode<MarlinNodeState>): RenderPrimitive[] {
  const s = node.state!;
  const prims: RenderPrimitive[] = [];
  const isRect = node.shape === "rect";
  const r = Math.min(node.w, node.h) / 2;

  // Container background: top-left label
  if (s.isContainerBackground && s.containerLabel) {
    const halfW = node.w / 2;
    const halfH = node.h / 2;
    const labelFill = node.selected ? "#8090c0" : s.hasError ? "#c07070" : "#444466";
    prims.push({
      kind: "text",
      x: -halfW + 10,
      y: -halfH + 16,
      text: s.containerLabel,
      fill: labelFill,
      fontSize: 11,
      fontFamily: "sans-serif",
      anchor: "start",
    });
    // Container backgrounds don't get other decorations
    return prims;
  }

  // Children count badge
  if (s.hasChildren && s.childrenCount > 0) {
    prims.push({
      kind: "text",
      x: 0,
      y: 10,
      text: `(${s.childrenCount})`,
      fill: node.selected ? "#6070a0" : "#3a3a60",
      fontSize: 8,
      anchor: "middle",
    });
  }

  // Error/warning badge
  if (s.hasError || s.hasWarning) {
    const badgeY = -(isRect ? LEAF_R * 0.7 - 2 : r - 2);
    prims.push({
      kind: "circle",
      cx: r - 2,
      cy: badgeY,
      r: 5,
      fill: s.hasError ? "#c04040" : "#c08020",
      stroke: "#0d0d1e",
      strokeWidth: 1,
    });
  }

  // Ref indicator text
  if (s.refTarget) {
    const labelY = isRect ? LEAF_R * 0.7 + 9 : r + 9;
    prims.push({
      kind: "text",
      x: 0,
      y: labelY,
      text: `\u2197 ${s.refTarget}`,
      fill: "#605080",
      fontSize: 7,
      anchor: "middle",
    });
  }

  // Edge-derived port dots
  for (const dot of s.edgePortDots) {
    prims.push({
      kind: "circle",
      cx: dot.x,
      cy: dot.y,
      r: 3,
      fill: dot.out ? "#cc8844" : "#6688cc",
      stroke: "none",
      strokeWidth: 0,
    });
  }

  return prims;
}

/** Full Marlinspike IDE theme — typed state access, no casting. */
export const marlinIdeTheme: CanvasTheme<MarlinNodeState> = {
  node: resolveNodeStyle,
  edge: resolveEdgeStyle,
  port: resolvePortStyle,
  decorations: resolveDecorations,
  background: "#0d0d1e",
};
