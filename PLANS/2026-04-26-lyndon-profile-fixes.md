# Profile Fixes

**Branch:** lyndon/profile-fixes
**Date:** 2026-04-26
**Branch Preview:** <!-- replace me -->

## Context

Profile switching doesn't restore previously saved state, and the tab model has fundamental sync
bugs: ghost "Untitled" entries, lost graph data, double-wrapped profile roots, and stale tab
references. The root cause is that `tabs: Tab[]` is stored separately from the tree — `rootNodeId`
can point to nonexistent nodes, tabs persist in the shared `_ui` database leaking across profiles,
and tree restructuring doesn't update tabs.

## Goal

1. Fix profile switching to correctly load saved state from the target profile's database.
2. Simplify the tab model: derive tabs from the profile root's children instead of storing them.

## Approach

### Phase 1: Profile switching fix (done)

- [x] Extract `loadProfileState()` from `loadStateAsync()` in `workspace.ts`
- [x] Update `selectProfile()` in `client.tsx` to call `loadProfileState()`
- [x] CI passes

### Phase 2: Derive tabs from tree (in progress)

- [x] Remove `tabs`/`activeTabId` from `WorkspaceState`, add `activeWorkspaceId`/`panels`
- [x] Update helpers: `getActiveTab` (computed), `withPanel` (drop tabId), `getWorkspaceRootId`
- [x] Update `freshProfileState`/`loadProfileState`/`loadState`/`loadStateAsync`
- [x] Tab bar: derive from profile root's children
- [x] Simplify tab operations: `addTab`, `activateTab`, `closeTab`, `finishRename`
- [x] Update all `withPanel` call sites (tree-panel, constraints-panel, code-panel, inspector)
- [x] Canvas: replace fake-tab with fake-panel pattern
- [x] Persistence: update `UiState`, `syncUiState`, `loadWorkspaceUi` (+ migration)
- [x] Tests and stories updated
- [x] `NO_COLOR=1 deno task ci` passes (358 tests)

### Design decisions

- **Panels reset on workspace switch** — simplest model, avoids sync complexity. Per-workspace
  panel persistence can be added later if needed.
- **Tab names derive from workspace node labels** — no separate `tab.name` field.
- **Migration**: old `tabs`/`activeTabId` in `_ui` database → derive `activeWorkspaceId` from
  active tab's `rootNodeId`, use that tab's `panels`.

## Open Questions

- ~~Should we save/restore per-profile UI state separately?~~ Resolved: tabs are derived from
  the tree, which is per-profile. The `_ui` database only stores `activeWorkspaceId` and `panels`.

## Verification

- [ ] `NO_COLOR=1 deno task ci` passes
- [ ] Manual: create workspace with nodes, switch workspaces, switch back — graph data preserved
- [ ] Manual: fresh profile gets empty workspace on first switch
- [ ] Manual: profile switching loads correct graph data
- [ ] Manual: tab bar shows workspace node labels
- [ ] Manual: rename workspace via tab bar → node label updates
