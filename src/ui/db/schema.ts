/**
 * SurrealQL schema definitions for the graph and UI databases.
 *
 * Each function returns a SurrealQL string that can be executed via
 * db.query() to define or update the schema for a database.
 */

// ---------------------------------------------------------------------------
// Graph database schema (one per project)
// ---------------------------------------------------------------------------

/** Schema for a per-project graph database. */
export const GRAPH_SCHEMA = `
-- Tree nodes (flat, with parent links — reconstructed into rose-tree in memory)
DEFINE TABLE IF NOT EXISTS tree_node SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS label    ON tree_node TYPE string;
DEFINE FIELD IF NOT EXISTS uri      ON tree_node TYPE option<string>;
DEFINE FIELD IF NOT EXISTS kind     ON tree_node TYPE string
  ASSERT $value IN ["leaf", "composite"];
DEFINE FIELD IF NOT EXISTS parent   ON tree_node TYPE option<record<tree_node>>;
DEFINE FIELD IF NOT EXISTS ports    ON tree_node TYPE any;
DEFINE FIELD IF NOT EXISTS data     ON tree_node TYPE object FLEXIBLE DEFAULT {};
DEFINE FIELD IF NOT EXISTS version  ON tree_node TYPE int DEFAULT 1;
DEFINE INDEX IF NOT EXISTS idx_parent ON tree_node FIELDS parent;

-- Edges (graph relations between tree_nodes)
DEFINE TABLE IF NOT EXISTS edge SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS fromId   ON edge TYPE record<tree_node>;
DEFINE FIELD IF NOT EXISTS toId     ON edge TYPE record<tree_node>;
DEFINE FIELD IF NOT EXISTS label    ON edge TYPE string;
DEFINE FIELD IF NOT EXISTS data     ON edge TYPE object FLEXIBLE DEFAULT {};
DEFINE FIELD IF NOT EXISTS version  ON edge TYPE int DEFAULT 1;
DEFINE INDEX IF NOT EXISTS idx_from ON edge FIELDS fromId;
DEFINE INDEX IF NOT EXISTS idx_to   ON edge FIELDS toId;

-- Constraints
DEFINE TABLE IF NOT EXISTS constraint SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS label    ON constraint TYPE string;
DEFINE FIELD IF NOT EXISTS uri      ON constraint TYPE option<string>;
DEFINE FIELD IF NOT EXISTS type     ON constraint TYPE string;
DEFINE FIELD IF NOT EXISTS targets  ON constraint TYPE any DEFAULT [];
DEFINE FIELD IF NOT EXISTS data     ON constraint TYPE object FLEXIBLE DEFAULT {};
DEFINE FIELD IF NOT EXISTS version  ON constraint TYPE int DEFAULT 1;

-- Constraint applications (junction: constraint ↔ entity)
DEFINE TABLE IF NOT EXISTS constraint_application SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS constraintId ON constraint_application TYPE record<constraint>;
DEFINE FIELD IF NOT EXISTS entityId     ON constraint_application TYPE string;
DEFINE FIELD IF NOT EXISTS version      ON constraint_application TYPE int DEFAULT 1;
`;

// ---------------------------------------------------------------------------
// UI database schema (shared across projects)
// ---------------------------------------------------------------------------

/** Schema for the _ui database (workspace state + database registry). */
export const UI_SCHEMA = `
-- Workspace UI state — single record per workspace
DEFINE TABLE IF NOT EXISTS workspace SCHEMALESS;

-- Database registry — tracks known project databases
DEFINE TABLE IF NOT EXISTS db_registry SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name       ON db_registry TYPE string;
DEFINE FIELD IF NOT EXISTS created    ON db_registry TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS lastOpened ON db_registry TYPE datetime DEFAULT time::now();
`;
