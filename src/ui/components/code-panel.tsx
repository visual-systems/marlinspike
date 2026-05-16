/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import { findNode, findParentOf, updateNodeInTree } from "@marlinspike/graph";
import {
  type Panel,
  PANEL_DEFAULT_WIDTH,
  PANEL_MIN_WIDTH,
  type Updater,
  withNodeMutation,
  withPanel,
  type WorkspaceState,
} from "../workspace.ts";
import { graphToSpike } from "../../code/spike-clojure.ts";
import { emitWorkspace, parseWorkspace } from "../../code/workspace-codec.ts";
import { Dropdown } from "./dropdown.tsx";
import { IconBtn } from "./widgets.tsx";
import { TOKEN_COLORS, tokenise, tokeniseJson } from "../lib/spike-tokenise.ts";
import type { EditorContext } from "../lib/editor-modes/types.ts";
import {
  defaultMode,
  type EditorModeId,
  MODE_LABELS,
  nextModeId,
} from "../lib/editor-modes/types.ts";
import { pareditMode } from "../lib/editor-modes/paredit.ts";

// ---------------------------------------------------------------------------
// Language registry
// ---------------------------------------------------------------------------

const LANGUAGES: { value: string; label: string }[] = [
  { value: "spike-clojure", label: "Spike-Clojure" },
];

// ---------------------------------------------------------------------------
// Validity state
// ---------------------------------------------------------------------------

export type ValidityState =
  | { state: "valid-applied" }
  | { state: "valid-unapplied" }
  | { state: "invalid"; error: string };

/** Pure function — compute validity of `text` against the current workspace. */
export function computeValidity(
  text: string,
  codeEntityId: string | undefined,
  codeEntityKind: "node" | "edge" | undefined,
  ws: WorkspaceState,
): ValidityState {
  if (codeEntityId && codeEntityKind === "node") {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const node = findNode(ws.treeNodes, codeEntityId);
      if (JSON.stringify(parsed) === JSON.stringify(node?.data ?? {})) {
        return { state: "valid-applied" };
      }
      return { state: "valid-unapplied" };
    } catch (err) {
      return { state: "invalid", error: String(err) };
    }
  }
  if (codeEntityId && codeEntityKind === "edge") {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const edge = ws.edges.find((e) => e.id === codeEntityId);
      if (JSON.stringify(parsed) === JSON.stringify(edge?.data ?? {})) {
        return { state: "valid-applied" };
      }
      return { state: "valid-unapplied" };
    } catch (err) {
      return { state: "invalid", error: String(err) };
    }
  }
  // Full-graph mode: parse and re-wrap so both sides canonicalise the same way,
  // then compare against the actual workspace in its always-wrapped form.
  const { treeNodes: parsedTree, edges: parsedEdges, errors } = parseWorkspace(text, ws);
  if (errors.length > 0) return { state: "invalid", error: errors.join("; ") };
  const parsedCanonical = graphToSpike(parsedTree, parsedEdges);
  const wsCanonical = graphToSpike(ws.treeNodes, ws.edges);
  if (parsedCanonical === wsCanonical) return { state: "valid-applied" };
  return { state: "valid-unapplied" };
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

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

/** Escape special regex characters in a string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Search `treeNodes` recursively for a node whose label equals `label`. Returns its id or null. */
function findNodeIdByLabel(
  nodes: WorkspaceState["treeNodes"],
  label: string,
): string | null {
  for (const n of nodes) {
    if (n.label === label) return n.id;
    const found = findNodeIdByLabel(n.children, label);
    if (found) return found;
  }
  return null;
}

/**
 * Scroll a textarea element so that the character at `charPos` is approximately
 * centred vertically. Uses an approximation based on newline count and font metrics.
 */
function scrollTextareaToPos(
  el: HTMLTextAreaElement,
  charPos: number,
  fontSizePx: number,
  lineHeight: number,
) {
  const linesAbove = (el.value.slice(0, charPos).match(/\n/g) ?? []).length;
  const lineH = fontSizePx * lineHeight;
  const target = linesAbove * lineH - el.clientHeight / 2 + lineH;
  el.scrollTop = Math.max(0, target);
}

/**
 * Given a cursor position in `text` and a tokenised stream (with cumulative offsets),
 * return the text of the identifier token (kind === null, non-whitespace) at that position,
 * or null if the cursor is not on an identifier.
 */
function identifierAtPos(text: string, pos: number): string | null {
  const tokens = tokenise(text);
  let offset = 0;
  for (const tok of tokens) {
    const end = offset + tok.text.length;
    if (offset <= pos && pos < end) {
      // Found the token containing the cursor
      if (tok.kind === null && /\S/.test(tok.text)) return tok.text;
      return null;
    }
    offset = end;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const FONT = "'SF Mono', 'Fira Code', 'Cascadia Code', monospace";
const FONT_SIZE_PX = 11;
const FONT_SIZE = `${FONT_SIZE_PX}px`;
const LINE_HEIGHT_RATIO = 1.6;
const LINE_HEIGHT = `${LINE_HEIGHT_RATIO}`;
const PADDING = "8px 10px";

const VALIDITY_DOT: Record<string, string> = {
  "valid-applied": "#2a4a3a",
  "valid-unapplied": "#7a5a10",
  "invalid": "#7a1a1a",
};

const VALIDITY_TITLE: Record<string, string> = {
  "valid-applied": "In sync with canvas",
  "valid-unapplied": "Valid — not yet applied to canvas",
  "invalid": "Parse error",
};

// ---------------------------------------------------------------------------
// CodePanel
// ---------------------------------------------------------------------------

export function CodePanel(
  { panel, ws, update }: {
    panel: Panel;
    ws: WorkspaceState;
    update: Updater;
  },
) {
  const lang = panel.codeLanguage ?? "spike-clojure";
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const [validity, setValidity] = useState<ValidityState>({ state: "valid-applied" });
  const [displayCode, setDisplayCode] = useState("");
  const [modeId, setModeId] = useState<EditorModeId>("paredit");
  const activeMode = modeId === "paredit" ? pareditMode : defaultMode;

  // B1/B2: suppress cross-highlight feedback loop during programmatic selections
  const suppressCanvasSyncRef = useRef(false);
  // B1: track which node id was last highlighted to avoid redundant work
  const lastHighlightedIdRef = useRef<string | null>(null);

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
    return emitWorkspace(s);
  }

  function applyCode(code: string) {
    const el = textareaRef.current;
    const { codeEntityId, codeEntityKind } = panel;

    if (codeEntityId && codeEntityKind === "node") {
      try {
        const data = JSON.parse(code) as Record<string, unknown>;
        const formatted = JSON.stringify(data, null, 2);
        if (el) {
          el.value = formatted;
          setDisplayCode(formatted);
        }
        setValidity({ state: "valid-applied" });
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
      } catch (err) {
        setValidity({ state: "invalid", error: String(err) });
      }
      return;
    }
    if (codeEntityId && codeEntityKind === "edge") {
      try {
        const data = JSON.parse(code) as Record<string, unknown>;
        const formatted = JSON.stringify(data, null, 2);
        if (el) {
          el.value = formatted;
          setDisplayCode(formatted);
        }
        setValidity({ state: "valid-applied" });
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
      } catch (err) {
        setValidity({ state: "invalid", error: String(err) });
      }
      return;
    }

    // Full-graph mode — parse and re-wrap in the workspace root so the tab's
    // rootNodeId and any root-level constraints remain stable.
    const { treeNodes, edges, errors } = parseWorkspace(code, ws);
    if (errors.length > 0) {
      setValidity({ state: "invalid", error: errors.join("; ") });
      return;
    }
    // Canonical formatting: re-derive using the same focus-aware emit used by
    // deriveDoc, so what lands in the textarea matches what the view shows.
    update((s) => {
      const nextExpanded = s.canvasExpandedNodes.filter((id) => findNode(treeNodes, id) !== null);
      const focusStillValid = s.focusId ? findNode(treeNodes, s.focusId) !== null : true;
      const nextState: WorkspaceState = {
        ...s,
        treeNodes,
        edges,
        canvasExpandedNodes: nextExpanded,
        focusId: focusStillValid ? s.focusId : null,
      };
      const canonical = emitWorkspace(nextState);
      if (el) {
        el.value = canonical;
        setDisplayCode(canonical);
      }
      return nextState;
    });
    setValidity({ state: "valid-applied" });
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
    // Live validity check
    setValidity(
      computeValidity(value, panel.codeEntityId, panel.codeEntityKind, ws),
    );
  }

  function handleKeyDown(e: KeyboardEvent) {
    const el = e.currentTarget as HTMLTextAreaElement;
    // Cmd/Ctrl+Enter: apply code — handled before mode so mode can't block it
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      applyCode(el.value);
      return;
    }
    // Delegate to active editor mode
    const editorCtx: EditorContext = {
      el,
      text: el.value,
      cursor: el.selectionStart,
      selectionEnd: el.selectionEnd,
      applyText(newText: string, newCursor: number) {
        el.value = newText;
        el.setSelectionRange(newCursor, newCursor);
        // Dispatch input event so React state (displayCode, validity) stays in sync
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
    };
    activeMode.keyDown(e, editorCtx);
  }

  /** B2: update canvasSelected when cursor moves over a node name. */
  function handleCursorMove(e: Event) {
    if (suppressCanvasSyncRef.current || panel.codeEntityId) return;
    const el = e.currentTarget as HTMLTextAreaElement;
    const pos = el.selectionStart;
    const label = identifierAtPos(el.value, pos);
    if (!label) return;
    const nodeId = findNodeIdByLabel(ws.treeNodes, label);
    if (!nodeId) return;
    if (ws.canvasSelected?.type === "node" && ws.canvasSelected.id === nodeId) return;
    update((s) => ({ ...s, canvasSelected: { type: "node" as const, id: nodeId } }));
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
    setValidity({ state: "valid-applied" });
  }, [ws.treeNodes, ws.edges, ws.focusId, ws.entityDrafts, lang]);

  // B1: canvas selection → scroll + highlight in code panel
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || panel.codeEntityId) return; // full-graph mode only
    if (ws.canvasSelected?.type !== "node") return;
    const nodeId = ws.canvasSelected.id;
    if (nodeId === lastHighlightedIdRef.current) return;
    if (document.activeElement === el) return; // don't interrupt typing
    lastHighlightedIdRef.current = nodeId;

    const node = findNode(ws.treeNodes, nodeId);
    if (!node) return;

    const label = node.label;
    const text = el.value;

    // Prefer a (def label …) or (defn label …) occurrence over bare references
    const defnRe = new RegExp(`\\((?:def|defn)\\s+(${escapeRegex(label)})\\b`);
    const plainRe = new RegExp(`\\b${escapeRegex(label)}\\b`);
    let charPos: number | null = null;
    const defnMatch = defnRe.exec(text);
    if (defnMatch) {
      charPos = defnMatch.index + defnMatch[0].indexOf(label);
    } else {
      const plainMatch = plainRe.exec(text);
      if (plainMatch) charPos = plainMatch.index;
    }
    if (charPos === null) return;

    suppressCanvasSyncRef.current = true;
    el.setSelectionRange(charPos, charPos + label.length);
    scrollTextareaToPos(el, charPos, FONT_SIZE_PX, LINE_HEIGHT_RATIO);
    syncScroll();
    setTimeout(() => {
      suppressCanvasSyncRef.current = false;
    }, 50);
  }, [ws.canvasSelected]);

  function closePanel() {
    update((s) => ({
      ...s,
      panels: s.panels.filter((p) => p.id !== panel.id),
    }));
  }

  function setLanguage(value: string) {
    update((s) => withPanel(s, panel.id, (p) => ({ ...p, codeLanguage: value })));
  }

  const effectiveLang = panel.codeEntityId ? "json" : lang;
  const tokens = effectiveLang === "json" ? tokeniseJson(displayCode) : tokenise(displayCode);

  const dotColor = VALIDITY_DOT[validity.state] ?? "#3a3a5a";
  const dotTitle = validity.state === "invalid"
    ? `Parse error: ${(validity as { state: "invalid"; error: string }).error}`
    : VALIDITY_TITLE[validity.state] ?? "";
  const canApply = validity.state === "valid-unapplied";

  return (
    <div
      style={`display:flex; flex-direction:column; width:${
        panel.width ?? PANEL_DEFAULT_WIDTH[panel.type]
      }px; min-width:${
        PANEL_MIN_WIDTH[panel.type]
      }px; flex-shrink:0; background:#0d1117; overflow:hidden; height:100%;`}
    >
      {/* Title bar */}
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a; flex-shrink:0;">
        <span>{panelTitle(ws, panel)}</span>
        <div style="display:flex; gap:4px; align-items:center;">
          {/* Validity dot */}
          <div
            title={dotTitle}
            style={`width:8px; height:8px; border-radius:50%; background:${dotColor}; flex-shrink:0; cursor:default;`}
          />
          {/* Apply button */}
          <button
            type="button"
            title={canApply
              ? "Apply to canvas (⌘Enter)"
              : validity.state === "invalid"
              ? "Fix parse errors first"
              : "Already applied"}
            disabled={!canApply}
            onClick={() => {
              const el = textareaRef.current;
              if (el) applyCode(el.value);
            }}
            style={`background:none; border:1px solid ${
              canApply ? "#3a6a3a" : "#2a2a3a"
            }; border-radius:3px; color:${canApply ? "#56d364" : "#444"}; font-size:11px; cursor:${
              canApply ? "pointer" : "default"
            }; padding:1px 5px; line-height:1; flex-shrink:0;`}
          >
            ✓
          </button>
          {/* Mode chip — only shown for code (not entity/JSON) panels */}
          {!panel.codeEntityId && (
            <button
              type="button"
              title={`${MODE_LABELS[modeId]} mode\n${
                (activeMode.keybindings ?? []).map(([k, d]) => `${k}  ${d}`).join("\n")
              }\n\nClick to cycle.`}
              onClick={() => setModeId(nextModeId(modeId))}
              style="background:none; border:1px solid #252538; border-radius:3px; color:#404466; font-size:10px; cursor:pointer; padding:1px 5px; letter-spacing:0.04em; flex-shrink:0; text-transform:none; font-weight:normal;"
            >
              {MODE_LABELS[modeId]}
            </button>
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
          onKeyUp={handleCursorMove}
          onMouseUp={handleCursorMove}
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
      {validity.state === "invalid" && (
        <div style="flex-shrink:0; padding:6px 10px; background:#2a0a0a; border-top:1px solid #5a1a1a; color:#f08080; font-size:11px; font-family:monospace; white-space:pre-wrap;">
          {(validity as { state: "invalid"; error: string }).error}
        </div>
      )}
    </div>
  );
}
