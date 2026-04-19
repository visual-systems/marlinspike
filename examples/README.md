# Examples

Aspirational examples of how Marlinspike can be used. Each example has a README describing the
vision and `.clj` source files in [Spike-Clojure](../docs/spike-clojure.md) that sketch the graph
structure.

These examples **do not run**. They envision future capabilities — topology schemas, runtime
targets, implementation alternatives, URI-referenced libraries — most of which are not yet
implemented. The source files use valid Spike-Clojure syntax where possible, with comments
explaining features that go beyond the current parser.

## Convention

Each example directory contains:

- `README.md` — what the example illustrates and why it matters
- One or more `.clj` files — Spike-Clojure source representing the graph

## Examples

| Example | Domain | Illustrates |
|---|---|---|
| [github-actions/](github-actions/) | CI/CD | Action libraries as subgraphs, testing via implementation isomorphism |
| [scientific-calculator/](scientific-calculator/) | Computation | Typed dataflow, intermediate results, composable calculations |
| [clojure-project/](clojure-project/) | Software development | Full isomorphism between a graph and a real-world Clojure project |

## Revisiting

These examples should be revisited periodically as implementation progresses. When the
implementation diverges from what an example envisions, update the example to reflect reality —
or note the divergence as a design question worth exploring.
