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
3. Put navigation state (profile, workspace, focus, selection) in the URL.

## Approach

### Phase 1: Profile switching fix (done)

- [x] Extract `loadProfileState()` from `loadStateAsync()` in `workspace.ts`
- [x] Update `selectProfile()` in `client.tsx` to call `loadProfileState()`
- [x] CI passes

### Phase 2: Derive tabs from tree (done)

- [x] Remove `tabs`/`activeTabId` from `WorkspaceState`, add `activeWorkspaceId`/`panels`
- [x] Update helpers: `getActiveTab` (computed), `withPanel` (drop tabId), `getWorkspaceRootId`
- [x] Update `freshProfileState`/`loadProfileState`/`loadState`/`loadStateAsync`
- [x] Tab bar: derive from profile root's children
- [x] Simplify tab operations: `addTab`, `activateTab`, `closeTab`, `finishRename`
- [x] Update all `withPanel` call sites (tree-panel, constraints-panel, code-panel, inspector)
- [x] Canvas: replace fake-tab with fake-panel pattern
- [x] Persistence: update `UiState`, `syncUiState`, `loadWorkspaceUi` (+ migration)
- [x] Tests and stories updated
- [x] Fix reload bugs: `validateFocusForWorkspace()`, derive `activeDatabaseId` from profile

### Phase 3: URL-based navigation state (done)

- [x] New `url-state.ts` module: `parseHash`, `serializeHash`, `readUrlState`, `writeUrlState`
- [x] Apply URL state on load in `client.tsx` (override profile/workspace from hash)
- [x] Push URL on state changes: `pushState` for profile/workspace, `replaceState` for focus/selection
- [x] Handle `hashchange` for back/forward button navigation
- [x] Remove `activeProfileId`/`activeWorkspaceId` from `UiState` persistence
- [x] 17 new tests for URL parsing/serialization
- [x] `NO_COLOR=1 deno task ci` passes (375 tests)

### Design decisions

- **Hash-based URL routing** — `#/{profileId}/{workspaceId}/{focusId?}/{selectionType:selectionId?}`
- **Panels reset on workspace switch** — simplest model, avoids sync complexity.
- **Tab names derive from workspace node labels** — no separate `tab.name` field.
- **Full UUIDs in URL** — simplest approach, no prefix-matching needed.
- **`pushState` for profile/workspace, `replaceState` for focus/selection** — back button navigates
  between workspaces but doesn't replay every click.
- **No navigation state in `_ui`** — URL is sole source of truth; no-hash loads pick first profile.

## Open Questions

- ~~Should we save/restore per-profile UI state separately?~~ Resolved: tabs are derived from
  the tree, which is per-profile. Navigation state is in the URL.

## Verification

- [x] `NO_COLOR=1 deno task ci` passes (375 tests)
- [x] Manual: URL updates when switching profiles
- [x] Manual: URL updates when switching workspaces
- [x] Manual: URL updates when changing focus / selection
- [x] Manual: back button navigates between workspaces
- [x] Manual: page refresh preserves profile + workspace + focus from URL
- [x] Manual: loading with no hash picks first profile + first workspace
- [x] Manual: tab bar shows workspace node labels
- [x] Manual: rename workspace via tab bar → node label updates
