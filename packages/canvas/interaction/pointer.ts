/**
 * PointerHandler — optional convenience for wiring pointer events to interaction hooks.
 *
 * A DOM-free state machine that manages drag threshold detection, hover tracking,
 * and double-click detection. Consumers feed it abstract pointer positions and it
 * dispatches through CanvasInteraction hooks.
 */

import type { Point } from "../geometry/surface.ts";
import type { RenderGroup } from "../render/primitives.ts";
import type { CanvasInteraction, InteractionHint } from "./types.ts";
import { hitTest } from "./hit-test.ts";

/** Configuration for the PointerHandler. */
export interface PointerHandlerConfig {
  /** Returns the current render tree root (called on each pointer event). */
  getRoot(): RenderGroup;
  /** Consumer hooks to dispatch interaction events to. */
  hooks: CanvasInteraction;
  /** Squared pixel distance before a press becomes a drag (default: 16 = 4px). */
  dragThreshold?: number;
  /** Maximum ms between two clicks to count as double-click (default: 300). */
  doubleClickWindow?: number;
}

const DEFAULT_DRAG_THRESHOLD = 16;
const DEFAULT_DOUBLE_CLICK_WINDOW = 300;

type PointerState =
  | { kind: "idle" }
  | { kind: "pending"; hint: InteractionHint; startPos: Point; startTime: number }
  | { kind: "dragging"; hint: InteractionHint; lastPos: Point };

/**
 * Stateful pointer handler that translates pointer events into interaction hooks.
 *
 * Usage:
 *   const handler = new PointerHandler(config);
 *   element.onpointerdown = (e) => handler.onPointerDown({ x: e.offsetX, y: e.offsetY });
 *   element.onpointermove = (e) => handler.onPointerMove({ x: e.offsetX, y: e.offsetY });
 *   element.onpointerup = (e) => handler.onPointerUp({ x: e.offsetX, y: e.offsetY });
 */
export class PointerHandler {
  private state: PointerState = { kind: "idle" };
  private hoveredId: string | null = null;
  private lastClickTime = 0;
  private lastClickId: string | null = null;
  private readonly config: PointerHandlerConfig;
  private readonly dragThreshold: number;
  private readonly doubleClickWindow: number;

  constructor(config: PointerHandlerConfig) {
    this.config = config;
    this.dragThreshold = config.dragThreshold ?? DEFAULT_DRAG_THRESHOLD;
    this.doubleClickWindow = config.doubleClickWindow ?? DEFAULT_DOUBLE_CLICK_WINDOW;
  }

  onPointerDown(pos: Point): void {
    const root = this.config.getRoot();
    const hint = hitTest(root, pos);

    if (hint) {
      this.state = { kind: "pending", hint, startPos: pos, startTime: Date.now() };
    } else {
      this.state = { kind: "idle" };
    }
  }

  onPointerMove(pos: Point): void {
    const { hooks } = this.config;

    if (this.state.kind === "pending") {
      const dx = pos.x - this.state.startPos.x;
      const dy = pos.y - this.state.startPos.y;
      if (dx * dx + dy * dy >= this.dragThreshold) {
        if (this.state.hint.draggable) {
          // Transition to dragging
          this.state = { kind: "dragging", hint: this.state.hint, lastPos: this.state.startPos };
          hooks.onDragStart?.(this.state.hint.id, this.state.lastPos);
          // Dispatch the first move
          const delta = { x: pos.x - this.state.lastPos.x, y: pos.y - this.state.lastPos.y };
          hooks.onDragMove?.(this.state.hint.id, pos, delta);
          this.state.lastPos = pos;
        } else {
          // Not draggable — cancel pending state
          this.state = { kind: "idle" };
        }
      }
      return;
    }

    if (this.state.kind === "dragging") {
      const delta = { x: pos.x - this.state.lastPos.x, y: pos.y - this.state.lastPos.y };
      hooks.onDragMove?.(this.state.hint.id, pos, delta);
      this.state.lastPos = pos;
      return;
    }

    // Idle — handle hover
    const root = this.config.getRoot();
    const hint = hitTest(root, pos);
    const newId = hint?.hoverable ? hint.id : null;

    if (newId !== this.hoveredId) {
      if (this.hoveredId) hooks.onHoverLeave?.(this.hoveredId);
      if (newId) hooks.onHoverEnter?.(newId);
      this.hoveredId = newId;
    }
  }

  onPointerUp(pos: Point): void {
    const { hooks } = this.config;

    if (this.state.kind === "dragging") {
      hooks.onDragEnd?.(this.state.hint.id, pos);
      this.state = { kind: "idle" };
      return;
    }

    if (this.state.kind === "pending") {
      const hint = this.state.hint;
      this.state = { kind: "idle" };

      // Click
      if (hint.clickable) {
        hooks.onClick?.(hint.id, pos);
      }

      // Double-click detection
      const now = Date.now();
      if (
        hint.doubleClickable &&
        hint.id === this.lastClickId &&
        now - this.lastClickTime < this.doubleClickWindow
      ) {
        hooks.onDoubleClick?.(hint.id, pos);
        this.lastClickId = null;
        this.lastClickTime = 0;
      } else {
        this.lastClickId = hint.id;
        this.lastClickTime = now;
      }
      return;
    }

    this.state = { kind: "idle" };
  }
}
