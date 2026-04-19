# Scientific Calculator

## Vision

Construct calculation graphs where each node is a mathematical operation with typed numeric ports.
The graph is both a visual diagram and a live computation — intermediate results are visible at
every node, and the whole graph can be shared as a reusable calculation template.

## Why this matters

Spreadsheets are the closest existing tool for "visual computation", but they hide the dataflow
structure in a grid of cell references. Marlinspike makes the dependency graph explicit:

- **Intermediate results** — every node shows its current value; change an input and watch values
  propagate through the graph
- **Type safety** — ports carry numeric types (`float`, `int`, `complex`); wiring a complex output
  to an int input is a constraint violation
- **Composability** — a calculation like "quadratic roots" is a composite node that can be dropped
  into any larger graph and wired up via its ports
- **Sharing** — calculations are URI-addressable subgraphs; share a link, not a copy

## Source files

- [`quadratic-roots.clj`](quadratic-roots.clj) — the canonical dataflow example: compute both
  roots of a quadratic equation from coefficients
- [`unit-conversion.clj`](unit-conversion.clj) — composable unit conversion chains, showing how
  simple leaf nodes compose into reusable converters
