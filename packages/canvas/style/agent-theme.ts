/**
 * Agent theme — clean minimal dark aesthetic.
 *
 * Dark background, circular nodes, thin gray edges, subtle styling.
 * Uses default straight-line edge routing (no angular router).
 */

import type { CanvasEdge, CanvasNode, CanvasPort } from "../scene/types.ts";
import type { CanvasTheme, EdgeStyle, NodeStyle, PortStyle } from "./types.ts";
import { containerFill } from "./color.ts";
import { angularRouter, MANHATTAN_ANGLES } from "../geometry/edge-routing.ts";

const route = angularRouter(MANHATTAN_ANGLES, 0);

const BACKGROUND = "#1a1a1a";

function resolveNodeStyle(node: CanvasNode<unknown>): NodeStyle {
  const { selected, highlighted, dashed } = node;

  let fill = "#2a2a2a";
  let stroke = "#444444";
  let strokeWidth = 1;

  if (node.containerLabel != null) {
    fill = containerFill("#2a2a2a", BACKGROUND, node.depth ?? 0);
    strokeWidth = 1;
  } else if (selected) {
    stroke = "#ffffff";
    strokeWidth = 2;
  } else if (highlighted) {
    stroke = "#4488ff";
    strokeWidth = 2;
  } else if (dashed) {
    fill = "#222222";
    stroke = "#383838";
  } else if (node.portDirection === "in") {
    fill = "#1a2030";
    stroke = "#4488ff";
  } else if (node.portDirection === "out") {
    fill = "#2a2a2a";
    stroke = "#ffffff";
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
  background: BACKGROUND,
  edgeRouter: route,
  decorations: (node) => {
    if (!node.containerLabel) return [];
    return [{
      kind: "text" as const,
      x: -node.w / 2 + 10,
      y: -node.h / 2 + 16,
      text: node.containerLabel,
      fill: "#666666",
      fontSize: 11,
      fontFamily: "sans-serif",
      anchor: "start" as const,
    }];
  },
};
