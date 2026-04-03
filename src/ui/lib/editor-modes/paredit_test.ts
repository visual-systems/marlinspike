import { assertEquals } from "@std/assert";
import { pareditMode } from "./paredit.ts";
import type { EditorContext } from "./types.ts";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a mock EditorContext from `text` and `cursor`. */
function ctx(text: string, cursor: number, selectionEnd?: number): EditorContext & {
  applied: { text: string; cursor: number } | null;
} {
  let applied: { text: string; cursor: number } | null = null;
  return {
    text,
    cursor,
    selectionEnd: selectionEnd ?? cursor,
    el: null as unknown as HTMLTextAreaElement,
    applyText(newText, newCursor) {
      applied = { text: newText, cursor: newCursor };
    },
    get applied() {
      return applied;
    },
  };
}

/** Fire a synthetic keydown through pareditMode.keyDown. Returns {consumed, applied}. */
function fire(
  c: ReturnType<typeof ctx>,
  key: string,
  mods: { cmd?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean } = {},
): { consumed: boolean; applied: typeof c.applied } {
  const e = {
    key,
    metaKey: mods.cmd ?? false,
    ctrlKey: mods.ctrl ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
    preventDefault: () => {},
  } as KeyboardEvent;
  const consumed = pareditMode.keyDown(e, c);
  return { consumed, applied: c.applied };
}

// ---------------------------------------------------------------------------
// Auto-close parens
// ---------------------------------------------------------------------------

Deno.test("paredit: auto-close ( inserts ()", () => {
  const c = ctx("hello", 5);
  const { consumed, applied } = fire(c, "(");
  assertEquals(consumed, true);
  assertEquals(applied, { text: "hello()", cursor: 6 });
});

Deno.test("paredit: auto-close [ inserts []", () => {
  const c = ctx("(a ", 3);
  const { consumed, applied } = fire(c, "[");
  assertEquals(consumed, true);
  assertEquals(applied, { text: "(a []", cursor: 4 });
});

Deno.test("paredit: auto-close { inserts {}", () => {
  const c = ctx("", 0);
  const { consumed, applied } = fire(c, "{");
  assertEquals(consumed, true);
  assertEquals(applied, { text: "{}", cursor: 1 });
});

Deno.test("paredit: auto-close with selection — passes through", () => {
  const c = ctx("hello", 1, 4); // selection 1..4
  const { consumed } = fire(c, "(");
  assertEquals(consumed, false); // not consumed — browser handles wrapping
});

// ---------------------------------------------------------------------------
// Auto-indent on Enter
// ---------------------------------------------------------------------------

Deno.test("paredit: Enter at top level — no indent", () => {
  const c = ctx("(def a)\n", 7);
  const { consumed, applied } = fire(c, "Enter");
  assertEquals(consumed, true);
  assertEquals(applied?.text, "(def a)\n\n");
  assertEquals(applied?.cursor, 8);
});

Deno.test("paredit: Enter inside a form — indents 2 from opening paren", () => {
  //  "(defn f\n|)"
  //   0123456 78
  // opening paren at col 0 → indent = 2 spaces
  const text = "(defn f\n)";
  const c = ctx(text, 8); // cursor just before ')'
  const { consumed, applied } = fire(c, "Enter");
  assertEquals(consumed, true);
  assertEquals(applied?.text, "(defn f\n\n  )");
  assertEquals(applied?.cursor, 9 + 2);
});

Deno.test("paredit: Enter inside nested form — indents from inner opening paren", () => {
  //  "(a (b|))"
  //   0123456
  // inner paren '(' at col 3 → indent = 5
  const text = "(a (b))";
  const c = ctx(text, 5); // cursor after 'b', inside (b)
  const { consumed, applied } = fire(c, "Enter");
  assertEquals(consumed, true);
  assertEquals(applied?.text, "(a (b\n     ))");
  assertEquals(applied?.cursor, 6 + 5);
});

Deno.test("paredit: Cmd+Enter is NOT consumed (applyCode handles it)", () => {
  const c = ctx("(a b)", 2);
  const { consumed } = fire(c, "Enter", { cmd: true });
  assertEquals(consumed, false);
});

// ---------------------------------------------------------------------------
// Forward slurp (Ctrl+Shift+Right)
// ---------------------------------------------------------------------------

Deno.test("paredit: forward slurp — swallows next sibling", () => {
  //  "(a (b c) d)"
  //   01234567890
  // cursor inside (b c), slurp d
  const text = "(a (b c) d)";
  const c = ctx(text, 5); // inside (b c)
  const { consumed, applied } = fire(c, "ArrowRight", { ctrl: true, shift: true });
  assertEquals(consumed, true);
  assertEquals(applied?.text, "(a (b c d))");
});

Deno.test("paredit: forward slurp — no next sibling → no change", () => {
  const text = "(a b c)";
  const c = ctx(text, 3); // last elements, no sibling after the form
  const { consumed, applied } = fire(c, "ArrowRight", { ctrl: true, shift: true });
  assertEquals(consumed, true);
  assertEquals(applied, null); // applyText not called
});

// ---------------------------------------------------------------------------
// Forward barf (Ctrl+Shift+Left)
// ---------------------------------------------------------------------------

Deno.test("paredit: forward barf — ejects last element", () => {
  //  "(a b c)"  cursor inside
  //   0123456
  const text = "(a b c)";
  const c = ctx(text, 3); // inside the form
  const { consumed, applied } = fire(c, "ArrowLeft", { ctrl: true, shift: true });
  assertEquals(consumed, true);
  assertEquals(applied?.text, "(a b) c");
});

Deno.test("paredit: forward barf — empty form → no change", () => {
  const text = "()";
  const c = ctx(text, 1);
  const { consumed, applied } = fire(c, "ArrowLeft", { ctrl: true, shift: true });
  assertEquals(consumed, true);
  assertEquals(applied, null);
});

// ---------------------------------------------------------------------------
// Kill to end of form (Ctrl+K)
// ---------------------------------------------------------------------------

Deno.test("paredit: Ctrl+K kills to end of form", () => {
  //  "(a b c)"  cursor at 3 (before 'b')
  const text = "(a b c)";
  const c = ctx(text, 3);
  const { consumed, applied } = fire(c, "k", { ctrl: true });
  assertEquals(consumed, true);
  assertEquals(applied?.text, "(a )");
  assertEquals(applied?.cursor, 3);
});

Deno.test("paredit: Ctrl+K at top level kills to end of line", () => {
  const text = "hello world\nfoo";
  const c = ctx(text, 5); // after 'hello'
  const { consumed, applied } = fire(c, "k", { ctrl: true });
  assertEquals(consumed, true);
  assertEquals(applied?.text, "hello\nfoo");
  assertEquals(applied?.cursor, 5);
});

// ---------------------------------------------------------------------------
// Kill expression (Ctrl+D)
// ---------------------------------------------------------------------------

Deno.test("paredit: Ctrl+D kills expression at cursor", () => {
  //  "(a b c)"  cursor at 3 ('b')
  const text = "(a b c)";
  const c = ctx(text, 3);
  const { consumed, applied } = fire(c, "d", { ctrl: true });
  assertEquals(consumed, true);
  assertEquals(applied?.text, "(a  c)");
  assertEquals(applied?.cursor, 3);
});

// ---------------------------------------------------------------------------
// Navigate by expression (Ctrl+Right / Ctrl+Left)
// ---------------------------------------------------------------------------

Deno.test("paredit: Ctrl+Right moves to end of next sibling", () => {
  //  "(a b c)"  cursor at 1 ('a') → end of next sibling 'b' = 4
  const text = "(a b c)";
  const c = ctx(text, 1);
  const { consumed, applied } = fire(c, "ArrowRight", { ctrl: true });
  assertEquals(consumed, true);
  assertEquals(applied?.cursor, 4); // end of 'b'
  assertEquals(applied?.text, text); // text unchanged
});

Deno.test("paredit: Ctrl+Left moves to start of previous sibling", () => {
  //  "(a b c)"  cursor at 5 ('c') → start of prev sibling 'b' = 3
  const text = "(a b c)";
  const c = ctx(text, 5);
  const { consumed, applied } = fire(c, "ArrowLeft", { ctrl: true });
  assertEquals(consumed, true);
  assertEquals(applied?.cursor, 3);
  assertEquals(applied?.text, text);
});

Deno.test("paredit: Ctrl+Right at last element → no move", () => {
  const text = "(a b c)";
  const c = ctx(text, 5); // 'c'
  const { consumed, applied } = fire(c, "ArrowRight", { ctrl: true });
  assertEquals(consumed, true);
  assertEquals(applied, null); // no next sibling, applyText not called
});

// ---------------------------------------------------------------------------
// Unhandled keys pass through
// ---------------------------------------------------------------------------

Deno.test("paredit: unhandled key not consumed", () => {
  const c = ctx("hello", 3);
  const { consumed } = fire(c, "a");
  assertEquals(consumed, false);
});
