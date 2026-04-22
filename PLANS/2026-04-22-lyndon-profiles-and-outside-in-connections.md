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
story. This is a design-only branch — no implementation code changes.

## Approach

- [x] Add Outside-In Connection Principle subsection to DESIGN.md Persistence Layer
- [x] Add Profiles subsection with `indxdb://` URL convention for local profiles
- [x] Add Profile UX detail (dropdown layout, add/edit form, default protection, switching)
- [x] Add Workspace Nodes as Tabs subsection
- [x] Add Workspace and Storage-Location Constraints subsection (split `workspace.connections`)
- [x] Update Future Direction to reference profiles as unit of cross-device sync
- [x] Add Phase 5b (Profiles and Storage) to Implementation Roadmap
- [x] Create `examples/cardano-cubic-roots/README.md`
- [x] Create `examples/cardano-cubic-roots/cubic-roots.clj`
- [x] Update `examples/README.md` table with new example
- [x] Add CardanoCubicRoots story to `src/ui/stories/examples.stories.tsx`
- [x] `deno task ci` passes

## Open Questions

- Should focusing on root show all workspace nodes as a "workspace browser" view?
- Should profiles support scoped personas?
- `indxdb://` key naming convention — is the key the same as the namespace, or should they be
  independent? (e.g. `indxdb://marlinspike` → key "marlinspike", namespace "marlinspike")

## Verification

- [x] DESIGN.md has four new subsections in Persistence Layer
- [x] Outside-in principle stated as explicit axiom
- [x] Profiles described as IndexedDB-stored with `indxdb://` URL convention for local
- [x] `workspace.connections` split into `workspace` + `storage-location` documented
- [x] Connection inheritance chain documented (profile → workspace → children)
- [x] Cardano example exists with README and .clj
- [x] CardanoCubicRoots story added
- [x] examples/README.md table updated
- [x] `deno task ci` passes (358 tests)
