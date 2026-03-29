/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import {
  type Panel,
  type Tab,
  type Updater,
  withPanel,
  type WorkspaceState,
} from "../workspace.ts";
import { graphToSpike, spikeToGraph } from "../../code/spike-clojure.ts";
import { Dropdown } from "./dropdown.tsx";
import { IconBtn } from "./widgets.tsx";

// ---------------------------------------------------------------------------
// Spike-Clojure tokeniser
// ---------------------------------------------------------------------------

type TokenKind = "comment" | "string" | "atom" | "typeName" | "keyword" | "number" | "bracket";

const TOKEN_COLORS: Record<TokenKind, string> = {
  comment: "#6272a4",
  string: "#f1fa8c",
  atom: "#bd93f9",
  typeName: "#8be9fd",
  keyword: "#ff79c6",
  number: "#bd93f9",
  bracket: "#f8f8f2",
};

type Token = { text: string; kind: TokenKind | null };

function tokenise(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < code.length) {
    // whitespace / commas (EDN treats commas as whitespace)
    if (/[\s,]/.test(code[i])) {
      let j = i + 1;
      while (j < code.length && /[\s,]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), kind: null });
      i = j;
      continue;
    }
    // line comment
    if (code[i] === ";") {
      let j = i;
      while (j < code.length && code[j] !== "\n") j++;
      tokens.push({ text: code.slice(i, j), kind: "comment" });
      i = j;
      continue;
    }
    // string literal
    if (code[i] === '"') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\" && j + 1 < code.length) {
          j += 2;
          continue;
        }
        if (code[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ text: code.slice(i, j), kind: "string" });
      i = j;
      continue;
    }
    // keyword :foo
    if (code[i] === ":") {
      let j = i + 1;
      while (j < code.length && !/[\s,()[\]{}"`;]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), kind: "atom" });
      i = j;
      continue;
    }
    // tagged literal #tag
    if (code[i] === "#") {
      let j = i + 1;
      while (j < code.length && !/[\s,()[\]{}"`;]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), kind: "typeName" });
      i = j;
      continue;
    }
    // brackets
    if ("()[]{}".includes(code[i])) {
      tokens.push({ text: code[i], kind: "bracket" });
      i++;
      continue;
    }
    // symbol / number / special form
    let j = i + 1;
    while (j < code.length && !/[\s,()[\]{}"`;]/.test(code[j])) j++;
    const word = code.slice(i, j);
    let kind: TokenKind | null = null;
    if (/^-?\d/.test(word)) kind = "number";
    else if (["def", "defn", "fn", "let", "do", "if", "when", "case"].includes(word)) {
      kind = "keyword";
    } else if (["nil", "true", "false"].includes(word)) kind = "atom";
    tokens.push({ text: word, kind });
    i = j;
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Language registry
// ---------------------------------------------------------------------------

const LANGUAGES: { value: string; label: string }[] = [
  { value: "spike-clojure", label: "Spike-Clojure" },
];

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

  function applyCode(code: string) {
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
    setDisplayCode((e.currentTarget as HTMLTextAreaElement).value);
    syncScroll();
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
    const doc = graphToSpike(ws.treeNodes, ws.edges);
    el.value = doc;
    setDisplayCode(doc);
  }, []);

  // Sync external workspace changes → editor when it doesn't have focus
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || document.activeElement === el) return;
    const newDoc = graphToSpike(ws.treeNodes, ws.edges);
    if (el.value !== newDoc) {
      el.value = newDoc;
      setDisplayCode(newDoc);
    }
    setParseError(null);
  }, [ws.treeNodes, ws.edges, ws.focusId, lang]);

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

  const tokens = tokenise(displayCode);

  return (
    <div style="display:flex; flex-direction:column; width:600px; min-width:300px; flex-shrink:0; border-right:1px solid #2a2a4a; background:#0d1117; overflow:hidden; height:100%;">
      {/* Title bar */}
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a; flex-shrink:0;">
        <span>Code View</span>
        <div style="display:flex; gap:2px; align-items:center;">
          <IconBtn label="⬡" title="Mirror on canvas" onClick={mirrorOnCanvas} />
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

        {/* Floating language selector */}
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
