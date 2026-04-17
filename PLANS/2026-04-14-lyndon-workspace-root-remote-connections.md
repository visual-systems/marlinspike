# Workspace Root & Remote Connections

**Branch:** lyndon/workspace-root-remote-connections
**Date:** 2026-04-14

## Context

Each tab's graph is currently a forest (`treeNodes: TreeNode[]` — an array of root-level nodes). To support remote SurrealDB connections, we need a place to store connection configuration. Rather than adding a separate config layer, we extend the graph model: each tab gets an explicit **workspace root node** whose `data` properties hold connection config, validated by a constraint. This is consistent with the project philosophy — constraints drive schema, nodes are uniform, and the root is embeddable in other graphs via ports.

Alongside the structural change, the code view needs to become a full-fidelity representation of the workspace — able to round-trip identity, data, and metadata without silent loss. The Spike-Clojure codec uses `^{:id "..."}` reader metadata for UUID-bearing entities and label-derived identity for everything else, keeping the common case clean while supporting stable identity when needed.

## Goal

1. Introduce a workspace root node (structural change to tree model)
2. Add a `workspace.connections` constraint type with schema-driven editing
3. Refactor `surreal.ts` from a singleton into a connection pool
4. Wire remote connections through the pool based on root node config
5. Full-fidelity code round-trip — emit and parse node data, edge metadata, constraints, and other domain state through the code view

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

### Phase 2.5: Virtual root, workspace visibility, and cleanup

The workspace node should be a regular inspectable entity — not hidden behind a special button. Introduce a virtual root above the workspace node so that navigating "up" from the workspace reveals it on the canvas like any other node.

#### Virtual root + workspace focus
Simpler approach than adding another node layer: `focusId=null` IS the virtual root. No extra node needed.

- Default `focusId` to workspaceRootId → users see workspace contents (same visual as before)
- `focusId=null` → `getFocusedRootNodes()` returns `treeNodes` (shows workspace root on canvas for inspection)
- Focus dropdown: "(root)" navigates to `null`, showing workspace; workspace root appears in ancestor breadcrumbs
- [x] Default `focusId` to the workspace root node ID (not null) in all load paths + `defaultState()` + `addTab()`
- [x] `getFocusedRootNodes()`: when `focusId=null`, return `ws.treeNodes` (shows workspace root on canvas); when focused on workspace root, return its children
- [x] Remove the ⓘ inspect button next to the focus dropdown — users navigate up to virtual root to inspect the workspace
- [x] Stop filtering workspace root from focus dropdown ancestors — it's now a navigable level
- [x] Add virtual root test case to `workspace_test.ts`
- [x] `deno task ci` passes — 304 tests, all checks green

#### Code view integration
- [x] When focused on virtual root: code view emits `(def WorkspaceName [...])` showing the workspace as a definition
- [x] When focused on workspace (default) or deeper: code view emits only the children — no wrapping workspace form
- [x] On apply, re-wrap parsed result in the existing workspace root so `rootNodeId` stays stable across round-trips
- [x] If user includes the `Workspace` form explicitly (virtual-root view), detect + unwrap it so the parser's label-derived id doesn't overwrite the UUID
- [x] Extract pure helpers to `src/code/workspace-codec.ts` with 10 unit tests covering both focus modes
- [ ] Open questions (round-tripping paste-in, orphan defs, workspace-name-as-label, constraint metadata emission) — deferred; these are independent design choices that can be revisited once remote connections are wired up

#### Workspace root label = tab name
- [x] Root node label should reflect the tab's display name, not a generic "Workspace"
- [x] Renaming the tab updates the root node label
- [x] Renaming the root node in code updates the tab name
- [x] New tabs / null tab names fall back to "Untitled"

#### Workspace constraint visibility
- [ ] Ensure `workspace.connections` constraint is visible in the constraints panel when applied to the workspace node
- [ ] Move schema-driven data fields (url, namespace, database, username, password) to the entity inspector — the constraint inspector should show the schema/rules, not the data that satisfies them. Data lives on the entity's `data` bag; the constraint just declares what shape that data must have.
- [ ] Verify constraint fields render and are editable in the entity inspector when the workspace root is selected

#### Default database UUID
- [x] Replace `DEFAULT_DB = "default"` with a generated UUID
- [x] Update `loadStateAsync` migration: treat "default" as a legacy identifier, remap to UUID
- [x] Update all code paths that compare against the literal "default" string

#### State corruption hardening
- [~] Can't replicate — deferred. User unable to reproduce the corruption symptoms that motivated this, so not worth speculative defenses right now. Revisit if symptoms reappear.
  - ~~Add a validation pass on load: detect and repair double-wrapped roots, missing rootNodeIds, orphaned tabs~~
  - ~~Add logging/diagnostics when validation repairs state~~
  - ~~Consider adding a `structuredClone` barrier on state save to catch non-serializable values~~

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

### Phase 5: Full-fidelity code round-trip (data, metadata, constraints)

Currently spike-clojure captures only the core graph structure — node labels, hierarchy, and dataflow edges. Everything else (version numbers, `data` bags, ports, URIs, constraints, constraint applications) is silently dropped on emit and lost on round-trip. This phase makes the code view a complete representation of the workspace.

#### Node metadata
- [ ] Emit `data` as a trailing map on `def`/`defn` forms — e.g. `(def name {:key "val"})` for leaves, or a kwargs-style block for composites
- [ ] Emit `uri` when present — e.g. `:uri "spike://..."` inside the data/meta map
- [ ] ~~Emit `version`~~ — **No.** Version is an internal reactivity/debugging signal, not domain data. It should not appear in the code view, serialised output, or data inspector. The merger can continue bumping it internally for change detection.
- [ ] Preserve `ports` through round-trip (currently only `{:ports ...}` attr-map on defn is handled; standalone port declarations on def composites are not)
- [ ] Parse all of the above back on apply, merging with existing node state

#### Edge metadata
- [ ] Emit edge `label` and `data` — edges currently carry no payload in the code view
- [ ] Consider syntax: inline annotation on the call site (e.g. `(f ^{:label "transforms"} x)`), or a separate `(edge from to {:label "..." ...})` form
- [ ] ~~Emit edge `version`~~ — same as nodes: internal only

#### Constraints and applications
- [ ] Emit constraints as top-level forms — e.g. `(constraint "workspace.connections" {:url "wss://..." ...})`
- [ ] Emit constraint applications linking constraints to their target entities
- [ ] Parse constraints back on apply, preserving constraint ids through round-trip
- [ ] Consider whether constraint definitions belong in the code view at all, or only their applications (the "this node has these constraints" relationship)

#### Workspace-level state
- [ ] Emit workspace-level properties that live on the root node's `data` (connection config, etc.)
- [ ] Consider what workspace state is structural (belongs in code) vs. ephemeral (canvas positions, expanded nodes, selections — clearly not in code)

#### Design questions
- What is the right syntax for node data? Options: trailing map `(def name {...data})`, kwargs before children `(def name :key val [...])`, or reader metadata `^{...} name`. Each has trade-offs for readability and Clojure-likeness.
- **Decision: version is internal.** It's a reactivity/change-detection counter, not domain data. It should not appear in emitted code, serialised formats, or the data inspector. Round-trips bump it as a side-effect — that's fine, it's what it's for.
- How much of this belongs in spike-clojure vs. a separate "workspace file format"? The code view is meant for interactive editing; a full serialisation format might warrant its own codec.
- Edge metadata syntax — Clojure has no native edge concept; any encoding is a convention. Should it be readable as valid Clojure, or can we extend the syntax?

### Phase 6: Blank-slate bootstrapping

The first-run experience is currently janky — `defaultState()` creates a tab called "Main" pre-populated with a fake `acme/backend` project tree (auth-service, token-validator, ingress, frontend). This is confusing for new users and has no relation to anything they're trying to do.

#### Goals
- First launch should present a clean, empty workspace — not a demo project the user has to delete
- Example projects should be available but opt-in, not forced on the user
- The bootstrapping path should feel intentional, not accidental

#### Default state
- [ ] `defaultState()` creates a single tab with `name: null` ("Untitled"), an empty workspace root, and no children
- [ ] Remove `defaultTreeNodes()` sample data — it was useful for development but is now noise for real users
- [ ] Remove hardcoded personas ("Architect", "Developer", "Reviewer") and workflows ("Explore", "Design", "Build") from default state — these should come from user configuration or be empty
- [ ] Keep `workspace.connections` constraint applied to the root (it's structural, not sample data)

#### Example projects
- [ ] Add an "Examples" mechanism — loadable sample workspaces that demonstrate the tool's capabilities
- [ ] Candidates: quadratic-roots (dataflow), a simple service topology (structural), an OIDC flow (mixed)
- [ ] UI affordance: a way to load an example into a new tab (could be a menu, a welcome screen, or a command)
- [ ] Examples should be defined as spike-clojure source text, parsed via `spikeToGraph` — dogfooding the codec

#### Design questions
- Should the first-run show a welcome/onboarding screen, or just an empty canvas? An empty canvas is honest but potentially confusing; a minimal welcome overlay could orient the user without polluting the workspace.
- Should `defaultTreeNodes()` be kept as a test utility (renamed to `exampleTreeNodes()` or similar), or should tests that need sample data construct their own?
- How should examples interact with tabs — always a new tab, or replace the current empty one?

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
- **Reference semantics & identity (future scope):** How UUIDs / identity interact with how one entity references another is a bigger design question than this branch. Goals we'd like the eventual design to satisfy:
  - Able to write and export **lightweight encodings** without UUID encumbrance when identity-through-rename isn't required (common case: pasting/exporting snippets).
  - Able to **unambiguously reference** a specific entity in a graph even when labels collide or change.
  - Able to **garbage-collect** entities no longer reachable (orphans).
  - Able to opt in to **ID-rich forms** when explicitness is needed (e.g. preserving identity across renames, cross-workspace refs, constraint-application targets).

  Candidate approaches to explore:
  - Default symbolic references (by label) with optional `^{:uuid "..."}` metadata only on the entities that need it — emitter chooses minimal form.
  - First-class reference literal — e.g. `#ref "uuid"` as a tagged form, usable anywhere a symbol is accepted.
  - Mixed: symbolic references resolve by name in scope; `#ref` disambiguates when names collide or cross scopes.
  - "Identity map" sidecar form — separates identity from structure, e.g. a trailing `(bindings …)` block or file-level map from label/path → UUID.

  Relevant tensions: lightness vs. rename-safety, local readability vs. cross-workspace interop, how to represent references inside constraint applications and ports.
- **Non-UUID GUIDs:** The `^{:id "..."}` metadata currently only emits when the id matches the UUID v4 pattern (`looksLikeUuid`). If we adopt other globally-unique identifier formats (e.g. ULIDs, nanoids, content-addressed hashes), the emit gate will need broadening. The question is whether `looksLikeUuid` should become a more general `isOpaqueId` check, or whether the emitter should use a different heuristic (e.g. "id !== label" plus a registry of known derivable patterns like `spike://`).
- **Reuse & instantiation (broader than "examples"):** Hard-coding example projects into the UI is a dead end — the real need is a general mechanism for reusing and instantiating graph structures. This intersects several existing design threads:
  - **Templating / prototypes:** A workspace or subgraph could serve as a template that gets instantiated into a new context. This is analogous to class/prototype inheritance — the template defines structure, the instance gets its own identity and can override specifics. How does this interact with `^{:id "..."}` identity? Instances need fresh ids; templates might use symbolic/label-based identity.
  - **Remote databases as template sources:** A connected remote database could serve as a library of reusable structures. Instantiating from a remote template combines the connection pool (Phase 3–4) with identity minting and reference resolution.
  - **Macros / expansion:** An alternative to prototype instantiation — a macro-like form that expands into a subgraph at apply time. Keeps the source representation terse while generating rich structure. Could compose with constraints (a macro that generates nodes pre-configured with constraint applications).
  - **Relationship to reference semantics:** Instantiation needs to distinguish "this is a copy" from "this is a reference to the original." The reference semantics design (above) directly informs how templates, instances, and cross-workspace links are encoded.
  - **Design goal:** Whatever mechanism emerges should be powerful (handles real reuse patterns), consistent (works the same way whether the source is local or remote, code or UI), and terse (doesn't bloat the spike-clojure representation with boilerplate).
- **View pane UI conflict:** * the title bar of view panes intersects the mode selection dropdowns etc. Looks bad. Perhaps when they overlap the margin above the view pane can increase so it "ducks" under those elements?

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
