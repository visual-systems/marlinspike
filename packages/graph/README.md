# @marlinspike/graph

A rose-tree graph library with typed ports and sibling-scoped edges.

## Data Model

The graph is a **rose-tree** — every node is either a **leaf** (no children) or a **composite**
(contains children). Three core invariants govern the structure:

1. **Containment is recursive.** A composite node's children form a complete subgraph. Zoom into any
   composite and it's a self-contained graph.

2. **Communication is sibling-scoped.** Edges only connect nodes that share the same parent. Data
   never flows directly across containment boundaries.

3. **Ports are boundary contracts.** Port declarations on a node define what goes in and what comes
   out — the interface between containment levels. Ports have a direction (`in`, `out`, `inout`) and
   an optional type identifier.

These rules produce natural hierarchy, encapsulation, fractal navigation, and composability —
without special-casing any of them.

## Quick Start

```typescript
import {
  buildTree,
  edgesInScope,
  findNode,
  flattenTree,
  makeNode,
  makeRootNode,
  walk,
} from "@marlinspike/graph";
import type { Edge, Port, TreeNode } from "@marlinspike/graph";

// Build a small graph
const add = makeNode("add", "Add", "leaf", [], undefined);
const multiply = makeNode("mul", "Multiply", "leaf", [], undefined);
const pipeline = makeNode("pipe", "Pipeline", "composite", [add, multiply]);
const root = makeRootNode("root", [pipeline]);

// Edges connect siblings
const edges: Edge[] = [
  { id: "e1", fromId: "add", toId: "mul", label: "result", data: {}, version: 1 },
];

// Query edges in scope — only returns edges between pipeline's children
const scopedEdges = edgesInScope(pipeline, edges); // [e1]

// Find a node anywhere in the tree
const found = findNode([root], "mul"); // the Multiply node

// Walk the tree with enter/leave callbacks
walk([root], {
  enter: (node, parent, depth) => {
    console.log("  ".repeat(depth) + node.label);
  },
});

// Flatten for storage, rebuild from rows
const flat = flattenTree([root]);
const rebuilt = buildTree(flat); // structurally identical to [root]
```

## API

### Types

| Type       | Description                                                            |
| ---------- | ---------------------------------------------------------------------- |
| `TreeNode` | Rose-tree node with `id`, `label`, `kind`, `children`, `ports`, `data` |
| `Edge`     | Directed edge with `fromId`, `toId`, `label`, `data`                   |
| `Port`     | I/O declaration with `name`, `direction`, optional `type`              |
| `FlatNode` | Flattened node row with `parent` link (for storage)                    |

### Traversal

| Function                      | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| `findNode(nodes, id)`         | Find a node by ID anywhere in the tree (DFS)         |
| `findParentOf(nodes, nodeId)` | Find the parent of a node                            |
| `findSiblings(nodes, nodeId)` | Find sibling nodes (same parent, excluding target)   |
| `findPath(nodes, targetId)`   | Path from root to target, inclusive                  |
| `collectSubtreeIds(node)`     | All node IDs in a subtree                            |
| `walk(nodes, visitor)`        | Depth-first traversal with `enter`/`leave` callbacks |

### Mutation

| Function                              | Description                                             |
| ------------------------------------- | ------------------------------------------------------- |
| `updateNodeInTree(nodes, nodeId, fn)` | Immutably update a node by ID                           |
| `removeNodeFromTree(nodes, nodeId)`   | Immutably remove a node (demotes empty parents to leaf) |

### Query

| Function                      | Description                             |
| ----------------------------- | --------------------------------------- |
| `getEdgesIn(edges, nodeId)`   | Edges pointing to a node                |
| `getEdgesOut(edges, nodeId)`  | Edges originating from a node           |
| `edgesInScope(parent, edges)` | Edges between direct children of parent |
| `nodeHash(node)`              | Lightweight hash for change detection   |

### Factory

| Function                                    | Description                |
| ------------------------------------------- | -------------------------- |
| `makeNode(id, label, kind, children, uri?)` | Create a standard node     |
| `makeRefNode(id, label, ref)`               | Create a reference node    |
| `makeRootNode(id, children, label?)`        | Create a root wrapper node |

### Flatten / Build

| Function                        | Description                               |
| ------------------------------- | ----------------------------------------- |
| `flattenTree(nodes, parentId?)` | Convert recursive tree to flat rows       |
| `buildTree(flat)`               | Reconstruct recursive tree from flat rows |

### Interchange Types

The package also exports an interchange format (`InterchangeNode`, `InterchangeEdge`, `Graph`, etc.)
representing the canonical serialization target. These are distinct from the runtime types and are
used for import/export between tools.

## Design Philosophy

This package is a **data-structure library** — it defines types and pure functions over them. It has
zero runtime dependencies and works in any JavaScript environment (browser, Deno, Node, Bun).

The package provides integration points for higher-level concerns without coupling to them:

- **Codecs** produce and consume `TreeNode[]` + `Edge[]`
- **Constraints/validation** traverse the tree via `walk` and query edges via `edgesInScope`
- **Layout engines** use the containment structure (children) and edge connectivity
- **Persistence layers** use `flattenTree`/`buildTree` for storage-agnostic serialization

## License

Part of the [Marlinspike](https://github.com/visual-systems/marlinspike) project.
