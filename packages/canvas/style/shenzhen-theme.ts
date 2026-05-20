/**
 * Shenzhen theme — retro circuit-board aesthetic.
 *
 * Dark blue-green background, golden-yellow component fills, thick teal
 * routing lines, manhattan-routed edges, monospace labels.
 */

import type { CanvasEdge, CanvasNode, CanvasPort } from "../scene/types.ts";
import type { CanvasTheme, EdgeStyle, PortStyle, ResolvedNode } from "./types.ts";
import { RECT_GEOMETRY } from "../geometry/node-geometry.ts";
import { angularRouter, MANHATTAN_ANGLES } from "../geometry/edge-routing.ts";

const route = angularRouter(MANHATTAN_ANGLES, 0);

function resolveNode(node: CanvasNode<unknown>): ResolvedNode {
  const { selected, highlighted, dashed } = node;

  let fill = "#c8a832";
  let stroke = "#1a6a5a";
  let strokeWidth = 1;

  if (selected) {
    stroke = "#30d060";
    strokeWidth = 2;
  } else if (highlighted) {
    stroke = "#e0c040";
    strokeWidth = 2;
  } else if (dashed) {
    fill = "#a08828";
    stroke = "#145a4a";
  }

  const labelFill = selected ? "#d0ffd0" : highlighted ? "#ffe080" : "#1a3a2a";

  return {
    geometry: RECT_GEOMETRY,
    style: {
      fill,
      stroke,
      strokeWidth,
      labelFill,
      labelFont: "monospace",
      labelSize: 9,
    },
  };
}

function resolveEdgeStyle(edge: CanvasEdge): EdgeStyle {
  const stroke = edge.selected ? "#30d060" : edge.highlighted ? "#e0c040" : "#1a6a5a";
  const strokeWidth = edge.selected ? 3 : 2;
  return {
    stroke,
    strokeWidth,
    arrowSize: 10,
    labelFill: "#1a6a5a",
    labelFont: "monospace",
    labelSize: 10,
    endCap: "arrow",
  };
}

function resolvePortStyle(port: CanvasPort, _node: CanvasNode<unknown>): PortStyle {
  return {
    fill: port.direction === "out" ? "#c8a832" : "#1a6a5a",
    stroke: "none",
    radius: 3,
  };
}

/** Shenzhen theme: circuit-board aesthetic, golden-yellow fills, teal traces. */
export const shenzhenTheme: CanvasTheme<unknown> = {
  node: (n) => resolveNode(n).style,
  edge: resolveEdgeStyle,
  port: resolvePortStyle,
  background: "#1a2a3a",
  resolveNode,
  edgeRouter: route,
};
