# Cardano's Cubic Roots

## Vision

Decompose Cardano's formula for the depressed cubic (x^3 + px + q = 0) into an explicit dataflow
graph. Each intermediate value — the discriminant, the cube roots, the complex intermediates — is
a visible node. The graph makes the _casus irreducibilis_ phenomenon legible: when all three roots
are real but the discriminant is negative, the formula must pass through complex intermediate values
to reach real results.

## Why this matters

- **Visible type transitions** — ports carry `float` or `complex` types. The transition from real
  inputs through complex intermediates back to real outputs is structurally apparent in the graph.
  The constraint system can validate these transitions: a `complex-sqrt` node outputs `complex`
  even when its input is `float`.
- **Mathematical structure made navigable** — Cardano's formula is a single algebraic expression,
  but it decomposes into a rich dataflow graph with fan-out (the discriminant feeds both cube root
  branches), fan-in (u and v combine for each root), and repeated structure (omega rotation for
  the second and third roots).
- **Stress test for branching types** — the casus irreducibilis is the historically significant case
  where "obvious" real roots require complex intermediate values. Any graph system that claims to
  handle typed dataflow needs to handle this gracefully.
- **Extends quadratic-roots** — this is the natural next step from the
  [`scientific-calculator/quadratic-roots.clj`](../scientific-calculator/quadratic-roots.clj)
  example, exercising more graph features (complex arithmetic, type-changing nodes, deeper
  dependency chains).

## Source files

- [`cubic-roots.clj`](cubic-roots.clj) — Cardano's formula as a dataflow graph
