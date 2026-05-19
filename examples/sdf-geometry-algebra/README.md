# SDF Geometry Algebra

## Vision

Define composite 2D/3D shapes as dataflow graphs where leaves are SDF primitives (circle,
box, half-plane) and interior nodes are constructive operations (union, intersection,
subtraction, smooth blend). The graph *is* the shape definition: traversing it produces an
SDF function, its Jacobian with respect to control parameters, and a GLSL shader — three
outputs from a single source of truth.

This is an example of a **marlinspike domain app**: a graph topology schema plus constraints
that turn the general-purpose graph editor into a specialised authoring tool for a specific
domain. The graph structure *is* the domain model; the editor *is* the domain tool.

## Why this matters

### Shape authoring as graph construction

Traditional SDF authoring uses code (Shadertoy, Inigo Quilez's articles) or node-based
editors (Houdini, Blender geometry nodes). Marlinspike offers a middle path: the graph is
both the visual diagram and the executable program. Each primitive's parameters (radius,
position, rounding) are visible and editable. Each combinator's blend radius is a port value,
not a hidden parameter.

### Automatic differentiation via graph structure

The dataflow graph is a computation DAG. Every SDF primitive has a known analytic gradient.
Every combinator (smooth union, intersection) has a known chain rule. Walking the graph in
reverse yields the Jacobian of the composite SDF with respect to all control parameters —
radius, position, blend factor. This is not numeric approximation; the graph structure
provides exact symbolic derivatives.

This enables:
- **Gradient-based optimisation** — fit a composite SDF to a target boundary by adjusting
  control parameters. The Jacobian tells the optimiser exactly how each parameter affects
  the boundary.
- **Sensitivity analysis** — which parameter has the greatest effect on the shape near a
  given point? The Jacobian column magnitudes answer this directly.
- **Inverse design** — specify a desired boundary and let the optimiser find parameters
  that produce it.

### Shader code generation

The same graph that defines the SDF and its Jacobian can be compiled to GLSL. Each leaf node
becomes a primitive SDF call. Each combinator becomes an `opUnion`, `opIntersect`, or
`opSmoothUnion` call. The result is a fragment shader that renders the shape in real time via
ray marching — directly from the graph definition, with no manual shader authoring.

### Domain app pattern

This example demonstrates a broader pattern for marlinspike: **domain-specific applications
as graph topologies**. The SDF algebra is defined by:

1. **A topology schema** — constraints on which node types can connect to which others.
   Primitives have parameter ports (float) and a single SDF output. Combinators have two
   SDF inputs, an optional blend parameter, and one SDF output.
2. **Execution semantics** — traversing the graph produces a value (the SDF function).
   This is the same pattern as the scientific calculator examples, but the "values" flowing
   through the graph are functions (R^n -> R) rather than numbers.
3. **Derived outputs** — the Jacobian and shader are computed from the same graph structure,
   not from separate definitions. The graph is the single source of truth.

Other potential domain apps following this pattern:
- **Signal processing** — filter graphs where nodes are DSP primitives
- **Shader graphs** — material/lighting graphs for real-time rendering
- **Circuit design** — logic gates as nodes, boolean/analog values on edges
- **Probabilistic programs** — Bayesian networks as explicit dataflow

## Source files

- [`sdf-algebra.clj`](sdf-algebra.clj) — core SDF primitives and combinators as a reusable
  library composite
- [`rounded-cross.clj`](rounded-cross.clj) — a concrete shape built from the algebra:
  a rounded cross constructed via smooth union of two boxes
- [`jacobian-example.clj`](jacobian-example.clj) — extends rounded-cross with Jacobian
  computation, showing how the graph structure enables automatic differentiation

## Deferred capabilities

These are not yet implemented but are structurally enabled by this example's design:

- **Live SDF preview** — render the composite SDF as a 2D distance field heatmap in the
  canvas, updated in real time as parameters are edited
- **GLSL code generation** — compile the graph to a fragment shader
- **3D extension** — same algebra with 3D primitives (sphere, box, cylinder, torus)
- **Constructive solid geometry** — boolean operations on 3D SDFs for CAD-like modelling
- **WebGL canvas rendering** — use the compiled SDF directly as the canvas renderer for
  node shapes, closing the loop: shapes defined as graphs rendered as shapes
