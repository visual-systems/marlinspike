/**
 * Render primitives — target-agnostic drawing commands.
 *
 * These abstract primitives describe what to draw without specifying how.
 * Different backends (SVG, Canvas2D, WebGL) interpret these via the
 * Renderer<T> interface.
 */

import type { InteractionHint } from "../interaction/types.ts";

/** A circle primitive. */
export interface RenderCircle {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  strokeDash?: string;
  cursor?: string;
}

/** A rectangle primitive. */
export interface RenderRect {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  strokeDash?: string;
  cursor?: string;
}

/** A path primitive (SVG path data string). */
export interface RenderPath {
  kind: "path";
  d: string;
  stroke: string;
  strokeWidth: number;
  fill: string;
  strokeDash?: string;
  opacity?: number;
  cursor?: string;
}

/** A polygon primitive. */
export interface RenderPolygon {
  kind: "polygon";
  points: [number, number][];
  fill: string;
  stroke?: string;
}

/** A text primitive. */
export interface RenderText {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fill: string;
  fontSize: number;
  fontFamily?: string;
  anchor?: "start" | "middle" | "end";
  /** If set, renders a stroke outline behind the text for readability. */
  strokeOutline?: { stroke: string; strokeWidth: number };
}

/** A group of primitives with an optional transform. */
export interface RenderGroup {
  kind: "group";
  children: RenderPrimitive[];
  transform?: string;
  /** Typed translation X offset (for hit-testing without parsing transform strings). */
  tx?: number;
  /** Typed translation Y offset (for hit-testing without parsing transform strings). */
  ty?: number;
  cursor?: string;
  opacity?: number;
  id?: string;
  /** Interaction metadata — declares what gestures this group responds to. */
  interaction?: InteractionHint;
}

/** Union of all render primitives. */
export type RenderPrimitive =
  | RenderCircle
  | RenderRect
  | RenderPath
  | RenderPolygon
  | RenderText
  | RenderGroup;
