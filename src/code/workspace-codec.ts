/**
 * Focus-aware bridge between WorkspaceState and Spike-Clojure source text.
 *
 * The code view respects the user's current focus:
 *   - At the virtual root (focusId === null) the workspace root is visible on
 *     the canvas, so the emitter includes `(def Workspace [...])` as the outer
 *     form.
 *   - Anywhere else (including the default view, focused on the workspace
 *     root) the wrapper is implicit — the emitter only shows the root's
 *     children.
 *
 * On parse we always re-wrap in the existing workspace root node so the tab's
 * `rootNodeId` and any root-level constraints stay stable across round-trips.
 */

import type { Edge, TreeNode, WorkspaceState } from "../ui/workspace.ts";
import { getWorkspaceRoot, getWorkspaceRootId, makeRootNode } from "../ui/workspace.ts";
import { graphToSpike, spikeToGraph } from "./spike-clojure.ts";

/**
 * Emit the workspace as Spike-Clojure, respecting the current focus.
 *
 *   focusId === null:  virtual-root view — emits the full tree including the
 *                      workspace root, e.g. `(def Workspace [acme/backend])`
 *                      plus child definitions.
 *   focusId === anything else:  emits only the workspace root's children. The
 *                      wrapper is implicit — users working inside the
 *                      workspace don't see their containing node.
 */
export function emitWorkspace(ws: WorkspaceState): string {
  if (ws.focusId == null) {
    return graphToSpike(ws.treeNodes, ws.edges);
  }
  const root = getWorkspaceRoot(ws);
  return graphToSpike(root?.children ?? [], ws.edges);
}

/**
 * Parse user-edited code back into a workspace tree, re-wrapping in the
 * existing workspace root so `rootNodeId` stays stable.
 *
 * If the user included the workspace wrapper explicitly (virtual-root view),
 * we detect it by label match and unwrap before re-wrapping — preserving the
 * original UUID rather than adopting the parser's label-derived id.
 */
export function parseWorkspace(
  code: string,
  ws: WorkspaceState,
): { treeNodes: TreeNode[]; edges: Edge[]; errors: string[] } {
  const { treeNodes: parsed, edges, errors } = spikeToGraph(code);
  if (errors.length > 0) return { treeNodes: [], edges, errors };

  const rootId = getWorkspaceRootId(ws);
  const rootLabel = getWorkspaceRoot(ws)?.label ?? "Workspace";
  const wsFromParse = parsed.find((n) => n.label === rootLabel && n.kind === "composite");
  const children = wsFromParse ? wsFromParse.children : parsed;
  return { treeNodes: [makeRootNode(rootId, children)], edges, errors: [] };
}
