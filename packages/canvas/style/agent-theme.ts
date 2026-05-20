/**
 * Agent theme — clean minimal dark aesthetic.
 *
 * Dark background, circular nodes, thin gray edges, subtle styling.
 * Uses default straight-line edge routing (no angular router).
 */

import type { CanvasEdge, CanvasNode, CanvasPort } from "../scene/types.ts";
import type { CanvasTheme, EdgeStyle, NodeStyle, PortStyle } from "./types.ts";

function resolveNodeStyle(node: CanvasNode<unknown>): NodeStyle {
  const { selected, highlighted, dashed } = node;

  let fill = "#2a2a2a";
  let stroke = "#444444";
  let strokeWidth = 1;

  if (selected) {
    stroke = "#ffffff";
    strokeWidth = 2;
  } else if (highlighted) {
    stroke = "#4488ff";
    strokeWidth = 2;
  } else if (dashed) {
    fill = "#222222";
    stroke = "#383838";
  }

  const labelFill = selected ? "#e0e0e0" : highlighted ? "#88aaff" : "#888888";

  return {
    fill,
    stroke,
    strokeWidth,
    labelFill,
    labelFont: "sans-serif",
    labelSize: 9,
  };
}

function resolveEdgeStyle(edge: CanvasEdge): EdgeStyle {
  const stroke = edge.selected ? "#ffffff" : edge.highlighted ? "#4488ff" : "#555555";
  const strokeWidth = edge.selected ? 1.5 : 1;
  return {
    stroke,
    strokeWidth,
    arrowSize: 8,
    labelFill: "#666666",
    labelFont: "sans-serif",
    labelSize: 10,
    endCap: "arrow",
  };
}

function resolvePortStyle(port: CanvasPort, _node: CanvasNode<unknown>): PortStyle {
  return {
    fill: port.direction === "out" ? "#ffffff" : "#4488ff",
    stroke: "none",
    radius: 3,
  };
}

/** Agent theme: clean minimal dark aesthetic, circular nodes, thin gray edges. */
export const agentTheme: CanvasTheme<unknown> = {
  node: resolveNodeStyle,
  edge: resolveEdgeStyle,
  port: resolvePortStyle,
  background: "#1a1a1a",
};
