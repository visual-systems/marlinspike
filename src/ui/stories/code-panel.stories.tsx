/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import { CodePanel } from "../components/code-panel.tsx";
import { defaultCodePanel, defaultState, type Updater, type WorkspaceState } from "../workspace.ts";

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
