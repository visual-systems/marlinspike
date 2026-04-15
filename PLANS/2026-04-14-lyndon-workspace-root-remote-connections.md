# Workspace Root & Remote Connections

**Branch:** lyndon/workspace-root-remote-connections
**Date:** 2026-04-14

## Context

Each tab's graph is currently a forest (`treeNodes: TreeNode[]` — an array of root-level nodes). To support remote SurrealDB connections, we need a place to store connection configuration. Rather than adding a separate config layer, we extend the graph model: each tab gets an explicit **workspace root node** whose `data` properties hold connection config, validated by a constraint. This is consistent with the project philosophy — constraints drive schema, nodes are uniform, and the root is embeddable in other graphs via ports.

## Goal

1. Introduce a workspace root node (structural change to tree model)
2. Add a `workspace.connections` constraint type with schema-driven editing
3. Refactor `surreal.ts` from a singleton into a connection pool
4. Wire remote connections through the pool based on root node config

Each phase is independently shippable.

## Approach

### Phase 1: Workspace root node
- [x] Add `makeRootNode(id, children)`, `getWorkspaceRoot()`, `getWorkspaceRootId()`, `ensureWorkspaceRoot()` to `workspace.ts`
- [x] Add `rootNodeId` field to `Tab` interface (UUID, not a constant — supports embedding)
- [x] Change `defaultTreeNodes()` to return `ensureWorkspaceRoot([...existing...])`
- [x] Change `getFocusedRootNodes()`: when `focusId === null`, return workspace root's children
- [x] Migration in `loadStateAsync()` and `loadDatabaseSnapshot()`: wrap via `ensureWorkspaceRoot()`
- [x] Migration in `loadState()` (localStorage path): same wrapping
- [x] Update `addTab()` in `client.tsx`: new tabs get `[makeRootNode([])]`
- [x] Update canvas `addNode()`: use `WORKSPACE_ROOT_ID` as fallback parent instead of null
- [x] Update focus dropdown: filter root node from ancestor breadcrumbs
- [x] Add "inspect" button next to focus dropdown — inspects the currently focused node (or workspace root when at root)
- [x] Widen the connected-graphs dropdown so graph names fit on one line (180px → 280px)
- [x] Add unit tests for workspace root helpers (`workspace_test.ts`)
- [x] Verify `buildTree`/`flattenTree` work unchanged (root is just a node with `parent: null`)
- [x] Verify sync works unchanged (root syncs as a regular FlatNode)
- [x] Fix `ensureWorkspaceRoot` double-wrapping bug — single node without rootNodeId now reuses it as root
- [x] Fix multi-tab rootNodeId backfill — inactive tabs no longer get active tab's rootNodeId
- [x] Add idempotency migration tests for ensureWorkspaceRoot
- [x] Clean up debug logging from client.tsx and workspace.ts
- [x] `deno task ci` passes — 303 tests, all checks green

### Phase 2: `workspace.connections` constraint type
- [x] Register `workspace.connections` in constraint type registry (`validate_workspace.ts`)
- [x] Define data schema: url, namespace, database, username, password fields
- [x] Implement evaluator: validate url format (ws/wss/http/https) and required fields
- [x] Add predefined constraint instance in `builtin_constraints.ts`
- [x] Add 7 unit tests for constraint validation (`validate_workspace_test.ts`)
- [ ] Verify: constraints panel auto-renders connection fields when applied to root

### Phase 3: Connection pool
- [ ] Refactor `surreal.ts`: split singleton into `localDb` + `remoteConnections` Map
- [ ] Keep `getDb()` backward-compatible (returns local by default)
- [ ] Add `connectRemote(id, config)`, `disconnectRemote(id)`, `getRemoteDb(id)`
- [ ] `useDatabase()` / `useUiDb()` always target local instance
- [ ] Verify all existing functionality unchanged

### Phase 4: Wire remote connections
- [ ] Add `getConnectionConfig(ws)` helper to read connection config from root node constraints
- [ ] Add `bootstrapConnections(ws)` in `client.tsx` — called after load, establishes remotes
- [ ] Update `connectedGraphs` to show remote connection status
- [ ] Handle connection errors gracefully with diagnostics
- [ ] Reconnect when constraint data changes

## Key files

| File | Phase | Changes |
|---|---|---|
| `src/ui/workspace.ts` | 1, 4 | Root node helpers, migration, `getConnectionConfig()` |
| `src/ui/client.tsx` | 1, 4 | `addTab()` root node, `bootstrapConnections()` |
| `src/ui/components/canvas.tsx` | 1 | `addNode()` fallback parent |
| `src/ui/components/focus-dropdown.tsx` | 1 | Filter root from breadcrumbs, inspect button |
| `src/ui/components/workspace-bar.tsx` | 1 | Widen connected-graphs dropdown |
| `src/ui/db/operations.ts` | 1 | No changes expected (buildTree/flattenTree work as-is) |
| `src/ui/db/sync.ts` | 1 | No changes expected (root syncs as regular node) |
| `src/graph/validate_workspace.ts` | 2 | `workspace.connections` type registration |
| `src/graph/builtin_constraints.ts` | 2 | Predefined constraint instance |
| `src/ui/db/surreal.ts` | 3 | Singleton → pool refactor |

## Key design details

### Root node structure
```
// Tab stores the root node's UUID
Tab { rootNodeId: "a1b2c3d4-..." }

treeNodes: [
  {
    id: "a1b2c3d4-...",        // UUID (same as tab.rootNodeId)
    label: "Workspace",
    kind: "composite",
    children: [...today's top-level nodes...],
    data: {},                   // connection config lives here via constraint
    version: 1
  }
]
```

Root IDs are UUIDs (not a fixed constant) so workspaces can be embedded inside other graphs without ID collisions.

### Visual transparency
`getFocusedRootNodes()` is the single point of change — returns `ws.treeNodes[0].children` when `focusId === null`. Tree panel, canvas, and focus dropdown all go through this function, so the root is never rendered directly.

Canvas `syncLayout()` receives `focusedRootNodes` (the children), so layout keys and root level rendering work unchanged.

### Canvas addNode() fix
Currently: `effectiveParentId = parentId ?? ws.focusId ?? null` — null means "add to forest root".
After: `effectiveParentId = parentId ?? ws.focusId ?? getWorkspaceRootId(ws)` — adds as child of workspace root.

### findParentOf() behavior
With the root node, `findParentOf(ws.treeNodes, topLevelChildId)` now returns the root node instead of null. Call sites use `?.id ?? ""` patterns which correctly handle this — the workspace root's grandparent is still null, so `findParentOf(treeNodes, rootNodeId)` returns null and the `?? ""` fallback still produces `""` for the canvas root level key.

### Migration
On load, `ensureWorkspaceRoot(treeNodes, tab.rootNodeId)` wraps if needed. If the tab has no `rootNodeId` yet (migration), a new UUID is generated and backfilled. This runs in `loadStateAsync()`, `loadDatabaseSnapshot()`, and `loadState()`. The root is then persisted by the normal sync cycle.

### Connection pool (Phase 3)
```typescript
let localDb: Surreal | null = null;
const remoteConnections = new Map<string, Surreal>();

// getDb() returns localDb by default — all 27 call sites unchanged
export function getDb(): Surreal {
  return localDb!;
}

// New functions for remote management
export async function connectRemote(id: string, config: ConnectionConfig): Promise<Surreal>;
export function disconnectRemote(id: string): void;
export function getRemoteDb(id: string): Surreal | undefined;
```

## Implementation Considerations

- If a file is getting too large, split out logical modules rather than letting it grow unbounded.
- Add sensible unit tests around new functionality and code — especially workspace root helpers, migration logic, and constraint validation.
- Keep DESIGN.md and this plan up to date as implementation progresses — check off items, note any deviations or decisions made during implementation.

## Open Questions

- Should the workspace root be deletable? Probably not — if deleted, recreate it automatically.
- How to handle auth credentials securely? For now, stored in node data (local IndexedDB). Future: credential store or OAuth flow.
- Should remote connection status be reactive (live query / subscription)? Defer — poll or manual refresh for now.
- **Tab name on root node:** The tab's display name could live as a property on the root node (it's workspace metadata). Deferring for now — currently on Tab.
- **databaseId on root node vs Tab:** The root node could own its database identity, but there's a bootstrap problem — you need to know which database to load *before* you can read the root node. For now, `databaseId` stays on Tab. Future: root nodes always live in local storage; their connection config (via constraints) determines what gets synced remotely.
- **Code view and the workspace root:** The code view currently emits `(def Workspace [acme/backend])` which wraps the focused subtree in the root node. Several interrelated questions:
  - Should the code view include the focused node as the outer form, or only its children? E.g. when focused on root, show `(def acme/backend [...])` directly rather than `(def Workspace [acme/backend])`.
  - Want to be able to easily paste code into the code view (e.g. the quadratic-roots example). If the Workspace wrapper is omitted on emit, it should be inferred and re-inserted automatically on parse.
  - What should happen to orphan definitions not referenced by the workspace root? Currently they'd be lost on round-trip.
  - Should the root node be called "Workspace"? Probably should match the tab/workspace name rather than be generic. Or perhaps use a special form for the declaration — e.g. `(workspace "My Project" [...])` or metadata on `def`.
  - How to show workspace metadata (especially db connections from constraints) in the code view? `def`/`defn` metadata maps would be a natural fit — e.g. `(def ^{:url "wss://..." :ns "prod"} my-workspace [...])`.

## Verification

- [ ] Existing data loads correctly after root node migration (no visual change)
- [ ] New tabs have a root node
- [ ] Adding nodes at root level works (becomes child of workspace root)
- [ ] Focus navigation: "(root)" still works, breadcrumbs don't show workspace root
- [ ] `workspace.connections` constraint renders connection fields in inspector
- [ ] Invalid connection URL produces a diagnostic
- [ ] Connection pool: local DB works identically to before
- [ ] Remote connection: configuring a valid wss:// URL establishes connection
- [ ] `connectedGraphs` dropdown shows remote connection status
- [ ] Removing connection constraint disconnects the remote
- [ ] `deno task ci` passes after each phase
