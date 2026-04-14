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
- [ ] Add `WORKSPACE_ROOT_ID` constant and `makeRootNode()` helper to `workspace.ts`
- [ ] Change `defaultTreeNodes()` to return `[makeRootNode([...existing...])]`
- [ ] Change `getFocusedRootNodes()`: when `focusId === null`, return `ws.treeNodes[0]?.children ?? []`
- [ ] Add `getWorkspaceRoot(ws)` helper
- [ ] Migration in `loadStateAsync()` and `loadDatabaseSnapshot()`: wrap existing trees in root node if missing
- [ ] Migration in `loadState()` (localStorage path): same wrapping
- [ ] Update `addTab()` in `client.tsx`: new tabs get `[makeRootNode([])]`
- [ ] Update canvas `addNode()`: use `WORKSPACE_ROOT_ID` as fallback parent instead of null
- [ ] Update focus dropdown: filter root node from ancestor breadcrumbs
- [ ] Verify `buildTree`/`flattenTree` work unchanged (root is just a node with `parent: null`)
- [ ] Verify sync works unchanged (root syncs as a regular FlatNode)

### Phase 2: `workspace.connections` constraint type
- [ ] Register `workspace.connections` in constraint type registry (`validate_workspace.ts`)
- [ ] Define data schema: url, namespace, database, username, password fields
- [ ] Implement evaluator: validate url format and required fields
- [ ] Add predefined constraint instance in `builtin_constraints.ts`
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
| `src/ui/components/focus-dropdown.tsx` | 1 | Filter root from breadcrumbs |
| `src/ui/db/operations.ts` | 1 | No changes expected (buildTree/flattenTree work as-is) |
| `src/ui/db/sync.ts` | 1 | No changes expected (root syncs as regular node) |
| `src/graph/validate_workspace.ts` | 2 | `workspace.connections` type registration |
| `src/graph/builtin_constraints.ts` | 2 | Predefined constraint instance |
| `src/ui/db/surreal.ts` | 3 | Singleton → pool refactor |

## Key design details

### Root node structure
```
treeNodes: [
  {
    id: WORKSPACE_ROOT_ID,     // "spike://workspace-root"
    label: "Workspace",
    kind: "composite",
    children: [...today's top-level nodes...],
    data: {},                   // connection config lives here via constraint
    version: 1
  }
]
```

### Visual transparency
`getFocusedRootNodes()` is the single point of change — returns `ws.treeNodes[0].children` when `focusId === null`. Tree panel, canvas, and focus dropdown all go through this function, so the root is never rendered directly.

Canvas `syncLayout()` receives `focusedRootNodes` (the children), so layout keys and root level rendering work unchanged.

### Canvas addNode() fix
Currently: `effectiveParentId = parentId ?? ws.focusId ?? null` — null means "add to forest root".
After: `effectiveParentId = parentId ?? ws.focusId ?? WORKSPACE_ROOT_ID` — adds as child of workspace root.

### findParentOf() behavior
With the root node, `findParentOf(ws.treeNodes, topLevelChildId)` now returns the root node instead of null. Call sites use `?.id ?? ""` patterns which correctly handle this — the workspace root's grandparent is still null, so `findParentOf(treeNodes, WORKSPACE_ROOT_ID)` returns null and the `?? ""` fallback still produces `""` for the canvas root level key.

### Migration
On load, check `ws.treeNodes[0]?.id !== WORKSPACE_ROOT_ID` → wrap: `[makeRootNode(existingNodes)]`. This runs in `loadStateAsync()`, `loadDatabaseSnapshot()`, and `loadState()`. The root is then persisted by the normal sync cycle.

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

## Open Questions

- Should the workspace root be deletable? Probably not — if deleted, recreate it automatically.
- How to handle auth credentials securely? For now, stored in node data (local IndexedDB). Future: credential store or OAuth flow.
- Should remote connection status be reactive (live query / subscription)? Defer — poll or manual refresh for now.

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
