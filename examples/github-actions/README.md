# GitHub Actions Designer

## Vision

Design GitHub Actions workflows as dataflow graphs. Each action is a node; data flows between
actions via typed ports (inputs/outputs). Action libraries are addressable subgraphs — you can
browse, import, and compose published actions visually, then emit a valid `.github/workflows/*.yml`
file as a runtime target.

## Why this matters

GitHub Actions workflows are already dataflow graphs — jobs depend on other jobs, steps pass
outputs to later steps. But the YAML authoring experience is flat and error-prone:

- No visual feedback on the dependency structure
- No type checking between action outputs and downstream inputs
- No way to test a workflow locally without pushing to CI
- Reusing action patterns requires copy-paste or brittle composite actions

Marlinspike addresses each of these:

- **Visual graph** — see the full workflow topology, enter composite actions to inspect internals
- **Typed ports** — action inputs/outputs carry schemas; wiring incompatible types is a constraint
  violation
- **Action libraries** — published actions are URI-referenced subgraphs
  (`spike://github/actions/checkout@v4`); browsing and importing is a first-class IDE operation
- **Testing via isomorphism** — select a `simulation` implementation for each action to run the
  workflow locally. If the port interfaces match, the simulation is structurally guaranteed to
  exercise the same topology as production.
- **YAML target** — a runtime target plugin emits valid workflow YAML from the validated graph

## Source files

- [`ci-pipeline.clj`](ci-pipeline.clj) — a CI/CD pipeline: checkout, build, test, deploy with
  conditional paths and matrix strategies
