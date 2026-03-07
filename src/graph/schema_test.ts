import { type Schema, Validator } from "@cfworker/json-schema";
import schema from "./schema.json" with { type: "json" };

const validator = new Validator(schema as Schema);

const VALID_GRAPH = {
  $schema: "https://marlinspike.io/schema/graph/v1",
  id: "00000000-0000-0000-0000-000000000001",
  uri: "spike://acme/backend/auth-service",
  meta: {
    name: "Auth Service",
    created: "2026-03-07T00:00:00Z",
    modified: "2026-03-07T00:00:00Z",
  },
  nodes: {
    "node-1": {
      id: "node-1",
      kind: "node",
      label: "Token Validator",
      subgraph: null,
      implementations: {},
      properties: {},
    },
    "port-in": {
      id: "port-in",
      kind: "port",
      label: "HTTP In",
      subgraph: null,
      portSchema: "io.http.request-response",
      direction: "in",
      implementations: {},
      properties: {},
    },
  },
  edges: {
    "edge-1": {
      id: "edge-1",
      from: { node: "port-in", port: "port-in" },
      to: { node: "node-1", port: "port-in" },
      properties: {},
    },
  },
  properties: {},
  activeSchemas: ["spike.topology.pipeline"],
  activeImplementation: null,
};

Deno.test("valid graph passes schema", () => {
  const result = validator.validate(VALID_GRAPH);
  if (!result.valid) {
    throw new Error(
      "Expected valid graph to pass, errors:\n" +
        result.errors.map((e) => `  ${e.instanceLocation}: ${e.error}`).join("\n"),
    );
  }
});

Deno.test("graph missing required 'uri' fails schema", () => {
  const { uri: _uri, ...invalid } = VALID_GRAPH;
  const result = validator.validate(invalid);
  if (result.valid) {
    throw new Error("Expected invalid graph (missing uri) to fail schema");
  }
});

Deno.test("graph with bad uri pattern fails schema", () => {
  const invalid = { ...VALID_GRAPH, uri: "not-a-spike-uri" };
  const result = validator.validate(invalid);
  if (result.valid) {
    throw new Error("Expected invalid graph (bad uri) to fail schema");
  }
});

Deno.test("node with unknown property fails schema", () => {
  const invalid = {
    ...VALID_GRAPH,
    nodes: {
      "node-1": { ...VALID_GRAPH.nodes["node-1"], unknownField: true },
    },
  };
  const result = validator.validate(invalid);
  if (result.valid) {
    throw new Error("Expected invalid node (extra property) to fail schema");
  }
});
