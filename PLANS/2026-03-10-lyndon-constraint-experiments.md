# Constraint Experiments

**Branch:** lyndon/constraint-experiments
**Date:** 2026-03-10

## Context

The constraint system is designed in DESIGN.md §5 but nothing is wired up yet. This branch
introduces `Constraint` as a first-class entity in the workspace (alongside Node and Edge),
a Constraints View panel, constraint inspection, entity ↔ constraint attachment, canvas
highlighting, and a live validation pipeline. No constraints are attached by default — the UI
exists to apply them manually; stories demonstrate the full flow.

### TODO / Integrate into this plan

* [x] "Applied to" should be a separate list of applications, not included in the constraint itself. Remember we want to be able to use this stuff in a CRDT fashion
* [x] Constraint interface should also have a "applies-to" or "relevance" (you think of a name) field that is an array of objects like {type: "entity-class", "class": "node"} - to inform the UI, etc. of what constraints are applicable - in future, we may use meta-constraints, etc. to have this be very specific - i.e. only apply shampoo-preference constraint to entities with hairy constraint. But let's keep it simple for now.
* [x] canvasSelectedNodeId: null, canvasSelectedEdgeId: null, canvasSelectedConstraintId: null, - should not be independent like this - there should just be a 'selected' field - that way it's impossible to accidentially introduce a multiselection bug
* [ ] Should consider having selection actually keep a reference to the selected object instead of just its id. This seems like it would save a lot of loopup operations in workspace state

### To incorporate back into design document

* Consider using surrealdb for graph backend - Investigate other options too, including building it myself
* Consider if there's a way to have templating/interface/inheritance type capabilities without having to build them explicitly - Perhaps we can achieve this with meta application of constraints - e.g. Apply a constraint to a whole subgraph that all nodes need to have a particular constraint applied, and prompting to auto-adopt since it's a constructive constraint... something? Just thinking out loud here.
* How do "libraries" avoid breaking the sibling rule? Maybe a notion of a "reference"? Don't want to get bogged down in pointer logic, but maybe something like this could be useful for various purposes like "editing a template", "including a sibling reference to a non-sibling node", etc.

## Goal

- `Constraint` as a workspace entity with id, label, uri, type, data, version, appliedTo
- Constraints View panel (flat list + inspector), beside Tree View
- Constraint inspector with Applied To section and JSON data field
- Entity inspectors (Node, Edge) get a "Constraints" section (attach/detach)
- Canvas highlights entities belonging to the selected constraint
- Live validation: JSON Schema constraints applied to attached entities produce canvas + inspector diagnostics

## Approach

### Step 1 — Data model (`src/ui/workspace.ts`)

- [ ] Add `Constraint { id, label, uri?, type: "json-schema", data: Record<string, unknown>, version, appliedTo: string[] }` interface
- [ ] Add `constraints: Constraint[]` to `WorkspaceState`
- [ ] Extend `Panel.type` to `"tree" | "constraints"`
- [ ] Add `selectedConstraintId: string | null` to `Panel`
- [ ] Add `canvasSelectedConstraintId: string | null` to `WorkspaceState`
- [ ] Add `defaultConstraintsPanel()` helper
- [ ] Add `withConstraintMutation` helper

### Step 2 — Diagnostic types (`src/graph/diagnostics.ts`)

- [ ] `Diagnostic { code, severity: "error"|"warning"|"info", message, entityId }`
- [ ] `DiagnosticMap = Record<string, Diagnostic[]>`

### Step 3 — Constraint evaluation (`src/graph/validate_workspace.ts`)

- [ ] `evaluateConstraint(constraint, entity): Diagnostic[]` — for `type: "json-schema"`, runs `@cfworker/json-schema` against entity properties
- [ ] `validateWorkspace(ws): DiagnosticMap` — iterates constraints with `appliedTo`, runs evaluator, merges by entityId
- [ ] `findEntity(ws, entityId)` — looks up node or edge

### Step 4 — Built-in test constraints (`src/graph/builtin_constraints.ts`)

- [ ] `LABEL_REQUIRED_CONSTRAINT` — JSON Schema requiring `label` is non-empty string
- [ ] `MAX_GROUP_SIZE_CONSTRAINT` — JSON Schema limiting children count
- [ ] Not attached to anything; available for stories and manual use

### Step 5 — Constraints View panel (`src/ui/components/constraints-panel.tsx`)

- [ ] `ConstraintsPanel` — header with "+" add + "×" close, flat list with "−" per item
- [ ] Selecting item sets `panel.selectedConstraintId` + `ws.canvasSelectedConstraintId`
- [ ] `ConstraintInspector` — label, type dropdown, uri, version, hash
- [ ] "Applied To" section — entity list + dropdown to add + "−" to remove
- [ ] "Data" section — JSON textarea
- [ ] Delete button in inspector

### Step 6 — Wire up `client.tsx`

- [ ] `diagnostics = useMemo(() => validateWorkspace(ws), [ws.constraints, ws.treeNodes, ws.edges])`
- [ ] "+ Constraints View" button in WorkspaceControls
- [ ] Dispatch `<ConstraintsPanel>` in WorkspaceArea for `panel.type === "constraints"`
- [ ] Pass `diagnostics` and `highlightEntityIds` to `<Canvas>`

### Step 7 — Canvas indicators (`src/ui/components/canvas.tsx`)

- [ ] `diagnostics?: DiagnosticMap` + `highlightEntityIds?: Set<string>` props
- [ ] Error: stroke `#c04040`, fill `#2a1a1a`; warning: stroke `#c08020`; highlight: stroke `#50c070`
- [ ] Small badge (r=5) top-right when error or warning

### Step 8 — Entity inspector "Constraints" section (`src/ui/components/inspector.tsx`)

- [ ] `ConstraintsAttachedSection` shared widget
- [ ] Add to `NodeInspector` (below edges) and `EdgeInspector` (below data)

### Step 9 — Story

- [ ] `Canvas/Diagnostics` story with pre-attached constraints demonstrating error + warning badges

## Open Questions

None at this stage.

## Verification

- [ ] `NO_COLOR=1 deno task fmt && deno task lint && deno task check && deno task check-ui && deno task test` all pass
- [ ] "+ Constraints View" opens a panel; can add/delete constraints
- [ ] Constraint inspector fields edit correctly
- [ ] "Applied To" attach/detach works from both constraint inspector and entity inspector
- [ ] Selecting a constraint highlights its entities on canvas
- [ ] `Canvas/Diagnostics` story shows error and warning indicators
