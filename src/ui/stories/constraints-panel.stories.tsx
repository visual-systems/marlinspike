/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { ConstraintsPanel } from "../components/constraints-panel.tsx";
import { validateWorkspace } from "../../graph/validate_workspace.ts";
import {
  LABEL_REQUIRED_CONSTRAINT,
  MAX_GROUP_SIZE_CONSTRAINT,
} from "../../graph/builtin_constraints.ts";
import {
  defaultConstraintsPanel,
  defaultState,
  makeNode,
  type Updater,
  type WorkspaceState,
} from "../workspace.ts";

export const meta = { title: "Constraints Panel" };

function StoryWrapper({ initial }: { initial: WorkspaceState }) {
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const update: Updater = (fn) => setWs((prev) => fn(prev));
  const tab = ws.tabs[0];
  const panel = ws.tabs[0].panels[0];
  const diagnostics = validateWorkspace(ws, ws.constraintApplications);

  return (
    <div style="display:inline-flex; background:#14142a; border:1px solid #2a2a4a; height:600px;">
      <ConstraintsPanel
        panel={panel}
        tab={tab}
        ws={ws}
        update={update}
        diagnostics={diagnostics}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Empty panel — no constraints defined yet. */
export function Default() {
  const ws = defaultState();
  ws.tabs[0].panels[0] = defaultConstraintsPanel();
  return <StoryWrapper initial={ws} />;
}

/** One label-required constraint applied to a node that has no label → error. */
export function LabelRequiredViolation() {
  const ws = defaultState();
  ws.tabs[0].panels[0] = defaultConstraintsPanel();
  ws.treeNodes = [makeNode("empty-label-node", "", "leaf", [])];
  ws.constraints = [{ ...LABEL_REQUIRED_CONSTRAINT }];
  ws.constraintApplications = [
    {
      id: "app-1",
      constraintId: LABEL_REQUIRED_CONSTRAINT.id,
      entityId: "empty-label-node",
      version: 1,
    },
  ];
  ws.tabs[0].panels[0].selected = {
    type: "constraint",
    id: LABEL_REQUIRED_CONSTRAINT.id,
  };
  return <StoryWrapper initial={ws} />;
}

/** max-children constraint with limit=3 applied to a group that has 5 children → warning. */
export function MaxChildrenViolation() {
  const ws = defaultState();
  ws.tabs[0].panels[0] = defaultConstraintsPanel();
  ws.treeNodes = [
    makeNode("big-group", "services", "composite", [
      makeNode("c1", "auth", "leaf", []),
      makeNode("c2", "billing", "leaf", []),
      makeNode("c3", "gateway", "leaf", []),
      makeNode("c4", "storage", "leaf", []),
      makeNode("c5", "logging", "leaf", []),
    ]),
  ];
  const constraint = { ...MAX_GROUP_SIZE_CONSTRAINT, data: { limit: 3 } };
  ws.constraints = [constraint];
  ws.constraintApplications = [
    { id: "app-1", constraintId: constraint.id, entityId: "big-group", version: 1 },
  ];
  ws.tabs[0].panels[0].selected = { type: "constraint", id: constraint.id };
  return <StoryWrapper initial={ws} />;
}

/** Multiple constraints — one passing, one failing — shows mixed state in the list. */
export function MultipleConstraints() {
  const ws = defaultState();
  ws.tabs[0].panels[0] = defaultConstraintsPanel();
  ws.treeNodes = [
    makeNode("named-node", "auth-service", "leaf", []),
    makeNode("unnamed-node", "", "leaf", []),
    makeNode("big-group", "platform", "composite", [
      makeNode("c1", "a", "leaf", []),
      makeNode("c2", "b", "leaf", []),
      makeNode("c3", "c", "leaf", []),
      makeNode("c4", "d", "leaf", []),
    ]),
  ];
  const maxConstraint = { ...MAX_GROUP_SIZE_CONSTRAINT, data: { limit: 3 } };
  ws.constraints = [LABEL_REQUIRED_CONSTRAINT, maxConstraint];
  ws.constraintApplications = [
    // label-required: applied to named-node (passes) and unnamed-node (fails)
    {
      id: "app-1",
      constraintId: LABEL_REQUIRED_CONSTRAINT.id,
      entityId: "named-node",
      version: 1,
    },
    {
      id: "app-2",
      constraintId: LABEL_REQUIRED_CONSTRAINT.id,
      entityId: "unnamed-node",
      version: 1,
    },
    // max-children: applied to big-group which has 4 children, limit 3 → fails
    { id: "app-3", constraintId: maxConstraint.id, entityId: "big-group", version: 1 },
  ];
  return <StoryWrapper initial={ws} />;
}
