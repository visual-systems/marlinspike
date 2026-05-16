/**
 * Marlinspike dark theme — default visual style.
 *
 * Encodes the current Marlinspike IDE color palette as a CanvasTheme
 * implementation. All colors are extracted from canvas.tsx renderLevel.
 */

import type { CanvasEdge, CanvasNode, CanvasPort } from "../scene/types.ts";
import type { CanvasTheme, ContainerStyle, EdgeStyle, NodeStyle, PortStyle } from "./types.ts";

function resolveNodeStyle(node: CanvasNode): NodeStyle {
  const { selected, highlighted, dashed } = node;

  // Fill
  let fill = "#111125";
  if (selected) fill = "#1e2a4a";
  else if (highlighted) fill = "#111125";
  else if (dashed) fill = "#141428"; // ref-like nodes

  // Stroke
  let stroke = "#252545";
  if (selected) stroke = "#5070c0";
  else if (highlighted) stroke = "#50c070";
  else if (dashed) stroke = "#605080";

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
    opacity: node.data?.inactive ? 0.3 : undefined,
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

function resolveContainerStyle(node: CanvasNode): ContainerStyle {
  const { selected, highlighted, dashed } = node;

  let fill = "#0f0f28";
  if (dashed) fill = "#0f0f24"; // ref-like containers

  let stroke = "#1e1e44";
  if (selected) stroke = "#4060b0";
  else if (highlighted) stroke = "#50c070";
  else if (dashed) stroke = "#605080";

  let strokeWidth = 1;
  if (selected || highlighted) strokeWidth = 2;

  const labelFill = selected ? "#8090c0" : "#444466";

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

/** The default Marlinspike dark theme. */
export const marlinTheme: CanvasTheme = {
  node: resolveNodeStyle,
  edge: resolveEdgeStyle,
  port: resolvePortStyle,
  container: resolveContainerStyle,
  background: "#0d0d1e",
};
