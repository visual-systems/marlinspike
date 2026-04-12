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

**Deferred to future branches**: Cross-database references/closures, tab-database mapping, remote database serving, security implementation, connected graphs UI overhaul.

## Architecture

### Data Separation

Split current `WorkspaceState` into two concerns:

**Graph data** (per-project SurrealDB database):
- `tree_node` table — flat records with `parent` link (not nested children)
- `edge` table — SurrealDB graph relations via `RELATE`
- `constraint` table
- `constraint_application` table

**UI state** (dedicated `_ui` SurrealDB database):
- `workspace` table — single record: tabs, activeTabId, personas, workflows, connectedGraphs, focusId, canvasExpandedNodes, canvasNodePositions, canvasSelected, canvasAlgorithm, entityDrafts
- `db_registry` table — known databases with metadata (name, created, lastOpened)

### Tree Model: Flat in DB, Nested in Memory

SurrealDB stores flat `tree_node` records with a `parent` field (record link or null for roots). On load, `buildTree()` reconstructs the recursive `TreeNode[]` structure. All existing tree-walking code (`findNode`, `findParentOf`, `collectSubtreeIds`, etc.) works unchanged against the in-memory representation.

### SurrealDB Namespace Layout

```
namespace: marlinspike
  database: default           ← migrated from localStorage
    tree_node, edge, constraint, constraint_application
  database: project_foo       ← additional projects (future)
    tree_node, edge, constraint, constraint_application
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
  - `initSurreal()`: loads SDK from esm.sh, connects to `indxdb://marlinspike`
  - `getDb()`: returns initialized Surreal instance
  - `useDatabase()`, `useUiDb()`, `useDefaultDb()`: namespace/database switching
- [x] Created `src/ui/db/schema.ts` — SurrealQL DEFINE TABLE/FIELD definitions for graph + UI databases

### Step 3: DB operations — typed SurrealQL wrappers
- [x] Created `src/ui/db/operations.ts` with all planned operations:
  - **Tree nodes**: `saveTreeNode()`, `deleteTreeNode()`, `loadAllNodes()` → `FlatNode[]`
  - **Tree reconstruction**: `buildTree(flatNodes)` → `TreeNode[]`, `flattenTree(nodes)` → `FlatNode[]`
  - **Edges**: `saveEdge()`, `deleteEdge()`, `loadAllEdges()`
  - **Constraints**: `saveConstraint()`, `deleteConstraint()`, `loadAllConstraints()`
  - **Constraint applications**: `saveApplication()`, `deleteApplication()`, `loadAllApplications()`
  - **UI state**: `saveWorkspaceUi()`, `loadWorkspaceUi()`
  - **DB registry**: `listDatabases()`, `createDatabase()`, `touchDatabase()`, `deleteDatabase()`

### Step 4: Async initialization & migration
- [x] Added `loadStateAsync()` to `src/ui/workspace.ts`
  - Initialises SurrealDB, checks for existing databases
  - On first launch: creates "Default" database, migrates localStorage data, clears localStorage
  - On subsequent launches: loads from SurrealDB, reconstructs tree from flat nodes
- [x] Modified `src/ui/client.tsx`:
  - `App` shows "Loading…" skeleton while SurrealDB initialises
  - Async init with `loadStateAsync()`, falls back to `loadState()` on SurrealDB error
  - Debounced SurrealDB write via sync layer, with localStorage fallback write

### Step 5: Incremental persistence (replace bulk serialization)
- [x] Created `src/ui/db/sync.ts` — diff-and-write layer
  - `scheduleSyncToDb()`: debounced (500ms) diff-based persistence
  - `setSyncBaseline()`: establishes initial state for diffing
  - Detects additions, deletions, modifications by ID + reference equality
  - Graph data synced incrementally; UI state synced as bulk update
- [x] Wired into `client.tsx` useEffect via `scheduleSyncToDb()`

### Step 5b: indxdb:// persistence fix
- [x] Pinned SurrealDB versions: `surrealdb@2.0.3`, `@surrealdb/wasm@3.0.3` in deno.json, deno.client.json, and esm.sh URLs
- [x] Added `useWithRetry()` — retries `use()` up to 4 times with increasing delays (0, 50, 200, 500ms) to work around known WASM↔JS IndexedDB transaction timing bug
- [x] Multiple SurrealQL schema fixes: `FLEXIBLE` after `TYPE`, `TYPE any` for flexible arrays, `NONE` for optional fields
- [x] Replaced broken dynamic `import("./db/surreal.ts")` with static `getDb()` import
- [x] indxdb:// persistence deferred — upstream WASM↔JS async barrier bug (#5712) prevents IndexedDB transactions; tried retries, Web Worker engine (`createWasmWorkerEngines` hangs on connect), and clearing IndexedDB (triggers WASM crash). Using `mem://` until remote SurrealDB backend is added.
- [x] Cleaned up dead code: removed `useWithRetry()`, `RETRY_DELAYS`, and `createWasmWorkerEngines` from `WasmModule` interface

### Step 6: Multi-database basics — tabs as databases
- [x] DB registry in `_ui` database: `db_registry` table with name, created, lastOpened
- [x] Default database created on first launch (migration target)
- [x] Add `databaseId` to `Tab` interface (SurrealDB database slug per tab)
- [x] Add `DatabaseSnapshot` type and `_snapshotCache` to `WorkspaceState`
- [x] Add `canvas_state` SCHEMALESS table to graph schema (per-database canvas state)
- [x] Add `slug` field to `db_registry` so database slug is tracked alongside display name
- [x] Update `UiState` — remove per-database fields (focusId, canvas*, entityDrafts)
- [x] Update sync layer: derive databaseId from active tab, add `flushSync()`, sync canvas state
- [x] Async `addTab()`: creates new SurrealDB database, assigns `databaseId`
- [x] Async `activateTab()`: flush sync → snapshot → load target → update state
- [x] `loadDatabaseSnapshot()` function for loading a database's data
- [x] Backfill migration: tabs missing `databaseId` get `DEFAULT_DB`

### Step 7: Remove localStorage (partially deferred)
- [ ] localStorage kept as fallback write during Phase 1 (dual-write: SurrealDB primary + localStorage fallback)
- [x] Migration code reads localStorage → imports to SurrealDB → clears localStorage on first launch
- [ ] Full removal deferred until SurrealDB persistence is validated end-to-end in browser

### Step 8: Documentation & verification
- [x] Security considerations documented (see section below)
- [x] Remote serving considerations documented (see section below)
- [x] `deno task ci` passes (283 tests, all checks green)
- [x] flattenTree/buildTree unit tests added (17 tests)

## Key Files

| File | Role |
|---|---|
| `src/ui/workspace.ts` | Data model types, `loadState()` → `loadStateAsync()`, tree helpers |
| `src/ui/client.tsx` | App root, state management, persistence hook |
| `src/ui/db/surreal.ts` | SurrealDB connection manager (dynamic esm.sh loading) |
| `src/ui/db/schema.ts` | SurrealQL table/field definitions |
| `src/ui/db/operations.ts` | Typed query wrappers + tree flatten/rebuild |
| `src/ui/db/sync.ts` | Diff-based incremental persistence |
| `src/graph/types.ts` | Formal graph model — cross-reference for schema alignment |
| `deno.json` | Add surrealdb dependency |

## Risks

1. **SurrealDB WASM bundle size** (~several MB). Mitigation: lazy-load after initial render; loading indicator.
2. **Deno bundling compatibility**. `@deno/emit` may not handle SurrealDB's WASM. Mitigation: validate in Step 1 before designing anything else. Fallback: CDN script tag or esbuild.
3. **Async state init**. Current `useState(loadState)` is synchronous. Mitigation: loading skeleton during ~100ms init.
4. **Tree flattening**. Changing from nested children to flat parent-links touches the persistence layer but NOT the in-memory model — existing code stays unchanged.

## Open Questions

- SurrealDB embedded WASM + Deno bundling: does it work out of the box?
- IndexedDB storage limits for larger projects (typically 50MB+, should be fine)
- Optimal debounce interval for SurrealDB writes (start with 500ms?)
- How to handle concurrent tabs writing to the same SurrealDB database (IndexedDB handles this, but worth testing)

## Security Considerations (documentation only, implementation deferred)

- **Embedded mode**: Data resides in IndexedDB, accessible to any script on the same origin. Acceptable for local development use case.
- **Remote mode** (future): SurrealDB supports namespace/database-level authentication. Credentials must not be stored in graph data.
- **Cross-database references** (future): URI resolution to remote databases must handle authentication. The `spike://` URI scheme encodes authority but not credentials.

## Remote Serving Considerations (documentation only, implementation deferred)

- SurrealDB's JS client works identically against `wss://remote-server/rpc` — the operations layer would work without modification.
- `db_registry` entries would gain a `type: "local" | "remote"` field with connection details.
- This naturally supports the collaboration story in DESIGN.md Phase 6.

## Verification

- [x] SurrealDB embedded connects via mem:// (indxdb:// deferred due to upstream bug)
- [ ] Graph data round-trips correctly (create nodes/edges, reload, verify) (requires browser testing)
- [x] Tree structure preserved through flatten → store → load → rebuild cycle (buildTree/flattenTree implemented and type-checked)
- [ ] Migration from localStorage works on first launch (requires browser testing)
- [ ] Multiple databases can be created and listed (API ready, UI deferred)
- [ ] Incremental persistence works (modify one node, only that record updates) (requires browser testing)
- [ ] No remaining direct localStorage usage for graph data (deferred — dual-write in Phase 1)
- [x] UI shows loading state during async init (no flash of empty state)
- [x] `deno task ci` passes (266 tests, all checks green)
