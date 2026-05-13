import { assertEquals } from "@std/assert";
import { makeNode, makeRefNode, makeRootNode } from "./factory.ts";

Deno.test("makeNode — creates a leaf with correct defaults", () => {
  const node = makeNode("id1", "Label", "leaf", []);
  assertEquals(node.id, "id1");
  assertEquals(node.label, "Label");
  assertEquals(node.kind, "leaf");
  assertEquals(node.children, []);
  assertEquals(node.data, {});
  assertEquals(node.version, 1);
  assertEquals(node.uri, undefined);
});

Deno.test("makeNode — accepts uri", () => {
  const node = makeNode("id1", "Label", "composite", [], "spike://test");
  assertEquals(node.uri, "spike://test");
});

Deno.test("makeRefNode — creates reference node", () => {
  const node = makeRefNode("ref1", "MyRef", "target-id");
  assertEquals(node.type, "ref");
  assertEquals(node.ref, "target-id");
  assertEquals(node.kind, "composite");
  assertEquals(node.children, []);
});

Deno.test("makeRootNode — default label is Untitled", () => {
  const node = makeRootNode("root1", []);
  assertEquals(node.label, "Untitled");
  assertEquals(node.kind, "composite");
});

Deno.test("makeRootNode — accepts custom label", () => {
  const node = makeRootNode("root1", [], "Custom");
  assertEquals(node.label, "Custom");
});

Deno.test("makeRootNode — wraps children", () => {
  const child = makeNode("c1", "Child", "leaf", []);
  const root = makeRootNode("root1", [child]);
  assertEquals(root.children.length, 1);
  assertEquals(root.children[0].id, "c1");
});
