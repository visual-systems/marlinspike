# Clojure Project

## Vision

Full isomorphism between a Marlinspike graph and a real-world Clojure project. The graph IS the
project — namespaces are composite nodes, functions are callable nodes, dependencies are edges.
Edit in either the canvas or the code view; both representations stay in sync.

## Why this matters

Spike-Clojure is already a subset of valid Clojure. This example pushes the isomorphism further:
a complete Clojure application expressed as a Marlinspike graph, where the graph structure maps
directly to the project's namespace and function organisation.

- **Namespace = composite node** — each namespace is a subgraph containing its public functions
  as callable nodes. Private functions are leaf nodes without output ports.
- **Require = edges** — `(:require [other.ns :as alias])` becomes edges from the namespace node
  to its dependencies. The graph shows the full dependency structure at a glance.
- **defn = callable node** — function signatures map to port declarations. Argument types (when
  spec'd) become port types. Return values become output ports.
- **Code view round-trip** — the Spike-Clojure text view shows idiomatic Clojure. Editing the code
  updates the graph; editing the graph updates the code. Neither view is primary.
- **REPL integration** (future) — a Clojure runtime target could connect to an nREPL server,
  evaluate nodes, and show live results on the canvas.

## Source files

- [`ring-app.clj`](ring-app.clj) — a minimal Ring web application: handler, middleware, router
