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
import type { CanvasEdge, CanvasNode, CanvasScene } from "@marlinspike/canvas";
import { CIRCLE_GEOMETRY, RECT_GEOMETRY, surfacePoint } from "@marlinspike/canvas";
import type { CanvasPort } from "@marlinspike/canvas";
import type { ForceNode, PortPosition } from "@marlinspike/layout";
import { rectPortPositions, resolveNodePorts } from "@marlinspike/layout";
import type { DiagnosticMap } from "../../graph/diagnostics.ts";

// ---------------------------------------------------------------------------
// Constants (matching canvas.tsx values)
// ---------------------------------------------------------------------------

const LABEL_H = 22;

// ---------------------------------------------------------------------------
// Consumer state type
// ---------------------------------------------------------------------------

/** Visual role — derived from node kind, expansion state, and constraint overrides. */
export type MarlinRole = "leaf" | "container" | "collapsed-subgraph" | "ref" | "leaf-rect";

/** IDE-specific visual state carried on each CanvasNode. */
export interface MarlinNodeState {
  levelId: string;
  role: MarlinRole;
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
  /** Per-element style overrides from constraints, merged over theme defaults. */
  styleOverrides?: import("@marlinspike/canvas").NodeStyleProps;
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
  /** Per-entity style overrides from constraints. */
  styleOverrides?: Map<string, import("@marlinspike/canvas").NodeStyleProps>;
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
    parentComposite: TreeNode | null,
  ): void {
    // Port role identification from the parent composite's declared ports
    const inputPortNames = new Set(
      (parentComposite?.ports ?? []).filter((p: Port) => p.direction === "in").map((p: Port) =>
        p.name
      ),
    );
    const outputPortNames = new Set(
      (parentComposite?.ports ?? []).filter((p: Port) => p.direction === "out").map((p: Port) =>
        p.name
      ),
    );
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

      // Derive visual role from structure + constraints
      const role: MarlinRole = isExpanded
        ? "container"
        : isRefNode
        ? "ref"
        : pos.shape === "rect"
        ? "leaf-rect"
        : (isComposite && hasChildren)
        ? "collapsed-subgraph"
        : "leaf";

      // Resolve geometry from role (containers always rect, leaf-rect from constraints)
      const nodeGeometry = nodeShape === "rect" ? RECT_GEOMETRY : CIRCLE_GEOMETRY;

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
        role,
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
        styleOverrides: opts.styleOverrides?.get(node.id),
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
          geometry: RECT_GEOMETRY,
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
        emitLevel(node.children, node.id, { x: wx, y: wy }, node);
      } else {
        allNodes.push({
          id: node.id,
          x: wx,
          y: wy,
          w: pos.w,
          h: pos.h,
          shape: nodeShape,
          geometry: nodeGeometry,
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
  const focusNode = opts.focusId ? findNode(opts.allTreeNodes, opts.focusId) ?? null : null;
  emitLevel(opts.nodes, "", { x: 0, y: 0 }, focusNode);

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
// Theme — re-export from classic-theme.ts
// ---------------------------------------------------------------------------

export { classicTheme as marlinIdeTheme } from "./classic-theme.ts";
