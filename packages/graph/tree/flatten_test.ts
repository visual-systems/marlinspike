import { assertEquals } from "@std/assert";
import type { TreeNode } from "./types.ts";
import type { FlatNode } from "./flatten.ts";
import { buildTree, flattenTree } from "./flatten.ts";
import { makeNode, makeRefNode, makeRootNode } from "./factory.ts";

function sampleTree(): TreeNode[] {
  return [
    {
      id: "root",
      label: "Root",
      kind: "composite",
      children: [
        {
          id: "a",
          label: "A",
          kind: "composite",
          children: [
            { id: "a1", label: "A1", kind: "leaf", children: [], data: {}, version: 1 },
            {
              id: "a2",
              label: "A2",
              kind: "leaf",
              children: [],
              data: {},
              version: 1,
              type: "ref",
              ref: "target",
            },
          ],
          data: {},
          version: 1,
        },
        {
          id: "b",
          label: "B",
          kind: "leaf",
          children: [],
          ports: [{ name: "in", direction: "in" as const }],
          data: { x: 42 },
          version: 2,
        },
      ],
      data: {},
      version: 1,
    },
  ];
}

Deno.test("flattenTree — produces correct number of rows", () => {
  const flat = flattenTree(sampleTree());
  assertEquals(flat.length, 5);
});

Deno.test("flattenTree — root has null parent", () => {
  const flat = flattenTree(sampleTree());
  assertEquals(flat[0].parent, null);
  assertEquals(flat[0].id, "root");
});

Deno.test("flattenTree — children have correct parent", () => {
  const flat = flattenTree(sampleTree());
  const byId = new Map(flat.map((f) => [f.id, f]));
  assertEquals(byId.get("a")!.parent, "root");
  assertEquals(byId.get("a1")!.parent, "a");
  assertEquals(byId.get("b")!.parent, "root");
});

Deno.test("flattenTree — preserves ref type", () => {
  const flat = flattenTree(sampleTree());
  const a2 = flat.find((f) => f.id === "a2")!;
  assertEquals(a2.type, "ref");
  assertEquals(a2.ref, "target");
});

Deno.test("flattenTree — preserves ports and data", () => {
  const flat = flattenTree(sampleTree());
  const b = flat.find((f) => f.id === "b")!;
  assertEquals(b.ports?.length, 1);
  assertEquals(b.data, { x: 42 });
  assertEquals(b.version, 2);
});

Deno.test("buildTree — round-trips from flattenTree", () => {
  const original = sampleTree();
  const flat = flattenTree(original);
  const rebuilt = buildTree(flat);
  assertEquals(rebuilt, original);
});

Deno.test("buildTree — handles empty input", () => {
  assertEquals(buildTree([]), []);
});

Deno.test("buildTree — round-trip with factory-created nodes is JSON-identical", () => {
  const httpIn = makeNode("http-in", "HTTP In", "leaf", []);
  httpIn.ports = [{ name: "request", direction: "out", type: "http.request" }];

  const validate = makeNode("validate", "Validate", "leaf", []);
  const transform = makeNode("transform", "Transform", "leaf", []);

  const pipeline = makeNode("pipeline", "Pipeline", "composite", [httpIn, validate, transform]);
  const logger = makeRefNode("logger-ref", "Logger", "logger-service");
  const tree = [makeRootNode("root", [pipeline, logger], "API Service")];

  const rebuilt = buildTree(flattenTree(tree));
  assertEquals(rebuilt, tree);
});

Deno.test("buildTree — handles flat input with multiple roots", () => {
  const flat: FlatNode[] = [
    { id: "x", label: "X", kind: "leaf", parent: null, data: {}, version: 1 },
    { id: "y", label: "Y", kind: "leaf", parent: null, data: {}, version: 1 },
  ];
  const result = buildTree(flat);
  assertEquals(result.length, 2);
  assertEquals(result[0].id, "x");
  assertEquals(result[1].id, "y");
});
