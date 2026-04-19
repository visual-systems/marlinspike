# J Program Editor

## Vision

Express array-language programs as typed dataflow graphs. Each node is a J verb (function) or
adverb (higher-order function); edges carry typed arrays between them. The graph makes the implicit
dataflow of tacit J expressions explicit and navigable.

## Why this matters

J is famously concise — a single line can express a complex computation over arrays. But this
conciseness makes programs hard to read, debug, and teach. As a Marlinspike graph:

- **Explicit dataflow** — each verb application is a visible node. The flow from input arrays
  through transformations to output is a graph you can trace step by step.
- **Intermediate results** — hover over any node to see the array value at that point. This is
  the key affordance J programmers lack: seeing what each verb does to the data.
- **Rank and shape visible** — port types carry array rank and shape information. A rank-2 verb
  applied to a rank-1 array is a type error visible before execution.
- **Tacit ↔ explicit toggle** — the code view shows idiomatic tacit J; the canvas view shows the
  explicit dataflow. Both are views of the same graph.
- **Composition as wiring** — J's forks, hooks, and trains are graph topologies. A fork `(f g h)`
  is a fan-out to `f` and `h`, then a fan-in through `g`. The graph makes this obvious.

## Source files

- [`mean-deviation.clj`](mean-deviation.clj) — compute mean absolute deviation of an array,
  decomposed from the tacit J expression into an explicit dataflow graph
