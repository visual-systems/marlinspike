# Fix Broken Stories

**Branch:** lyndon/fix-broken-stories
**Date:** 2026-03-09

## Context

Several stories rendered nothing (TreePanel all, Inspector all, Dropdown/WithEditRow) and Canvas stories did not update content when navigation changed. Root cause: `StoryCanvas` in `main.tsx` called `story.fn()` as a plain function, running hooks inside the wrong component context (StoryCanvas's render, not the story's own instance). Stories with no hooks worked fine; all hook-using stories failed silently. Additionally, no `key` was used on the story renderer, so switching stories didn't force remount — Canvas stories "stuck" on the first one rendered.

## Goal

All stories render correctly and each story gets a fresh component instance on navigation.

## Approach

- [x] Fix `StoryCanvas` in `main.tsx` — render story as `<Story />` JSX component instead of `story.fn()` plain call, giving each story its own component boundary and hook context
- [x] Add `key={group/story}` to `<StoryCanvas>` in `App` — forces full remount on navigation
- [x] Fix `Canvas/Default` story — set `canvasExpandedNodes = []` so Default/WithExpanded/DeepExpanded are visually distinct

## Open Questions

None — complete.

## Verification

- [x] `deno task fmt`, `deno task lint`, `deno task check`, `deno task test` all pass
- [x] TreePanel/{Default, WithNodeSelected, WithEdgeSelected, DeepTree} — all render
- [x] Inspector/{NodeLeaf, NodeComposite, NodeWithEdges, EdgeBasic, EdgeUnlabelled} — all render
- [x] Dropdown/WithEditRow — renders correctly
- [x] Canvas stories — Default (collapsed), WithExpanded, DeepExpanded show distinct states
- [x] Switching between stories resets state
