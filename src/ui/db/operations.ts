/// <reference lib="dom" />
/**
 * Typed SurrealDB operations for graph and UI data.
 *
 * These are thin wrappers around SurrealQL — no abstract interface.
 * The caller is responsible for calling useDatabase() / useUiDb()
 * before invoking operations to select the correct database context.
 */

import type { Constraint, ConstraintApplication, Edge, WorkspaceState } from "../workspace.ts";
import type { FlatNode } from "@marlinspike/graph";
import type { AlgorithmId } from "../lib/algorithms/index.ts";
import { getDb, NS, useUiDb } from "./surreal.ts";
import { GRAPH_SCHEMA, UI_SCHEMA } from "./schema.ts";

// Re-export flatten/build from @marlinspike/graph
export type { FlatNode } from "@marlinspike/graph";
export { buildTree, flattenTree } from "@marlinspike/graph";

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

/** Load all tree nodes from the current database as flat rows. */
export async function loadAllNodes(): Promise<FlatNode[]> {
  const db = getDb();
  const result = await db.query<[FlatNode[]]>("SELECT * FROM tree_node");
  const rows = extractQueryResult<FlatNode>(result);
  // Normalise fields from SurrealDB's representation:
  // - `id` comes back as a RecordId object → extract the string key
  // - `parent` comes back as a RecordId or NONE → normalise to string|null
  return rows.map((row) => ({
    ...row,
    id: normaliseRecordId(row.id),
    parent: row.parent == null ? null : normaliseRecordId(row.parent as string),
  }));
}

/** Extract the plain string ID from a SurrealDB RecordId or string. */
function normaliseRecordId(value: unknown): string {
  if (typeof value === "string") {
    // Strip "table:" prefix if present (e.g. "tree_node:abc" → "abc")
    const colonIdx = value.indexOf(":");
    return colonIdx >= 0 ? value.slice(colonIdx + 1) : value;
  }
  // RecordId objects have a .id property or toString()
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.id === "string") return rec.id;
    if (typeof rec.toString === "function") {
      const s = rec.toString();
      const colonIdx = s.indexOf(":");
      return colonIdx >= 0 ? s.slice(colonIdx + 1) : s;
    }
  }
  return String(value);
}

/** Upsert a single flat node. */
export async function saveTreeNode(node: FlatNode): Promise<void> {
  const db = getDb();
  const parentRef = node.parent ? `tree_node:${sanitizeId(node.parent)}` : "NONE";
  // Build SET clauses — omit optional fields when undefined so SurrealDB
  // doesn't receive NULL (which it rejects for option<T> fields).
  const setClauses = [
    `label = $label`,
    `kind = $kind`,
    `parent = ${parentRef}`,
    `data = $data`,
    `version = $version`,
  ];
  const bindings: Record<string, unknown> = {
    label: node.label,
    kind: node.kind,
    data: node.data,
    version: node.version,
  };
  if (node.uri !== undefined) {
    setClauses.push(`uri = $uri`);
    bindings.uri = node.uri;
  } else {
    setClauses.push(`uri = NONE`);
  }
  if (node.type !== undefined) {
    setClauses.push(`type = $type`);
    bindings.type = node.type;
  } else {
    setClauses.push(`type = NONE`);
  }
  if (node.ref !== undefined) {
    setClauses.push(`ref = $ref`);
    bindings.ref = node.ref;
  } else {
    setClauses.push(`ref = NONE`);
  }
  if (node.ports !== undefined) {
    setClauses.push(`ports = $ports`);
    bindings.ports = node.ports;
  } else {
    setClauses.push(`ports = NONE`);
  }
  await db.query(
    `UPSERT tree_node:${sanitizeId(node.id)} SET ${setClauses.join(",\n      ")}`,
    bindings,
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
  const rows = extractQueryResult<Edge>(result);
  return rows.map((row) => ({
    ...row,
    id: normaliseRecordId(row.id),
    fromId: normaliseRecordId(row.fromId),
    toId: normaliseRecordId(row.toId),
  }));
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
  const rows = extractQueryResult<Constraint>(result);
  return rows.map((row) => ({
    ...row,
    id: normaliseRecordId(row.id),
  }));
}

/** Upsert a constraint. */
export async function saveConstraint(c: Constraint): Promise<void> {
  const db = getDb();
  const setClauses = [
    `label = $label`,
    `type = $type`,
    `targets = $targets`,
    `data = $data`,
    `version = $version`,
  ];
  const bindings: Record<string, unknown> = {
    label: c.label,
    type: c.type,
    targets: c.targets,
    data: c.data,
    version: c.version,
  };
  if (c.uri !== undefined) {
    setClauses.push(`uri = $uri`);
    bindings.uri = c.uri;
  } else {
    setClauses.push(`uri = NONE`);
  }
  await db.query(
    `UPSERT \`constraint\`:${sanitizeId(c.id)} SET ${setClauses.join(",\n      ")}`,
    bindings,
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
  const rows = extractQueryResult<ConstraintApplication>(result);
  return rows.map((row) => ({
    ...row,
    id: normaliseRecordId(row.id),
    constraintId: normaliseRecordId(row.constraintId),
  }));
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

/** The portion of WorkspaceState stored in the _ui database (global, not per-database). */
export interface UiState {
  profiles: WorkspaceState["profiles"];
  panels: WorkspaceState["panels"];
  personas: string[];
  activePersona: string | null;
  workflows: string[];
  activeWorkflow: string | null;
  connectedGraphs: WorkspaceState["connectedGraphs"];
}

/** Per-database canvas/UI state stored in each graph database's canvas_state table. */
export interface CanvasState {
  focusId: string | null;
  canvasExpandedNodes: string[];
  canvasNodePositions: Record<string, { x: number; y: number; pinned?: boolean }>;
  canvasSelected: WorkspaceState["canvasSelected"];
  canvasAlgorithm: AlgorithmId;
  canvasShowRefEdges?: boolean;
  entityDrafts: Record<string, string>;
}

/** Load workspace UI state. Returns null if none exists. */
export async function loadWorkspaceUi(): Promise<UiState | null> {
  const db = getDb();
  await useUiDb();
  const result = await db.query<[UiState[]]>(
    "SELECT profiles, panels, personas, activePersona, workflows, activeWorkflow, connectedGraphs FROM workspace:main",
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
// Canvas state (per-database)
// ---------------------------------------------------------------------------

/** Load canvas state from the current graph database. Returns null if none exists. */
export async function loadCanvasState(): Promise<CanvasState | null> {
  const db = getDb();
  const result = await db.query<[CanvasState[]]>("SELECT * FROM canvas_state:main");
  const rows = extractQueryResult<CanvasState>(result);
  return rows.length > 0 ? rows[0] : null;
}

/** Save canvas state to the current graph database. */
export async function saveCanvasState(state: CanvasState): Promise<void> {
  const db = getDb();
  await db.query("UPSERT canvas_state:main CONTENT $state", { state });
}

// ---------------------------------------------------------------------------
// Database registry
// ---------------------------------------------------------------------------

export interface DbRegistryEntry {
  id: string;
  /** UUID used as the SurrealDB database name and IndexedDB dump key. */
  uuid: string;
  /** Human-readable display name (mutable). */
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

/** Register a new database entry and initialise its schema. Returns the UUID. */
export async function createDatabase(name: string, dbId?: string): Promise<string> {
  const db = getDb();
  const id = dbId ?? crypto.randomUUID();

  // Register in the _ui db
  await useUiDb();
  await db.query(
    `CREATE db_registry SET name = $name, uuid = $uuid`,
    { name, uuid: id },
  );

  // Initialise graph schema in the new database
  await initGraphSchema(id);

  return id;
}

/** Rename a database (update display name only). */
export async function renameDatabase(registryId: string, name: string): Promise<void> {
  const db = getDb();
  await useUiDb();
  await db.query(
    `UPDATE ${registryId} SET name = $name`,
    { name },
  );
}

/** Update lastOpened timestamp for a database. */
export async function touchDatabase(registryId: string): Promise<void> {
  const db = getDb();
  await useUiDb();
  await db.query(
    `UPDATE ${registryId} SET lastOpened = time::now()`,
  );
}

/** Delete a database registry entry. */
export async function deleteDatabase(registryId: string): Promise<void> {
  const db = getDb();
  await useUiDb();
  await db.query(`DELETE ${registryId}`);
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
