# Graph Backend API — Phase 1

**Branch:** lyndon/graph-backend-api
**Date:** 2026-04-12

## Context

The current graph storage uses `localStorage` directly — a single JSON blob under `"marlinspike.workspace"` — with no abstraction layer. This limits the application to one browser-local store, prevents multiple projects/databases, and blocks the design roadmap (CRDT sync, remote backends, collaboration). DESIGN.md §12.3 explicitly calls out "Graph database / API" as an unexplored notion.

SurrealDB is a strong fit because:
- Embedded WASM mode with IndexedDB persistence (no server needed, same deployment model)
- Native namespace > database > table hierarchy maps to multi-project isolation
- Graph relations (`RELATE`) model edges as first-class primitives
- The same JS client API works against remote servers later
- Live queries can eventually feed reactive UI updates and CRDT sync

## Goal

**Shippable Phase 1**: Replace localStorage with SurrealDB embedded as the persistence layer. Use the SurrealDB JS client directly (no abstract interface). Separate graph data from UI state. Support multiple local databases (one per project). Basic multi-database UI.

**Deferred to future branches**: Cross-database references/closures, remote database connections, security implementation, connected graphs UI overhaul.

## Architecture

### Data Separation

Split current `WorkspaceState` into two concerns:

**Graph data** (per-project SurrealDB database):
- `tree_node` table — flat records with `parent` link (not nested children)
- `edge` table — SurrealDB graph relations via `RELATE`
- `constraint` table
- `constraint_application` table
- `canvas_state` table — per-database canvas/UI state

**UI state** (dedicated `_ui` SurrealDB database):
- `workspace` table — single record: tabs, activeTabId, personas, workflows, connectedGraphs
- `db_registry` table — known databases with metadata (uuid, name)

### Persistence: mem:// + IndexedDB Bridge

SurrealDB's native `indxdb://` engine is broken in WASM (upstream [#5712](https://github.com/surrealdb/surrealdb/issues/5712)). Workaround: use `mem://` for the engine, `db.export()`/`db.import()` through our own IndexedDB store for persistence.

```
WorkspaceState ←→ SurrealDB (mem://) ←→ export/import ←→ IndexedDB
                   in-memory WASM            SurrealQL        browser storage
                   (query engine)            dump strings     (marlinspike_snapshots)
```

### Tree Model: Flat in DB, Nested in Memory

SurrealDB stores flat `tree_node` records with a `parent` field (record link or null for roots). On load, `buildTree()` reconstructs the recursive `TreeNode[]` structure. SurrealDB WASM returns RecordId objects (not plain strings) and `NONE` as `undefined` (not `null`), so all load functions normalise via `normaliseRecordId()`.

### SurrealDB Namespace Layout

```
namespace: marlinspike
  database: default           ← migrated from localStorage
    tree_node, edge, constraint, constraint_application, canvas_state
  database: {uuid}            ← additional projects (one per tab)
    tree_node, edge, constraint, constraint_application, canvas_state
  database: _ui               ← UI state, cross-project
    workspace, db_registry
```

### No Abstract Interface

Use SurrealDB's JS client directly. Typed helper functions wrap SurrealQL queries for ergonomics (`saveNode()`, `loadEdges()`, etc.) but there's no formal `GraphBackend` interface. If we swap backends later, extract the interface then.

## Approach

### Step 1: SurrealDB dependency & bundling validation
- [x] Add `surrealdb` and `@surrealdb/wasm` npm packages to `deno.json` and `deno.client.json` imports
- [x] Validated SurrealDB SDK v2.0.3 and WASM engine v3.0.3 import correctly in Deno
- [x] `@deno/emit` cannot bundle npm packages — resolved via **dynamic imports from esm.sh** in `surreal.ts` (type-only imports for compile-time checking, runtime loading from CDN)
- [x] **Bundling risk gate passed** — dynamic import approach bypasses the bundler entirely

### Step 2: DB module — connection & schema
- [x] Created `src/ui/db/surreal.ts` — connection manager with dynamic esm.sh loading
- [x] Created `src/ui/db/schema.ts` — SurrealQL DEFINE TABLE/FIELD definitions for graph + UI databases

### Step 3: DB operations — typed SurrealQL wrappers
- [x] Created `src/ui/db/operations.ts` with all planned operations
- [x] RecordId normalisation — `normaliseRecordId()` converts SurrealDB RecordId objects and `NONE` values back to plain strings/null

### Step 4: Async initialization & migration
- [x] `loadStateAsync()` — initialises SurrealDB, restores from IndexedDB, migrates localStorage on first launch
- [x] `App` shows "Loading…" skeleton while SurrealDB initialises, falls back to `loadState()` on error

### Step 5: Incremental persistence
- [x] Created `src/ui/db/sync.ts` — diff-based sync layer
- [x] Leading-edge + trailing-edge debounce (immediate after 2s idle, 500ms debounce for rapid changes)
- [x] `beforeunload` handler for best-effort flush on page close
- [x] `flushSync()` for immediate sync (used before tab switches)

### Step 5b: indxdb:// investigation
- [x] Pinned SurrealDB versions: `surrealdb@2.0.3`, `@surrealdb/wasm@3.0.3`
- [x] Standalone Vite spike confirmed upstream bug (`spikes/surrealdb-indxdb/`)
- [x] indxdb:// deferred — using mem:// + IndexedDB bridge

### Step 6: Multi-database — tabs as databases
- [x] UUID-based database identity (`Tab.databaseId`)
- [x] `DatabaseSnapshot` type and `_snapshotCache` for tab switching
- [x] Async `addTab()` with immediate dump persistence (bypasses sync race condition)
- [x] Async `activateTab()` with flush → snapshot → load → update
- [x] `skipBaselineReset` flag prevents useEffect from clobbering sync baseline on tab change
- [x] Tab rename with nullable `name` field (null = unnamed, "Untitled" as placeholder)

### Step 7: IndexedDB persistence bridge
- [x] Created `src/ui/db/bridge.ts` — IndexedDB key-value store for SurrealQL dumps
- [x] Startup restore: import `_ui` dump → read registry → import active tab's graph dump
- [x] Sync exports changed databases to IndexedDB after each sync cycle
- [x] `loadWorkspaceUi()` uses explicit SELECT field list (prevents stale fields leaking)
- [x] `loadStateAsync()` spreads `uiState` before explicit graph fields (prevents clobber)

### Step 8: Documentation
- [x] DESIGN.md §14 Persistence Layer — architecture, RecordId normalisation, indxdb:// bug, future direction
- [x] Security considerations documented
- [x] Remote serving considerations documented

## Key Files

| File | Role |
|---|---|
| `src/ui/workspace.ts` | Data model types, `loadStateAsync()`, tree helpers |
| `src/ui/client.tsx` | App root, state management, persistence hooks |
| `src/ui/db/surreal.ts` | SurrealDB connection manager (dynamic esm.sh loading) |
| `src/ui/db/schema.ts` | SurrealQL table/field definitions |
| `src/ui/db/operations.ts` | Typed query wrappers + tree flatten/rebuild + RecordId normalisation |
| `src/ui/db/sync.ts` | Diff-based incremental persistence with eager sync |
| `src/ui/db/bridge.ts` | mem:// ↔ IndexedDB persistence bridge |
| `src/graph/types.ts` | Formal graph model — cross-reference for schema alignment |
| `deno.json` | SurrealDB dependency (pinned versions) |

## Risks

1. **SurrealDB WASM bundle size** (~several MB). Mitigation: lazy-load after initial render; loading indicator.
2. **Deno bundling compatibility**. `@deno/emit` may not handle SurrealDB's WASM. Mitigation: validated — dynamic imports from esm.sh bypass the bundler.
3. **Async state init**. Current `useState(loadState)` is synchronous. Mitigation: loading skeleton during ~100ms init.
4. **Tree flattening**. Changing from nested children to flat parent-links touches the persistence layer but NOT the in-memory model — existing code stays unchanged.
5. **SurrealDB RecordId objects**. WASM SDK returns RecordId objects, not strings; `NONE` → `undefined` not `null`. Mitigation: normalisation layer in all load functions.

## Open Questions

- IndexedDB storage limits for larger projects (typically 50MB+, should be fine)
- How to handle concurrent browser tabs writing to the same IndexedDB dump (last-write-wins is probably fine for local use)

## Verification

- [x] SurrealDB embedded connects via mem://
- [x] Tree structure preserved through flatten → store → load → rebuild cycle
- [x] Migration from localStorage works on first launch
- [x] Data persists across page reloads via mem:// + IndexedDB bridge
- [x] New tab creates new database, switching tabs loads correct data
- [x] Tab rename works without breaking tab associations
- [x] UI shows loading state during async init
- [x] `deno task ci` passes (283 tests, all checks green)
- [ ] Database delete cleans up IndexedDB dump and handles orphaned tabs
- [ ] Database management UI (create, rename, delete from a dedicated panel)
- [ ] Remove localStorage fallback write (bridge replaces it)

## Next Steps: Workspace Root & Remote Connections

The next branch will introduce remote SurrealDB connections by extending the graph model itself rather than adding a separate configuration layer.

### Design: Workspace root node

Each tab's tree gains an **explicit root node** — a composite node whose children are the graphs that exist today. The root node is visually implicit (rendered the same as the current "root" level), but is a real node with editable properties.

```
[workspace root]              ← real node, implicit in tree/canvas UI
  │  constraints: [workspace.connections]
  │  data.connections: [{ url: "wss://...", ns: "marlinspike", ... }]
  │  data.primaryConnection: "conn-id-1"
  │
  ├── [composite: service-a]  ← today's top-level nodes
  │     └── ...
  └── [composite: service-b]
```

**Key principles:**

- **Constraints, not kinds.** The workspace root is a regular node. A `workspace.connections` constraint provides the schema for connection properties and informs the property editor. No special `kind` field.
- **Uniform node model.** Connection/database properties aren't root-specific. Deeper nodes may carry them too (e.g., a service node that references an external database). The root is just the first node that uses the constraint.
- **Implicit visual root.** The tree view and canvas render the root's children as the top level, matching today's UX. The root's properties are accessible via a settings/config gesture.
- **Embeddable via ports.** A workspace root with port nodes is a standard composite — another graph can embed it as a subgraph, enabling composable/nested workspaces.
- **Structural change.** `treeNodes` moves from a forest (array of top-level nodes) to a rooted tree (single root node whose children are today's top-level nodes).

### Connection model

Connection config lives in the root node's `data` properties, validated by a `workspace.connections` constraint:

```jsonc
{
  "connections": [
    { "id": "local", "type": "embedded", "name": "Local" },
    { "id": "prod", "type": "remote", "name": "Production",
      "url": "wss://surreal.example.com",
      "namespace": "marlinspike",
      "auth": { "method": "token" } }
  ],
  "primaryConnection": "local"
}
```

`surreal.ts` becomes a connection **pool** — one embedded `mem://` instance plus zero or more remote `Surreal` instances. The existing `useDatabase()` / `getDb()` API gains a connection parameter. Operations code remains unchanged.

### Bootstrap

The workspace root always lives in the local embedded database — it must be readable before any remote connection is established. Remote connections described in the root's properties are established after startup. Child graphs may live locally or on a remote, determined by which connection serves their database UUID.
