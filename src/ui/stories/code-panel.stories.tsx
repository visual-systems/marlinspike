/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import { CodePanel } from "../components/code-panel.tsx";
import { defaultCodePanel, defaultState, type Updater, type WorkspaceState } from "../workspace.ts";
import { FIXTURES } from "../../code/spike-clojure-fixtures.ts";
import { evaluateSpike, numericEnv } from "../../code/spike-clojure-eval.ts";
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
      nodes: nodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        ...(n.ports && n.ports.length > 0 ? { ports: n.ports } : {}),
        children: n.children.map((c) => c.id),
      })),
      edges: edges.map((e) => ({ from: e.fromId, to: e.toId })),
    },
    null,
    2,
  );
}

// Normalised comparison: sorts children by id and edges by from→to so that
// topo-sort reorderings (which are semantically irrelevant) don't show as mismatches.
function stableGraphJson(
  nodes: Parameters<typeof graphToSpike>[0],
  edges: Parameters<typeof graphToSpike>[1],
): string {
  function sortNode(
    n: { id: string; kind: string; ports?: typeof nodes[0]["ports"]; children: typeof nodes },
  ): unknown {
    const sorted = n.children
      .map((c) =>
        sortNode(
          c as {
            id: string;
            kind: string;
            ports?: typeof nodes[0]["ports"];
            children: typeof nodes;
          },
        )
      )
      .sort((a, b) =>
        String((a as { id: string }).id).localeCompare(String((b as { id: string }).id))
      );
    return {
      id: n.id,
      kind: n.kind,
      ...(n.ports && n.ports.length > 0 ? { ports: n.ports } : {}),
      children: sorted,
    };
  }
  return JSON.stringify(
    {
      nodes: nodes.map((n) =>
        sortNode(
          n as {
            id: string;
            kind: string;
            ports?: typeof nodes[0]["ports"];
            children: typeof nodes;
          },
        )
      ),
      edges: [...edges.map((e) => ({ from: e.fromId, to: e.toId }))]
        .sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`)),
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
  // Use stableGraphJson so topo-sort reorderings of children don't false-negative.
  const clj = graphToSpike(fixture.nodes, fixture.edges);
  const { treeNodes: g2, edges: e2, errors: errs2 } = spikeToGraph(clj);
  const graphMatch = errs2.length === 0 &&
    stableGraphJson(g2, e2) === stableGraphJson(fixture.nodes, fixture.edges);

  // clj → graph → clj
  // Only shown when there is a meaningful starting program:
  //   - fixture.clj (idiomatic hand-written form), or
  //   - the emitter output for a non-shortcoming fixture (a real program)
  // Shortcoming fixtures without fixture.clj produce comments-only emitter
  // output which is not worth round-tripping.
  const showSectionB = !!fixture.clj || !fixture.shortcoming;
  const cljStart = fixture.clj ?? clj;
  const { treeNodes: g3, edges: e3, errors: errs3 } = showSectionB
    ? spikeToGraph(cljStart)
    : { treeNodes: [], edges: [], errors: [] };
  const reClj = errs3.length === 0 && showSectionB ? graphToSpike(g3, e3) : null;
  // Eval comparison: run each example against original and round-tripped CLJ
  type EvalExample = {
    inputs: Record<string, number>;
    origResult: unknown;
    rtResult: unknown;
    match: boolean;
    origError?: string;
    rtError?: string;
  };
  const evalExamples: EvalExample[] = [];
  if (fixture.examples && fixture.evalFns && showSectionB && reClj !== null) {
    const fns = numericEnv(fixture.evalFns);
    for (const ex of fixture.examples) {
      let origResult: unknown = null;
      let rtResult: unknown = null;
      let origError: string | undefined;
      let rtError: string | undefined;
      try {
        origResult = evaluateSpike(cljStart, ex.inputs, fns);
      } catch (e) {
        origError = String(e);
      }
      try {
        rtResult = evaluateSpike(reClj, ex.inputs, fns);
      } catch (e) {
        rtError = String(e);
      }
      const match = !origError && !rtError &&
        JSON.stringify(origResult) === JSON.stringify(rtResult);
      evalExamples.push({ inputs: ex.inputs, origResult, rtResult, match, origError, rtError });
    }
  }

  // Check: graph stability (clj→graph is used as normalisation; round-trip
  // parse→emit→parse must give the same graph).
  const cljMatch = showSectionB &&
    errs3.length === 0 &&
    reClj !== null &&
    (() => {
      const { treeNodes: t2, edges: e2, errors: err2 } = spikeToGraph(reClj);
      return err2.length === 0 && stableGraphJson(t2, e2) === stableGraphJson(g3, e3);
    })();

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

      {/* Section B: clj → graph → clj (omitted for shortcomings without idiomatic form) */}
      {showSectionB
        ? (
          <>
            <div style={SECTION_LABEL}>
              clj → graph → clj &nbsp; <Badge ok={cljMatch} />
              {errs3.length > 0 && (
                <span style="color:#f85149; margin-left:8px;">
                  parse errors: {errs3.join("; ")}
                </span>
              )}
            </div>
            {evalExamples.length > 0 && (
              <div style="padding:8px 14px; border-top:1px solid #21262d20;">
                <div style="font-size:10px; color:#444; text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px;">
                  eval &nbsp;
                  {fixture.evalShortcoming
                    ? (
                      <span style="background:#2a1f00; color:#d29922; font-size:11px; padding:2px 7px; border-radius:4px; letter-spacing:0; text-transform:none;">
                        ⚠ known shortcoming
                      </span>
                    )
                    : evalExamples.every((e) => e.match)
                    ? (
                      <span style="background:#1a3a1a; color:#56d364; font-size:11px; padding:2px 7px; border-radius:4px; letter-spacing:0; text-transform:none;">
                        ✓ results match
                      </span>
                    )
                    : (
                      <span style="background:#3a1a1a; color:#f85149; font-size:11px; padding:2px 7px; border-radius:4px; letter-spacing:0; text-transform:none;">
                        ✗ results differ
                      </span>
                    )}
                </div>
                <table style="font-size:11px; border-collapse:collapse; width:100%;">
                  <thead>
                    <tr style="color:#555;">
                      <th style="text-align:left; padding:2px 8px 4px 0; font-weight:normal;">
                        inputs
                      </th>
                      <th style="text-align:left; padding:2px 8px 4px 0; font-weight:normal;">
                        orig
                      </th>
                      <th style="text-align:left; padding:2px 8px 4px 0; font-weight:normal;">
                        round-trip
                      </th>
                      <th style="text-align:left; padding:2px 0 4px 0; font-weight:normal;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {evalExamples.map((e, i) => (
                      <tr key={i} style="color:#adbac7;">
                        <td style="padding:2px 8px 2px 0; font-family:monospace;">
                          {JSON.stringify(e.inputs)}
                        </td>
                        <td style="padding:2px 8px 2px 0; font-family:monospace;">
                          {e.origError
                            ? <span style="color:#f85149;">{e.origError}</span>
                            : JSON.stringify(e.origResult)}
                        </td>
                        <td style="padding:2px 8px 2px 0; font-family:monospace;">
                          {e.rtError
                            ? <span style="color:#f85149;">{e.rtError}</span>
                            : JSON.stringify(e.rtResult)}
                        </td>
                        <td style="padding:2px 0;">
                          {e.match
                            ? <span style="color:#56d364;">✓</span>
                            : <span style="color:#f85149;">✗</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {fixture.evalShortcoming && (
                  <div style="font-size:10px; color:#555; margin-top:4px; font-style:italic;">
                    {fixture.evalShortcoming}
                  </div>
                )}
              </div>
            )}
            <div style={SECTION_GRID}>
              <div>
                <div style={PANEL_LABEL}>① clj</div>
                <Highlighted src={cljStart} />
              </div>
              <Arrow />
              <div>
                <div style={PANEL_LABEL}>② graph</div>
                {errs3.length === 0
                  ? <pre style={GRAPH_SCROLL}>{graphJson(g3, e3)}</pre>
                  : <pre style={GRAPH_SCROLL + " color:#f85149;"}>parse failed</pre>}
              </div>
              <Arrow />
              <div>
                <div style={PANEL_LABEL}>③ clj</div>
                {reClj !== null
                  ? <Highlighted src={reClj} />
                  : (
                    <pre style="background:#0d1117; color:#f85149; padding:10px 12px; border-radius:6px; font-size:12px; margin:0;">
                      parse failed
                    </pre>
                  )}
              </div>
            </div>
          </>
        )
        : (
          <div style={SECTION_LABEL + " color:#555;"}>
            clj → graph → clj — no idiomatic form (emitter shortcoming)
          </div>
        )}
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

// ---------------------------------------------------------------------------
// New stories: validity states, canonical format, paredit ops, mode switcher
// ---------------------------------------------------------------------------

import { computeValidity } from "../components/code-panel.tsx";
import { defaultTreeNodes } from "../workspace.ts";

// ---------------------------------------------------------------------------
// ValidityStates — shows all three dot states side by side
// ---------------------------------------------------------------------------

const VALID_APPLIED_CODE = `(def acme-backend
  [auth-service
   frontend])`;

const VALID_UNAPPLIED_CODE = `(def acme-backend
  [auth-service
   frontend
   new-service])`;

const INVALID_CODE = `(defn broken [x]
  (let [a (A x]
    a))`;

export function ValidityStates() {
  const base = defaultState();
  const rootNodeId = base.tabs[0].rootNodeId;
  const ws: WorkspaceState = { ...base, treeNodes: defaultTreeNodes(rootNodeId), edges: [] };

  const vApplied = computeValidity(
    VALID_APPLIED_CODE,
    undefined,
    undefined,
    ws.treeNodes,
    ws.edges,
  );
  const vUnapplied = computeValidity(
    VALID_UNAPPLIED_CODE,
    undefined,
    undefined,
    ws.treeNodes,
    ws.edges,
  );
  const vInvalid = computeValidity(INVALID_CODE, undefined, undefined, ws.treeNodes, ws.edges);

  const DOT = (state: string) => {
    const color = state === "valid-applied"
      ? "#56d364"
      : state === "valid-unapplied"
      ? "#d29922"
      : "#f85149";
    return (
      <div style={`display:flex; align-items:center; gap:8px; padding:8px 0;`}>
        <div style={`width:10px;height:10px;border-radius:50%;background:${color};`} />
        <span style="font-size:12px; color:#adb5bd;">{state}</span>
      </div>
    );
  };

  return (
    <div style="background:#0d1117; padding:24px; font-family:monospace; color:#e0e0e0; min-height:200px;">
      <div style="font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#555; margin-bottom:12px;">
        Validity states
      </div>
      {DOT(vApplied.state)}
      {DOT(vUnapplied.state)}
      {DOT(vInvalid.state)}
      <div style="margin-top:16px; font-size:11px; color:#555;">
        These dots appear in the code panel title bar as you type.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CanonicalFormat — shows before/after canonical normalisation
// ---------------------------------------------------------------------------

export function CanonicalFormat() {
  const NON_CANONICAL = `(defn pipeline   [input]
  (let [a   (A input)
        b (B a)] (C b)))`;

  const { treeNodes, edges } = spikeToGraph(NON_CANONICAL);
  const canonical = graphToSpike(treeNodes, edges);
  const stable = spikeToGraph(canonical);
  const reCanonical = graphToSpike(stable.treeNodes, stable.edges);

  return (
    <div style="background:#0d1117; padding:24px; font-family:monospace; display:flex; gap:24px; flex-wrap:wrap;">
      <div style="flex:1; min-width:280px;">
        <div style="font-size:10px; text-transform:uppercase; color:#555; margin-bottom:6px;">
          Before apply (user typed)
        </div>
        <pre style="background:#161b22; color:#adbac7; padding:12px; border-radius:6px; font-size:11px; line-height:1.6; white-space:pre-wrap; margin:0;">
          {NON_CANONICAL}
        </pre>
      </div>
      <div style="flex:1; min-width:280px;">
        <div style="font-size:10px; text-transform:uppercase; color:#555; margin-bottom:6px;">
          After apply (canonical form)
        </div>
        <pre style="background:#161b22; color:#56d364; padding:12px; border-radius:6px; font-size:11px; line-height:1.6; white-space:pre-wrap; margin:0;">
          {canonical}
        </pre>
      </div>
      <div style="width:100%; font-size:11px; color:#555; padding-top:4px;">
        Stable: {canonical === reCanonical ? "✓ canonical form is stable" : "✗ not stable"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PareditOps — interactive demo panel with a "default" mode code snippet
// ---------------------------------------------------------------------------

export function PareditOps() {
  return (
    <PanelWithCode
      code={`; Paredit mode active — try these keybindings:
; (  →  auto-closes as ()
; Enter inside a form  →  auto-indents
; Ctrl+K  →  kill to end of form
; Ctrl+D  →  kill expression at cursor
; Alt+Right / Alt+Left  →  navigate by expression
; Cmd+Shift+]  →  forward slurp
; Cmd+Shift+[  →  forward barf

(defn pipeline [input]
  (let [a (A input)
        b (B a)]
    (C b)))`}
    />
  );
}

// ---------------------------------------------------------------------------
// ModeSwitcher — shows the mode chip in the panel title bar
// ---------------------------------------------------------------------------

export function ModeSwitcher() {
  return (
    <PanelWithCode
      code={`; The mode chip in the title bar cycles between:
;   paredit  →  structural editing keybindings active
;   default  →  plain textarea, no structural editing

(def my-graph [A B C])`}
    />
  );
}
