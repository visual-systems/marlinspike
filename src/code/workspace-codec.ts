/**
 * Focus-aware bridge between WorkspaceState and Spike-Clojure source text.
 *
 * Emit
 * ----
 * The code view respects the user's current focus:
 *   - Virtual root (`focusId === null`): the workspace root itself is on the
 *     canvas, so the emitter includes the `(def ^{:uuid "..."} Workspace …)`
 *     wrapper plus every child definition.
 *   - Workspace focus (default) or deeper focus: emit only the focused
 *     container's children. The container is implicit — users working inside
 *     a node don't see its wrapping form.
 *
 * Apply
 * -----
 * User edits are merged into the existing workspace rather than replacing it
 * wholesale. The merger preserves identity (id) across renames, reorders, and
 * moves by matching:
 *   1. `:uuid` reader metadata against any existing node id (global lookup),
 *   2. label against an existing sibling under the same container (position),
 *   3. otherwise a fresh UUID is generated for genuinely new nodes.
 *
 * Edges are scoped to the focused subtree: edges with both endpoints inside
 * the scope are replaced by the parsed edges (remapped through the id map);
 * edges that cross the scope boundary or live outside it are preserved.
 *
 * Root identity is anchored by `^{:uuid "..."}` metadata on the workspace
 * root's def form. The tab's `rootNodeId` is always preserved — if the user
 * edits the workspace form's label, the UUID stays, and on parse the existing
 * root node is updated in place.
 */

import type { Edge, TreeNode, WorkspaceState } from "../ui/workspace.ts";
import {
  findNode,
  getWorkspaceRoot,
  getWorkspaceRootId,
  makeRootNode,
  updateNodeInTree,
} from "../ui/workspace.ts";
import { graphToSpike, spikeToGraph } from "./spike-clojure.ts";

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

/**
 * Emit the workspace as Spike-Clojure, respecting the current focus.
 *
 *   focusId === null         → virtual-root view; emits the workspace-as-def
 *                              wrapper plus all child definitions.
 *   focusId === root/deeper  → emits only the focused container's children.
 */
export function emitWorkspace(ws: WorkspaceState): string {
  if (ws.focusId == null) {
    return graphToSpike(ws.treeNodes, ws.edges);
  }
  const focused = findNode(ws.treeNodes, ws.focusId);
  return graphToSpike(focused?.children ?? [], ws.edges);
}

// ---------------------------------------------------------------------------
// Apply (merge-based)
// ---------------------------------------------------------------------------

/**
 * Parse user-edited code and merge it into the existing workspace at the
 * current focus level. Returns a new `treeNodes`/`edges` pair ready to be
 * swapped into the workspace state.
 *
 * The merger preserves identities wherever possible — see the module header
 * for the full matching rules.
 */
export function parseWorkspace(
  code: string,
  ws: WorkspaceState,
): { treeNodes: TreeNode[]; edges: Edge[]; errors: string[] } {
  const { treeNodes: parsed, edges: parsedEdges, errors } = spikeToGraph(code);
  if (errors.length > 0) return { treeNodes: ws.treeNodes, edges: ws.edges, errors };

  const rootId = getWorkspaceRootId(ws);
  const rootLabel = getWorkspaceRoot(ws)?.label ?? "Workspace";

  // Determine the existing "container children" the parsed forest will merge
  // into. For virtual-root we merge at the top level; otherwise into whatever
  // composite the user is focused on.
  const containerId: string | null = ws.focusId ?? null;
  const containerChildren: TreeNode[] = containerId == null
    ? ws.treeNodes
    : findNode(ws.treeNodes, containerId)?.children ?? [];

  // Flat uuid index of the ENTIRE workspace — matches work across moves.
  const flatById = flattenById(ws.treeNodes);

  // If the user kept the explicit workspace wrapper in virtual-root view,
  // strip it so the parsed forest represents the workspace *contents*. The
  // wrapper's uuid (if present in meta) has already been read into its id,
  // so we look up by id, then by label as a fallback.
  let parsedForMerge = parsed;
  if (containerId == null) {
    const wsIdx = parsed.findIndex(
      (n) => n.kind === "composite" && (n.id === rootId || n.label === rootLabel),
    );
    if (wsIdx >= 0) {
      const wsNode = parsed[wsIdx];
      // Preserve the workspace node as a root-level entry; hoist its children
      // alongside anything else the user typed at the top level (orphan defs
      // at virtual-root remain siblings of the workspace node).
      const others = parsed.filter((_, i) => i !== wsIdx);
      parsedForMerge = [
        { ...wsNode, id: rootId },
        ...others,
      ];
    }
  }

  const used = new Set<string>();
  const { merged, idMap } = mergeTrees(parsedForMerge, containerChildren, flatById, used);

  // Scope predicate: an id is "in scope" if it was (or is) inside the
  // container's subtree. Edges within this scope are replaced by the parsed
  // edges; edges outside it are preserved.
  const oldScopeIds = flattenIdSet(containerChildren);
  const newScopeIds = flattenIdSet(merged);
  const inScope = (id: string) => oldScopeIds.has(id) || newScopeIds.has(id);

  const mergedEdges = mergeEdges(parsedEdges, ws.edges, idMap, inScope);

  // Reassemble tree depending on focus
  let nextTreeNodes: TreeNode[];
  if (containerId == null) {
    nextTreeNodes = merged;
  } else {
    nextTreeNodes = updateNodeInTree(ws.treeNodes, containerId, (n) => ({
      ...n,
      children: merged,
      version: n.version + 1,
    }));
  }

  // Anchor the workspace root id: whatever happened above, tab.rootNodeId
  // must still refer to a node that exists. If the virtual-root merge
  // produced no root-shaped node at the top level, wrap the result back under
  // the existing root so downstream invariants hold.
  if (!findNode(nextTreeNodes, rootId)) {
    nextTreeNodes = [makeRootNode(rootId, nextTreeNodes, rootLabel)];
  }

  return { treeNodes: nextTreeNodes, edges: mergedEdges, errors: [] };
}

// ---------------------------------------------------------------------------
// Tree merger
// ---------------------------------------------------------------------------

/**
 * Merge a parsed forest into an existing forest at a single level, recursing
 * into children. Returns the merged forest plus a parsed-id → merged-id map.
 *
 * `used` tracks existing ids already claimed by a match so a single existing
 * node can't be picked up by two parsed siblings.
 */
export function mergeTrees(
  parsed: TreeNode[],
  existingSiblings: TreeNode[],
  existingFlat: Map<string, TreeNode>,
  used: Set<string>,
): { merged: TreeNode[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const merged: TreeNode[] = [];

  for (const p of parsed) {
    const match = findMatch(p, existingSiblings, existingFlat, used);
    const mergedId = match?.id ?? generateId(p);
    idMap.set(p.id, mergedId);
    if (match) used.add(match.id);

    const childResult = mergeTrees(p.children, match?.children ?? [], existingFlat, used);
    for (const [k, v] of childResult.idMap) idMap.set(k, v);

    const mergedNode: TreeNode = {
      id: mergedId,
      label: p.label,
      kind: p.kind,
      children: childResult.merged,
      data: { ...(match?.data ?? {}), ...p.data },
      version: (match?.version ?? 0) + 1,
      ...(p.ports ?? match?.ports ? { ports: p.ports ?? match?.ports } : {}),
      ...(match?.uri ? { uri: match.uri } : {}),
    };
    merged.push(mergedNode);
  }

  return { merged, idMap };
}

function findMatch(
  parsed: TreeNode,
  existingSiblings: TreeNode[],
  existingFlat: Map<string, TreeNode>,
  used: Set<string>,
): TreeNode | undefined {
  // 1. Direct id match anywhere in the workspace (covers UUID meta and also
  //    label-based id re-matches). Handles rename AND move in one step.
  const byId = existingFlat.get(parsed.id);
  if (byId && !used.has(byId.id)) return byId;
  // 2. Sibling-label match (handles the common case where a user adds or
  //    removes siblings without renaming the existing ones).
  return existingSiblings.find((s) => s.label === parsed.label && !used.has(s.id));
}

/**
 * Use the parsed node's id as-is. When the user wrote `^{:id "..."}` metadata,
 * the parser already set the UUID as the id; otherwise it's the label — which
 * is exactly what we want for lightweight, label-derived identity. UUIDs are
 * only assigned explicitly (by the user or by the workspace root factory), not
 * minted automatically for every new node.
 */
function generateId(p: TreeNode): string {
  return p.id;
}

// ---------------------------------------------------------------------------
// Edge merger
// ---------------------------------------------------------------------------

export function mergeEdges(
  parsedEdges: Edge[],
  existingEdges: Edge[],
  idMap: Map<string, string>,
  inScope: (id: string) => boolean,
): Edge[] {
  // Parsed edges get their ids remapped; reuse existing edge ids when an
  // endpoint pair matches.
  const existingByEndpoints = new Map<string, Edge>();
  for (const e of existingEdges) {
    if (inScope(e.fromId) && inScope(e.toId)) {
      existingByEndpoints.set(`${e.fromId}->${e.toId}`, e);
    }
  }
  const mappedParsed: Edge[] = parsedEdges.map((pe) => {
    const fromId = idMap.get(pe.fromId) ?? pe.fromId;
    const toId = idMap.get(pe.toId) ?? pe.toId;
    const key = `${fromId}->${toId}`;
    const existing = existingByEndpoints.get(key);
    if (existing) {
      existingByEndpoints.delete(key);
      return {
        ...existing,
        label: pe.label || existing.label,
        data: { ...existing.data, ...pe.data },
        version: existing.version + 1,
      };
    }
    return {
      id: crypto.randomUUID(),
      fromId,
      toId,
      label: pe.label,
      data: pe.data,
      version: 1,
    };
  });

  // Preserve out-of-scope edges as-is.
  const preserved = existingEdges.filter(
    (e) => !(inScope(e.fromId) && inScope(e.toId)),
  );

  return [...mappedParsed, ...preserved];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenById(
  nodes: TreeNode[],
  out: Map<string, TreeNode> = new Map(),
): Map<string, TreeNode> {
  for (const n of nodes) {
    out.set(n.id, n);
    flattenById(n.children, out);
  }
  return out;
}

function flattenIdSet(nodes: TreeNode[], out: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    out.add(n.id);
    flattenIdSet(n.children, out);
  }
  return out;
}
