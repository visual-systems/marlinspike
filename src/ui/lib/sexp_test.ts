import { assertEquals } from "@std/assert";
import {
  columnOf,
  findEnclosingForm,
  findFormAt,
  findNextSibling,
  findPrevSibling,
  lineIndent,
} from "./sexp.ts";

// ---------------------------------------------------------------------------
// findEnclosingForm
// ---------------------------------------------------------------------------

Deno.test("findEnclosingForm — top level returns null", () => {
  // pos=7 is past the closing paren of "(a b c)" — top level
  assertEquals(findEnclosingForm("(a b c)", 7), null);
  assertEquals(findEnclosingForm("hello world", 3), null);
});

Deno.test("findEnclosingForm — simple form", () => {
  //                             0123456
  const text = "(a b c)";
  assertEquals(findEnclosingForm(text, 1), { start: 0, end: 7 });
  assertEquals(findEnclosingForm(text, 3), { start: 0, end: 7 });
  assertEquals(findEnclosingForm(text, 5), { start: 0, end: 7 });
});

Deno.test("findEnclosingForm — nested forms", () => {
  //                             0123456789012
  const text = "(a (b c) d)";
  // pos=4 is inside the inner form (b c)
  assertEquals(findEnclosingForm(text, 4), { start: 3, end: 8 });
  // pos=9 is 'd', inside the outer form
  assertEquals(findEnclosingForm(text, 9), { start: 0, end: 11 });
});

Deno.test("findEnclosingForm — cursor at closing paren", () => {
  const text = "(a b)";
  // pos=4 is ')' itself — inside the form
  assertEquals(findEnclosingForm(text, 4), { start: 0, end: 5 });
});

Deno.test("findEnclosingForm — empty text", () => {
  assertEquals(findEnclosingForm("", 0), null);
});

// ---------------------------------------------------------------------------
// findFormAt
// ---------------------------------------------------------------------------

Deno.test("findFormAt — atom", () => {
  const text = "hello world";
  assertEquals(findFormAt(text, 0), { start: 0, end: 5 });
  assertEquals(findFormAt(text, 4), { start: 0, end: 5 });
  assertEquals(findFormAt(text, 6), { start: 6, end: 11 });
});

Deno.test("findFormAt — balanced form", () => {
  const text = "(a b c)";
  // pos=0 is the '(' itself → the whole form
  assertEquals(findFormAt(text, 0), { start: 0, end: 7 });
  // pos=3 is the atom 'b' → the atom itself (most specific)
  assertEquals(findFormAt(text, 3), { start: 3, end: 4 });
  // pos=6 is the closing ')' → no form "at" this position
  assertEquals(findFormAt(text, 6), null);
});

Deno.test("findFormAt — multiple top-level forms", () => {
  const text = "(def a) (def b)";
  assertEquals(findFormAt(text, 0), { start: 0, end: 7 });
  assertEquals(findFormAt(text, 8), { start: 8, end: 15 });
});

Deno.test("findFormAt — nested: returns innermost containing form starting <= pos", () => {
  const text = "(a (b c))";
  // pos=3 is '(' of inner form — returns the inner form since it contains pos
  assertEquals(findFormAt(text, 3), { start: 3, end: 8 });
});

Deno.test("findFormAt — empty text", () => {
  assertEquals(findFormAt("", 0), null);
});

// ---------------------------------------------------------------------------
// findNextSibling
// ---------------------------------------------------------------------------

Deno.test("findNextSibling — inside a form", () => {
  //                             0123456789
  const text = "(a b c d)";
  // pos=1 is 'a'; next sibling starts at 3 ('b')
  assertEquals(findNextSibling(text, 1), { start: 3, end: 4 });
  // pos=3 is 'b'; next sibling is 'c' at 5
  assertEquals(findNextSibling(text, 3), { start: 5, end: 6 });
  // pos=7 is 'd'; no next sibling
  assertEquals(findNextSibling(text, 7), null);
});

Deno.test("findNextSibling — nested", () => {
  const text = "(a (b c) d)";
  // pos=1 is 'a'; next sibling is the inner form (b c) at 3
  assertEquals(findNextSibling(text, 1), { start: 3, end: 8 });
  // pos=4 is 'b' inside (b c); next sibling within (b c) is 'c' at 6
  assertEquals(findNextSibling(text, 4), { start: 6, end: 7 });
});

Deno.test("findNextSibling — top level", () => {
  const text = "(def a) (def b)";
  // pos=7 is the space between forms (top level) → next top-level form starts at 8
  assertEquals(findNextSibling(text, 7), { start: 8, end: 15 });
});

// ---------------------------------------------------------------------------
// findPrevSibling
// ---------------------------------------------------------------------------

Deno.test("findPrevSibling — inside a form", () => {
  const text = "(a b c d)";
  // pos=7 is 'd'; prev sibling is 'c' at 5
  assertEquals(findPrevSibling(text, 7), { start: 5, end: 6 });
  // pos=5 is 'c'; prev sibling is 'b' at 3
  assertEquals(findPrevSibling(text, 5), { start: 3, end: 4 });
  // pos=1 is 'a'; no prev sibling
  assertEquals(findPrevSibling(text, 1), null);
});

// ---------------------------------------------------------------------------
// lineIndent / columnOf
// ---------------------------------------------------------------------------

Deno.test("lineIndent — first line no indent", () => {
  assertEquals(lineIndent("(def a)", 0), 0);
});

Deno.test("lineIndent — indented second line", () => {
  const text = "(defn f []\n  (a b))";
  // pos=12 is '(' on the second line (2 spaces indent)
  assertEquals(lineIndent(text, 12), 2);
});

Deno.test("columnOf — first char", () => {
  assertEquals(columnOf("hello", 0), 0);
  assertEquals(columnOf("hello", 3), 3);
});

Deno.test("columnOf — second line", () => {
  const text = "abc\ndef";
  assertEquals(columnOf(text, 4), 0); // 'd'
  assertEquals(columnOf(text, 6), 2); // 'f'
});
