/**
 * CLASSIC theme — the default Marlinspike visual theme.
 *
 * Implements CanvasTheme<MarlinNodeState> with `resolveNode` for unified
 * geometry + style resolution. Maps visual roles to default styles, merges
 * per-element style overrides, and resolves geometry strings to NodeGeometry.
 *
 * Interaction-dependent styles (hover, selection, error) are computed
 * functions — not declarative data — because they depend on transient state.
 */

import type {
  CanvasEdge,
  CanvasNode,
  CanvasPort,
  CanvasTheme,
  EdgeStyle,
  NodeStyleProps,
  PortStyle,
  RenderPrimitive,
  ResolvedNode,
  ThemeConstants,
} from "@marlinspike/canvas";
import { CIRCLE_GEOMETRY, RECT_GEOMETRY } from "@marlinspike/canvas";
import type { MarlinNodeState, MarlinRole } from "./canvas-adapter.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAF_R = 26;

export const CLASSIC_CONSTANTS: ThemeConstants = {
  groupPadding: 32,
  labelH: 22,
  leafRadius: LEAF_R,
};

// ---------------------------------------------------------------------------
// Role → default style props
// ---------------------------------------------------------------------------

/** Base style defaults per role. These are the "theme definition" — pure data. */
const ROLE_DEFAULTS: Record<MarlinRole, NodeStyleProps> = {
  leaf: {
    geometry: "circle",
    fill: "#111125",
    stroke: "#252545",
    strokeWidth: 1,
    labelFill: "#777799",
    labelFont: "sans-serif",
    labelSize: 9,
  },
  container: {
    geometry: "rect",
    fill: "#0f0f28",
    stroke: "#1e1e44",
    strokeWidth: 1,
    labelFill: "transparent",
    labelFont: "sans-serif",
    labelSize: 11,
  },
  "collapsed-subgraph": {
    geometry: "circle",
    fill: "#141430",
    stroke: "#303060",
    strokeWidth: 1,
    labelFill: "#777799",
    labelFont: "sans-serif",
    labelSize: 9,
  },
  ref: {
    geometry: "circle",
    fill: "#141428",
    stroke: "#605080",
    strokeWidth: 1,
    labelFill: "#9080b0",
    labelFont: "sans-serif",
    labelSize: 9,
  },
  "leaf-rect": {
    geometry: "rect",
    fill: "#111125",
    stroke: "#252545",
    strokeWidth: 1,
    labelFill: "#777799",
    labelFont: "sans-serif",
    labelSize: 9,
  },
};

// ---------------------------------------------------------------------------
// Geometry resolution
// ---------------------------------------------------------------------------

function resolveGeometryFromString(geo: string | undefined) {
  if (geo === "rect") return RECT_GEOMETRY;
  return CIRCLE_GEOMETRY;
}

// ---------------------------------------------------------------------------
// Node style resolution (interaction-dependent)
// ---------------------------------------------------------------------------

function resolveNodeStyle(node: CanvasNode<MarlinNodeState>): ResolvedNode {
  const s = node.state!;
  const { selected, highlighted } = node;

  // Start from role defaults, merge style overrides
  const roleDefaults = ROLE_DEFAULTS[s.role];
  const merged: NodeStyleProps = s.styleOverrides
    ? { ...roleDefaults, ...s.styleOverrides }
    : roleDefaults;

  // Resolve geometry from merged props
  const geometry = resolveGeometryFromString(merged.geometry);

  // Compute interaction-dependent style mutations
  let fill = merged.fill!;
  let stroke = merged.stroke!;
  let strokeWidth = merged.strokeWidth!;
  let labelFill = merged.labelFill!;
  let opacity = merged.opacity;

  if (s.isContainerBackground) {
    // Container background styling
    if (s.isRef) fill = "#0f0f24";
    if (s.hasError) fill = "#1a0f0f";

    if (s.hasError) stroke = "#c04040";
    else if (s.hasWarning) stroke = "#c08020";
    else if (selected) stroke = "#4060b0";
    else if (highlighted) stroke = "#50c070";
    else if (s.isRef) stroke = "#605080";

    if (selected || s.hasError || s.hasWarning || highlighted) strokeWidth = 2;
  } else {
    // Non-container node styling — interaction state overrides
    if (s.isEdgeSource || s.isHovered) fill = "#1e2a4a";
    else if (s.hasError) fill = "#2a1a1a";
    else if (selected) fill = "#1e2a4a";
    else if (s.isInput) fill = "#101828";
    else if (s.isOutput) fill = "#181410";

    if (s.isEdgeSource) stroke = "#5070c0";
    else if (s.isHovered) stroke = "#6080e0";
    else if (s.hasError) stroke = "#c04040";
    else if (s.hasWarning) stroke = "#c08020";
    else if (selected) stroke = "#5070c0";
    else if (s.isCandidate) stroke = "#3050a0";
    else if (highlighted) stroke = "#50c070";
    else if (s.isInput) stroke = "#4080c0";
    else if (s.isOutput) stroke = "#c06040";

    if (s.isEdgeSource || selected || s.isHovered) strokeWidth = 2;
    else if (s.isCandidate || s.hasError || s.hasWarning || highlighted) strokeWidth = 1.5;

    labelFill = selected ? "#a0b4e0" : (s.isRef ? "#9080b0" : merged.labelFill!);

    if (s.isInactive) opacity = 0.3;
  }

  return {
    geometry,
    style: {
      fill,
      stroke,
      strokeWidth,
      labelFill,
      labelFont: merged.labelFont!,
      labelSize: merged.labelSize!,
      opacity,
    },
  };
}

// ---------------------------------------------------------------------------
// Edge style resolution
// ---------------------------------------------------------------------------

function resolveEdgeStyle(edge: CanvasEdge): EdgeStyle {
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

// ---------------------------------------------------------------------------
// Port style resolution
// ---------------------------------------------------------------------------

function resolvePortStyle(port: CanvasPort, _node: CanvasNode<MarlinNodeState>): PortStyle {
  const isOut = port.direction === "out";
  return {
    fill: isOut ? "#cc8844" : "#6688cc",
    stroke: "none",
    radius: 3,
  };
}

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CLASSIC theme — the complete theme object
// ---------------------------------------------------------------------------

/** The CLASSIC Marlinspike IDE theme — roles, geometry, and interaction-dependent styles. */
export const classicTheme: CanvasTheme<MarlinNodeState> = {
  node: (node) => resolveNodeStyle(node).style,
  edge: resolveEdgeStyle,
  port: resolvePortStyle,
  decorations: resolveDecorations,
  background: "#0d0d1e",
  resolveNode: resolveNodeStyle,
  constants: CLASSIC_CONSTANTS,
};
