/// <reference lib="dom" />
/**
 * Typed SurrealDB operations for graph and UI data.
 *
 * These are thin wrappers around SurrealQL — no abstract interface.
 * The caller is responsible for calling useDatabase() / useUiDb()
 * before invoking operations to select the correct database context.
 */

import type {
  Constraint,
  ConstraintApplication,
  Edge,
  Port,
  TreeNode,
  WorkspaceState,
} from "../workspace.ts";
import type { AlgorithmId } from "../lib/algorithms/index.ts";
import { getDb, NS, useUiDb } from "./surreal.ts";
import { GRAPH_SCHEMA, UI_SCHEMA } from "./schema.ts";

// ---------------------------------------------------------------------------
// Flat node type (DB row shape — no nested children)
// ---------------------------------------------------------------------------

export interface FlatNode {
  id: string;
  label: string;
  uri?: string;
  kind: "leaf" | "composite";
  parent: string | null; // record id string or null for roots
  ports?: Port[];
  data: Record<string, unknown>;
  version: number;
}

// ---------------------------------------------------------------------------
// Schema initialisation
// ---------------------------------------------------------------------------

/** Ensure schema tables exist in a graph database. */
export async function initGraphSchema(database: string): Promise<void> {
  const db = getDb();
  await db.use({ namespace: NS, database });
  await db.query(GRAPH_SCHEMA);
}

/** Ensure schema tables exist in the _ui database. */
export async function initUiSchema(): Promise<void> {
  const db = getDb();
  await useUiDb();
  await db.query(UI_SCHEMA);
}

// ---------------------------------------------------------------------------
// Tree nodes
// ---------------------------------------------------------------------------

/** Flatten a recursive TreeNode[] into flat rows with parent links. */
export function flattenTree(nodes: TreeNode[], parentId: string | null = null): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    result.push({
      id: node.id,
      label: node.label,
      uri: node.uri,
      kind: node.kind,
      parent: parentId,
      ports: node.ports,
      data: node.data,
      version: node.version,
    });
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, node.id));
    }
  }
  return result;
}

/** Reconstruct recursive TreeNode[] from flat rows. */
export function buildTree(flat: FlatNode[]): TreeNode[] {
  const byId = new Map<string, FlatNode>();
  for (const row of flat) byId.set(row.id, row);

  const childrenOf = new Map<string | null, FlatNode[]>();
  for (const row of flat) {
    const key = row.parent;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(row);
  }

  function build(parentId: string | null): TreeNode[] {
    const rows = childrenOf.get(parentId) ?? [];
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      uri: row.uri,
      kind: row.kind,
      children: build(row.id),
      ports: row.ports,
      data: row.data,
      version: row.version,
    }));
  }

  return build(null);
}

/** Load all tree nodes from the current database as flat rows. */
export async function loadAllNodes(): Promise<FlatNode[]> {
  const db = getDb();
  const result = await db.query<[FlatNode[]]>("SELECT * FROM tree_node");
  return extractQueryResult(result);
}

/** Upsert a single flat node. */
export async function saveTreeNode(node: FlatNode): Promise<void> {
  const db = getDb();
  const parentRef = node.parent ? `tree_node:${sanitizeId(node.parent)}` : "NONE";
  await db.query(
    `UPSERT tree_node:${sanitizeId(node.id)} SET
      label = $label,
      uri = $uri,
      kind = $kind,
      parent = ${parentRef},
      ports = $ports,
      data = $data,
      version = $version`,
    {
      label: node.label,
      uri: node.uri ?? null,
      kind: node.kind,
      ports: node.ports ?? null,
      data: node.data,
      version: node.version,
    },
  );
}

/** Delete a tree node by id. */
export async function deleteTreeNode(id: string): Promise<void> {
  const db = getDb();
  await db.query(`DELETE tree_node:${sanitizeId(id)}`);
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/** Load all edges from the current database. */
export async function loadAllEdges(): Promise<Edge[]> {
  const db = getDb();
  const result = await db.query<[Edge[]]>("SELECT * FROM edge");
  return extractQueryResult(result);
}

/** Upsert an edge. */
export async function saveEdge(edge: Edge): Promise<void> {
  const db = getDb();
  await db.query(
    `UPSERT edge:${sanitizeId(edge.id)} SET
      fromId = tree_node:${sanitizeId(edge.fromId)},
      toId = tree_node:${sanitizeId(edge.toId)},
      label = $label,
      data = $data,
      version = $version`,
    {
      label: edge.label,
      data: edge.data,
      version: edge.version,
    },
  );
}

/** Delete an edge by id. */
export async function deleteEdge(id: string): Promise<void> {
  const db = getDb();
  await db.query(`DELETE edge:${sanitizeId(id)}`);
}

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

/** Load all constraints from the current database. */
export async function loadAllConstraints(): Promise<Constraint[]> {
  const db = getDb();
  // "constraint" is a reserved word in SurrealQL, so we backtick-quote it
  const result = await db.query<[Constraint[]]>("SELECT * FROM `constraint`");
  return extractQueryResult(result);
}

/** Upsert a constraint. */
export async function saveConstraint(c: Constraint): Promise<void> {
  const db = getDb();
  await db.query(
    `UPSERT \`constraint\`:${sanitizeId(c.id)} SET
      label = $label,
      uri = $uri,
      type = $type,
      targets = $targets,
      data = $data,
      version = $version`,
    {
      label: c.label,
      uri: c.uri ?? null,
      type: c.type,
      targets: c.targets,
      data: c.data,
      version: c.version,
    },
  );
}

/** Delete a constraint by id. */
export async function deleteConstraint(id: string): Promise<void> {
  const db = getDb();
  await db.query(`DELETE \`constraint\`:${sanitizeId(id)}`);
}

// ---------------------------------------------------------------------------
// Constraint applications
// ---------------------------------------------------------------------------

/** Load all constraint applications from the current database. */
export async function loadAllApplications(): Promise<ConstraintApplication[]> {
  const db = getDb();
  const result = await db.query<[ConstraintApplication[]]>(
    "SELECT * FROM constraint_application",
  );
  return extractQueryResult(result);
}

/** Upsert a constraint application. */
export async function saveApplication(app: ConstraintApplication): Promise<void> {
  const db = getDb();
  await db.query(
    `UPSERT constraint_application:${sanitizeId(app.id)} SET
      constraintId = \`constraint\`:${sanitizeId(app.constraintId)},
      entityId = $entityId,
      version = $version`,
    {
      entityId: app.entityId,
      version: app.version,
    },
  );
}

/** Delete a constraint application by id. */
export async function deleteApplication(id: string): Promise<void> {
  const db = getDb();
  await db.query(`DELETE constraint_application:${sanitizeId(id)}`);
}

// ---------------------------------------------------------------------------
// UI state (workspace)
// ---------------------------------------------------------------------------

/** The portion of WorkspaceState stored in the _ui database. */
export interface UiState {
  tabs: WorkspaceState["tabs"];
  activeTabId: string;
  personas: string[];
  activePersona: string | null;
  workflows: string[];
  activeWorkflow: string | null;
  connectedGraphs: WorkspaceState["connectedGraphs"];
  focusId: string | null;
  canvasExpandedNodes: string[];
  canvasNodePositions: Record<string, { x: number; y: number; pinned?: boolean }>;
  canvasSelected: WorkspaceState["canvasSelected"];
  canvasAlgorithm: AlgorithmId;
  entityDrafts: Record<string, string>;
}

/** Load workspace UI state. Returns null if none exists. */
export async function loadWorkspaceUi(): Promise<UiState | null> {
  const db = getDb();
  await useUiDb();
  const result = await db.query<[UiState[]]>(
    "SELECT * FROM workspace:main",
  );
  const rows = extractQueryResult<UiState>(result);
  return rows.length > 0 ? rows[0] : null;
}

/** Save workspace UI state (upsert single record). */
export async function saveWorkspaceUi(state: UiState): Promise<void> {
  const db = getDb();
  await useUiDb();
  await db.query("UPSERT workspace:main CONTENT $state", { state });
}

// ---------------------------------------------------------------------------
// Database registry
// ---------------------------------------------------------------------------

export interface DbRegistryEntry {
  id: string;
  name: string;
  created: string;
  lastOpened: string;
}

/** List all registered databases. */
export async function listDatabases(): Promise<DbRegistryEntry[]> {
  const db = getDb();
  await useUiDb();
  const result = await db.query<[DbRegistryEntry[]]>(
    "SELECT * FROM db_registry ORDER BY lastOpened DESC",
  );
  return extractQueryResult(result);
}

/** Register a new database entry and initialise its schema. */
export async function createDatabase(name: string): Promise<string> {
  const db = getDb();

  // Generate a slug from the name
  const slug = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") ||
    "project";

  // Register in the _ui db
  await useUiDb();
  const regResult = await db.query<[DbRegistryEntry[]]>(
    `CREATE db_registry SET name = $name`,
    { name },
  );
  const entry = extractQueryResult<DbRegistryEntry>(regResult)[0];

  // Initialise graph schema in the new database
  await initGraphSchema(slug);

  return entry.id;
}

/** Update lastOpened timestamp for a database. */
export async function touchDatabase(id: string): Promise<void> {
  const db = getDb();
  await useUiDb();
  await db.query(
    `UPDATE ${id} SET lastOpened = time::now()`,
  );
}

/** Delete a database registry entry. */
export async function deleteDatabase(id: string): Promise<void> {
  const db = getDb();
  await useUiDb();
  await db.query(`DELETE ${id}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitize a user-provided ID for safe inclusion in SurrealQL record identifiers. */
function sanitizeId(id: string): string {
  // Wrap in backticks to handle IDs containing special characters
  return "`" + id.replace(/`/g, "\\`") + "`";
}

/** Extract the first result array from a SurrealDB query response. */
function extractQueryResult<T>(result: unknown): T[] {
  // The SDK v2 query() returns an array of result frames.
  // Each frame may be a ValueFrame with a .value property, or the result itself.
  if (!Array.isArray(result)) return [];

  for (const frame of result) {
    // SDK v2 frame objects have a value property
    if (frame && typeof frame === "object" && "value" in frame) {
      if (Array.isArray(frame.value)) return frame.value as T[];
      if (frame.value != null) return [frame.value] as T[];
    }
    // Direct array result (older SDK pattern)
    if (Array.isArray(frame)) return frame as T[];
  }

  return [];
}
