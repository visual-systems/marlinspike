/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import {
  findNode,
  findParentOf,
  type Panel,
  type Tab,
  updateNodeInTree,
  type Updater,
  withNodeMutation,
  withPanel,
  type WorkspaceState,
} from "../workspace.ts";
import { graphToSpike, spikeToGraph } from "../../code/spike-clojure.ts";
import { Dropdown } from "./dropdown.tsx";
import { IconBtn } from "./widgets.tsx";
import { TOKEN_COLORS, tokenise, tokeniseJson } from "../lib/spike-tokenise.ts";

// ---------------------------------------------------------------------------
// Language registry
// ---------------------------------------------------------------------------

const LANGUAGES: { value: string; label: string }[] = [
  { value: "spike-clojure", label: "Spike-Clojure" },
];

function panelTitle(ws: WorkspaceState, panel: Panel): string {
  const { codeEntityId, codeEntityKind } = panel;
  if (!codeEntityId) return "Code View";
  if (codeEntityKind === "node") {
    const node = findNode(ws.treeNodes, codeEntityId);
    if (!node) return "Data";
    const parts = [node.label];
    let cur = codeEntityId;
    while (true) {
      const parent = findParentOf(ws.treeNodes, cur);
      if (!parent) break;
      parts.unshift(parent.label);
      cur = parent.id;
    }
    return "Data: " + parts.join(" / ");
  }
  if (codeEntityKind === "edge") {
    const edge = ws.edges.find((e) => e.id === codeEntityId);
    if (!edge) return "Data";
    const from = findNode(ws.treeNodes, edge.fromId)?.label ?? edge.fromId;
    const to = findNode(ws.treeNodes, edge.toId)?.label ?? edge.toId;
    return `Data: ${from} → ${to}`;
  }
  return "Data";
}

const FONT = "'SF Mono', 'Fira Code', 'Cascadia Code', monospace";
const FONT_SIZE = "11px";
const LINE_HEIGHT = "1.6";
const PADDING = "8px 10px";

// ---------------------------------------------------------------------------
// CodePanel
// ---------------------------------------------------------------------------

export function CodePanel(
  { panel, tab, ws, update }: {
    panel: Panel;
    tab: Tab;
    ws: WorkspaceState;
    update: Updater;
  },
) {
  const lang = panel.codeLanguage ?? "spike-clojure";
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [displayCode, setDisplayCode] = useState("");

  function deriveDoc(s: WorkspaceState): string {
    const { codeEntityId, codeEntityKind } = panel;
    if (codeEntityId) {
      if (s.entityDrafts[codeEntityId] !== undefined) return s.entityDrafts[codeEntityId];
      if (codeEntityKind === "node") {
        const n = findNode(s.treeNodes, codeEntityId);
        return JSON.stringify(n?.data ?? {}, null, 2);
      }
      if (codeEntityKind === "edge") {
        const e = s.edges.find((e) => e.id === codeEntityId);
        return JSON.stringify(e?.data ?? {}, null, 2);
      }
    }
    return graphToSpike(s.treeNodes, s.edges);
  }

  function applyCode(code: string) {
    const { codeEntityId, codeEntityKind } = panel;
    if (codeEntityId && codeEntityKind === "node") {
      try {
        const data = JSON.parse(code) as Record<string, unknown>;
        setParseError(null);
        update((s) => {
          const { [codeEntityId]: _d, ...entityDrafts } = s.entityDrafts;
          return withNodeMutation(
            { ...s, entityDrafts },
            (nodes) =>
              updateNodeInTree(
                nodes,
                codeEntityId,
                (n) => ({ ...n, data, version: n.version + 1 }),
              ),
          );
        });
      } catch {
        setParseError("Invalid JSON");
      }
      return;
    }
    if (codeEntityId && codeEntityKind === "edge") {
      try {
        const data = JSON.parse(code) as Record<string, unknown>;
        setParseError(null);
        update((s) => {
          const { [codeEntityId]: _d, ...entityDrafts } = s.entityDrafts;
          return {
            ...s,
            entityDrafts,
            edges: s.edges.map((e) =>
              e.id === codeEntityId ? { ...e, data, version: e.version + 1 } : e
            ),
          };
        });
      } catch {
        setParseError("Invalid JSON");
      }
      return;
    }
    const { treeNodes, errors } = spikeToGraph(code);
    if (errors.length > 0) {
      setParseError(errors.join("; "));
      return;
    }
    setParseError(null);
    if (treeNodes.length > 0) {
      update((s) => ({
        ...s,
        treeNodes,
        canvasExpandedNodes: s.canvasExpandedNodes.filter((id) =>
          treeNodes.some((n) => n.id === id)
        ),
      }));
    }
  }

  function syncScroll() {
    const ta = textareaRef.current;
    const bd = backdropRef.current;
    if (!ta || !bd) return;
    bd.scrollTop = ta.scrollTop;
    bd.scrollLeft = ta.scrollLeft;
  }

  function handleInput(e: Event) {
    const value = (e.currentTarget as HTMLTextAreaElement).value;
    setDisplayCode(value);
    syncScroll();
    if (panel.codeEntityId) {
      update((s) => ({
        ...s,
        entityDrafts: { ...s.entityDrafts, [panel.codeEntityId!]: value },
      }));
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      applyCode((e.currentTarget as HTMLTextAreaElement).value);
    }
  }

  // Initialise on mount
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const doc = deriveDoc(ws);
    el.value = doc;
    setDisplayCode(doc);
  }, []);

  // Sync external workspace changes → editor when it doesn't have focus
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || document.activeElement === el) return;
    const newDoc = deriveDoc(ws);
    if (el.value !== newDoc) {
      el.value = newDoc;
      setDisplayCode(newDoc);
    }
    setParseError(null);
  }, [ws.treeNodes, ws.edges, ws.focusId, ws.entityDrafts, lang]);

  function mirrorOnCanvas() {
    const ids: string[] = [];
    function collect(nodes: typeof ws.treeNodes) {
      for (const n of nodes) {
        if (n.kind === "composite" && n.children.length > 0) {
          ids.push(n.id);
          collect(n.children);
        }
      }
    }
    collect(ws.treeNodes);
    update((s) => ({ ...s, canvasExpandedNodes: ids }));
  }

  function closePanel() {
    update((s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === tab.id ? { ...t, panels: t.panels.filter((p) => p.id !== panel.id) } : t
      ),
    }));
  }

  function setLanguage(value: string) {
    update((s) => withPanel(s, tab.id, panel.id, (p) => ({ ...p, codeLanguage: value })));
  }

  const effectiveLang = panel.codeEntityId ? "json" : lang;
  const tokens = effectiveLang === "json" ? tokeniseJson(displayCode) : tokenise(displayCode);

  return (
    <div style="display:flex; flex-direction:column; width:600px; min-width:300px; flex-shrink:0; border-right:1px solid #2a2a4a; background:#0d1117; overflow:hidden; height:100%;">
      {/* Title bar */}
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a; flex-shrink:0;">
        <span>{panelTitle(ws, panel)}</span>
        <div style="display:flex; gap:2px; align-items:center;">
          {!panel.codeEntityId && (
            <IconBtn label="⬡" title="Mirror on canvas" onClick={mirrorOnCanvas} />
          )}
          <IconBtn label="×" title="Close panel" onClick={closePanel} />
        </div>
      </div>

      {/* Editor area — highlighted backdrop + transparent textarea */}
      <div style="flex:1; position:relative; min-height:0; overflow:hidden;">
        {/* Backdrop: scrolls in sync with the textarea, pointer-events off */}
        <div
          ref={backdropRef}
          style="position:absolute; inset:0; overflow:hidden; pointer-events:none;"
        >
          <pre
            style={`margin:0; padding:${PADDING}; font-family:${FONT}; font-size:${FONT_SIZE}; line-height:${LINE_HEIGHT}; white-space:pre-wrap; word-break:break-word; color:#f8f8f2;`}
          >
            {tokens.map((t, idx) =>
              t.kind
                ? <span key={idx} style={`color:${TOKEN_COLORS[t.kind]}`}>{t.text}</span>
                : t.text
            )}
            {"\u00a0"}
          </pre>
        </div>

        {/* Transparent textarea sits on top; text invisible, caret visible */}
        <textarea
          ref={textareaRef}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onScroll={syncScroll}
          spellcheck={false}
          style={`position:absolute; inset:0; width:100%; height:100%; box-sizing:border-box; resize:none; border:none; outline:none; background:transparent; color:transparent; caret-color:#cdd6f4; font-family:${FONT}; font-size:${FONT_SIZE}; line-height:${LINE_HEIGHT}; padding:${PADDING}; overflow:auto;`}
        />

        {/* Floating language selector — hidden for entity (JSON) panels */}
        {!panel.codeEntityId && (
          <div style="position:absolute; top:6px; right:8px; display:flex; align-items:center; gap:4px; pointer-events:auto; z-index:1;">
            <span style="font-size:10px; color:#404466; user-select:none;">language</span>
            <Dropdown
              items={LANGUAGES}
              selectedValue={lang}
              placeholder="Language"
              onSelect={setLanguage}
              width={130}
            />
          </div>
        )}
      </div>

      {/* Parse error bar */}
      {parseError && (
        <div style="flex-shrink:0; padding:6px 10px; background:#2a0a0a; border-top:1px solid #5a1a1a; color:#f08080; font-size:11px; font-family:monospace; white-space:pre-wrap;">
          {parseError}
        </div>
      )}
    </div>
  );
}
