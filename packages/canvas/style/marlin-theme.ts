/**
 * Marlinspike dark theme — default visual style.
 *
 * Encodes the current Marlinspike IDE color palette as a CanvasTheme
 * implementation. Uses only universal CanvasNode fields (selected,
 * highlighted, dashed) — consumer-specific state is ignored.
 *
 * This theme works with any state type (CanvasTheme<unknown>).
 */

import type { CanvasEdge, CanvasNode, CanvasPort } from "../scene/types.ts";
import type { CanvasTheme, EdgeStyle, NodeStyle, PortStyle } from "./types.ts";
import { containerFill } from "./color.ts";
import { angularRouter, MANHATTAN_ANGLES } from "../geometry/edge-routing.ts";

const route = angularRouter(MANHATTAN_ANGLES, 0);

const BACKGROUND = "#0d0d1e";

function resolveNodeStyle(node: CanvasNode<unknown>): NodeStyle {
  const { selected, highlighted, dashed } = node;

  // Fill
  let fill = "#111125";
  if (node.containerLabel != null) {
    fill = containerFill("#111125", BACKGROUND, node.depth ?? 0);
  } else if (selected) fill = "#1e2a4a";
  else if (highlighted) fill = "#111125";
  else if (dashed) fill = "#141428"; // ref-like nodes
  else if (node.portDirection === "in") fill = "#101828";
  else if (node.portDirection === "out") fill = "#181410";

  // Stroke
  let stroke = "#252545";
  if (selected) stroke = "#5070c0";
  else if (highlighted) stroke = "#50c070";
  else if (dashed) stroke = "#605080";
  else if (node.portDirection === "in") stroke = "#4080c0";
  else if (node.portDirection === "out") stroke = "#c06040";

  // Stroke width
  let strokeWidth = 1;
  if (selected || highlighted) strokeWidth = 2;

  // Label
  const labelFill = selected ? "#a0b4e0" : dashed ? "#9080b0" : "#777799";

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

function resolvePortStyle(port: CanvasPort, _node: CanvasNode<unknown>): PortStyle {
  const isOut = port.direction === "out";
  return {
    fill: isOut ? "#cc8844" : "#6688cc",
    stroke: "none",
    radius: 3,
  };
}

/** The default Marlinspike dark theme. Works with any state type. */
export const marlinTheme: CanvasTheme<unknown> = {
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
      fill: "#444466",
      fontSize: 11,
      fontFamily: "sans-serif",
      anchor: "start" as const,
    }];
  },
};
