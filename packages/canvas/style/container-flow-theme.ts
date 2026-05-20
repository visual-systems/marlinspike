/**
 * ContainerFlow theme — dark navy with teal strokes and amber highlights.
 *
 * A technical/infrastructure aesthetic with rectangular nodes,
 * manhattan-routed edges, and teal + amber colour accent.
 */

import type { CanvasEdge, CanvasNode, CanvasPort } from "../scene/types.ts";
import type { CanvasTheme, EdgeStyle, PortStyle, ResolvedNode } from "./types.ts";
import { RECT_GEOMETRY } from "../geometry/node-geometry.ts";
import { angularRouter, MANHATTAN_ANGLES } from "../geometry/edge-routing.ts";

const route = angularRouter(MANHATTAN_ANGLES, 0);

function resolveNode(node: CanvasNode<unknown>): ResolvedNode {
  const { selected, highlighted, dashed } = node;

  let fill = "#0d1f2d";
  let stroke = "#2a8a8a";
  let strokeWidth = 1;

  if (selected) {
    stroke = "#40c0c0";
    strokeWidth = 2;
  } else if (highlighted) {
    stroke = "#d4a030";
    strokeWidth = 2;
  } else if (dashed) {
    fill = "#0a1a28";
    stroke = "#1e6a6a";
  }

  const labelFill = selected ? "#80d0d0" : highlighted ? "#d4a030" : "#5a9a9a";

  return {
    geometry: RECT_GEOMETRY,
    style: {
      fill,
      stroke,
      strokeWidth,
      labelFill,
      labelFont: "sans-serif",
      labelSize: 9,
    },
  };
}

function resolveEdgeStyle(edge: CanvasEdge): EdgeStyle {
  const stroke = edge.selected ? "#40c0c0" : edge.highlighted ? "#d4a030" : "#2a8a8a";
  const strokeWidth = edge.selected ? 2 : 1;
  return {
    stroke,
    strokeWidth,
    arrowSize: 10,
    labelFill: "#5a9a9a",
    labelFont: "sans-serif",
    labelSize: 10,
    endCap: "arrow",
  };
}

function resolvePortStyle(port: CanvasPort, _node: CanvasNode<unknown>): PortStyle {
  return {
    fill: port.direction === "out" ? "#d4a030" : "#40c0c0",
    stroke: "none",
    radius: 3,
  };
}

/** ContainerFlow theme: dark navy, teal strokes, amber highlights, rectangular nodes. */
export const containerFlowTheme: CanvasTheme<unknown> = {
  node: (n) => resolveNode(n).style,
  edge: resolveEdgeStyle,
  port: resolvePortStyle,
  background: "#0a1628",
  resolveNode,
  edgeRouter: route,
};
