/**
 * Node factory functions for constructing graph nodes.
 */

import type { TreeNode } from "./types.ts";

/** Create a standard node. */
export function makeNode(
  id: string,
  label: string,
  kind: "leaf" | "composite",
  children: TreeNode[],
  uri?: string,
): TreeNode {
  return { id, label, kind, children, data: {}, version: 1, uri };
}

/** Create a reference node that points to another entity. */
export function makeRefNode(id: string, label: string, ref: string): TreeNode {
  return {
    id,
    label,
    type: "ref",
    ref,
    kind: "composite",
    children: [],
    data: {},
    version: 1,
  };
}

/** Create a root wrapper node with the given ID, label, and children. */
export function makeRootNode(
  id: string,
  children: TreeNode[],
  label = "Untitled",
): TreeNode {
  return {
    id,
    label,
    kind: "composite",
    children,
    data: {},
    version: 1,
  };
}
