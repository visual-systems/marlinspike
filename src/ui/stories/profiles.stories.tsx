/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";

export const meta = { title: "Profiles & Workspace Focus" };

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface WorkspaceNode {
  id: string;
  label: string;
  nodeCount: number;
}

const WORKSPACES: WorkspaceNode[] = [
  { id: "ws-1", label: "Backend Services", nodeCount: 24 },
  { id: "ws-2", label: "Frontend App", nodeCount: 12 },
  { id: "ws-3", label: "Data Pipeline", nodeCount: 8 },
  { id: "ws-4", label: "Auth System", nodeCount: 15 },
];

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const BAR_STYLE =
  "display:flex; align-items:stretch; height:32px; background:#0a0a1a; border-bottom:1px solid #1a1a2e; font-family:system-ui,sans-serif; color:#777;";

const LABEL_STYLE =
  "font-size:10px; color:#3a3a5a; letter-spacing:0.05em; text-transform:uppercase;";

// ---------------------------------------------------------------------------
// Workspace browser — list view at root focus
// ---------------------------------------------------------------------------

/** **Workspace Browser — list variant.**
 *  When focus is at the profile root, the canvas shows workspace nodes as a
 *  compact list. Good for many workspaces. */
export function WorkspaceBrowser_List() {
  const [activeTab, setActiveTab] = useState("ws-1");
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style="width:900px; font-family:system-ui,sans-serif;">
      <div style={BAR_STYLE}>
        <ProfileSegment />
        <div style="display:flex; align-items:center; gap:4px; flex:1; overflow:hidden; padding:0 8px;">
          {WORKSPACES.map((w) => (
            <TabButton
              key={w.id}
              label={w.label}
              isActive={w.id === activeTab}
              onClick={() => setActiveTab(w.id)}
            />
          ))}
        </div>
      </div>

      {/* Canvas area showing workspace list */}
      <div style="background:#0e0e1e; height:400px; padding:24px; max-width:500px;">
        <div style={`${LABEL_STYLE} margin-bottom:16px;`}>
          All workspaces in Local
        </div>
        {WORKSPACES.map((w) => (
          <div
            key={w.id}
            style={[
              "display:flex; align-items:center; gap:12px; padding:10px 12px; cursor:pointer; border-bottom:1px solid #1a1a2e;",
              w.id === activeTab
                ? "background:#141428; color:#9090c0;"
                : hovered === w.id
                ? "background:#111122; color:#888;"
                : "color:#666;",
            ].join("")}
            onMouseEnter={() => setHovered(w.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => setActiveTab(w.id)}
          >
            <span style="font-size:13px; flex:1;">{w.label}</span>
            <span style="font-size:11px; color:#3a3a5a;">{w.nodeCount} nodes</span>
            {w.id === activeTab && <span style="font-size:10px; color:#4a7;">active</span>}
          </div>
        ))}
        <div
          style={[
            "display:flex; align-items:center; gap:8px; padding:10px 12px; cursor:pointer;",
            hovered === "add" ? "color:#555;" : "color:#2a2a4a;",
          ].join("")}
          onMouseEnter={() => setHovered("add")}
          onMouseLeave={() => setHovered(null)}
        >
          <span style="font-size:16px;">+</span>
          <span style="font-size:12px;">New workspace</span>
        </div>
      </div>

      <AnnotationBox
        lines={[
          "List variant of workspace browser — compact for many workspaces",
          "Could also appear as the canvas content when focus is at root",
          "Shows node count as a quick summary stat",
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Focus navigation: stepping out from a workspace
// ---------------------------------------------------------------------------

/** **Step-out scenario — focused inside workspace, then stepping out.**
 *  Shows the tab bar and controls bar in three states:
 *  1. Focused inside the workspace (normal working state)
 *  2. Stepped out to workspace level (can edit workspace properties)
 *  3. Stepped out to profile root (sees all workspaces as a graph)
 *
 *  The tab label always shows the home workspace. The focus breadcrumb
 *  shows where the camera is. The root is named after the profile ("Local"). */
export function FocusNavigation_StepOut() {
  type FocusLevel = "inside" | "workspace" | "root";
  const [focus, setFocus] = useState<FocusLevel>("inside");

  const focusLabel: Record<FocusLevel, string> = {
    inside: "auth-service",
    workspace: "Backend Services",
    root: "Local",
  };

  const breadcrumb: Record<FocusLevel, string[]> = {
    inside: ["Local", "Backend Services", "auth-service"],
    workspace: ["Local", "Backend Services"],
    root: ["Local"],
  };

  return (
    <div style="width:900px; font-family:system-ui,sans-serif;">
      {/* Workspace bar */}
      <div style={BAR_STYLE}>
        <ProfileSegment />
        <div style="display:flex; align-items:center; gap:4px; flex:1; overflow:hidden; padding:0 8px;">
          <TabButton label="Backend Services" isActive onClick={() => {}} />
          <TabButton label="Frontend App" isActive={false} onClick={() => {}} />
        </div>
      </div>

      {/* Controls bar */}
      <ControlsBar focusLabel={focusLabel[focus]} breadcrumb={breadcrumb[focus]} />

      {/* Canvas area — placeholder sketches showing what each focus level renders */}
      <div style="background:#0e0e1e; height:300px; display:flex; align-items:center; justify-content:center;">
        {focus === "inside" && (
          <div style="text-align:center;">
            <MockNodeRow
              nodes={["token-validator", "session-store", "ingress"]}
              highlight={null}
              square={false}
            />
            <div style="font-size:10px; color:#2a2a4a; margin-top:16px; font-style:italic;">
              story hint: normal working state, nodes inside auth-service
            </div>
          </div>
        )}
        {focus === "workspace" && (
          <div style="text-align:center;">
            <MockNodeRow
              nodes={["api-gateway", "auth-service", "user-service", "db"]}
              highlight={null}
              square={false}
            />
            <div style="font-size:10px; color:#2a2a4a; margin-top:16px; font-style:italic;">
              story hint: workspace children visible, select workspace node in focus dropdown to
              inspect
            </div>
          </div>
        )}
        {focus === "root" && (
          <div style="text-align:center;">
            <MockNodeRow
              nodes={["Backend Services", "Frontend App", "Data Pipeline", "Auth System"]}
              highlight="Backend Services"
              square
              homeId="Backend Services"
            />
            <div style="font-size:10px; color:#2a2a4a; margin-top:16px; font-style:italic;">
              story hint: all workspaces as graph, home workspace has green dot indicator
            </div>
          </div>
        )}
      </div>

      {/* Step controls for the story */}
      <div style="display:flex; gap:8px; padding:12px; background:#08081a; border-top:1px solid #1a1a2e;">
        {(["inside", "workspace", "root"] as FocusLevel[]).map((level) => (
          <button
            key={level}
            type="button"
            style={[
              "font-size:11px; padding:4px 10px; border-radius:3px; cursor:pointer; border:1px solid",
              focus === level
                ? " #3a3a6a; background:#1a1a3a; color:#9090c0;"
                : " #252538; background:none; color:#555;",
            ].join("")}
            onClick={() => setFocus(level)}
          >
            {level === "inside"
              ? "Inside auth-service"
              : level === "workspace"
              ? "Workspace level"
              : "Profile root (Local)"}
          </button>
        ))}
      </div>

      <AnnotationBox
        lines={[
          "Tab label stays 'Backend Services' at all focus levels — it's the tab's home",
          "Root is named after the profile ('Local'), not '(root)'",
          "Focus breadcrumb: Local / Backend Services / auth-service",
          "Stepping out is just focus navigation — no new concepts",
          "At profile root, home workspace is visually emphasised",
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab identity vs focus: the key distinction
// ---------------------------------------------------------------------------

/** **Tab identity is stable — focus is fluid.**
 *  Shows two tabs side by side: one focused inside its workspace, one stepped
 *  out to root. Both retain their home workspace label. Demonstrates that
 *  tabs don't lose identity when the user navigates. */
export function TabIdentity_VsFocus() {
  const [activeTab, setActiveTab] = useState<"be" | "fe">("be");

  // Each tab has independent focus state
  const [beFocus, setBeFocus] = useState<"inside" | "root">("inside");
  const [feFocus, setFeFocus] = useState<"inside" | "root">("root");

  const currentFocus = activeTab === "be" ? beFocus : feFocus;
  const setCurrentFocus = activeTab === "be" ? setBeFocus : setFeFocus;

  return (
    <div style="width:900px; font-family:system-ui,sans-serif;">
      {/* Workspace bar */}
      <div style={BAR_STYLE}>
        <ProfileSegment />
        <div style="display:flex; align-items:center; gap:4px; flex:1; overflow:hidden; padding:0 8px;">
          <TabButton
            label="Backend Services"
            isActive={activeTab === "be"}
            onClick={() => setActiveTab("be")}
          />
          <TabButton
            label="Frontend App"
            isActive={activeTab === "fe"}
            onClick={() => setActiveTab("fe")}
          />
        </div>
      </div>

      {/* Controls bar */}
      <ControlsBar
        focusLabel={currentFocus === "root"
          ? "Local"
          : activeTab === "be"
          ? "Backend Services"
          : "Frontend App"}
        breadcrumb={currentFocus === "root"
          ? ["Local"]
          : ["Local", activeTab === "be" ? "Backend Services" : "Frontend App"]}
      />

      {/* Canvas */}
      <div style="background:#0e0e1e; height:250px; display:flex; align-items:center; justify-content:center;">
        <div style="text-align:center;">
          <div style="font-size:12px; color:#666;">
            {currentFocus === "root"
              ? `Viewing all workspaces (home: ${
                activeTab === "be" ? "Backend Services" : "Frontend App"
              })`
              : `Working inside ${activeTab === "be" ? "Backend Services" : "Frontend App"}`}
          </div>
        </div>
      </div>

      {/* Toggle focus for current tab */}
      <div style="display:flex; gap:8px; padding:12px; background:#08081a; border-top:1px solid #1a1a2e;">
        <span style="font-size:11px; color:#3a3a5a; display:flex; align-items:center;">
          Toggle focus for active tab:
        </span>
        <button
          type="button"
          style={[
            "font-size:11px; padding:4px 10px; border-radius:3px; cursor:pointer; border:1px solid",
            currentFocus === "inside"
              ? " #3a3a6a; background:#1a1a3a; color:#9090c0;"
              : " #252538; background:none; color:#555;",
          ].join("")}
          onClick={() => setCurrentFocus("inside")}
        >
          Inside workspace
        </button>
        <button
          type="button"
          style={[
            "font-size:11px; padding:4px 10px; border-radius:3px; cursor:pointer; border:1px solid",
            currentFocus === "root"
              ? " #3a3a6a; background:#1a1a3a; color:#9090c0;"
              : " #252538; background:none; color:#555;",
          ].join("")}
          onClick={() => setCurrentFocus("root")}
        >
          Profile root (Local)
        </button>
      </div>

      <AnnotationBox
        lines={[
          "Tab labels always show the home workspace name — never changes",
          "Focus position is communicated by the focus breadcrumb, not the tab label",
          "Each tab has independent focus state — switching tabs restores focus position",
          "No special 'overview tab' needed — any tab can step out and come back",
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile root: workspaces as a graph
// ---------------------------------------------------------------------------

/** **All workspaces as a graph at the profile root.**
 *  When focused at the profile root ("Local"), workspace nodes render as
 *  square nodes in a normal graph. Edges are user-created connections
 *  documenting cross-workspace dependencies. The existing entity inspector
 *  shows workspace properties when a node is selected. */
export function ProfileRoot_WorkspaceGraph() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const selectedWs = WORKSPACES.find((w) => w.id === selected);

  // Mock positions for a graph layout
  const positions: Record<string, { x: number; y: number }> = {
    "ws-1": { x: 200, y: 80 },
    "ws-2": { x: 500, y: 60 },
    "ws-3": { x: 140, y: 220 },
    "ws-4": { x: 450, y: 230 },
  };

  // Edges are manually created by the user, like at any other level
  const edges = [
    { from: "ws-2", to: "ws-1", label: "API calls" },
    { from: "ws-1", to: "ws-4", label: "auth delegation" },
    { from: "ws-3", to: "ws-1", label: "data feed" },
  ];

  return (
    <div style="width:900px; font-family:system-ui,sans-serif;">
      {/* Workspace bar — tab is "Backend Services" but focused at profile root */}
      <div style={BAR_STYLE}>
        <ProfileSegment />
        <div style="display:flex; align-items:center; gap:4px; flex:1; overflow:hidden; padding:0 8px;">
          <TabButton label="Backend Services" isActive onClick={() => {}} />
          <TabButton label="Frontend App" isActive={false} onClick={() => {}} />
        </div>
        <div style="display:flex; align-items:center; padding:0 12px; color:#2a2a4a; font-size:12px; font-weight:600; letter-spacing:0.05em;">
          Marlinspike
        </div>
      </div>

      <ControlsBar
        focusLabel="Local"
        breadcrumb={["Local"]}
        homeHint={selected === null ? "Backend Services" : undefined}
      />

      {/* Canvas area + inspector */}
      <div style="display:flex; background:#0e0e1e; height:350px;">
        {/* Canvas — workspace graph */}
        <div style="position:relative; flex:1; overflow:hidden;">
          {/* Edges */}
          <svg style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;">
            {edges.map((e) => {
              const from = positions[e.from];
              const to = positions[e.to];
              const isSelectedEdge = e.from === selected || e.to === selected;
              return (
                <g key={`${e.from}-${e.to}`}>
                  <line
                    x1={from.x + 60}
                    y1={from.y + 30}
                    x2={to.x + 60}
                    y2={to.y + 30}
                    stroke={isSelectedEdge ? "#2a2a5a" : "#1a1a3a"}
                    stroke-width="1"
                  />
                  <text
                    x={(from.x + to.x) / 2 + 60}
                    y={(from.y + to.y) / 2 + 26}
                    fill={isSelectedEdge ? "#3a3a6a" : "#2a2a4a"}
                    font-size="9"
                    text-anchor="middle"
                  >
                    {e.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Workspace nodes — square shape (border-radius:4px, not circular) */}
          {WORKSPACES.map((w) => {
            const pos = positions[w.id];
            const isHome = w.id === "ws-1";
            const isSelected = w.id === selected;
            return (
              <div
                key={w.id}
                style={[
                  `position:absolute; left:${pos.x}px; top:${pos.y}px; width:120px; height:60px;`,
                  "border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer;",
                  isSelected
                    ? "background:#1a1a3a; border:2px solid #5a5a9a;"
                    : hovered === w.id
                    ? "background:#151528; border:2px solid #2a2a4a;"
                    : "background:#12122a; border:2px solid #1a1a2e;",
                ].join("")}
                onMouseEnter={() => setHovered(w.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(w.id === selected ? null : w.id)}
              >
                {/* Home indicator — persistent small dot, independent of selection */}
                {isHome && (
                  <div style="position:absolute; top:4px; right:4px; width:5px; height:5px; border-radius:50%; background:#4a7;" />
                )}
                <div
                  style={`font-size:11px; ${isSelected ? "color:#bbb;" : "color:#777;"}`}
                >
                  {w.label}
                </div>
                <div style="font-size:9px; color:#3a3a5a; margin-top:2px;">
                  {w.nodeCount} nodes
                </div>
              </div>
            );
          })}
        </div>

        {/* Entity inspector — same one used everywhere, shown when a node is selected */}
        {selectedWs && (
          <div style="width:220px; border-left:1px solid #1a1a2e; padding:12px; flex-shrink:0; font-size:12px;">
            <div style={`${LABEL_STYLE} margin-bottom:8px;`}>Entity Inspector</div>
            <div style="font-size:13px; color:#999; font-weight:500; margin-bottom:12px;">
              {selectedWs.label}
            </div>

            <div style="font-size:10px; color:#3a3a5a; margin-bottom:4px;">LABEL</div>
            <div style="font-size:12px; color:#777; margin-bottom:10px; padding:4px 6px; background:#0a0a18; border:1px solid #1a1a2e; border-radius:2px;">
              {selectedWs.label}
            </div>

            <div style="font-size:10px; color:#3a3a5a; margin-bottom:4px;">DATA</div>
            <div style="font-size:11px; color:#555; font-family:ui-monospace,monospace; padding:6px; background:#0a0a18; border:1px solid #1a1a2e; border-radius:2px; margin-bottom:10px; line-height:1.5;">
              <div>nodeCount: {selectedWs.nodeCount}</div>
            </div>

            <div style="font-size:10px; color:#3a3a5a; margin-bottom:4px;">CONSTRAINTS</div>
            <div style="font-size:11px; color:#555; margin-bottom:4px;">
              <span style="color:#4a7;">pass</span> workspace
            </div>
            <div style="font-size:11px; color:#555;">
              <span style="color:#4a7;">pass</span> storage-location
            </div>
          </div>
        )}
      </div>

      <AnnotationBox
        lines={[
          "Profile root ('Local') shows workspaces as square nodes in a normal graph",
          "Square shape is driven by the workspace constraint — not a special UI mode",
          "Edges are manually created by the user to document cross-workspace relationships",
          "The entity inspector (right) is the same one used at every other level",
          "Home workspace has a small green dot (top-right) — persists even when selected",
          "Selection is independent of home — clicking any node selects it normally",
          "When nothing is selected, the focus breadcrumb shows a home hint with green dot",
          "Clicking the home hint in the breadcrumb focuses back into the home workspace",
          "Double-click any workspace to focus into it",
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile add/edit form
// ---------------------------------------------------------------------------

/** **Profile form — add/edit a profile.**
 *  Shows the form fields from the DESIGN.md spec: name, URL, and collapsible
 *  advanced section for namespace/database/credentials. */
export function ProfileForm() {
  const [name, setName] = useState("Staging");
  const [url, setUrl] = useState("wss://staging.acme.com");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [namespace, setNamespace] = useState("marlinspike");
  const [database, setDatabase] = useState("");

  return (
    <div style="width:360px; background:#0d0d1e; border:1px solid #252538; border-radius:4px; padding:20px; font-family:system-ui,sans-serif;">
      <div style="font-size:13px; color:#999; font-weight:500; margin-bottom:16px;">
        Edit Profile
      </div>

      <FormField
        label="Name"
        value={name}
        onChange={setName}
        placeholder="e.g. Local, Work, Staging"
      />
      <FormField
        label="URL"
        value={url}
        onChange={setUrl}
        placeholder="indxdb://... or wss://..."
        mono
      />

      <div
        style="display:flex; align-items:center; gap:4px; padding:8px 0; cursor:pointer; user-select:none;"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        <span style="font-size:10px; color:#3a3a5a;">{showAdvanced ? "\u25be" : "\u25b8"}</span>
        <span style={LABEL_STYLE}>Advanced</span>
      </div>

      {showAdvanced && (
        <div style="padding-left:12px; border-left:1px solid #1a1a2e;">
          <FormField
            label="Namespace"
            value={namespace}
            onChange={setNamespace}
            placeholder="marlinspike"
          />
          <FormField
            label="Database"
            value={database}
            onChange={setDatabase}
            placeholder="(auto)"
          />
          <FormField label="Username" value="" onChange={() => {}} placeholder="(optional)" />
          <FormField
            label="Password"
            value=""
            onChange={() => {}}
            placeholder="(optional)"
            type="password"
          />
        </div>
      )}

      <div style="display:flex; gap:8px; margin-top:16px; justify-content:flex-end;">
        <button
          type="button"
          style="background:none; border:1px solid #252538; color:#666; font-size:11px; padding:5px 12px; border-radius:3px; cursor:pointer;"
        >
          Cancel
        </button>
        <button
          type="button"
          style="background:#1a1a3a; border:1px solid #3a3a6a; color:#9090c0; font-size:11px; padding:5px 12px; border-radius:3px; cursor:pointer;"
        >
          Save
        </button>
      </div>

      <AnnotationBox
        lines={[
          "Profile edit form — name and URL are required",
          "Advanced section collapsed by default (namespace, database, credentials)",
          "URL scheme determines backend: indxdb:// = local, wss:// = remote",
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function TabButton(
  { label, isActive, onClick, badge }: {
    label: string;
    isActive: boolean;
    onClick: () => void;
    badge?: string;
  },
) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={[
        "font-size:11px; padding:4px 10px; cursor:pointer; white-space:nowrap; border-radius:2px; display:flex; align-items:center; gap:4px;",
        isActive
          ? "color:#ddd; background:#1a1a30;"
          : hovered
          ? "color:#888; background:#111122;"
          : "color:#555;",
      ].join("")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {label}
      {badge && <span style="font-size:9px; color:#3a3a5a; font-weight:normal;">{badge}</span>}
    </div>
  );
}

function ProfileSegment() {
  return (
    <div style="display:flex; align-items:center; gap:6px; padding:0 12px; border-right:1px solid #1a1a2e; flex-shrink:0;">
      <div style="width:6px; height:6px; border-radius:50%; background:#4a7;" />
      <span style="font-size:11px; color:#888;">Local</span>
    </div>
  );
}

function ControlsBar(
  { focusLabel, breadcrumb, homeHint }: {
    focusLabel: string;
    breadcrumb: string[];
    homeHint?: string;
  },
) {
  return (
    <div style="display:flex; align-items:center; height:28px; background:#0c0c1e; border-bottom:1px solid #1a1a2e; font-family:system-ui,sans-serif; padding:0 12px;">
      {/* View controls stub */}
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:11px; color:#3a3a5a; border:1px solid #1a1a2e; padding:1px 6px; border-radius:2px;">
          + Tree View
        </span>
      </div>

      {/* Focus breadcrumb — right side (no connected graphs element) */}
      <div style="display:flex; align-items:center; gap:0; margin-left:auto;">
        {breadcrumb.map((level, i) => (
          <span key={level}>
            {i > 0 && <span style="font-size:9px; color:#1a1a2e; padding:0 4px;">/</span>}
            <span
              style={[
                "font-size:11px; cursor:pointer;",
                level === focusLabel ? "color:#9090c0;" : "color:#3a3a5a;",
              ].join("")}
            >
              {level}
            </span>
          </span>
        ))}
        {/* Home workspace hint — shown below focus when at root with nothing selected */}
        {homeHint && (
          <span style="display:flex; align-items:center; gap:4px; margin-left:8px; border-left:1px solid #1a1a2e; padding-left:8px;">
            <div style="width:4px; height:4px; border-radius:50%; background:#4a7;" />
            <span style="font-size:11px; color:#3a3a5a; cursor:pointer;">{homeHint}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function MockNodeRow(
  { nodes, highlight, square, homeId }: {
    nodes: string[];
    highlight: string | null;
    square: boolean;
    homeId?: string;
  },
) {
  return (
    <div style="display:flex; gap:12px; margin-top:16px; justify-content:center;">
      {nodes.map((name) => (
        <div
          key={name}
          style={[
            `position:relative; width:90px; height:44px; ${
              square ? "border-radius:4px;" : "border-radius:22px;"
            } display:flex; align-items:center; justify-content:center; font-size:10px;`,
            name === highlight
              ? "background:#14142e; border:2px solid #3a3a6a; color:#9090c0;"
              : "background:#12122a; border:1px solid #1a1a2e; color:#555;",
          ].join("")}
        >
          {name === homeId && (
            <div style="position:absolute; top:3px; right:3px; width:4px; height:4px; border-radius:50%; background:#4a7;" />
          )}
          {name}
        </div>
      ))}
    </div>
  );
}

function FormField(
  { label, value, onChange, placeholder, mono, type }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    mono?: boolean;
    type?: string;
  },
) {
  return (
    <div style="margin-bottom:10px;">
      <div style={`${LABEL_STYLE} margin-bottom:4px;`}>{label}</div>
      <input
        type={type || "text"}
        value={value}
        onInput={(e: InputEvent) => onChange((e.target as HTMLInputElement).value)}
        placeholder={placeholder}
        style={[
          "width:100%; box-sizing:border-box; background:#0a0a18; border:1px solid #252538; color:#999; font-size:12px; padding:6px 8px; border-radius:3px; outline:none;",
          mono ? " font-family:ui-monospace,monospace;" : "",
        ].join("")}
      />
    </div>
  );
}

function AnnotationBox({ lines }: { lines: string[] }) {
  return (
    <div style="margin-top:12px; padding:12px; background:#0a0a16; border:1px solid #1a1a2e; border-radius:3px; font-family:system-ui,sans-serif;">
      <ul style="margin:0; padding:0 0 0 16px; list-style:disc;">
        {lines.map((line) => (
          <li key={line} style="font-size:11px; color:#555; line-height:1.6;">{line}</li>
        ))}
      </ul>
    </div>
  );
}
