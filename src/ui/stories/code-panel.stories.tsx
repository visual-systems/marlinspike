/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import { CodePanel } from "../components/code-panel.tsx";
import { defaultCodePanel, defaultState, type Updater, type WorkspaceState } from "../workspace.ts";
import { FIXTURES } from "../../code/spike-clojure-fixtures.ts";
import { graphToSpike, spikeToGraph } from "../../code/spike-clojure.ts";
import { TOKEN_COLORS, tokenise } from "../lib/spike-tokenise.ts";

export const meta = { title: "Code Panel" };

// Renders a CodePanel pre-seeded with a code string, independent of graphToSpike.
function PanelWithCode({ code }: { code: string }) {
  const panel = defaultCodePanel();
  const base = defaultState();
  const initial: WorkspaceState = {
    ...base,
    treeNodes: [],
    edges: [],
    tabs: [{ ...base.tabs[0], panels: [panel] }],
  };
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const update: Updater = (fn) => setWs((prev) => fn(prev));
  const tab = ws.tabs[0];
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ta = wrapRef.current?.querySelector("textarea");
    if (!ta) return;
    ta.value = code;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  return (
    <div
      ref={wrapRef}
      style="display:flex; height:480px; border:1px solid #2a2a4a; overflow:hidden; width:600px;"
    >
      <CodePanel panel={panel} tab={tab} ws={ws} update={update} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Leaf-only structural container
// ---------------------------------------------------------------------------

export function LeafOnly() {
  return (
    <PanelWithCode
      code={`; def — structural container (named value, not callable)
; A, B, C are leaf nodes; no call order expressed.
(def my-graph [A B C])`}
    />
  );
}

// ---------------------------------------------------------------------------
// 2. Nested subgraph
// ---------------------------------------------------------------------------

export function NestedSubgraph() {
  return (
    <PanelWithCode
      code={`; Nested containment — composite nodes as def forms
(def auth-service
  [token-validator
   ingress
   (def session-store
     [cache db])])

(def backend
  [auth-service
   frontend])`}
    />
  );
}

// ---------------------------------------------------------------------------
// 3. Call chain — A → B → C
// ---------------------------------------------------------------------------

export function CallChain() {
  return (
    <PanelWithCode
      code={`; A → B → C: sequential call chain
; Each let binding passes the output of one node to the next.
(defn pipeline [input]
  (let [a (A input)
        b (B a)]
    (C b)))`}
    />
  );
}

// ---------------------------------------------------------------------------
// 4. Fan-out — A → B, A → C
// ---------------------------------------------------------------------------

export function FanOut() {
  return (
    <PanelWithCode
      code={`; A fans out to B and C — both receive A's output
(defn pipeline [input]
  (let [a (A input)
        b (B a)
        c (C a)]
    {:b b :c c}))`}
    />
  );
}

// ---------------------------------------------------------------------------
// 5. Diamond — A → B → D, A → C → D
// ---------------------------------------------------------------------------

export function Diamond() {
  return (
    <PanelWithCode
      code={`; Diamond: A → B, A → C, B → D, C → D
; b and c are computed in parallel; D merges both.
(defn pipeline [input]
  (let [a (A input)
        b (B a)
        c (C a)]
    (D b c)))`}
    />
  );
}

// ---------------------------------------------------------------------------
// 6. Mixed — structural + callable + typed ports
// ---------------------------------------------------------------------------

export function MixedSemantics() {
  return (
    <PanelWithCode
      code={`; Mixed: structural containment + typed callable nodes
(def oidc-flow
  [^oidc.AuthCode issue-auth-code
   ^oidc.Token    exchange-token])

(defn ^oidc.Token auth [^oidc.Session session ^oidc.Client client]
  (let [code  (issue-auth-code session client)
        token (exchange-token code)]
    token))`}
    />
  );
}

// ---------------------------------------------------------------------------
// 7. Parse error state
// ---------------------------------------------------------------------------

export function ParseError() {
  return (
    <PanelWithCode
      code={`; Unclosed paren — triggers parse error on Cmd+Enter
(defn broken [x]
  (let [a (A x]
    a))`}
    />
  );
}

// ---------------------------------------------------------------------------
// 8. Round-trip gallery — two sections per fixture:
//      graph → clj → graph   (does the graph survive serialisation?)
//      clj → graph → clj     (does the Clojure survive parsing?)
// ---------------------------------------------------------------------------

const PANEL_LABEL =
  "font-size:10px; color:#555; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px;";
const GRAPH_SCROLL =
  "background:#161b22; color:#adbac7; padding:10px 12px; border-radius:6px; font-size:11px; line-height:1.5; margin:0; white-space:pre-wrap; height:160px; overflow-y:auto;";

function Highlighted({ src }: { src: string }) {
  const tokens = tokenise(src);
  return (
    <pre style="background:#0d1117; color:#c9d1d9; padding:10px 12px; border-radius:6px; font-size:12px; line-height:1.6; margin:0; white-space:pre-wrap;">
      {tokens.map((t, i) =>
        t.kind ? <span key={i} style={`color:${TOKEN_COLORS[t.kind]}`}>{t.text}</span> : t.text
      )}
    </pre>
  );
}

function Arrow() {
  return (
    <div style="display:flex; align-items:center; justify-content:center; color:#444; font-size:18px; padding-top:18px;">
      →
    </div>
  );
}

function Badge({ ok }: { ok: boolean }) {
  return (
    <span
      style={`font-size:11px; padding:2px 7px; border-radius:4px; ${
        ok ? "background:#1a3a1a; color:#56d364;" : "background:#3a1a1a; color:#f85149;"
      }`}
    >
      {ok ? "✓ stable" : "✗ mismatch"}
    </span>
  );
}

function graphJson(
  nodes: Parameters<typeof graphToSpike>[0],
  edges: Parameters<typeof graphToSpike>[1],
) {
  return JSON.stringify(
    {
      nodes: nodes.map((n) => ({ id: n.id, kind: n.kind, children: n.children.map((c) => c.id) })),
      edges: edges.map((e) => ({ from: e.fromId, to: e.toId })),
    },
    null,
    2,
  );
}

const SECTION_GRID =
  "display:grid; grid-template-columns:1fr auto 1fr auto 1fr; gap:6px; padding:8px 14px 14px; align-items:start;";
const SECTION_LABEL =
  "padding:6px 14px 2px; font-size:10px; color:#444; text-transform:uppercase; letter-spacing:.08em; border-top:1px solid #21262d;";

function RoundTripCard({ fixture }: { fixture: (typeof FIXTURES)[number] }) {
  // graph → clj → graph
  const clj = graphToSpike(fixture.nodes, fixture.edges);
  const { treeNodes: g2, edges: e2, errors: errs2 } = spikeToGraph(clj);
  const graphMatch = errs2.length === 0 &&
    graphJson(g2, e2) === graphJson(fixture.nodes, fixture.edges);

  // clj → graph → clj  (starts from the emitted Clojure)
  const reClj = errs2.length === 0 ? graphToSpike(g2, e2) : null;
  const cljMatch = reClj === clj;

  return (
    <div style="background:#0d1117; border:1px solid #30363d; border-radius:8px; margin:12px 16px; overflow:hidden; font-family:monospace;">
      {/* Header */}
      <div style="padding:8px 14px; background:#161b22; border-bottom:1px solid #30363d;">
        <span style="color:#e6edf3; font-size:13px; font-weight:600;">{fixture.label}</span>
        <span style="color:#8b949e; font-size:11px; margin-left:10px;">{fixture.description}</span>
      </div>

      {/* Section A: graph → clj → graph */}
      <div style={SECTION_LABEL}>
        graph → clj → graph &nbsp; <Badge ok={graphMatch} />
        {errs2.length > 0 && (
          <span style="color:#f85149; margin-left:8px;">parse errors: {errs2.join("; ")}</span>
        )}
      </div>
      <div style={SECTION_GRID}>
        <div>
          <div style={PANEL_LABEL}>① graph</div>
          <pre style={GRAPH_SCROLL}>{graphJson(fixture.nodes, fixture.edges)}</pre>
        </div>
        <Arrow />
        <div>
          <div style={PANEL_LABEL}>② clj</div>
          <Highlighted src={clj} />
        </div>
        <Arrow />
        <div>
          <div style={PANEL_LABEL}>③ graph</div>
          {errs2.length === 0
            ? <pre style={GRAPH_SCROLL}>{graphJson(g2, e2)}</pre>
            : <pre style={GRAPH_SCROLL + " color:#f85149;"}>parse failed</pre>}
        </div>
      </div>

      {/* Section B: clj → graph → clj */}
      <div style={SECTION_LABEL}>
        clj → graph → clj &nbsp; <Badge ok={cljMatch} />
      </div>
      <div style={SECTION_GRID}>
        <div>
          <div style={PANEL_LABEL}>① clj</div>
          <Highlighted src={clj} />
        </div>
        <Arrow />
        <div>
          <div style={PANEL_LABEL}>② graph</div>
          {errs2.length === 0
            ? <pre style={GRAPH_SCROLL}>{graphJson(g2, e2)}</pre>
            : <pre style={GRAPH_SCROLL + " color:#f85149;"}>parse failed</pre>}
        </div>
        <Arrow />
        <div>
          <div style={PANEL_LABEL}>③ clj</div>
          {reClj !== null
            ? <Highlighted src={reClj} />
            : (
              <pre style="background:#0d1117; color:#f85149; padding:10px 12px; border-radius:6px; font-size:12px; margin:0;">parse failed</pre>
            )}
        </div>
      </div>
    </div>
  );
}

export function RoundTripGallery() {
  return (
    <div style="background:#010409; min-height:100vh; padding:8px 0;">
      {FIXTURES.map((f) => <RoundTripCard key={f.label} fixture={f} />)}
    </div>
  );
}
