import { assertEquals } from "@std/assert";
import {
  getConstraintDataSchema,
  getEntityDataSchema,
  registeredConstraintTypes,
  validateWorkspace,
} from "./validate_workspace.ts";
import {
  type Constraint,
  type ConstraintApplication,
  defaultState,
  makeNode,
  makeRootNode,
  type WorkspaceState,
} from "../ui/workspace.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wsWithNode(
  nodeId: string,
  constraint: Constraint,
  nodeData: Record<string, unknown> = {},
): { ws: WorkspaceState; apps: ConstraintApplication[] } {
  const ds = defaultState();
  const node = { ...makeNode(nodeId, "Test Node", "leaf", []), data: nodeData };
  const rootId = ds.tabs[0].rootNodeId;
  const ws: WorkspaceState = {
    ...ds,
    treeNodes: [makeRootNode(rootId, [node])],
    constraints: [constraint],
  };
  const apps: ConstraintApplication[] = [{
    id: "app-1",
    constraintId: constraint.id,
    entityId: nodeId,
    version: 1,
  }];
  return { ws, apps };
}

// ---------------------------------------------------------------------------
// workspace.connections — registration
// ---------------------------------------------------------------------------

Deno.test("workspace.connections: is registered", () => {
  const types = registeredConstraintTypes();
  assertEquals(types.includes("workspace.connections"), true);
});

Deno.test("workspace.connections: has entity data schema with url, namespace, database, username, password", () => {
  const schema = getEntityDataSchema("workspace.connections");
  assertEquals(schema !== null, true);
  assertEquals("url" in schema!.properties, true);
  assertEquals("namespace" in schema!.properties, true);
  assertEquals("database" in schema!.properties, true);
  assertEquals("username" in schema!.properties, true);
  assertEquals("password" in schema!.properties, true);
  assertEquals(schema!.required, ["url"]);
  // Constraint's own dataSchema should be empty — config lives on the entity.
  const constraintSchema = getConstraintDataSchema("workspace.connections");
  assertEquals(Object.keys(constraintSchema!.properties).length, 0);
});

// ---------------------------------------------------------------------------
// workspace.connections — validation
// ---------------------------------------------------------------------------

const CONN_CONSTRAINT: Constraint = {
  id: "c1",
  label: "Connection",
  type: "workspace.connections",
  targets: [{ type: "entity", class: "node" }],
  data: {},
  version: 1,
};

Deno.test("workspace.connections: empty URL produces error", () => {
  const { ws, apps } = wsWithNode("n1", CONN_CONSTRAINT, { url: "" });
  const diags = validateWorkspace(ws, apps);
  assertEquals(diags["n1"]?.length, 1);
  assertEquals(diags["n1"][0].severity, "error");
  assertEquals(diags["n1"][0].message.includes("requires a URL"), true);
});

Deno.test("workspace.connections: invalid URL produces error", () => {
  const { ws, apps } = wsWithNode("n1", CONN_CONSTRAINT, { url: "not-a-url" });
  const diags = validateWorkspace(ws, apps);
  assertEquals(diags["n1"]?.length, 1);
  assertEquals(diags["n1"][0].message.includes("not a valid URL"), true);
});

Deno.test("workspace.connections: wrong protocol produces error", () => {
  const { ws, apps } = wsWithNode("n1", CONN_CONSTRAINT, { url: "ftp://example.com" });
  const diags = validateWorkspace(ws, apps);
  assertEquals(diags["n1"]?.length, 1);
  assertEquals(diags["n1"][0].message.includes("ws://"), true);
});

Deno.test("workspace.connections: valid wss:// URL produces no diagnostics", () => {
  const { ws, apps } = wsWithNode("n1", CONN_CONSTRAINT, { url: "wss://db.example.com/rpc" });
  const diags = validateWorkspace(ws, apps);
  assertEquals(diags["n1"], undefined);
});

Deno.test("workspace.connections: valid https:// URL produces no diagnostics", () => {
  const { ws, apps } = wsWithNode("n1", CONN_CONSTRAINT, { url: "https://db.example.com/rpc" });
  const diags = validateWorkspace(ws, apps);
  assertEquals(diags["n1"], undefined);
});
