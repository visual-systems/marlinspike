// Built-in test constraints.
// These are predefined constraint definitions available for use in stories and manual experimentation.
// None are attached to any entities by default.

import type { Constraint } from "../ui/workspace.ts";

export const LABEL_REQUIRED_CONSTRAINT: Constraint = {
  id: "builtin/label-required",
  label: "Label Required",
  uri: "spike://builtin/constraints/label-required",
  type: "label-required",
  targets: [
    { type: "entity", class: "node" },
    { type: "entity", class: "edge" },
  ],
  data: {},
  version: 1,
};

export const MAX_GROUP_SIZE_CONSTRAINT: Constraint = {
  id: "builtin/max-group-size",
  label: "Max Group Size (5)",
  uri: "spike://builtin/constraints/max-group-size",
  type: "max-children",
  targets: [{ type: "entity", class: "node" }],
  data: { max: 5 },
  version: 1,
};
