# Profiles and Outside-In Connections

**Branch:** lyndon/profiles-and-outside-in-connections
**Date:** 2026-04-22
**Branch Preview:** <!-- replace me -->

## Context

The connection pool and bootstrap layering are implemented — workspace root nodes carry connection
config, root nodes are always local, children follow the connection. But the outside-in principle
is implicit in the code, not stated in DESIGN.md. Additionally, there's no concept of "profiles"
to scope which workspaces a user sees, and the current `tabs[]` / workspace root nodes are
maintained as separate concepts that must be kept in sync.

## Goal

Document the outside-in connection principle, profiles, workspace-as-tabs unification, and the
workspace/storage-location constraint split in DESIGN.md. Add a Cardano cubic roots example and
story. Implement the UI and data model changes for profiles, workspace focus, and
constraint-driven node shapes.

## Design decisions (from story exploration)

### Profile placement
- Profile dropdown sits left of the tab strip in the workspace bar (Option A)
- Focus breadcrumb shows "(root)" above the profile level; profile node label shows when focused on it
- Remove the persona dropdown for now — no persona functionality implemented yet

### Workspace focus and tab identity
- **Tab identity (`homeWorkspaceId`) is stable, focus (`focusId`) is fluid.** Tab labels always
  show the home workspace name, regardless of where the user has navigated.
- Focus position is communicated solely by the focus breadcrumb in the controls bar — no badge
  or annotation on the tab label itself.
- Any tab can step out to the profile root and come back. No special "overview tab" needed.
- Each tab has independent focus state — switching tabs restores the previous focus position.

### Profile root view
- When focused at the profile root, workspace nodes render as a **normal graph** — same canvas,
  same zoom/pan/select/inspect. Not a special browser mode.
- Edges between workspaces are **manually created by the user**, like at any other level. They
  document cross-workspace relationships (e.g. "Frontend calls Backend API").
- The entity inspector shows workspace properties when a node is selected — no separate workspace
  properties UI.

### Home workspace indicator
- Home workspace has a **small green dot** (top-right of node) that persists regardless of
  selection state. It's subtle orientation, not emphasis.
- Selection is independent — clicking any node selects it normally.
- When nothing is selected at root, the focus breadcrumb shows a **home hint** (green dot +
  workspace name) as a clickable return-to link.

### Constraint-driven node shapes
- Workspace nodes render as **squares** (rounded rect, `border-radius:4px`), driven by
  `data.rendering.shape` in the workspace constraint.
- The canvas reads `rendering.shape` from any constraint — this is a general mechanism, not
  workspace-specific.
- `WORKSPACE_CONSTRAINT` has `data: { rendering: { shape: "rect" } }`.
- Already implemented: canvas renders `<rect>` when `shape === "rect"`, `<circle>` otherwise.

### Connected graphs dropdown
- Remove from the controls bar. Profiles now handle the "which database" question.
- May revisit as a "graph overlay" feature in future.

## Approach

### Phase 1: Design documentation (complete)

- [x] Add Outside-In Connection Principle subsection to DESIGN.md Persistence Layer
- [x] Add Profiles subsection with `indxdb://` URL convention for local profiles
- [x] Add Profile UX detail (dropdown layout, add/edit form, default protection, switching)
- [x] Add Workspace Nodes as Tabs subsection
- [x] Add Workspace and Storage-Location Constraints subsection (split `workspace.connections`)
- [x] Update Future Direction to reference profiles as unit of cross-device sync
- [x] Add Phase 5b (Profiles and Storage) to Implementation Roadmap

### Phase 2: Cardano example and story (complete)

- [x] Create `examples/cardano-cubic-roots/README.md`
- [x] Create `examples/cardano-cubic-roots/cubic-roots.clj`
- [x] Update `examples/README.md` table with new example
- [x] Add CardanoCubicRoots story to `src/ui/stories/examples.stories.tsx`
- [x] Fix examples stories blank canvas (reset `focusId = null` in StoryWrapper)

### Phase 3: Design exploration stories (complete)

- [x] Create `src/ui/stories/profiles.stories.tsx` with profile/workspace focus stories
- [x] Iterate on stories based on feedback (remove rejected options, refine indicators)
- [x] Register in `src/ui/stories/index.ts`

### Phase 4: Constraint-driven node shape (complete)

- [x] Add `rendering: { shape: "rect" }` to `WORKSPACE_CONSTRAINT` data
- [x] Canvas reads `data.rendering.shape` from constraint applications
- [x] Collapsed nodes render `<rect>` when shape is "rect", `<circle>` otherwise

### Phase 5: Profile data model and storage (complete)

- [x] Define `Profile` interface in `workspace.ts`
- [x] Profiles stored in UI state (part of `WorkspaceState`, persisted via SurrealDB `_ui` database)
- [x] Implement default "Local" profile (`indxdb://marlinspike`)
- [x] Add `profiles` and `activeProfileId` to workspace/UI state
- [x] Load/save profiles on startup (via existing sync mechanism)

### Phase 6: Profile UI (complete)

- [x] Add profile dropdown to workspace bar (left of tabs)
- [x] Profile browser: shows URL, local/remote label, active badge per profile
- [x] Add/edit profile form (name, URL, collapsible advanced section)
- [x] Edit button (✎) on each profile row opens pre-filled form
- [x] Profile switching: flush current DB, connect to new profile's target, load workspaces
- [x] Default profile protection (URL locked, `localDatabaseId` preserved on edit)
- [x] Delete profile button (hidden for default profile, switches to default on delete)

### Phase 7: Workspace-as-tabs unification (mostly complete)

- [x] Add `homeWorkspaceId` to `Tab` interface
- [x] **Single-graph model**: all workspace nodes live in the profile's database as
  top-level composite nodes in one `treeNodes` array — not one database per tab
- [x] Tabs become focus pointers: `Tab.rootNodeId` references a workspace node ID in
  the shared tree, not a separate `databaseId`
- [x] Profile root view (`focusId === null`) shows all workspace nodes on the canvas
- [x] Tab labels derive from workspace node labels
- [x] **New tab** creates a workspace node (composite, with `workspace` constraint) as a
  top-level sibling in the shared tree, and opens a tab focused on it
- [x] **Close tab** deletes the workspace node and its subtree from the graph. This is
  a destructive action — the workspace and its contents are removed. (May revisit with
  soft-delete/archive later, but initially keep it simple: close = delete.)
- [ ] `storage-location` constraint on a workspace node opts its children into a
  different database — this is the only case where a separate DB is involved
- [x] Remove `DatabaseSnapshot` swap-on-tab-switch in favour of focus navigation
- [x] `databaseId` moved from `Tab` to `WorkspaceState` (single DB per profile)
- [x] Sync layer uses `state.databaseId` instead of per-tab database
- [~] ~~Migration: convert existing per-tab databases into workspace nodes in one graph~~ (deferred — not yet stable)

**Why this is required**: the current architecture creates a separate SurrealDB database
per tab and swaps `treeNodes` entirely when switching tabs. This means at the profile root
(`focusId === null`) only the active tab's workspace root is visible. The design requires
all workspaces to be siblings in a single graph so that the profile root shows them all,
edges can be drawn between workspaces, and the entity inspector works on workspace nodes.

The `workspace` constraint makes a node tab-eligible. The `storage-location` constraint
optionally declares that a node's children live in a different connection — this is
independent of being a workspace. By default, children inherit the profile's connection.

### Phase 8: Focus navigation updates (complete)

- [x] Virtual root shows "(root)" in focus breadcrumb; profile node label at profile level
- [x] Home workspace indicator (green dot) on workspace nodes at root level
- [x] Home hint in focus breadcrumb when at root with nothing selected
- [x] Remove connected graphs dropdown from controls bar

### Phase 9: Remove persona dropdown (complete)

- [x] Remove persona dropdown from workspace bar
- [x] Keep `personas` / `activePersona` in `WorkspaceState` (state preserved, UI hidden)

### Phase 10: Edge clipping for rect nodes (complete)

- [x] Update `surfacePoint` to use AABB clipping for rect-shaped collapsed nodes
- [x] Update arc exit point calculation for rect nodes (both `arcClipRect` and straight edges)

### Phase 11: Refactoring and cleanup (complete)

- [x] Move node shape from external `rectNodeIds` Set onto `ForceNode.shape` property
- [x] `surfacePoint` reads `from.shape` directly instead of `isRect` parameter
- [x] Remove workflow (explore/design/build) dropdown from controls bar
- [x] Remove `ListEditorModal` and dead code (state fields preserved)
- [x] Recognise both `indxdb://` and `indexdb://` as local profile schemes
- [x] Add global `input::placeholder` style for dimmer placeholder text

### Phase 12: Profile root node

Currently workspace nodes sit as top-level siblings in a flat `treeNodes` array (a forest).
This is inconsistent with every other level of the tree, which follows the pattern: a composite
node containing children. A profile root node eliminates this special case.

**Design:**
- A `PROFILE_CONSTRAINT` (type `profile`, `rendering.shape: "rect"`) marks the profile root
- `treeNodes` always has exactly one root: the profile node
- Workspace nodes are children of the profile node
- The profile root is the default focus on startup (`focusId === profileRootId`)
- `focusId === null` is the true virtual root (shows just the profile node — rarely used)
- Profile root carries profile metadata (name, etc.) in its `data`
- `ensureWorkspaceRoot` → `ensureProfileRoot` — wraps all workspace nodes under the profile node

**Implementation:**
- [x] Add `PROFILE_CONSTRAINT` to `builtin_constraints.ts`
- [x] Add `ensureProfileRoot()` to `workspace.ts` — wraps workspace nodes under a profile
  root node with the profile constraint applied
- [x] Update `defaultState()` — profile root contains the workspace root as a child
- [x] Update `addTab()` — new workspace node becomes a child of the profile root, not a
  top-level sibling
- [x] Update `closeTab()` — already works (recursive `removeNodeFromTree`)
- [x] Update `loadStateAsync()` / `loadState()` — ensure profile root exists on load
- [x] Update focus breadcrumb — reads label from profile root node instead of profile lookup
- [x] Update home workspace indicator — checks `focusId === profileRootId` instead of `null`
- [x] `profileRootId` added to `WorkspaceState`
- [x] `deno task ci` passes after changes (358 tests)

### Phase 13: Profile database IDs and UI polish (complete)

- [x] Derive `localDatabaseId` from `indxdb://` URL path (not UUID) — e.g. `db:marlinspike`
- [x] `localDbIdFromUrl()` helper extracts path from local profile URLs
- [x] `createDatabase()` accepts optional `dbId` parameter
- [x] `backfillProfileDatabaseIds()` derives from URL when possible
- [x] Tab name defaults to `null` — display derives from workspace node label
- [x] Node `kind` reverts from "composite" to "leaf" when all children removed
- [x] Remove auth-service example from default bootstrap data
- [x] Split `WORKSPACE_CONNECTIONS_CONSTRAINT` into orthogonal `WORKSPACE_CONSTRAINT` (tab-eligible,
  rect shape) and `CONNECTIONS_CONSTRAINT` (remote connection config) — renamed across all source
  and test files
- [x] `deno task ci` passes (358 tests)

### Ongoing

- [ ] Update DESIGN.md to reflect implementation decisions as they land
- [x] `deno task ci` passes after each phase (358 tests)

## Open Questions

- Should profiles support scoped personas? (deferred — personas removed from UI for now)
- `indxdb://` key naming convention — is the key the same as the namespace, or should they be
  independent? (e.g. `indxdb://marlinspike` → key "marlinspike", namespace "marlinspike")
- ~~Should closing a tab delete the workspace node or just hide it from the session?~~
  → Initially, close = delete. May revisit with soft-delete/archive later.
- What constraints beyond `rendering.shape` might influence node appearance in future?
- How to migrate existing per-tab databases into workspace nodes in a single graph?
- Should local databases have separate name and id keys? Currently the URL path is used as
  both the database ID and dump key (`indxdb://foobar` → `db:foobar`). A separate id key
  (e.g. a UUID) could avoid PK collisions when sharing/importing databases between instances.

## Verification

### Design (complete)

- [x] DESIGN.md has four new subsections in Persistence Layer
- [x] Outside-in principle stated as explicit axiom
- [x] Profiles described as IndexedDB-stored with `indxdb://` URL convention for local
- [x] Constraint split documented: `WORKSPACE_CONSTRAINT` + `CONNECTIONS_CONSTRAINT` (orthogonal)
- [x] Connection inheritance chain documented (profile → workspace → children)
- [x] Cardano example exists with README and .clj
- [x] CardanoCubicRoots story added
- [x] examples/README.md table updated
- [x] `deno task ci` passes (358 tests)

### Implementation

- [x] Profile data persists in IndexedDB across sessions (via UI state sync)
- [x] Profile browser shows URL, local/remote, active badge, edit button
- [x] Add/edit profile form with name, URL, collapsible advanced fields
- [x] Default "Local" profile exists on first launch
- [x] Tab labels reflect workspace node labels
- [x] Profile root shows all workspaces (single-graph model implemented)
- [x] New tab creates workspace node in shared tree (no database creation)
- [x] Close tab deletes workspace node and subtree
- [x] Tab switching is focus-only (no database swap)
- [x] `DatabaseSnapshot` and `_snapshotCache` removed
- [x] `databaseId` on `WorkspaceState`, optional on `Tab` (migration compat)
- [x] Focus breadcrumb shows "(root)" above profile, profile label at profile level
- [x] Workspace nodes render as rectangles on canvas
- [x] Home workspace dot visible at profile root level
- [x] Connected graphs dropdown removed
- [x] Persona dropdown removed
- [x] Workflow dropdown removed
- [x] Node shape on ForceNode interface (not external Set)
- [x] Edge clipping works correctly for rect-shaped collapsed nodes
- [x] Local database IDs derived from profile URL path (human-readable dump keys)
- [x] Delete profile works (non-default profiles only)
- [x] Node kind reverts to leaf when children removed
- [x] `deno task ci` passes after all changes (358 tests)
