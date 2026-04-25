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
- Profile name is used as the root label in the focus breadcrumb (e.g. "Local" not "(root)")
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
- `WORKSPACE_CONNECTIONS_CONSTRAINT` now has `data: { rendering: { shape: "rect" } }`.
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

- [x] Add `rendering: { shape: "rect" }` to `WORKSPACE_CONNECTIONS_CONSTRAINT` data
- [x] Canvas reads `data.rendering.shape` from constraint applications
- [x] Collapsed nodes render `<rect>` when shape is "rect", `<circle>` otherwise

### Phase 5: Profile data model and storage (complete)

- [x] Define `Profile` interface in `workspace.ts`
- [x] Profiles stored in UI state (part of `WorkspaceState`, persisted via SurrealDB `_ui` database)
- [x] Implement default "Local" profile (`indxdb://marlinspike`)
- [x] Add `profiles` and `activeProfileId` to workspace/UI state
- [x] Load/save profiles on startup (via existing sync mechanism)

### Phase 6: Profile UI (partial)

- [x] Add profile dropdown to workspace bar (left of tabs)
- [ ] Profile switching: flush current DB, connect to new profile's target, load workspaces
- [ ] Add/edit profile form (name, URL, collapsible advanced section)
- [ ] Default profile protection (cannot delete)

### Phase 7: Workspace-as-tabs unification (partial)

- [x] Add `homeWorkspaceId` to `Tab` interface
- [ ] Tab labels derive from workspace node labels
- [ ] Creating a new tab creates a workspace node under the active profile
- [ ] Closing a tab hides the workspace from the session (does not delete)

Note: Full workspace-as-tabs unification (single graph, no separate databases per tab) is a deeper
architectural change deferred to a follow-up branch.

### Phase 8: Focus navigation updates (complete)

- [x] Profile name as root label in focus breadcrumb (replace "(root)")
- [x] Home workspace indicator (green dot) on workspace nodes at root level
- [x] Home hint in focus breadcrumb when at root with nothing selected
- [x] Remove connected graphs dropdown from controls bar

### Phase 9: Remove persona dropdown (complete)

- [x] Remove persona dropdown from workspace bar
- [x] Keep `personas` / `activePersona` in `WorkspaceState` (state preserved, UI hidden)

### Phase 10: Edge clipping for rect nodes (complete)

- [x] Update `surfacePoint` to use AABB clipping for rect-shaped collapsed nodes
- [x] Update arc exit point calculation for rect nodes (both `arcClipRect` and straight edges)

### Ongoing

- [ ] Update DESIGN.md to reflect implementation decisions as they land
- [x] `deno task ci` passes after each phase (358 tests)

## Open Questions

- Should profiles support scoped personas? (deferred — personas removed from UI for now)
- `indxdb://` key naming convention — is the key the same as the namespace, or should they be
  independent? (e.g. `indxdb://marlinspike` → key "marlinspike", namespace "marlinspike")
- Should closing a tab delete the workspace node or just hide it from the session?
- What constraints beyond `rendering.shape` might influence node appearance in future?

## Verification

### Design (complete)

- [x] DESIGN.md has four new subsections in Persistence Layer
- [x] Outside-in principle stated as explicit axiom
- [x] Profiles described as IndexedDB-stored with `indxdb://` URL convention for local
- [x] `workspace.connections` split into `workspace` + `storage-location` documented
- [x] Connection inheritance chain documented (profile → workspace → children)
- [x] Cardano example exists with README and .clj
- [x] CardanoCubicRoots story added
- [x] examples/README.md table updated
- [x] `deno task ci` passes (358 tests)

### Implementation

- [x] Profile data persists in IndexedDB across sessions (via UI state sync)
- [x] Profile dropdown shows all profiles in workspace bar
- [x] Default "Local" profile exists on first launch
- [ ] Tab labels reflect workspace node labels (deferred — needs workspace-as-tabs)
- [x] Focus breadcrumb shows profile name as root
- [x] Workspace nodes render as rectangles on canvas
- [x] Home workspace dot visible at profile root level
- [x] Connected graphs dropdown removed
- [x] Persona dropdown removed
- [x] Edge clipping works correctly for rect-shaped collapsed nodes
- [x] `deno task ci` passes after all changes (358 tests)
