/// <reference lib="dom" />
// Constraint evaluation against workspace state.
// Each Constraint with appliedTo entries is evaluated against those entities;
// results are merged into a DiagnosticMap keyed by entity ID.

import { type Schema, Validator } from "@cfworker/json-schema";
import type { Diagnostic, DiagnosticMap } from "./diagnostics.ts";
import {
  type Constraint,
  type ConstraintApplication,
  type Edge,
  findNode,
  type TreeNode,
  type WorkspaceState,
} from "../ui/workspace.ts";

type Entity = TreeNode | Edge;

function findEntity(ws: WorkspaceState, entityId: string): Entity | undefined {
  return findNode(ws.treeNodes, entityId) ?? ws.edges.find((e) => e.id === entityId);
}

function evaluateConstraint(constraint: Constraint, entity: Entity): Diagnostic[] {
  if (constraint.type === "json-schema") {
    const validator = new Validator(constraint.data as Schema);
    const result = validator.validate(entity);
    if (result.valid) return [];
    return result.errors.map((e) => ({
      code: constraint.id,
      severity: "error" as const,
      message: e.error,
      entityId: entity.id,
    }));
  }
  return [];
}

export function validateWorkspace(
  ws: WorkspaceState,
  apps: ConstraintApplication[],
): DiagnosticMap {
  const map: DiagnosticMap = {};
  for (const app of apps) {
    const constraint = ws.constraints.find((c) => c.id === app.constraintId);
    if (!constraint) continue;
    const entity = findEntity(ws, app.entityId);
    if (!entity) continue;
    const diags = evaluateConstraint(constraint, entity);
    if (diags.length > 0) {
      map[app.entityId] = [...(map[app.entityId] ?? []), ...diags];
    }
  }
  return map;
}
