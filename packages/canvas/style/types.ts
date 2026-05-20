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
import type { EdgeRoutingResult } from "../geometry/edge-routing.ts";
import type { Point } from "../geometry/surface.ts";

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

/**
 * Declarative style properties — the shared vocabulary for themes and per-element overrides.
 * All fields optional: themes define defaults per role, elements override sparsely.
 * Same format in both contexts — merge with spread: `{ ...themeDefaults, ...overrides }`.
 */
export interface NodeStyleProps {
  /** Geometry identifier resolved to NodeGeometry by theme ("circle", "rect", etc). */
  geometry?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  labelFill?: string;
  labelFont?: string;
  labelSize?: number;
  opacity?: number;
  /** Container extent rule: padding around children. */
  groupPadding?: number;
  /** Container extent rule: label strip height. */
  labelH?: number;
}

/** Layout constants that themes can override (container padding, label height, etc). */
export interface ThemeConstants {
  /** Padding around children in expanded containers. */
  groupPadding: number;
  /** Height of label strip at top of expanded containers. */
  labelH: number;
  /** Radius of collapsed leaf nodes. */
  leafRadius: number;
}

/** Combined geometry + style resolution result from resolveNode. */
export interface ResolvedNode {
  geometry: import("../geometry/node-geometry.ts").NodeGeometry;
  style: NodeStyle;
}

/** A complete visual theme for the canvas. */
export interface CanvasTheme<S = unknown> {
  node: NodeStyleResolver<S>;
  edge: EdgeStyleResolver;
  port: PortStyleResolver<S>;
  /** Optional extra primitives rendered after the node shape (badges, indicators, etc). */
  decorations?: NodeDecorationsResolver<S>;
  background: string;
  /**
   * Full node resolution: geometry + style in one call.
   * When present, takes precedence over the separate `node` resolver for both
   * geometry and style. This is the extension point for theme-controlled shapes.
   */
  resolveNode?: (node: CanvasNode<S>) => ResolvedNode;
  /** Layout constants. When absent, consumers use their own defaults. */
  constants?: ThemeConstants;
  /**
   * Custom edge routing. When present, replaces default straight/arc path computation.
   * Receives surface-clipped endpoints and returns an SVG path with arrival direction.
   */
  edgeRouter?: (src: Point, dst: Point, edge: CanvasEdge) => EdgeRoutingResult;
}
