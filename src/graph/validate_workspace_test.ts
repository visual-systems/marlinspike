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
// connections — registration
// ---------------------------------------------------------------------------

Deno.test("connections: is registered", () => {
  const types = registeredConstraintTypes();
  assertEquals(types.includes("connections"), true);
});

Deno.test("connections: has entity data schema with connection object", () => {
  const schema = getEntityDataSchema("connections");
  assertEquals(schema !== null, true);
  assertEquals("connection" in schema!.properties, true);
  assertEquals(schema!.required, ["connection"]);
  const connSchema = schema!.properties.connection;
  assertEquals(connSchema.type, "object");
  const connProps = (connSchema as { type: "object"; properties: Record<string, unknown> })
    .properties;
  assertEquals("url" in connProps, true);
  assertEquals("namespace" in connProps, true);
  assertEquals("database" in connProps, true);
  assertEquals("username" in connProps, true);
  assertEquals("password" in connProps, true);
  // Constraint's own dataSchema should be empty — config lives on the entity.
  const constraintSchema = getConstraintDataSchema("connections");
  assertEquals(Object.keys(constraintSchema!.properties).length, 0);
});

// ---------------------------------------------------------------------------
// connections — validation
// ---------------------------------------------------------------------------

const CONN_CONSTRAINT: Constraint = {
  id: "c1",
  label: "Connection",
  type: "connections",
  targets: [{ type: "entity", class: "node" }],
  data: {},
  version: 1,
};

Deno.test("connections: empty URL produces error", () => {
  const { ws, apps } = wsWithNode("n1", CONN_CONSTRAINT, { connection: { url: "" } });
  const diags = validateWorkspace(ws, apps);
  assertEquals(diags["n1"]?.length, 1);
  assertEquals(diags["n1"][0].severity, "error");
  assertEquals(diags["n1"][0].message.includes("requires a URL"), true);
});

Deno.test("connections: invalid URL produces error", () => {
  const { ws, apps } = wsWithNode("n1", CONN_CONSTRAINT, { connection: { url: "not-a-url" } });
  const diags = validateWorkspace(ws, apps);
  assertEquals(diags["n1"]?.length, 1);
  assertEquals(diags["n1"][0].message.includes("not a valid URL"), true);
});

Deno.test("connections: wrong protocol produces error", () => {
  const { ws, apps } = wsWithNode("n1", CONN_CONSTRAINT, {
    connection: { url: "ftp://example.com" },
  });
  const diags = validateWorkspace(ws, apps);
  assertEquals(diags["n1"]?.length, 1);
  assertEquals(diags["n1"][0].message.includes("ws://"), true);
});

Deno.test("connections: valid wss:// URL produces no diagnostics", () => {
  const { ws, apps } = wsWithNode("n1", CONN_CONSTRAINT, {
    connection: { url: "wss://db.example.com/rpc" },
  });
  const diags = validateWorkspace(ws, apps);
  assertEquals(diags["n1"], undefined);
});

Deno.test("connections: valid https:// URL produces no diagnostics", () => {
  const { ws, apps } = wsWithNode("n1", CONN_CONSTRAINT, {
    connection: { url: "https://db.example.com/rpc" },
  });
  const diags = validateWorkspace(ws, apps);
  assertEquals(diags["n1"], undefined);
});
