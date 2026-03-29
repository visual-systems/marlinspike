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
// Language registry
// ---------------------------------------------------------------------------

const LANGUAGES: { value: string; label: string }[] = [
  { value: "spike-clojure", label: "Spike-Clojure" },
];

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

  function serialize(state: WorkspaceState): string {
    return graphToSpike(state.treeNodes, state.edges);
  }

  const [localCode, setLocalCode] = useState(() => serialize(ws));
  const [parseError, setParseError] = useState<string | null>(null);
  const isFocusedRef = useRef(false);

  // Refresh display when workspace changes externally (only when not actively editing)
  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalCode(serialize(ws));
      setParseError(null);
    }
  }, [ws.treeNodes, ws.edges, ws.focusId, lang]);

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
        // Clear canvas positions/expansion for nodes that no longer exist
        canvasExpandedNodes: s.canvasExpandedNodes.filter((id) =>
          treeNodes.some((n) => n.id === id)
        ),
      }));
    }
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

  return (
    <div style="display:flex; flex-direction:column; width:600px; min-width:300px; flex-shrink:0; border-right:1px solid #2a2a4a; background:#0d1117; overflow:hidden; height:100%;">
      {/* Title bar — matches height of other panel headers */}
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a; flex-shrink:0;">
        <span>Code View</span>
        <IconBtn label="×" title="Close panel" onClick={closePanel} />
      </div>

      {/* Editor area — textarea + floating language control */}
      <div style="flex:1; position:relative; min-height:0;">
        <textarea
          value={localCode}
          onInput={(e: Event) => setLocalCode((e.target as HTMLTextAreaElement).value)}
          onFocus={() => {
            isFocusedRef.current = true;
          }}
          onBlur={() => {
            isFocusedRef.current = false;
          }}
          onKeyDown={(e: KeyboardEvent) => {
            // Cmd+Enter / Ctrl+Enter → apply changes to graph
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              applyCode((e.target as HTMLTextAreaElement).value);
            }
          }}
          style="position:absolute; inset:0; width:100%; height:100%; background:#0d1117; color:#e6edf3; font-family:'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size:11px; line-height:1.6; padding:8px 10px; border:none; resize:none; outline:none; tab-size:2;"
          spellcheck={false as unknown as boolean}
        />
        {/* Floating language selector — top-right of editor, like canvas layout controls */}
        <div style="position:absolute; top:6px; right:8px; display:flex; align-items:center; gap:4px; pointer-events:auto;">
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
