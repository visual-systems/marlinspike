/**
 * Tests for the focus-aware workspace ↔ Spike-Clojure codec.
 *
 * Covers:
 *   - Emit hides the workspace wrapper when focused inside the workspace.
 *   - Emit includes the workspace wrapper at the virtual root.
 *   - Parse re-wraps unwrapped input back into the preserved rootNodeId.
 *   - Parse preserves rootNodeId when the user explicitly included the wrapper.
 *   - Round-trip in both focus modes yields an equivalent tree.
 */

import { assertEquals } from "@std/assert";
import { emitWorkspace, parseWorkspace } from "./workspace-codec.ts";
import {
  DEFAULT_PROFILE,
  defaultTreeNodes,
  makeNode,
  makeRootNode,
  type TreeNode,
  type WorkspaceState,
} from "../ui/workspace.ts";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const ROOT_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

/** Build a workspace with a backend composite containing auth-service + frontend. */
function testTreeNodes(rootId: string): TreeNode[] {
  return [makeRootNode(rootId, [
    makeNode("spike://acme/backend", "acme/backend", "composite", [
      makeNode("spike://acme/backend/auth-service", "auth-service", "leaf", []),
      makeNode("spike://acme/backend/frontend", "frontend", "leaf", []),
    ]),
  ])];
}

function wsWithFocus(focusId: string | null): WorkspaceState {
  return {
    profiles: [DEFAULT_PROFILE],
    activeProfileId: DEFAULT_PROFILE.id,
    databaseId: "db-uuid",
    profileRootId: "profile-root",
    activeWorkspaceId: ROOT_ID,
    panels: [],
    treeNodes: testTreeNodes(ROOT_ID),
    edges: [],
    constraints: [],
    constraintApplications: [],
    personas: [],
    activePersona: null,
    workflows: [],
    activeWorkflow: null,
    connectedGraphs: [],
    focusId,
    canvasExpandedNodes: [],
    canvasNodePositions: {},
    canvasSelected: null,
    canvasAlgorithm: "SDF",
    canvasThemeId: "classic",
    canvasShowRefEdges: false,
    entityDrafts: {},
  };
}

// ---------------------------------------------------------------------------
// emitWorkspace
// ---------------------------------------------------------------------------

Deno.test("emitWorkspace: focused on workspace root omits the wrapper", () => {
  const code = emitWorkspace(wsWithFocus(ROOT_ID));
  // The wrapper form must not appear when we're inside it.
  assertEquals(code.includes("(def Untitled"), false);
  // Children should still be emitted.
  assertEquals(code.includes("acme/backend"), true);
});

Deno.test("emitWorkspace: virtual root (focusId=null) includes the wrapper", () => {
  const code = emitWorkspace(wsWithFocus(null));
  // At the virtual root the workspace IS the focused entity, so it shows up.
  // Emits with ^{:id "..."} metadata since root id is a UUID.
  assertEquals(/\(def\s+\^\{:id\s+"[^"]+"\}\s+Untitled/.test(code), true);
  assertEquals(code.includes("acme/backend"), true);
});

Deno.test("emitWorkspace: focused on a child node emits only workspace children", () => {
  const code = emitWorkspace(wsWithFocus("spike://acme/backend"));
  // Same as focused-on-root: no wrapper. We're still "inside" the workspace.
  assertEquals(code.includes("(def Untitled"), false);
});

// ---------------------------------------------------------------------------
// parseWorkspace
// ---------------------------------------------------------------------------

Deno.test("parseWorkspace: re-wraps unwrapped input in existing root", () => {
  const ws = wsWithFocus(ROOT_ID);
  const { treeNodes, errors } = parseWorkspace("(def hello)", ws);
  assertEquals(errors, []);
  assertEquals(treeNodes.length, 1);
  // Root node id is preserved — not replaced by the parsed node's label-based id.
  assertEquals(treeNodes[0].id, ROOT_ID);
  assertEquals(treeNodes[0].label, "Untitled");
  assertEquals(treeNodes[0].children.length, 1);
  assertEquals(treeNodes[0].children[0].label, "hello");
});

Deno.test("parseWorkspace: unwraps explicit root form and preserves root id", () => {
  const ws = wsWithFocus(null);
  const code = `(def child)
(def Untitled [child])`;
  const { treeNodes, errors } = parseWorkspace(code, ws);
  assertEquals(errors, []);
  assertEquals(treeNodes.length, 1);
  // The explicit `(def Untitled [...])` form's id would be "Untitled" from
  // the parser; we must replace it with the preserved UUID.
  assertEquals(treeNodes[0].id, ROOT_ID);
  assertEquals(treeNodes[0].children.length, 1);
  assertEquals(treeNodes[0].children[0].label, "child");
});

Deno.test("parseWorkspace: propagates parser errors", () => {
  const ws = wsWithFocus(ROOT_ID);
  const { errors } = parseWorkspace("(def broken", ws);
  assertEquals(errors.length > 0, true);
});

Deno.test("parseWorkspace: empty input wraps an empty workspace", () => {
  const ws = wsWithFocus(ROOT_ID);
  const { treeNodes, errors } = parseWorkspace("", ws);
  assertEquals(errors, []);
  assertEquals(treeNodes.length, 1);
  assertEquals(treeNodes[0].id, ROOT_ID);
  assertEquals(treeNodes[0].children.length, 0);
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

Deno.test("emitWorkspace → parseWorkspace round-trip (workspace focus)", () => {
  const ws = wsWithFocus(ROOT_ID);
  const code = emitWorkspace(ws);
  const { treeNodes, errors } = parseWorkspace(code, ws);
  assertEquals(errors, []);
  // Labels of direct children survive the round-trip.
  const originalChildLabels = ws.treeNodes[0].children.map((c) => c.label).sort();
  const roundTripChildLabels = treeNodes[0].children.map((c) => c.label).sort();
  assertEquals(roundTripChildLabels, originalChildLabels);
  assertEquals(treeNodes[0].id, ROOT_ID);
});

Deno.test("emitWorkspace → parseWorkspace round-trip (virtual root)", () => {
  const ws = wsWithFocus(null);
  const code = emitWorkspace(ws);
  const { treeNodes, errors } = parseWorkspace(code, ws);
  assertEquals(errors, []);
  assertEquals(treeNodes[0].id, ROOT_ID);
  const originalChildLabels = ws.treeNodes[0].children.map((c) => c.label).sort();
  const roundTripChildLabels = treeNodes[0].children.map((c) => c.label).sort();
  assertEquals(roundTripChildLabels, originalChildLabels);
});

Deno.test("parseWorkspace: custom root label (non-'Workspace') still unwraps", () => {
  // Simulate a future where the root label tracks the tab/workspace name.
  const ws = wsWithFocus(null);
  const customRoot = makeRootNode(ROOT_ID, [makeNode("alpha", "alpha", "leaf", [])]);
  const customWs: WorkspaceState = {
    ...ws,
    treeNodes: [{ ...customRoot, label: "MyProject" }],
  };
  const code = `(def alpha)
(def MyProject [alpha])`;
  const { treeNodes, errors } = parseWorkspace(code, customWs);
  assertEquals(errors, []);
  assertEquals(treeNodes[0].id, ROOT_ID);
  assertEquals(treeNodes[0].children.map((c) => c.label), ["alpha"]);
});

// ---------------------------------------------------------------------------
// Merger — identity preservation
// ---------------------------------------------------------------------------

/** Build a WorkspaceState with an explicit tree and focus. */
function wsWith(treeNodes: TreeNode[], focusId: string | null): WorkspaceState {
  return {
    profiles: [DEFAULT_PROFILE],
    activeProfileId: DEFAULT_PROFILE.id,
    databaseId: "db-uuid",
    profileRootId: "profile-root",
    activeWorkspaceId: ROOT_ID,
    panels: [],
    treeNodes,
    edges: [],
    constraints: [],
    constraintApplications: [],
    personas: [],
    activePersona: null,
    workflows: [],
    activeWorkflow: null,
    connectedGraphs: [],
    focusId,
    canvasExpandedNodes: [],
    canvasNodePositions: {},
    canvasSelected: null,
    canvasAlgorithm: "SDF",
    canvasThemeId: "classic",
    canvasShowRefEdges: false,
    entityDrafts: {},
  };
}

Deno.test("merger: renaming a sibling via UUID preserves id (rename)", () => {
  // Existing: workspace root with one child whose id is a UUID distinct from label.
  const CHILD = "11111111-1111-4111-8111-111111111111";
  const root = makeRootNode(ROOT_ID, [
    { ...makeNode(CHILD, "old-name", "leaf", []), data: { note: "keep me" } },
  ]);
  const ws = wsWith([root], ROOT_ID);

  // User rewrites code with uuid meta but a new label.
  const code = `(def ^{:id "${CHILD}"} new-name)`;
  const { treeNodes, errors } = parseWorkspace(code, ws);
  assertEquals(errors, []);
  const children = treeNodes[0].children;
  assertEquals(children.length, 1);
  assertEquals(children[0].id, CHILD);
  assertEquals(children[0].label, "new-name");
  // Existing data survives the merge.
  assertEquals(children[0].data.note, "keep me");
  // Version bumps on change.
  assertEquals(children[0].version > 1, true);
});

Deno.test("merger: rename by sibling-label match (no UUID meta)", () => {
  // Existing: composite with child "alpha" whose id is a UUID.
  const ALPHA = "22222222-2222-4222-8222-222222222222";
  const root = makeRootNode(ROOT_ID, [
    makeNode(ALPHA, "alpha", "leaf", []),
  ]);
  const ws = wsWith([root], ROOT_ID);

  // User types `(def alpha)` with NO uuid meta — matches by sibling label.
  const code = `(def alpha)`;
  const { treeNodes, errors } = parseWorkspace(code, ws);
  assertEquals(errors, []);
  const children = treeNodes[0].children;
  assertEquals(children.length, 1);
  assertEquals(children[0].id, ALPHA); // id preserved by label match
});

Deno.test("merger: new node (no uuid, no label match) keeps label-as-id", () => {
  const ws = wsWith(defaultTreeNodes(ROOT_ID), ROOT_ID);
  // Add a wholly new top-level child.
  const code = `(def brand-new-thing)`;
  const { treeNodes, errors } = parseWorkspace(code, ws);
  assertEquals(errors, []);
  const children = treeNodes[0].children;
  // Only `brand-new-thing` remains (existing siblings dropped — they were in scope).
  assertEquals(children.length, 1);
  assertEquals(children[0].label, "brand-new-thing");
  // Label-derived id — no automatic UUID minting.
  assertEquals(children[0].id, "brand-new-thing");
});

Deno.test("merger: move a node across containers via UUID (global match)", () => {
  // Two sibling composites; `item` lives inside FROM; user moves it to TO.
  //
  // Composite child vectors only list labels — UUIDs are attached to each
  // child's separate `(def name)` form. Resolution happens via nameUuid map.
  const FROM = "33333333-3333-4333-8333-333333333333";
  const TO = "44444444-4444-4444-8444-444444444444";
  const ITEM = "55555555-5555-4555-8555-555555555555";
  const root = makeRootNode(ROOT_ID, [
    makeNode(FROM, "from", "composite", [
      makeNode(ITEM, "item", "leaf", []),
    ]),
    makeNode(TO, "to", "composite", []),
  ]);
  const ws = wsWith([root], ROOT_ID);

  // User rewrites so ITEM now lives inside TO instead of FROM.
  const code = `(def ^{:id "${ITEM}"} item)
(def ^{:id "${FROM}"} from)
(def ^{:id "${TO}"} to [item])`;
  const { treeNodes, errors } = parseWorkspace(code, ws);
  assertEquals(errors, []);
  const rootNode = treeNodes[0];
  const to = rootNode.children.find((c) => c.id === TO)!;
  assertEquals(to.children.length, 1);
  assertEquals(to.children[0].id, ITEM);
  assertEquals(to.children[0].label, "item");
});

Deno.test("merger: removing a sibling drops it from the tree", () => {
  const A = "66666666-6666-4666-8666-666666666666";
  const B = "77777777-7777-4777-8777-777777777777";
  const root = makeRootNode(ROOT_ID, [
    makeNode(A, "alpha", "leaf", []),
    makeNode(B, "bravo", "leaf", []),
  ]);
  const ws = wsWith([root], ROOT_ID);

  // User keeps only bravo.
  const code = `(def ^{:id "${B}"} bravo)`;
  const { treeNodes, errors } = parseWorkspace(code, ws);
  assertEquals(errors, []);
  const children = treeNodes[0].children;
  assertEquals(children.length, 1);
  assertEquals(children[0].id, B);
});

Deno.test("merger: new node with no match keeps label as id", () => {
  // Existing tree has a child with a non-UUID id ("foo").
  const root = makeRootNode(ROOT_ID, [makeNode("foo", "foo", "leaf", [])]);
  const ws = wsWith([root], ROOT_ID);

  // User renames it to `bar` — no label match, no uuid match, keeps label-as-id.
  const code = `(def bar)`;
  const { treeNodes, errors } = parseWorkspace(code, ws);
  assertEquals(errors, []);
  const child = treeNodes[0].children[0];
  assertEquals(child.label, "bar");
  assertEquals(child.id, "bar");
});

// ---------------------------------------------------------------------------
// Merger — edge scope
// ---------------------------------------------------------------------------

Deno.test("merger: out-of-scope edges are preserved when focused on a container", () => {
  // Composite FOO contains A, B. Composite BAR contains C, D.
  // Edge inside FOO: A→B. Edge inside BAR: C→D. Edge crossing: B→C.
  const FOO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const BAR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const C = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const D = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const root = makeRootNode(ROOT_ID, [
    makeNode(FOO, "foo", "composite", [
      makeNode(A, "a", "leaf", []),
      makeNode(B, "b", "leaf", []),
    ]),
    makeNode(BAR, "bar", "composite", [
      makeNode(C, "c", "leaf", []),
      makeNode(D, "d", "leaf", []),
    ]),
  ]);
  const ws: WorkspaceState = {
    ...wsWith([root], FOO),
    edges: [
      { id: "e-ab", fromId: A, toId: B, label: "", data: {}, version: 1 },
      { id: "e-cd", fromId: C, toId: D, label: "", data: {}, version: 1 },
      { id: "e-bc", fromId: B, toId: C, label: "", data: {}, version: 1 },
    ],
  };

  // Focused on FOO — user drops the A→B edge entirely, leaves only nodes.
  const code = `(def ^{:id "${A}"} a)
(def ^{:id "${B}"} b)`;
  const { treeNodes: _tn, edges, errors } = parseWorkspace(code, ws);
  assertEquals(errors, []);
  // In-scope edge A→B is replaced (dropped).
  assertEquals(edges.find((e) => e.id === "e-ab"), undefined);
  // Out-of-scope edge C→D is preserved as-is.
  assertEquals(edges.find((e) => e.id === "e-cd")?.fromId, C);
  // Crossing edge B→C stays (one endpoint outside the scope).
  assertEquals(edges.find((e) => e.id === "e-bc")?.toId, C);
});
