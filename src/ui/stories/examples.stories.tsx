/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { Canvas } from "../components/canvas.tsx";
import { validateWorkspace } from "../../graph/validate_workspace.ts";
import {
  EDGE_OUTPUT_TYPE_CONSTRAINT,
  JS_SCRIPT_CONSTRAINT,
  LABEL_REQUIRED_CONSTRAINT,
  MAX_GROUP_SIZE_CONSTRAINT,
} from "../../graph/builtin_constraints.ts";
import { defaultState, type TreeNode, type Updater, type WorkspaceState } from "../workspace.ts";

export const meta = { title: "Examples" };

// Local helper — makeNode extended with optional data payload.
function node(
  id: string,
  label: string,
  kind: "leaf" | "composite",
  children: TreeNode[],
  data: Record<string, unknown> = {},
): TreeNode {
  return { id, label, kind, children, data, version: 1 };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function StoryWrapper(
  {
    initial,
    makeExecute,
  }: {
    initial: WorkspaceState;
    makeExecute?: (setHighlight: (ids: Set<string>) => void) => () => void;
  },
) {
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const update: Updater = (fn) => setWs((prev) => fn(prev));
  const diagnostics = validateWorkspace(ws, ws.constraintApplications);
  const onExecute = makeExecute?.(setHighlighted);
  return (
    <div style="position:relative; width:900px; height:600px; border:1px solid #2a2a4a;">
      <Canvas
        ws={ws}
        update={update}
        diagnostics={diagnostics}
        onExecute={onExecute}
        highlightEntityIds={highlighted}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline — three-stage event processing chain
// ---------------------------------------------------------------------------

/** A simple linear pipeline: ingest → process → publish.
 *  Each node carries a JS script that operates on USGS earthquake data.
 *  A js-script constraint is applied to all three nodes; all pass. */
export function Pipeline() {
  const ws = defaultState();
  ws.treeNodes = [
    node("ingest", "Ingest", "leaf", [], {
      owner: "data-team",
      version: "2.1.0",
      outputs: ["features"],
      script: `\
async function ingest() {
  console.log("[ingest] fetching earthquake data...");
  const res = await fetch(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"
  );
  const json = await res.json();
  console.log(\`[ingest] received \${json.features.length} features\`);
  return json.features;
}`,
    }),
    node("process", "Process", "leaf", [], {
      owner: "data-team",
      version: "2.1.0",
      inputs: ["features"],
      outputs: ["events"],
      script: `\
function process(features) {
  console.log(\`[process] processing \${features.length} features...\`);
  const result = features.map((f) => {
    const { mag, place, time } = f.properties;
    const t = new Date(time).toUTCString();
    return \`M\${mag.toFixed(1)} — \${place} (\${t})\`;
  });
  console.log(\`[process] produced \${result.length} events\`);
  return result;
}`,
    }),
    node("publish", "Publish", "leaf", [], {
      owner: "platform-team",
      version: "1.4.2",
      inputs: ["events"],
      script: `\
function publish(events) {
  events.forEach((e) => console.log(e));
}`,
    }),
  ];
  ws.edges = [
    {
      id: "e1",
      fromId: "ingest",
      toId: "process",
      label: "raw features",
      data: { type: "features" },
      version: 1,
    },
    {
      id: "e2",
      fromId: "process",
      toId: "publish",
      label: "formatted events",
      data: { type: "events" },
      version: 1,
    },
  ];
  ws.canvasExpandedNodes = [];

  const jsConstraint = { ...JS_SCRIPT_CONSTRAINT };
  const edgeTypeConstraint = { ...EDGE_OUTPUT_TYPE_CONSTRAINT };
  ws.constraints = [jsConstraint, edgeTypeConstraint];
  ws.constraintApplications = [
    { id: "a1", constraintId: jsConstraint.id, entityId: "ingest", version: 1 },
    { id: "a2", constraintId: jsConstraint.id, entityId: "process", version: 1 },
    { id: "a3", constraintId: jsConstraint.id, entityId: "publish", version: 1 },
    { id: "a4", constraintId: edgeTypeConstraint.id, entityId: "e1", version: 1 },
    { id: "a5", constraintId: edgeTypeConstraint.id, entityId: "e2", version: 1 },
  ];

  function makeExecute(setHighlight: (ids: Set<string>) => void) {
    return async () => {
      setHighlight(new Set());

      const ingestFn = new Function(`return (${ws.treeNodes[0].data.script})`)() as () => Promise<
        unknown[]
      >;
      const processFn = new Function(`return (${ws.treeNodes[1].data.script})`)() as (
        x: unknown[],
      ) => string[];
      const publishFn = new Function(`return (${ws.treeNodes[2].data.script})`)() as (
        x: string[],
      ) => void;

      const features = await ingestFn();
      setHighlight(new Set(["ingest"]));
      await sleep(400);

      setHighlight(new Set(["ingest", "e1"]));
      await sleep(300);

      const events = processFn(features);
      setHighlight(new Set(["ingest", "e1", "process"]));
      await sleep(400);

      setHighlight(new Set(["ingest", "e1", "process", "e2"]));
      await sleep(300);

      publishFn(events);
      setHighlight(new Set(["ingest", "e1", "process", "e2", "publish"]));
    };
  }

  return <StoryWrapper initial={ws} makeExecute={makeExecute} />;
}

// ---------------------------------------------------------------------------
// HTTP Request Lifecycle — web request flowing through a service stack
// ---------------------------------------------------------------------------

/** An HTTP request travelling from browser through gateway, auth, service, and database.
 *  All nodes carry owner/version metadata; edges show the protocol or query at each hop. */
export function RequestLifecycle() {
  const ws = defaultState();
  ws.treeNodes = [
    node("browser", "Browser", "leaf", [], { kind: "client", owner: "frontend-team" }),
    node("gateway", "API Gateway", "leaf", [], {
      owner: "platform-team",
      version: "3.0.1",
      port: 443,
    }),
    node("auth", "Auth Service", "leaf", [], {
      owner: "security-team",
      version: "1.8.0",
      port: 8080,
    }),
    node("user-svc", "User Service", "leaf", [], {
      owner: "product-team",
      version: "4.2.3",
      port: 8081,
    }),
    node("db", "PostgreSQL", "leaf", [], { owner: "infra-team", version: "15.4", port: 5432 }),
  ];
  ws.edges = [
    {
      id: "e1",
      fromId: "browser",
      toId: "gateway",
      label: "HTTPS GET /api/users",
      data: {},
      version: 1,
    },
    { id: "e2", fromId: "gateway", toId: "auth", label: "validate token", data: {}, version: 1 },
    {
      id: "e3",
      fromId: "gateway",
      toId: "user-svc",
      label: "GET /users/:id",
      data: {},
      version: 1,
    },
    {
      id: "e4",
      fromId: "user-svc",
      toId: "db",
      label: "SELECT * FROM users",
      data: {},
      version: 1,
    },
  ];
  ws.canvasExpandedNodes = [];
  return <StoryWrapper initial={ws} />;
}

// ---------------------------------------------------------------------------
// Service Mesh — small cluster with expanded groups and live constraints
// ---------------------------------------------------------------------------

/** A small service mesh with two expanded service groups and a standalone worker.
 *  Two constraints are active: label-required (one unlabelled node → error) and
 *  max-children on the backend group (limit 2, has 3 children → warning). */
export function ServiceMesh() {
  const ws = defaultState();
  ws.treeNodes = [
    node("platform", "Platform", "composite", [
      node("frontend-grp", "Frontend", "composite", [
        node("web", "Web App", "leaf", [], { owner: "frontend-team", version: "5.0.0" }),
        node("mobile", "Mobile App", "leaf", [], { owner: "frontend-team", version: "3.2.1" }),
      ]),
      node("backend-grp", "Backend", "composite", [
        node("api", "API", "leaf", [], { owner: "backend-team", version: "2.0.0", port: 8080 }),
        node("auth-svc", "Auth", "leaf", [], {
          owner: "security-team",
          version: "1.8.0",
          port: 8081,
        }),
        // Intentionally unlabelled — will fail the label-required constraint
        node("unlabelled", "", "leaf", [], { owner: "backend-team" }),
      ]),
    ]),
    node("workers", "Workers", "leaf", [], { owner: "platform-team", version: "1.1.0" }),
  ];
  ws.edges = [
    { id: "e1", fromId: "web", toId: "api", label: "REST", data: {}, version: 1 },
    { id: "e2", fromId: "mobile", toId: "api", label: "REST", data: {}, version: 1 },
    { id: "e3", fromId: "api", toId: "auth-svc", label: "verify token", data: {}, version: 1 },
    { id: "e4", fromId: "workers", toId: "api", label: "job results", data: {}, version: 1 },
  ];

  const labelConstraint = { ...LABEL_REQUIRED_CONSTRAINT };
  const maxChildrenConstraint = { ...MAX_GROUP_SIZE_CONSTRAINT, data: { limit: 2 } };
  ws.constraints = [labelConstraint, maxChildrenConstraint];
  ws.constraintApplications = [
    { id: "a1", constraintId: labelConstraint.id, entityId: "web", version: 1 },
    { id: "a2", constraintId: labelConstraint.id, entityId: "mobile", version: 1 },
    { id: "a3", constraintId: labelConstraint.id, entityId: "api", version: 1 },
    { id: "a4", constraintId: labelConstraint.id, entityId: "auth-svc", version: 1 },
    { id: "a5", constraintId: labelConstraint.id, entityId: "unlabelled", version: 1 },
    { id: "a6", constraintId: labelConstraint.id, entityId: "workers", version: 1 },
    // max-children on backend group (3 children, limit 2)
    { id: "a7", constraintId: maxChildrenConstraint.id, entityId: "backend-grp", version: 1 },
  ];
  ws.canvasExpandedNodes = ["platform", "backend-grp"];
  return <StoryWrapper initial={ws} />;
}

// ---------------------------------------------------------------------------
// Data Pipeline — ETL with nested groups for each stage
// ---------------------------------------------------------------------------

/** A batch ETL pipeline where each stage (Extract, Transform, Load) is a composite node
 *  containing sub-steps. Shows nested group expansion alongside a flow of edges. */
export function DataPipeline() {
  const ws = defaultState();
  ws.treeNodes = [
    node("extract", "Extract", "composite", [
      node("db-reader", "DB Reader", "leaf", [], {
        owner: "data-team",
        source: "postgres",
        version: "1.0.0",
      }),
      node("file-reader", "File Reader", "leaf", [], {
        owner: "data-team",
        source: "s3",
        version: "1.2.0",
      }),
    ]),
    node("transform", "Transform", "composite", [
      node("validate", "Validate", "leaf", [], {
        owner: "data-team",
        rules: "schema-v3",
        version: "2.0.0",
      }),
      node("enrich", "Enrich", "leaf", [], {
        owner: "data-team",
        lookup: "geo-ip",
        version: "1.1.0",
      }),
      node("aggregate", "Aggregate", "leaf", [], {
        owner: "data-team",
        window: "1h",
        version: "1.0.0",
      }),
    ]),
    node("load", "Load", "composite", [
      node("warehouse", "Warehouse", "leaf", [], {
        owner: "infra-team",
        target: "bigquery",
        version: "3.1.0",
      }),
      node("cache", "Cache", "leaf", [], {
        owner: "infra-team",
        target: "redis",
        version: "2.0.0",
        ttl: "24h",
      }),
    ]),
  ];
  ws.edges = [
    { id: "e1", fromId: "db-reader", toId: "validate", label: "raw rows", data: {}, version: 1 },
    {
      id: "e2",
      fromId: "file-reader",
      toId: "validate",
      label: "raw records",
      data: {},
      version: 1,
    },
    {
      id: "e3",
      fromId: "validate",
      toId: "enrich",
      label: "valid records",
      data: {},
      version: 1,
    },
    {
      id: "e4",
      fromId: "enrich",
      toId: "aggregate",
      label: "enriched records",
      data: {},
      version: 1,
    },
    {
      id: "e5",
      fromId: "aggregate",
      toId: "warehouse",
      label: "hourly batches",
      data: {},
      version: 1,
    },
    {
      id: "e6",
      fromId: "aggregate",
      toId: "cache",
      label: "recent results",
      data: {},
      version: 1,
    },
  ];
  ws.canvasExpandedNodes = ["extract", "transform", "load"];
  return <StoryWrapper initial={ws} />;
}

// ---------------------------------------------------------------------------
// SingleNode — minimal canvas for debugging add-node behaviour
// ---------------------------------------------------------------------------

/** A single leaf node on an empty canvas. Use this to debug add-node mode. */
export function SingleNode() {
  const ws = defaultState();
  ws.treeNodes = [node("alpha", "Alpha", "leaf", [])];
  return <StoryWrapper initial={ws} />;
}
