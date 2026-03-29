# Data View Bug

**Branch:** lyndon/data-view-bug
**Date:** 2026-03-29

## Context

The "code-view" button (⊞) in the canvas inspector (when clicking a node/edge on the canvas) does nothing. The same button in the tree view inspector works correctly — it opens a new code panel tab.

## Goal

When the code-view button is clicked from the canvas inspector, a new code panel should open in the active tab.

## Approach

- [x] Fix `canvasUpdate` in `src/ui/components/canvas.tsx` (~line 468) to extract any newly created panels from the fake tab and append them to the active tab (`s.activeTabId`)
- [x] Run `NO_COLOR=1 deno task ci` and fix any failures

## Root Cause

`canvasUpdate` injects a fake tab, lets the inspector's update function run (which adds the new code panel to the fake tab), then **discards the entire fake tab** including the new panel. The fix: extract panels added to the fake tab (other than the sentinel `__canvas__` panel) and append them to the active real tab.

## Open Questions

None.

## Deferred

- Consider refactoring `CanvasInspector` to eliminate the fake tab shim. The shim exists so `NodeInspector`/`EdgeInspector` can be reused as-is in the canvas context (which has no real tab), but it's a leaky abstraction — as this bug showed, any new inspector action that mutates tabs requires the shim to be updated. A cleaner approach would be to decouple inspector components from tab/panel state and pass callbacks instead.

## Verification

- [x] Click a node/edge on the canvas
- [x] Click the ⊞ code-view button in the canvas inspector
- [x] A new code panel opens in the active tab showing the entity's JSON
- [x] Tree view inspector code-view button still works
- [x] `NO_COLOR=1 deno task ci` passes
