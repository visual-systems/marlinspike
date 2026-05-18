/**
 * Style interfaces for pluggable visual theming.
 *
 * Consumers implement CanvasTheme to control the appearance of nodes,
 * edges, and ports. Style resolvers receive the element being rendered
 * and return concrete visual properties.
 *
 * The `S` type parameter flows from CanvasNode<S> — theme resolvers
 * receive the consumer's typed state without casting.
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
  strokeDash?: string;
  opacity?: number;
  /** Endpoint decoration at destination. Default "arrow". */
  endCap?: "arrow" | "dot" | "none";
}

/** Visual properties for rendering a port dot. */
export interface PortStyle {
  fill: string;
  stroke: string;
  radius: number;
}

/** Resolves visual style for a node based on its state. */
export type NodeStyleResolver<S = unknown> = (node: CanvasNode<S>) => NodeStyle;

/** Resolves visual style for an edge based on its state. */
export type EdgeStyleResolver = (edge: CanvasEdge) => EdgeStyle;

/** Resolves visual style for a port based on its state and parent node. */
export type PortStyleResolver<S = unknown> = (
  port: CanvasPort,
  node: CanvasNode<S>,
) => PortStyle;

/** Additional primitives to render as decorations on a node (badges, indicators). */
export type NodeDecorationsResolver<S = unknown> = (
  node: CanvasNode<S>,
) => import("../render/primitives.ts").RenderPrimitive[];

/** A complete visual theme for the canvas. */
export interface CanvasTheme<S = unknown> {
  node: NodeStyleResolver<S>;
  edge: EdgeStyleResolver;
  port: PortStyleResolver<S>;
  /** Optional extra primitives rendered after the node shape (badges, indicators, etc). */
  decorations?: NodeDecorationsResolver<S>;
  background: string;
}
