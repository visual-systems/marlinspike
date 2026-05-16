/**
 * Canvas adapter — maps workspace state to a CanvasScene for rendering
 * via @marlinspike/canvas.
 *
 * This bridges the IDE's workspace model (TreeNode[], LayoutMap, expandedSet,
 * diagnostics, interaction state) into the canvas package's pure data model.
 */

import type { Edge, Port, TreeNode } from "@marlinspike/graph";
import { findNode, isRef } from "@marlinspike/graph";
import type {
  CanvasEdge,
  CanvasNode,
  CanvasScene,
  CanvasTheme,
  ContainerStyle,
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
}

// ---------------------------------------------------------------------------
// Scene builder
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

function getEdgesAtLevel(edges: Edge[], nodeIds: string[]): { a: string; b: string }[] {
  const idSet = new Set(nodeIds);
  return edges
    .filter((e) => idSet.has(e.fromId) && idSet.has(e.toId))
    .map((e) => ({ a: e.fromId, b: e.toId }));
}

/**
 * Build a hierarchical CanvasScene from workspace state.
 *
 * Each expanded composite becomes a container node with children.
 * Visual state (diagnostics, ref, interaction mode, selection) is encoded
 * in `node.data` for theme resolution.
 */
export function buildCanvasScene(opts: BuildSceneOptions): CanvasScene {
  const allLabels = collectAllLabels(opts.allTreeNodes);

  // Determine port role colors (input/output params of focused composite)
  const parentNode = opts.focusId ? findNode(opts.allTreeNodes, opts.focusId) : null;
  const inputPortNames = new Set(
    (parentNode?.ports ?? []).filter((p: Port) => p.direction === "in").map((p: Port) => p.name),
  );
  const outputPortNames = new Set(
    (parentNode?.ports ?? []).filter((p: Port) => p.direction === "out").map((p: Port) => p.name),
  );

  function buildLevel(
    treeNodes: TreeNode[],
    levelId: string,
  ): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
    const level = opts.layout.get(levelId);
    if (!level) return { nodes: [], edges: [] };

    const posMap = new Map(level.nodes.map((n) => [n.id, n]));
    const nodeIds = treeNodes.map((n) => n.id);
    const levelEdgeKeys = getEdgesAtLevel(opts.edges, nodeIds);
    const levelEdges = opts.edges.filter((e) =>
      levelEdgeKeys.some((le) => le.a === e.fromId && le.b === e.toId)
    );

    // Effective ports for collapsed nodes
    const effectivePortsMap = new Map<string, Port[]>();
    for (const node of treeNodes) {
      if (opts.expandedSet.has(node.id) && node.kind === "composite") continue;
      const ports = resolveNodePorts(node, opts.allTreeNodes);
      if (ports.length > 0) effectivePortsMap.set(node.id, ports);
    }

    // Edge-derived port dots
    const edgePortDots = new Map<string, { x: number; y: number; out: boolean }[]>();
    for (const edge of levelEdges) {
      const pa = posMap.get(edge.fromId);
      const pb = posMap.get(edge.toId);
      if (!pa || !pb) continue;
      if (effectivePortsMap.has(edge.fromId)) {
        // Cast ForceNode to CanvasNode shape for surfacePoint (only reads x,y,w,h,shape)
        const bp = surfacePoint(pa as unknown as CanvasNode, pb as unknown as CanvasNode, 0);
        if (!edgePortDots.has(edge.fromId)) edgePortDots.set(edge.fromId, []);
        edgePortDots.get(edge.fromId)!.push({ x: bp.x - pa.x, y: bp.y - pa.y, out: true });
      }
      if (effectivePortsMap.has(edge.toId)) {
        const bp = surfacePoint(pb as unknown as CanvasNode, pa as unknown as CanvasNode, 0);
        if (!edgePortDots.has(edge.toId)) edgePortDots.set(edge.toId, []);
        edgePortDots.get(edge.toId)!.push({ x: bp.x - pb.x, y: bp.y - pb.y, out: false });
      }
    }

    const canvasNodes: CanvasNode[] = [];

    for (const node of treeNodes) {
      const pos = posMap.get(node.id);
      if (!pos) continue;

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

      // Resolve ports for this node
      let ports: CanvasPort[] | undefined;
      if (isExpanded && node.ports && node.ports.length > 0) {
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

      const data: Record<string, unknown> = {
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
      };

      if (isExpanded) {
        // Recursively build children
        const childResult = buildLevel(node.children, node.id);
        canvasNodes.push({
          id: node.id,
          x: pos.x,
          y: pos.y,
          w: pos.w,
          h: pos.h,
          shape: "rect",
          label: node.label,
          selected: isSelected,
          highlighted: isHighlighted,
          dashed: isDashed,
          expanded: true,
          children: childResult.nodes,
          edges: childResult.edges,
          ports,
          data,
        });
      } else {
        canvasNodes.push({
          id: node.id,
          x: pos.x,
          y: pos.y,
          w: pos.w,
          h: pos.h,
          shape: pos.shape === "rect" ? "rect" : "circle",
          label: node.label,
          selected: isSelected,
          highlighted: isHighlighted,
          dashed: isDashed,
          ports,
          data,
        });
      }
    }

    // Build canvas edges
    const canvasEdges: CanvasEdge[] = levelEdges.map((e) => ({
      id: e.id,
      fromId: e.fromId,
      toId: e.toId,
      label: e.label,
      selected: opts.selectedId === e.id,
      highlighted: opts.highlightEntityIds.has(e.id),
    }));

    return { nodes: canvasNodes, edges: canvasEdges };
  }

  const result = buildLevel(opts.nodes, "");
  return { nodes: result.nodes, edges: result.edges };
}

// ---------------------------------------------------------------------------
// Marlinspike IDE theme (full-fidelity color resolution)
// ---------------------------------------------------------------------------

function resolveNodeStyle(node: CanvasNode): NodeStyle {
  const d = (node.data ?? {}) as Record<string, unknown>;
  const { selected, highlighted } = node;
  const isRefNode = d.isRef as boolean;
  const isComposite = d.isComposite as boolean;
  const isInput = d.isInput as boolean;
  const isOutput = d.isOutput as boolean;
  const isEdgeSource = d.isEdgeSource as boolean;
  const isHovered = d.isHovered as boolean;
  const isCandidate = d.isCandidate as boolean;
  const isInactive = d.isInactive as boolean;
  const hasError = d.hasError as boolean;
  const hasWarning = d.hasWarning as boolean;

  // Fill
  let fill = "#111125";
  if (isEdgeSource || isHovered) fill = "#1e2a4a";
  else if (hasError) fill = "#2a1a1a";
  else if (selected) fill = "#1e2a4a";
  else if (isRefNode) fill = "#141428";
  else if (isComposite) fill = "#141430";
  else if (isInput) fill = "#101828";
  else if (isOutput) fill = "#181410";

  // Stroke
  let stroke = "#252545";
  if (isEdgeSource) stroke = "#5070c0";
  else if (isHovered) stroke = "#6080e0";
  else if (hasError) stroke = "#c04040";
  else if (hasWarning) stroke = "#c08020";
  else if (selected) stroke = "#5070c0";
  else if (isCandidate) stroke = "#3050a0";
  else if (highlighted) stroke = "#50c070";
  else if (isRefNode) stroke = "#605080";
  else if (isInput) stroke = "#4080c0";
  else if (isOutput) stroke = "#c06040";
  else if (isComposite) stroke = "#303060";

  // Stroke width
  let strokeWidth = 1;
  if (isEdgeSource || selected || isHovered) strokeWidth = 2;
  else if (isCandidate || hasError || hasWarning || highlighted) strokeWidth = 1.5;

  // Label
  const labelFill = selected ? "#a0b4e0" : isRefNode ? "#9080b0" : "#777799";

  return {
    fill,
    stroke,
    strokeWidth,
    labelFill,
    labelFont: "sans-serif",
    labelSize: 9,
    opacity: isInactive ? 0.3 : undefined,
  };
}

function resolveContainerStyle(node: CanvasNode): ContainerStyle {
  const d = (node.data ?? {}) as Record<string, unknown>;
  const { selected, highlighted, dashed } = node;
  const isRefNode = d.isRef as boolean;
  const hasError = d.hasError as boolean;
  const hasWarning = d.hasWarning as boolean;
  const isHighlighted = highlighted ?? false;

  let fill = isRefNode ? "#0f0f24" : "#0f0f28";
  if (hasError) fill = "#1a0f0f";

  let stroke = "#1e1e44";
  if (hasError) stroke = "#c04040";
  else if (hasWarning) stroke = "#c08020";
  else if (selected) stroke = "#4060b0";
  else if (isHighlighted) stroke = "#50c070";
  else if (isRefNode) stroke = "#605080";

  let strokeWidth = 1;
  if (selected || hasError || hasWarning || isHighlighted) strokeWidth = 2;

  const labelFill = selected ? "#8090c0" : hasError ? "#c07070" : "#444466";

  return {
    fill,
    stroke,
    strokeWidth,
    labelFill,
    labelFont: "sans-serif",
    labelSize: 11,
    cornerRadius: 8,
    strokeDash: dashed ? "6,3" : undefined,
  };
}

function resolveEdgeStyle(edge: CanvasEdge): EdgeStyle {
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

function resolvePortStyle(port: CanvasPort, _node: CanvasNode): PortStyle {
  const isOut = port.direction === "out";
  return {
    fill: isOut ? "#cc8844" : "#6688cc",
    stroke: "none",
    radius: 3,
  };
}

/** Produce decorations: diagnostic badges, ref indicators, children count, port dots. */
function resolveDecorations(node: CanvasNode): RenderPrimitive[] {
  const d = (node.data ?? {}) as Record<string, unknown>;
  const prims: RenderPrimitive[] = [];
  const isRect = node.shape === "rect";
  const r = Math.min(node.w, node.h) / 2;
  const hasChildren = d.hasChildren as boolean;

  // Children count badge
  if (hasChildren && !node.expanded) {
    const count = d.childrenCount as number;
    if (count > 0) {
      prims.push({
        kind: "text",
        x: 0,
        y: 10,
        text: `(${count})`,
        fill: node.selected ? "#6070a0" : "#3a3a60",
        fontSize: 8,
        anchor: "middle",
      });
    }
  }

  // Error/warning badge
  const hasError = d.hasError as boolean;
  const hasWarning = d.hasWarning as boolean;
  if (hasError || hasWarning) {
    const badgeY = -(isRect ? LEAF_R * 0.7 - 2 : r - 2);
    prims.push({
      kind: "circle",
      cx: r - 2,
      cy: badgeY,
      r: 5,
      fill: hasError ? "#c04040" : "#c08020",
      stroke: "#0d0d1e",
      strokeWidth: 1,
    });
  }

  // Ref indicator text
  const refTarget = d.refTarget as string | undefined;
  if (refTarget) {
    const labelY = isRect ? LEAF_R * 0.7 + 9 : r + 9;
    prims.push({
      kind: "text",
      x: 0,
      y: labelY,
      text: `\u2197 ${refTarget}`,
      fill: "#605080",
      fontSize: 7,
      anchor: "middle",
    });
  }

  // Edge-derived port dots
  const dots = (d.edgePortDots ?? []) as Array<{ x: number; y: number; out: boolean }>;
  for (const dot of dots) {
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

/** Metadata for a node in the scene, used for event handling. */
export interface NodeMeta {
  levelId: string;
  x: number;
  y: number;
  isComposite: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
}

/** Build a flat map from node ID → metadata for event handling. */
export function buildNodeMetaMap(scene: CanvasScene): Map<string, NodeMeta> {
  const map = new Map<string, NodeMeta>();
  function walk(nodes: CanvasNode[]) {
    for (const node of nodes) {
      const d = (node.data ?? {}) as Record<string, unknown>;
      map.set(node.id, {
        levelId: (d.levelId as string) ?? "",
        x: node.x,
        y: node.y,
        isComposite: (d.isComposite as boolean) ?? false,
        hasChildren: (d.hasChildren as boolean) ?? false,
        isExpanded: node.expanded ?? false,
      });
      if (node.children) walk(node.children);
    }
  }
  walk(scene.nodes);
  return map;
}

/** Full Marlinspike IDE theme — resolves all visual states from node.data. */
export const marlinIdeTheme: CanvasTheme = {
  node: resolveNodeStyle,
  edge: resolveEdgeStyle,
  port: resolvePortStyle,
  container: resolveContainerStyle,
  decorations: resolveDecorations,
  background: "#0d0d1e",
};
