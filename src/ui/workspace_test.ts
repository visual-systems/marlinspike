import { assertEquals } from "@std/assert";
import {
  type ConstraintApplication,
  DEFAULT_PROFILE,
  defaultTreeNodes,
  ensureWorkspaceConstraint,
  ensureWorkspaceRoot,
  getConnectionConfig,
  getFocusedRootNodes,
  getWorkspaceRoot,
  makeNode,
  makeRootNode,
  type WorkspaceState,
} from "./workspace.ts";
import { WORKSPACE_CONNECTIONS_CONSTRAINT } from "../graph/builtin_constraints.ts";

// ---------------------------------------------------------------------------
// Helper to build a minimal WorkspaceState for testing
// ---------------------------------------------------------------------------

function minimalWs(
  overrides: Partial<WorkspaceState> = {},
): WorkspaceState {
  const rootNodeId = "test-root-id";
  return {
    profiles: [DEFAULT_PROFILE],
    activeProfileId: DEFAULT_PROFILE.id,
    tabs: [{
      id: "t1",
      name: "Test",
      databaseId: "test-db-id",
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
    focusId: rootNodeId, // default: focused on workspace root (shows its children)
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
  assertEquals(root.label, "Untitled");
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

Deno.test("ensureWorkspaceRoot: single node without rootNodeId uses node as root", () => {
  const nodes = [makeNode("a", "A", "leaf", [])];
  const result = ensureWorkspaceRoot(nodes);
  assertEquals(result.treeNodes.length, 1);
  // Should NOT wrap — uses existing single node as root
  assertEquals(result.treeNodes[0].id, "a");
  assertEquals(result.rootNodeId, "a");
});

Deno.test("ensureWorkspaceRoot: multiple nodes without rootNodeId wraps with UUID", () => {
  const nodes = [makeNode("a", "A", "leaf", []), makeNode("b", "B", "leaf", [])];
  const result = ensureWorkspaceRoot(nodes);
  assertEquals(result.treeNodes.length, 1);
  assertEquals(result.treeNodes[0].children.length, 2);
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

Deno.test("ensureWorkspaceRoot: idempotent — second call does not double-wrap", () => {
  const nodes = [makeNode("a", "A", "leaf", []), makeNode("b", "B", "leaf", [])];
  const first = ensureWorkspaceRoot(nodes, "root-1");
  // Simulate reload: rootNodeId matches → no-op
  const second = ensureWorkspaceRoot(first.treeNodes, "root-1");
  assertEquals(second.treeNodes.length, 1);
  assertEquals(second.treeNodes[0].id, "root-1");
  assertEquals(second.treeNodes[0].children.length, 2);
});

Deno.test("ensureWorkspaceRoot: idempotent — reload without rootNodeId does not double-wrap", () => {
  // Simulate: root was created in a previous session, but rootNodeId was lost
  const nodes = [makeNode("a", "A", "leaf", []), makeNode("b", "B", "leaf", [])];
  const first = ensureWorkspaceRoot(nodes, "root-1");
  // Simulate reload without rootNodeId (migration case)
  const second = ensureWorkspaceRoot(first.treeNodes);
  assertEquals(second.treeNodes.length, 1);
  assertEquals(second.treeNodes[0].id, "root-1");
  assertEquals(second.treeNodes[0].children.length, 2);
  assertEquals(second.rootNodeId, "root-1");
});

// ---------------------------------------------------------------------------
// getWorkspaceRoot
// ---------------------------------------------------------------------------

Deno.test("getWorkspaceRoot: finds root in default state", () => {
  const ws = minimalWs();
  const root = getWorkspaceRoot(ws);
  assertEquals(root?.id, "test-root-id");
});

Deno.test("getWorkspaceRoot: falls back to first node when rootNodeId not in tree", () => {
  const ws = minimalWs({ treeNodes: [makeNode("a", "A", "leaf", [])] });
  const root = getWorkspaceRoot(ws);
  assertEquals(root?.id, "a");
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

Deno.test("getFocusedRootNodes: focused on workspace root returns its children", () => {
  const ws = minimalWs(); // focusId = rootNodeId by default
  const focused = getFocusedRootNodes(ws);
  // Should return the children of the workspace root, not the root node
  assertEquals(focused.every((n) => n.id !== "test-root-id"), true);
  assertEquals(focused.length, 1);
  assertEquals(focused[0].id, "spike://acme/backend");
});

Deno.test("getFocusedRootNodes: virtual root (focusId=null) returns treeNodes including workspace root", () => {
  const ws = minimalWs({ focusId: null });
  const focused = getFocusedRootNodes(ws);
  // At virtual root level, the workspace root itself is visible on the canvas
  assertEquals(focused.length, 1);
  assertEquals(focused[0].id, "test-root-id");
});

Deno.test("getFocusedRootNodes: focused on a composite returns its children", () => {
  const ws = minimalWs({ focusId: "spike://acme/backend" });
  const focused = getFocusedRootNodes(ws);
  assertEquals(focused.length, 2); // auth-service + frontend
});

// ---------------------------------------------------------------------------
// ensureWorkspaceConstraint
// ---------------------------------------------------------------------------

Deno.test("ensureWorkspaceConstraint: adds constraint and application when missing", () => {
  const result = ensureWorkspaceConstraint([], [], "root-1");
  assertEquals(result.constraints.length, 1);
  assertEquals(result.constraints[0].id, WORKSPACE_CONNECTIONS_CONSTRAINT.id);
  assertEquals(result.constraintApplications.length, 1);
  assertEquals(result.constraintApplications[0].constraintId, WORKSPACE_CONNECTIONS_CONSTRAINT.id);
  assertEquals(result.constraintApplications[0].entityId, "root-1");
});

// ---------------------------------------------------------------------------
// getConnectionConfig
// ---------------------------------------------------------------------------

Deno.test("getConnectionConfig: returns null when no constraint applied", () => {
  const ws = minimalWs(); // no constraint applications
  assertEquals(getConnectionConfig(ws), null);
});

Deno.test("getConnectionConfig: returns null when URL is empty", () => {
  const rootId = "test-root-id";
  const ws = minimalWs({
    constraints: [WORKSPACE_CONNECTIONS_CONSTRAINT],
    constraintApplications: [{
      id: "app-1",
      constraintId: WORKSPACE_CONNECTIONS_CONSTRAINT.id,
      entityId: rootId,
      version: 1,
    }],
  });
  // Root node data has no url field → null
  assertEquals(getConnectionConfig(ws), null);
});

Deno.test("getConnectionConfig: returns config when URL is set", () => {
  const rootId = "test-root-id";
  const rootNode = {
    ...makeRootNode(rootId, []),
    data: {
      connection: {
        url: "wss://db.example.com/rpc",
        namespace: "prod",
        database: "main",
        username: "",
        password: "",
      },
    },
  };
  const ws = minimalWs({
    treeNodes: [rootNode],
    constraints: [WORKSPACE_CONNECTIONS_CONSTRAINT],
    constraintApplications: [{
      id: "app-1",
      constraintId: WORKSPACE_CONNECTIONS_CONSTRAINT.id,
      entityId: rootId,
      version: 1,
    }],
  });
  const config = getConnectionConfig(ws);
  assertEquals(config?.entityId, rootId);
  assertEquals(config?.url, "wss://db.example.com/rpc");
  assertEquals(config?.namespace, "prod");
  assertEquals(config?.database, "main");
  // Empty strings map to undefined
  assertEquals(config?.username, undefined);
  assertEquals(config?.password, undefined);
});

// ---------------------------------------------------------------------------
// ensureWorkspaceConstraint (continued)
// ---------------------------------------------------------------------------

Deno.test("ensureWorkspaceConstraint: idempotent when already present", () => {
  const app: ConstraintApplication = {
    id: "existing-app",
    constraintId: WORKSPACE_CONNECTIONS_CONSTRAINT.id,
    entityId: "root-1",
    version: 1,
  };
  const result = ensureWorkspaceConstraint(
    [WORKSPACE_CONNECTIONS_CONSTRAINT],
    [app],
    "root-1",
  );
  assertEquals(result.constraints.length, 1);
  assertEquals(result.constraintApplications.length, 1);
  assertEquals(result.constraintApplications[0].id, "existing-app");
});
