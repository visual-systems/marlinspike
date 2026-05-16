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

/** Visual properties for rendering an expanded container node. */
export interface ContainerStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  labelFill: string;
  labelFont: string;
  labelSize: number;
  cornerRadius: number;
  strokeDash?: string;
  opacity?: number;
}

/** Resolves visual style for a node based on its state. */
export type NodeStyleResolver = (node: CanvasNode) => NodeStyle;

/** Resolves visual style for an edge based on its state. */
export type EdgeStyleResolver = (edge: CanvasEdge) => EdgeStyle;

/** Resolves visual style for a port based on its state and parent node. */
export type PortStyleResolver = (port: CanvasPort, node: CanvasNode) => PortStyle;

/** Resolves visual style for an expanded container based on its state. */
export type ContainerStyleResolver = (node: CanvasNode) => ContainerStyle;

/** Additional primitives to render as decorations on a node (badges, indicators). */
export type NodeDecorationsResolver = (
  node: CanvasNode,
) => import("../render/primitives.ts").RenderPrimitive[];

/** A complete visual theme for the canvas. */
export interface CanvasTheme {
  node: NodeStyleResolver;
  edge: EdgeStyleResolver;
  port: PortStyleResolver;
  /** Optional resolver for expanded container nodes. Falls back to defaults if omitted. */
  container?: ContainerStyleResolver;
  /** Optional extra primitives rendered after the node shape (badges, indicators, etc). */
  decorations?: NodeDecorationsResolver;
  background: string;
}
