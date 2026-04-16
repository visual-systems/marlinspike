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
import { defaultTreeNodes, makeNode, makeRootNode, type WorkspaceState } from "../ui/workspace.ts";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const ROOT_ID = "root-uuid-abc";

function wsWithFocus(focusId: string | null): WorkspaceState {
  return {
    tabs: [{
      id: "t1",
      name: "Test",
      databaseId: "db-uuid",
      rootNodeId: ROOT_ID,
      panels: [],
    }],
    activeTabId: "t1",
    treeNodes: defaultTreeNodes(ROOT_ID),
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
    entityDrafts: {},
    _snapshotCache: {},
  };
}

// ---------------------------------------------------------------------------
// emitWorkspace
// ---------------------------------------------------------------------------

Deno.test("emitWorkspace: focused on workspace root omits the wrapper", () => {
  const code = emitWorkspace(wsWithFocus(ROOT_ID));
  // The `Workspace` wrapper form must not appear when we're inside it.
  assertEquals(code.includes("(def Workspace"), false);
  // Children should still be emitted.
  assertEquals(code.includes("acme/backend"), true);
});

Deno.test("emitWorkspace: virtual root (focusId=null) includes the wrapper", () => {
  const code = emitWorkspace(wsWithFocus(null));
  // At the virtual root the workspace IS the focused entity, so it shows up.
  assertEquals(code.includes("(def Workspace"), true);
  assertEquals(code.includes("acme/backend"), true);
});

Deno.test("emitWorkspace: focused on a child node emits only workspace children", () => {
  const code = emitWorkspace(wsWithFocus("spike://acme/backend"));
  // Same as focused-on-root: no wrapper. We're still "inside" the workspace.
  assertEquals(code.includes("(def Workspace"), false);
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
  assertEquals(treeNodes[0].label, "Workspace");
  assertEquals(treeNodes[0].children.length, 1);
  assertEquals(treeNodes[0].children[0].label, "hello");
});

Deno.test("parseWorkspace: unwraps explicit Workspace form and preserves root id", () => {
  const ws = wsWithFocus(null);
  const code = `(def child)
(def Workspace [child])`;
  const { treeNodes, errors } = parseWorkspace(code, ws);
  assertEquals(errors, []);
  assertEquals(treeNodes.length, 1);
  // The explicit `(def Workspace [...])` form's id would be "Workspace" from
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
