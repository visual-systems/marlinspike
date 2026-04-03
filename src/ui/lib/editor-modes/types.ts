/// <reference lib="dom" />
// ---------------------------------------------------------------------------
// Editor mode system
//
// An EditorMode is a pluggable set of keybindings and structural-editing
// behaviours for the CodePanel textarea. The mode receives a `keyDown` event
// and an `EditorContext` giving it read/write access to the text and cursor.
//
// Built-in modes: "paredit"
// Future modes: "vim", "emacs", "default" (no structural editing)
//
// Adding a new mode:
//  1. Implement EditorMode
//  2. Register it in the EDITOR_MODES map in this file
// ---------------------------------------------------------------------------

export interface EditorContext {
  /** The current textarea element. */
  readonly el: HTMLTextAreaElement;
  /** Current text content of the textarea (same as el.value). */
  readonly text: string;
  /** Current cursor position (selectionStart). */
  readonly cursor: number;
  /** Current selection end (selectionEnd). */
  readonly selectionEnd: number;
  /**
   * Apply a text replacement and place the cursor.
   * Replaces el.value with `newText`, sets cursor to `newCursor`,
   * and dispatches an "input" event so that React state stays in sync.
   */
  applyText(newText: string, newCursor: number): void;
}

export interface EditorMode {
  /** Human-readable name shown in the mode chip. */
  readonly name: string;
  /**
   * Handle a keydown event. Return `true` if the event was consumed
   * (preventing default browser behaviour and further processing).
   */
  keyDown(e: KeyboardEvent, ctx: EditorContext): boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Mode IDs that the panel UI knows about. Extend this as new modes are added. */
export type EditorModeId = "paredit" | "default";

/** Cycle to the next mode in the list. */
export function nextModeId(current: EditorModeId): EditorModeId {
  const order: EditorModeId[] = ["paredit", "default"];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

export const MODE_LABELS: Record<EditorModeId, string> = {
  paredit: "paredit",
  default: "default",
};

/** No-op default mode — passes all keys through to the browser. */
export const defaultMode: EditorMode = {
  name: "default",
  keyDown: () => false,
};
