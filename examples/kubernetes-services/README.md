# Kubernetes Services Configuration

## Vision

Define a Kubernetes cluster as a Marlinspike graph where services are composite nodes, inter-service
communication is formalised over typed port APIs or message queues, and the whole topology can be
validated by constraint plugins before generating deployment manifests.

## Why this matters

Kubernetes manifests are verbose YAML that describes individual resources in isolation. The
relationships between services — who calls whom, over what protocol, with what data contract — are
implicit in environment variables, DNS names, and tribal knowledge. As a Marlinspike graph:

- **Topology is explicit** — services are nodes, communication channels are typed edges. The
  graph shows the full service mesh at a glance. Enter a service node to see its internal
  architecture.
- **Typed port APIs** — each service exposes typed ports (HTTP REST, gRPC, message queue topics).
  Wiring an HTTP client to a gRPC server is a constraint violation, caught at design time.
- **Constraint validation** — topology schemas enforce invariants: no circular dependencies between
  synchronous services, every service must have a health check port, message queue consumers must
  declare a dead-letter queue. These are live diagnostics, not CI-time surprises.
- **Implementation alternatives** — select `production` for real container images, `simulation` for
  local Docker Compose, `mock` for integration test stubs. Same topology, different runtimes.
- **Manifest generation** — a `spike.target.k8s` runtime target emits Helm charts or raw manifests
  from the validated graph. The generated YAML is always consistent with the visual topology.

## Source files

- [`microservices.clj`](microservices.clj) — a simple microservice architecture: API gateway,
  auth service, user service, notification service, connected via HTTP and message queues
