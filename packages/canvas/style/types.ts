/**
 * Style interfaces for pluggable visual theming.
 *
 * Consumers implement CanvasTheme to control the appearance of nodes,
 * edges, and ports. Style resolvers receive the element being rendered
 * and return concrete visual properties.
 */

import type { CanvasEdge, CanvasNode, CanvasPort } from "../scene/types.ts";

/** Visual properties for rendering a node. */
export interface NodeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  labelFill: string;
  labelFont: string;
  labelSize: number;
  opacity?: number;
}

/** Visual properties for rendering an edge. */
export interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  arrowSize: number;
  labelFill: string;
  labelFont: string;
  labelSize: number;
}

/** Visual properties for rendering a port dot. */
export interface PortStyle {
  fill: string;
  stroke: string;
  radius: number;
}

/** Resolves visual style for a node based on its state. */
export type NodeStyleResolver = (node: CanvasNode) => NodeStyle;

/** Resolves visual style for an edge based on its state. */
export type EdgeStyleResolver = (edge: CanvasEdge) => EdgeStyle;

/** Resolves visual style for a port based on its state and parent node. */
export type PortStyleResolver = (port: CanvasPort, node: CanvasNode) => PortStyle;

/** A complete visual theme for the canvas. */
export interface CanvasTheme {
  node: NodeStyleResolver;
  edge: EdgeStyleResolver;
  port: PortStyleResolver;
  background: string;
}
