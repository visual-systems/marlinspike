/**
 * Tests for base_lisp reader/printer — focused on reader metadata (`^{...}`).
 *
 * Existing forms are indirectly covered by spike-clojure round-trip tests.
 * These tests target the metadata feature specifically, including the
 * interaction with `^Type` param hints (which must still read as symbols).
 */

import { assertEquals, assertThrows } from "@std/assert";
import { parse, parseOne, print, type SExp } from "./base_lisp.ts";

// ---------------------------------------------------------------------------
// ^{...} metadata
// ---------------------------------------------------------------------------

Deno.test("^{...} attaches metadata to the following symbol", () => {
  const form = parseOne(`^{:uuid "abc"} Name`);
  if (form.type !== "symbol") throw new Error("expected symbol");
  assertEquals(form.value, "Name");
  assertEquals(form.meta?.type, "map");
  if (form.meta?.type === "map") {
    assertEquals(form.meta.entries.length, 1);
    assertEquals(form.meta.entries[0][0], { type: "keyword", value: "uuid" });
    assertEquals(form.meta.entries[0][1], { type: "string", value: "abc" });
  }
});

Deno.test("^{...} attaches metadata inside a list", () => {
  const form = parseOne(`(def ^{:uuid "xyz"} Workspace [a b])`);
  assertEquals(form.type, "list");
  if (form.type !== "list") return;
  const name = form.items[1];
  assertEquals(name.type, "symbol");
  assertEquals(name.meta?.type, "map");
});

Deno.test("^{...} may have whitespace before the map", () => {
  const form = parseOne(`^ {:k 1} sym`);
  assertEquals(form.meta?.type, "map");
});

Deno.test("multiple ^{...} stack; outer (leftmost) wins on key collision", () => {
  // Matches Clojure reader semantics: each `^` wraps the next form, with the
  // outer meta merged over the inner one — so leftmost / outermost wins.
  const form = parseOne(`^{:a 1 :b 2} ^{:a 99} sym`);
  assertEquals(form.meta?.type, "map");
  if (form.meta?.type !== "map") return;
  const asObj = Object.fromEntries(
    form.meta.entries.map(([k, v]) => [
      k.type === "keyword" ? k.value : "?",
      v.type === "number" ? v.value : null,
    ]),
  );
  assertEquals(asObj, { a: 1, b: 2 });
});

Deno.test("^Type (no map) continues to read as a symbol prefix (not metadata)", () => {
  // spike-clojure relies on `^float` being a single symbol for port-type hints.
  const forms = parse("^float a");
  assertEquals(forms.length, 2);
  assertEquals(forms[0], { type: "symbol", value: "^float" });
  assertEquals(forms[1], { type: "symbol", value: "a" });
});

Deno.test("^{...} missing target form is an error", () => {
  assertThrows(() => parse('^{:uuid "x"}'));
});

Deno.test("bare ^{...} without closing is an error", () => {
  assertThrows(() => parse("^{:uuid x"));
});

// ---------------------------------------------------------------------------
// printer round-trip
// ---------------------------------------------------------------------------

Deno.test("print round-trips metadata", () => {
  const src = `(def ^{:uuid "abc-123"} Name [a b])`;
  const reparsed = parseOne(print(parseOne(src)));
  assertEquals(reparsed.type, "list");
  if (reparsed.type !== "list") return;
  const name = reparsed.items[1];
  assertEquals(name.type, "symbol");
  assertEquals((name as SExp & { type: "symbol" }).value, "Name");
  assertEquals(name.meta?.type, "map");
});

Deno.test("print preserves meta-free forms unchanged", () => {
  const src = "(defn f [a b] (+ a b))";
  assertEquals(print(parseOne(src)), src);
});
