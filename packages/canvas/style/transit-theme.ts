/**
 * Transit theme — metro/rail map aesthetic.
 *
 * Light warm-paper background, circle station dots, bold coloured lines,
 * transit-angle routing (h/v + 45-degree diagonals) with rounded corners.
 * Node colour is deterministic via ID hash.
 */

import type { CanvasEdge, CanvasNode, CanvasPort } from "../scene/types.ts";
import type { CanvasTheme, EdgeStyle, PortStyle, ResolvedNode } from "./types.ts";
import { CIRCLE_GEOMETRY, RECT_GEOMETRY } from "../geometry/node-geometry.ts";
import { angularRouter, TRANSIT_ANGLES } from "../geometry/edge-routing.ts";
import { containerFill } from "./color.ts";

const BACKGROUND = "#e8e4dc";

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

function resolveNode(node: CanvasNode<unknown>): ResolvedNode {
  const base = nodeColour(node.id);
  const { selected, highlighted } = node;
  const isPort = node.portDirection != null;

  let fill = base;
  let stroke = "#3a3530";
  let strokeWidth = 1;

  if (node.containerLabel != null) {
    fill = containerFill(base, BACKGROUND, node.depth ?? 0);
  }

  if (selected) {
    strokeWidth = 3;
    fill = darken(base);
  } else if (highlighted) {
    stroke = "#1a1510";
    strokeWidth = 2;
  } else if (isPort) {
    // Port nodes: white fill with direction-coloured stroke (terminal/interchange style)
    fill = "#ffffff";
    stroke = node.portDirection === "in" ? "#2060c0" : "#d03030";
    strokeWidth = 2;
  }

  return {
    geometry: (isPort || node.containerLabel != null) ? RECT_GEOMETRY : CIRCLE_GEOMETRY,
    style: {
      fill,
      stroke,
      strokeWidth,
      labelFill: "#3a3530",
      labelFont: "sans-serif",
      labelSize: 9,
    },
  };
}

function resolveEdgeStyle(edge: CanvasEdge): EdgeStyle {
  const colour = nodeColour(edge.fromId);
  const strokeWidth = edge.selected ? 6 : 4.5;
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
  node: (n) => resolveNode(n).style,
  resolveNode,
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
      fill: "#3a3530",
      fontSize: 11,
      fontFamily: "sans-serif",
      anchor: "start" as const,
    }];
  },
};
