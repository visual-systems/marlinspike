/**
 * Transit theme — metro/rail map aesthetic.
 *
 * Light warm-paper background, circle station dots, bold coloured lines,
 * transit-angle routing (h/v + 45-degree diagonals) with rounded corners.
 * Node colour is deterministic via ID hash.
 */

import type { CanvasEdge, CanvasNode, CanvasPort } from "../scene/types.ts";
import type { CanvasTheme, EdgeStyle, NodeStyle, PortStyle } from "./types.ts";
import { angularRouter, TRANSIT_ANGLES } from "../geometry/edge-routing.ts";

const route = angularRouter(TRANSIT_ANGLES, 8);

const LINE_COLOURS = ["#d03030", "#2060c0", "#208040", "#7040b0", "#d07020"];

/** Simple hash of a string to an index in the colour palette. */
function colourIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return ((h % LINE_COLOURS.length) + LINE_COLOURS.length) % LINE_COLOURS.length;
}

function nodeColour(id: string): string {
  return LINE_COLOURS[colourIndex(id)];
}

function resolveNodeStyle(node: CanvasNode<unknown>): NodeStyle {
  const base = nodeColour(node.id);
  const { selected, highlighted } = node;

  let fill = base;
  let stroke = "#3a3530";
  let strokeWidth = 1;

  if (selected) {
    strokeWidth = 3;
    fill = darken(base);
  } else if (highlighted) {
    stroke = "#1a1510";
    strokeWidth = 2;
  }

  return {
    fill,
    stroke,
    strokeWidth,
    labelFill: "#3a3530",
    labelFont: "sans-serif",
    labelSize: 9,
  };
}

function resolveEdgeStyle(edge: CanvasEdge): EdgeStyle {
  const colour = nodeColour(edge.fromId);
  const strokeWidth = edge.selected ? 4 : 3;
  return {
    stroke: edge.selected ? darken(colour) : colour,
    strokeWidth,
    arrowSize: 0,
    labelFill: "#3a3530",
    labelFont: "sans-serif",
    labelSize: 10,
    endCap: "none",
  };
}

function resolvePortStyle(_port: CanvasPort, _node: CanvasNode<unknown>): PortStyle {
  return { fill: "#5a5550", stroke: "none", radius: 3 };
}

/** Darken a hex colour by mixing toward black. */
function darken(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 0.7;
  return `#${Math.round(r * f).toString(16).padStart(2, "0")}${
    Math.round(g * f).toString(16).padStart(2, "0")
  }${Math.round(b * f).toString(16).padStart(2, "0")}`;
}

/** Transit theme: metro-map style, bold coloured lines, circle station dots. */
export const transitTheme: CanvasTheme<unknown> = {
  node: resolveNodeStyle,
  edge: resolveEdgeStyle,
  port: resolvePortStyle,
  background: "#f4f0e8",
  edgeRouter: route,
};
