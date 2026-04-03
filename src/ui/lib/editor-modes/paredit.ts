/// <reference lib="dom" />
// ---------------------------------------------------------------------------
// Paredit editor mode
//
// Implements structural editing operations for the CodePanel textarea.
// Operations mirror common paredit/parinfer conventions.
//
// Keybindings (macOS — Cmd = ⌘, Ctrl = ^, Alt = ⌥):
//   ( [ {              Auto-close: inserts matching close paren
//   Enter              Auto-indent: newline at correct column
//   Ctrl+Shift+Right   Forward slurp: extend current form to swallow next sibling
//   Ctrl+Shift+Left    Forward barf:  eject last element from current form
//   Ctrl+K             Kill to end of current form (or kill line)
//   Ctrl+D             Kill expression under cursor
//   Ctrl+Right         Move cursor to end of next expression
//   Ctrl+Left          Move cursor to start of previous expression
// ---------------------------------------------------------------------------

import {
  columnOf,
  findEnclosingForm,
  findFormAt,
  findNextSibling,
  findPrevSibling,
  type Range,
} from "../sexp.ts";
import { type EditorContext, type EditorMode } from "./types.ts";

// ---------------------------------------------------------------------------
// Internal structural operations (pure text → text transformations)
// ---------------------------------------------------------------------------

/** Skip whitespace (including commas) scanning backward from `pos`. */
function skipWSBack(text: string, pos: number): number {
  let i = pos;
  while (i > 0 && /[\s,]/.test(text[i - 1])) i--;
  return i;
}

/** Collect all direct child forms of `form` (i.e., top-level elements inside the parens). */
function childForms(text: string, form: Range): Range[] {
  const open = text[form.start];
  const close = open === "(" ? ")" : open === "[" ? "]" : "}";
  const children: Range[] = [];
  let i = form.start + 1;
  while (i < form.end - 1) {
    const ch = text[i];
    if (/[\s,]/.test(ch)) {
      i++;
      continue;
    }
    if (ch === ";") {
      while (i < form.end - 1 && text[i] !== "\n") i++;
      continue;
    }
    if (ch === close) break;
    // Scan one form
    let end = i + 1;
    if ('([{"'.includes(ch)) {
      // Use findFormAt to skip this nested form properly
      const nested = findFormAt(text, i);
      end = nested ? nested.end : i + 1;
    } else {
      while (end < form.end - 1 && !/[\s,()[\]{}"`;]/.test(text[end])) end++;
    }
    children.push({ start: i, end });
    i = end;
  }
  return children;
}

// ---------------------------------------------------------------------------
// Auto-indent helpers
// ---------------------------------------------------------------------------

/** Return the indentation string (spaces) for a new line after pressing Enter at `cursor`. */
function autoIndentString(text: string, cursor: number): string {
  const enclosing = findEnclosingForm(text, cursor);
  if (!enclosing) {
    // Top level — no indent
    return "";
  }
  // Indent = column of opening paren + 2
  const col = columnOf(text, enclosing.start);
  return " ".repeat(col + 2);
}

// ---------------------------------------------------------------------------
// Structural operations
// ---------------------------------------------------------------------------

/** Forward slurp: extend the innermost enclosing form to swallow the next sibling. */
function forwardSlurp(text: string, cursor: number): { text: string; cursor: number } | null {
  const enclosing = findEnclosingForm(text, cursor);
  if (!enclosing) return null;

  // Search for the next sibling AFTER the enclosing form closes
  // (i.e., within the parent form, after enclosing.end - 1)
  const afterClose = enclosing.end; // position just after the ')'
  const nextSibling = findNextSibling(text, enclosing.end);
  if (!nextSibling) return null;

  // We want: remove ')' at enclosing.end-1, insert ')' after nextSibling.end
  const closePos = enclosing.end - 1;
  const newText = text.slice(0, closePos) + // up to but not including ')'
    text.slice(afterClose, nextSibling.end) + // whitespace + next sibling
    ")" + // new closing paren
    text.slice(nextSibling.end); // rest of the text
  return { text: newText, cursor };
}

/** Forward barf: eject the last element from the innermost enclosing form. */
function forwardBarf(text: string, cursor: number): { text: string; cursor: number } | null {
  const enclosing = findEnclosingForm(text, cursor);
  if (!enclosing) return null;

  const children = childForms(text, enclosing);
  if (children.length === 0) return null;
  const last = children[children.length - 1];

  // Insert ')' just before the whitespace leading up to `last`
  const barfPos = skipWSBack(text, last.start);
  // Remove ')' at enclosing.end - 1, insert ')' at barfPos
  const newText = text.slice(0, barfPos) +
    ")" +
    text.slice(barfPos, enclosing.end - 1) +
    text.slice(enclosing.end);
  // Adjust cursor if it was past the barf point
  const newCursor = cursor >= enclosing.end - 1 ? cursor - 1 : cursor;
  return { text: newText, cursor: newCursor };
}

/** Kill from cursor to the end of the current form content (before closing paren). */
function killForm(text: string, cursor: number): { text: string; cursor: number } | null {
  const enclosing = findEnclosingForm(text, cursor);
  if (!enclosing) {
    // Top level: kill to end of line
    let eol = cursor;
    while (eol < text.length && text[eol] !== "\n") eol++;
    const newText = text.slice(0, cursor) + text.slice(eol);
    return { text: newText, cursor };
  }
  const killEnd = enclosing.end - 1; // just before the closing paren
  if (cursor >= killEnd) return null; // already at end of form
  const newText = text.slice(0, cursor) + text.slice(killEnd);
  return { text: newText, cursor };
}

/** Kill (delete) the expression at/containing the cursor. */
function killExpression(text: string, cursor: number): { text: string; cursor: number } | null {
  const form = findFormAt(text, cursor);
  if (!form) return null;
  const newText = text.slice(0, form.start) + text.slice(form.end);
  return { text: newText, cursor: form.start };
}

// ---------------------------------------------------------------------------
// Paredit EditorMode implementation
// ---------------------------------------------------------------------------

export const pareditMode: EditorMode = {
  name: "paredit",
  keybindings: [
    ["( [ {", "Auto-close pair"],
    ["Enter", "Auto-indent"],
    ["^⇧→", "Forward slurp"],
    ["^⇧←", "Forward barf"],
    ["^K", "Kill to end of form"],
    ["^D", "Kill expression"],
    ["^→", "Next expression"],
    ["^←", "Previous expression"],
  ],

  keyDown(e: KeyboardEvent, ctx: EditorContext): boolean {
    const { text, cursor, selectionEnd } = ctx;
    const hasSelection = cursor !== selectionEnd;
    const cmd = e.metaKey || e.ctrlKey;
    const alt = e.altKey;

    // -----------------------------------------------------------------------
    // Auto-close pairs: ( [ {
    // -----------------------------------------------------------------------
    if (!cmd && !alt && (e.key === "(" || e.key === "[" || e.key === "{")) {
      if (hasSelection) return false; // let the browser handle wrap via OS
      const close = e.key === "(" ? ")" : e.key === "[" ? "]" : "}";
      e.preventDefault();
      const newText = text.slice(0, cursor) + e.key + close + text.slice(selectionEnd);
      ctx.applyText(newText, cursor + 1);
      return true;
    }

    // -----------------------------------------------------------------------
    // Auto-indent on Enter (plain Enter, not Cmd+Enter which is apply)
    // -----------------------------------------------------------------------
    if (e.key === "Enter" && !cmd && !alt) {
      e.preventDefault();
      const indent = autoIndentString(text, cursor);
      const newText = text.slice(0, cursor) + "\n" + indent + text.slice(selectionEnd);
      ctx.applyText(newText, cursor + 1 + indent.length);
      return true;
    }

    // -----------------------------------------------------------------------
    // Forward slurp: Ctrl+Shift+Right
    // -----------------------------------------------------------------------
    if (e.ctrlKey && !e.metaKey && e.shiftKey && e.key === "ArrowRight") {
      e.preventDefault();
      const result = forwardSlurp(text, cursor);
      if (result) ctx.applyText(result.text, result.cursor);
      return true;
    }

    // -----------------------------------------------------------------------
    // Forward barf: Ctrl+Shift+Left
    // -----------------------------------------------------------------------
    if (e.ctrlKey && !e.metaKey && e.shiftKey && e.key === "ArrowLeft") {
      e.preventDefault();
      const result = forwardBarf(text, cursor);
      if (result) ctx.applyText(result.text, result.cursor);
      return true;
    }

    // -----------------------------------------------------------------------
    // Kill to end of form: Ctrl+K
    // -----------------------------------------------------------------------
    if (e.ctrlKey && !e.metaKey && !alt && e.key === "k") {
      e.preventDefault();
      const result = killForm(text, cursor);
      if (result) ctx.applyText(result.text, result.cursor);
      return true;
    }

    // -----------------------------------------------------------------------
    // Kill expression: Ctrl+D
    // -----------------------------------------------------------------------
    if (e.ctrlKey && !e.metaKey && !alt && e.key === "d") {
      e.preventDefault();
      const result = killExpression(text, cursor);
      if (result) ctx.applyText(result.text, result.cursor);
      return true;
    }

    // -----------------------------------------------------------------------
    // Navigate by expression: Ctrl+Right / Ctrl+Left
    // -----------------------------------------------------------------------
    if (e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === "ArrowRight") {
      e.preventDefault();
      const next = findNextSibling(text, cursor);
      if (next) ctx.applyText(text, next.end);
      return true;
    }
    if (e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = findPrevSibling(text, cursor);
      if (prev) ctx.applyText(text, prev.start);
      return true;
    }

    return false; // key not handled
  },
};
