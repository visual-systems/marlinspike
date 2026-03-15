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
* [ ] JSON Schema validator: native constraints used for now (open-set registry). Revisit when backend validation API is available.

### To incorporate back into design document

* Consider using surrealdb for graph backend - Investigate other options too, including building it myself
* Consider if there's a way to have templating/interface/inheritance type capabilities without having to build them explicitly - Perhaps we can achieve this with meta application of constraints - e.g. Apply a constraint to a whole subgraph that all nodes need to have a particular constraint applied, and prompting to auto-adopt since it's a constructive constraint... something? Just thinking out loud here.
* How do "libraries" avoid breaking the sibling rule? Maybe a notion of a "reference"? Don't want to get bogged down in pointer logic, but maybe something like this could be useful for various purposes like "editing a template", "including a sibling reference to a non-sibling node", etc.
* Ad-hoc fix: selecting a node with no label in the inspector doesn't have a place to click the node label to change it.

## Goal

- `Constraint` as a workspace entity with id, label, uri, type, data, version, targets
- `ConstraintApplication` as a separate join record (CRDT-friendly)
- Constraints View panel (flat list + inspector), beside Tree View
- Constraint inspector with Applied To section and schema-driven data fields
- Entity inspectors (Node, Edge) get a "Constraints" section (attach/detach + clickable navigation)
- Canvas highlights entities belonging to the selected constraint
- Live validation: native constraint registry produces canvas + inspector diagnostics
- Bidirectional navigation: entity inspector ↔ constraint inspector in canvas sidebar

## Approach

### Step 1 — Data model (`src/ui/workspace.ts`)

- [x] Add `Constraint { id, label, uri?, type: string, data, version, targets }` interface
- [x] Add `ConstraintApplication { id, constraintId, entityId, version }` interface
- [x] Add `constraints: Constraint[]` and `constraintApplications: ConstraintApplication[]` to `WorkspaceState`
- [x] Extend `Panel.type` to `"tree" | "constraints"`
- [x] Unify canvas selection as `canvasSelected: { type, id } | null` (replaces three separate fields)
- [x] Add `defaultConstraintsPanel()` helper
- [x] Add `withConstraintMutation` / `withApplicationMutation` helpers
- [x] Extend `subgraphJson` to include constraints and constraintApplications filtered to subtree

### Step 2 — Diagnostic types (`src/graph/diagnostics.ts`)

- [x] `Diagnostic { code, severity: "error"|"warning"|"info", message, entityId }`
- [x] `DiagnosticMap = Record<string, Diagnostic[]>`

### Step 3 — Constraint evaluation (`src/graph/validate_workspace.ts`)

- [x] Open-set native constraint registry (`Record<string, ConstraintTypeDefinition>`)
- [x] Built-in evaluators: `label-required`, `max-children`
- [x] `DataPropertySchema` / `ConstraintDataSchema` for schema-driven form UI
- [x] `validateWorkspace(ws, apps): DiagnosticMap`
- [x] `registeredConstraintTypes()` and `getConstraintDataSchema(type)` for UI

### Step 4 — Built-in test constraints (`src/graph/builtin_constraints.ts`)

- [x] `LABEL_REQUIRED_CONSTRAINT` — checks entity label is non-empty
- [x] `MAX_GROUP_SIZE_CONSTRAINT` — checks children.length ≤ limit
- [x] Not attached by default; available for stories and manual use

### Step 5 — Constraints View panel (`src/ui/components/constraints-panel.tsx`)

- [x] `ConstraintsPanel` — header with "+" add + "×" close, flat list with diagnostic count badge
- [x] Selecting item sets `panel.selected` + `ws.canvasSelected`
- [x] `ConstraintInspector` — label (editable), type dropdown, uri, version
- [x] "Applied To" section — entity list (clickable for navigation) + dropdown to add + "×" to remove; error highlighting
- [x] Schema-driven "Data" section via `ConstraintDataFields`
- [x] Delete button removes constraint and all its applications
- [x] `ConstraintsAttachedSection` shared widget (used in entity inspectors)

### Step 6 — Wire up `client.tsx`

- [x] `diagnostics = useMemo(() => validateWorkspace(ws, ws.constraintApplications), [...])`
- [x] `highlightEntityIds` derived from `canvasSelected` constraint applications
- [x] "+ Constraints View" button in WorkspaceControls
- [x] Dispatch `<ConstraintsPanel>` in WorkspaceArea for `panel.type === "constraints"`
- [x] Pass `diagnostics` and `highlightEntityIds` to `<Canvas>`

### Step 7 — Canvas indicators (`src/ui/components/canvas.tsx`)

- [x] `diagnostics?: DiagnosticMap` + `highlightEntityIds?: Set<string>` props
- [x] Error/warning fill and stroke on collapsed circles (error persists even when selected)
- [x] Error/warning fill, stroke, and badge on expanded group rects
- [x] Highlight stroke (`#50c070`) for entities belonging to selected constraint
- [x] `CanvasInspector` renders `ConstraintInspector` inline when `canvasSelected.type === "constraint"`
- [x] Bidirectional navigation: `onInspectConstraint` / `onInspectEntity` callbacks bypass `canvasUpdate`

### Step 8 — Entity inspector "Constraints" section (`src/ui/components/inspector.tsx`)

- [x] `ConstraintsAttachedSection` in `NodeInspector` (below edges) and `EdgeInspector` (below data)
- [x] Constraint labels clickable — navigates to constraint inspector
- [x] Export button includes constraints and constraintApplications

### Step 9 — Stories

- [x] `Canvas/Diagnostics` — error badge (label-required) + warning badge (max-group-size)
- [x] `Canvas/ConstraintInspection` — pre-selected node; tests constraint ↔ entity navigation
- [x] `ConstraintsPanel/Default`, `LabelRequiredViolation`, `MaxChildrenViolation`, `MultipleConstraints`

## Open Questions

- JSON Schema validator: deferred. Native constraint registry used for now. Backend validation API is a future option.
- Selection by reference (not just id): deferred to a future refactor.

## Verification

- [ ] `NO_COLOR=1 deno task fmt && deno task lint && deno task check && deno task check-ui && deno task test` all pass
- [x] "+ Constraints View" opens a panel; can add/delete constraints
- [x] Constraint inspector fields edit correctly
- [x] "Applied To" attach/detach works from both constraint inspector and entity inspector
- [x] Clicking constraint label in entity inspector navigates to constraint inspector in canvas sidebar
- [x] Clicking entity in constraint inspector "Applied To" navigates back to entity inspector
- [x] Selecting a constraint highlights its entities on canvas
- [x] Failed constraint entities show red stroke/fill even when selected
- [x] `Canvas/Diagnostics` story shows error and warning indicators
- [x] Export (copy as JSON) includes constraints and constraintApplications
