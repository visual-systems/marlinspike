// ---------------------------------------------------------------------------
// S-expression structural utilities
//
// These functions operate on raw text (a Spike-Clojure / Lisp-family source
// string) and return character-offset ranges {start, end} describing the
// boundaries of expressions. They are used by the paredit editor mode to
// implement structural editing without a full AST.
//
// Definitions:
//  - A "form" is any balanced parenthesised group `(…)` or a bare atom.
//  - "start" is inclusive (index of first character).
//  - "end" is exclusive (index one past the last character).
// ---------------------------------------------------------------------------

export interface Range {
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Internal scanner helpers
// ---------------------------------------------------------------------------

/** Skip past a string literal starting at `i` (where text[i] === '"'). */
function skipString(text: string, i: number): number {
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === "\\" && j + 1 < text.length) {
      j += 2;
    } else if (text[j] === '"') {
      return j + 1;
    } else {
      j++;
    }
  }
  return j;
}

/** Skip a line comment starting at `i` (where text[i] === ';'). */
function skipComment(text: string, i: number): number {
  let j = i;
  while (j < text.length && text[j] !== "\n") j++;
  return j;
}

/**
 * Skip a single "token" (atom, string, or whitespace blob) starting at `i`.
 * Returns the index just past the token. Does NOT handle `(` — callers do
 * that for balanced forms.
 */
function skipAtom(text: string, i: number): number {
  if (i >= text.length) return i;
  const ch = text[i];
  if (/[\s,]/.test(ch)) {
    let j = i + 1;
    while (j < text.length && /[\s,]/.test(text[j])) j++;
    return j;
  }
  if (ch === ";") return skipComment(text, i);
  if (ch === '"') return skipString(text, i);
  // Everything else up to a delimiter
  let j = i + 1;
  while (j < text.length && !/[\s,()[\]{}"`;]/.test(text[j])) j++;
  return j;
}

/**
 * Skip a complete s-expression starting at `i`.
 * Handles nested parens, strings, and comments.
 * Returns the index just past the expression.
 */
function skipForm(text: string, i: number): number {
  if (i >= text.length) return i;
  const ch = text[i];
  if (ch === "(" || ch === "[" || ch === "{") {
    const close = ch === "(" ? ")" : ch === "[" ? "]" : "}";
    let j = i + 1;
    while (j < text.length && text[j] !== close) {
      if (/[\s,]/.test(text[j])) {
        j = skipAtom(text, j);
      } else if (text[j] === ";") {
        j = skipComment(text, j);
      } else if (text[j] === '"') {
        j = skipString(text, j);
      } else if ("([{".includes(text[j])) {
        j = skipForm(text, j);
      } else {
        j = skipAtom(text, j);
      }
    }
    return j < text.length ? j + 1 : j; // skip closing bracket
  }
  // Bare atom / string / comment
  return skipAtom(text, i);
}

/** Skip whitespace and comments at position `i`. Returns new position. */
function skipWS(text: string, i: number): number {
  let j = i;
  while (j < text.length) {
    if (/[\s,]/.test(text[j])) {
      j++;
    } else if (text[j] === ";") {
      j = skipComment(text, j);
    } else {
      break;
    }
  }
  return j;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find the innermost balanced form `(…)` that *contains* position `pos`.
 * Returns {start, end} of the outer parens, or null if `pos` is at top level
 * (not inside any parens).
 */
export function findEnclosingForm(text: string, pos: number): Range | null {
  // Scan from the start, tracking open parens on a stack
  const stack: number[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ";") {
      i = skipComment(text, i);
    } else if (ch === '"') {
      const end = skipString(text, i);
      // If pos is inside a string, treat the string as a unit
      if (i <= pos && pos < end) return { start: i, end };
      i = end;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      stack.push(i);
      i++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      const open = stack.pop();
      if (open !== undefined && open < pos && pos <= i) {
        // `pos` is inside this pair
        return { start: open, end: i + 1 };
      }
      i++;
    } else {
      i++;
    }
  }
  // pos is at top level
  return null;
}

/**
 * Find the most-specific complete form (balanced paren group or bare atom)
 * that contains `pos`. For a pos inside an atom like `hello`, returns the
 * range of the whole atom. For a pos at the opening paren of a group, returns
 * that group. For a pos on whitespace with no containing form, returns null.
 *
 * Differs from `findEnclosingForm` in that it returns the atom/form AT the
 * cursor rather than the paren group that surrounds it.
 */
export function findFormAt(text: string, pos: number): Range | null {
  // Find the innermost balanced paren group that "encloses" pos.
  const enclosing = findEnclosingForm(text, pos);

  // If pos is exactly at the opening delimiter, the enclosing form IS the form at pos.
  if (enclosing && pos === enclosing.start) return enclosing;

  // Search within the enclosing context for the direct child that contains pos.
  const searchStart = enclosing ? enclosing.start + 1 : 0;
  const searchEnd = enclosing ? enclosing.end - 1 : text.length;

  let i = skipWS(text, searchStart);
  while (i < searchEnd) {
    const ch = text[i];
    if (/[\s,]/.test(ch)) {
      i++;
      continue;
    }
    if (ch === ";") {
      i = skipComment(text, i);
      continue;
    }
    const formEnd = skipForm(text, i);
    if (i <= pos && pos < formEnd) {
      return { start: i, end: formEnd };
    }
    i = formEnd;
  }
  return null;
}

/**
 * Find the next sibling form *after* `pos` within the innermost enclosing
 * form. Returns {start, end} or null if there is no next sibling.
 *
 * "After" means: the first form whose start is strictly greater than `pos`.
 */
export function findNextSibling(text: string, pos: number): Range | null {
  const enclosing = findEnclosingForm(text, pos);
  // Search range: after `pos` up to the closing paren (or end of text)
  const searchEnd = enclosing ? enclosing.end - 1 : text.length;
  let i = skipWS(text, pos + 1);
  while (i < searchEnd) {
    const ch = text[i];
    if (/[\s,]/.test(ch)) {
      i++;
      continue;
    }
    if (ch === ";") {
      i = skipComment(text, i);
      continue;
    }
    // Found a form
    const formEnd = skipForm(text, i);
    return { start: i, end: formEnd };
  }
  return null;
}

/**
 * Find the previous sibling form *before* `pos` within the innermost enclosing
 * form. Returns {start, end} or null if there is no previous sibling.
 */
export function findPrevSibling(text: string, pos: number): Range | null {
  const enclosing = findEnclosingForm(text, pos);
  const searchStart = enclosing ? enclosing.start + 1 : 0;

  // Collect all sibling forms up to pos, return the last one
  let i = skipWS(text, searchStart);
  let last: Range | null = null;
  while (i < pos) {
    const ch = text[i];
    if (/[\s,]/.test(ch)) {
      i++;
      continue;
    }
    if (ch === ";") {
      i = skipComment(text, i);
      continue;
    }
    const formEnd = skipForm(text, i);
    if (formEnd <= pos) {
      last = { start: i, end: formEnd };
    }
    i = formEnd;
  }
  return last;
}

/**
 * Return the column (0-based) of the first non-whitespace character on the
 * line where `pos` sits. Used for auto-indent calculations.
 */
export function lineIndent(text: string, pos: number): number {
  // Find start of line
  let lineStart = pos;
  while (lineStart > 0 && text[lineStart - 1] !== "\n") lineStart--;
  // Find first non-ws on that line
  let col = 0;
  let j = lineStart;
  while (j < text.length && text[j] === " ") {
    col++;
    j++;
  }
  return col;
}

/**
 * Return the column (0-based) of the character at position `pos`
 * within its line.
 */
export function columnOf(text: string, pos: number): number {
  let lineStart = pos;
  while (lineStart > 0 && text[lineStart - 1] !== "\n") lineStart--;
  return pos - lineStart;
}
