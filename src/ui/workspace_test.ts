import { assertEquals } from "@std/assert";
import {
  defaultTreeNodes,
  ensureWorkspaceRoot,
  getFocusedRootNodes,
  getWorkspaceRoot,
  makeNode,
  makeRootNode,
  type WorkspaceState,
} from "./workspace.ts";

// ---------------------------------------------------------------------------
// Helper to build a minimal WorkspaceState for testing
// ---------------------------------------------------------------------------

function minimalWs(
  overrides: Partial<WorkspaceState> = {},
): WorkspaceState {
  const rootNodeId = "test-root-id";
  return {
    tabs: [{
      id: "t1",
      name: "Test",
      databaseId: "default",
      rootNodeId,
      panels: [],
    }],
    activeTabId: "t1",
    treeNodes: defaultTreeNodes(rootNodeId),
    edges: [],
    constraints: [],
    constraintApplications: [],
    personas: [],
    activePersona: null,
    workflows: [],
    activeWorkflow: null,
    connectedGraphs: [],
    focusId: null,
    canvasExpandedNodes: [],
    canvasNodePositions: {},
    canvasSelected: null,
    canvasAlgorithm: "SDF",
    entityDrafts: {},
    _snapshotCache: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// makeRootNode
// ---------------------------------------------------------------------------

Deno.test("makeRootNode: creates a root with given ID", () => {
  const children = [makeNode("a", "A", "leaf", [])];
  const root = makeRootNode("my-root-id", children);
  assertEquals(root.id, "my-root-id");
  assertEquals(root.label, "Workspace");
  assertEquals(root.kind, "composite");
  assertEquals(root.children, children);
});

// ---------------------------------------------------------------------------
// ensureWorkspaceRoot
// ---------------------------------------------------------------------------

Deno.test("ensureWorkspaceRoot: wraps plain nodes in a root with given ID", () => {
  const nodes = [makeNode("a", "A", "leaf", [])];
  const result = ensureWorkspaceRoot(nodes, "root-123");
  assertEquals(result.treeNodes.length, 1);
  assertEquals(result.treeNodes[0].id, "root-123");
  assertEquals(result.treeNodes[0].children, nodes);
  assertEquals(result.rootNodeId, "root-123");
});

Deno.test("ensureWorkspaceRoot: generates a UUID when no rootNodeId given", () => {
  const nodes = [makeNode("a", "A", "leaf", [])];
  const result = ensureWorkspaceRoot(nodes);
  assertEquals(result.treeNodes.length, 1);
  assertEquals(result.treeNodes[0].id, result.rootNodeId);
  assertEquals(result.treeNodes[0].children, nodes);
  // rootNodeId should be a non-empty string (UUID)
  assertEquals(result.rootNodeId.length > 0, true);
});

Deno.test("ensureWorkspaceRoot: does not double-wrap if root already present", () => {
  const rootId = "root-456";
  const nodes = [makeRootNode(rootId, [makeNode("a", "A", "leaf", [])])];
  const result = ensureWorkspaceRoot(nodes, rootId);
  assertEquals(result.treeNodes.length, 1);
  assertEquals(result.treeNodes[0].id, rootId);
  assertEquals(result.treeNodes[0].children.length, 1);
  assertEquals(result.treeNodes[0].children[0].id, "a");
});

Deno.test("ensureWorkspaceRoot: wraps empty array", () => {
  const result = ensureWorkspaceRoot([], "root-empty");
  assertEquals(result.treeNodes.length, 1);
  assertEquals(result.treeNodes[0].id, "root-empty");
  assertEquals(result.treeNodes[0].children.length, 0);
});

// ---------------------------------------------------------------------------
// getWorkspaceRoot
// ---------------------------------------------------------------------------

Deno.test("getWorkspaceRoot: finds root in default state", () => {
  const ws = minimalWs();
  const root = getWorkspaceRoot(ws);
  assertEquals(root?.id, "test-root-id");
});

Deno.test("getWorkspaceRoot: returns undefined when root node missing from tree", () => {
  const ws = minimalWs({ treeNodes: [makeNode("a", "A", "leaf", [])] });
  const root = getWorkspaceRoot(ws);
  assertEquals(root, undefined);
});

// ---------------------------------------------------------------------------
// defaultTreeNodes
// ---------------------------------------------------------------------------

Deno.test("defaultTreeNodes: returns tree wrapped in workspace root with given ID", () => {
  const nodes = defaultTreeNodes("my-root");
  assertEquals(nodes.length, 1);
  assertEquals(nodes[0].id, "my-root");
  assertEquals(nodes[0].children.length, 1);
  assertEquals(nodes[0].children[0].id, "spike://acme/backend");
});

// ---------------------------------------------------------------------------
// getFocusedRootNodes
// ---------------------------------------------------------------------------

Deno.test("getFocusedRootNodes: unfocused returns root's children, not root itself", () => {
  const ws = minimalWs();
  const focused = getFocusedRootNodes(ws);
  // Should return the children of the workspace root, not the root node
  assertEquals(focused.every((n) => n.id !== "test-root-id"), true);
  assertEquals(focused.length, 1);
  assertEquals(focused[0].id, "spike://acme/backend");
});

Deno.test("getFocusedRootNodes: focused on a composite returns its children", () => {
  const ws = minimalWs({ focusId: "spike://acme/backend" });
  const focused = getFocusedRootNodes(ws);
  assertEquals(focused.length, 2); // auth-service + frontend
});
