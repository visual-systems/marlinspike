/**
 * Interaction types for the canvas package.
 *
 * InteractionHint is metadata attached to render primitives declaring what
 * gestures each element responds to. CanvasInteraction is the consumer-provided
 * hooks interface for handling those gestures.
 */

import type { Point } from "../geometry/surface.ts";

/** Metadata declaring what interactions a primitive responds to. */
export interface InteractionHint {
  /** Unique ID for this interactive element (typically node or edge ID). */
  id: string;
  /** Can be dragged to reposition. */
  draggable?: boolean;
  /** Responds to single click. */
  clickable?: boolean;
  /** Responds to double-click. */
  doubleClickable?: boolean;
  /** Shows hover feedback. */
  hoverable?: boolean;
  /** CSS cursor to show when hovering. */
  cursor?: string;
}

/** Consumer-provided hooks dispatched by the interaction system. */
export interface CanvasInteraction {
  onDragStart?(id: string, pos: Point): void;
  onDragMove?(id: string, pos: Point, delta: Point): void;
  onDragEnd?(id: string, pos: Point): void;
  onClick?(id: string, pos: Point): void;
  onDoubleClick?(id: string, pos: Point): void;
  onHoverEnter?(id: string): void;
  onHoverLeave?(id: string): void;
}
