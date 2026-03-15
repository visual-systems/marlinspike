/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import {
  type Constraint,
  type ConstraintApplication,
  type ConstraintTarget,
  findNode,
  getAppliedEntityIds,
  getConstraintsForEntity,
  type Panel,
  type Tab,
  type Updater,
  withApplicationMutation,
  withConstraintMutation,
  withPanel,
  type WorkspaceState,
} from "../workspace.ts";
import type { DiagnosticMap } from "../../graph/diagnostics.ts";
import {
  type DataPropertySchema,
  getConstraintDataSchema,
  registeredConstraintTypes,
} from "../../graph/validate_workspace.ts";
import { Dropdown } from "./dropdown.tsx";
import { IconBtn, PropLabel, SmallBtn } from "./widgets.tsx";
import { InspectorShell } from "./inspector.tsx";

// ---------------------------------------------------------------------------
// ConstraintsPanel
// ---------------------------------------------------------------------------

export function ConstraintsPanel(
  { panel, tab, ws, update, diagnostics }: {
    panel: Panel;
    tab: Tab;
    ws: WorkspaceState;
    update: Updater;
    diagnostics: DiagnosticMap;
  },
) {
  const [localSplit, setLocalSplit] = useState(panel.inspectorSplit);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inspectorElRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const selectedConstraintId = panel.selected?.type === "constraint" ? panel.selected.id : null;
  const selectedConstraint = selectedConstraintId
    ? ws.constraints.find((c) => c.id === selectedConstraintId) ?? null
    : null;
  const hasInspector = selectedConstraint != null;

  function closePanel() {
    update((s) => ({
      ...s,
      canvasSelected: s.canvasSelected?.type === "constraint" ? null : s.canvasSelected,
      tabs: s.tabs.map((t) =>
        t.id === tab.id ? { ...t, panels: t.panels.filter((p) => p.id !== panel.id) } : t
      ),
    }));
  }

  function addConstraint() {
    const id = crypto.randomUUID();
    const uri = `spike://local/constraints/${id}`;
    const newConstraint: Constraint = {
      id,
      label: "New Constraint",
      uri,
      type: "label-required",
      targets: [{ type: "entity", class: "node" }],
      data: {},
      version: 1,
    };
    update((s) => ({
      ...withConstraintMutation(s, (cs) => [...cs, newConstraint]),
      canvasSelected: { type: "constraint", id },
      tabs: s.tabs.map((t) =>
        t.id === tab.id
          ? {
            ...t,
            panels: t.panels.map((p) =>
              p.id === panel.id ? { ...p, selected: { type: "constraint" as const, id } } : p
            ),
          }
          : t
      ),
    }));
  }

  function selectConstraint(id: string) {
    update((s) => ({
      ...s,
      canvasSelected: { type: "constraint", id },
      tabs: s.tabs.map((t) =>
        t.id === tab.id
          ? {
            ...t,
            panels: t.panels.map((p) =>
              p.id === panel.id ? { ...p, selected: { type: "constraint" as const, id } } : p
            ),
          }
          : t
      ),
    }));
  }

  function deleteConstraint(id: string) {
    update((s) => ({
      ...withApplicationMutation(
        withConstraintMutation(s, (cs) => cs.filter((c) => c.id !== id)),
        (apps) => apps.filter((a) => a.constraintId !== id),
      ),
      canvasSelected: s.canvasSelected?.type === "constraint" && s.canvasSelected.id === id
        ? null
        : s.canvasSelected,
      tabs: s.tabs.map((t) => ({
        ...t,
        panels: t.panels.map((p) =>
          p.selected?.type === "constraint" && p.selected.id === id ? { ...p, selected: null } : p
        ),
      })),
    }));
  }

  function handleDividerMouseDown(e: MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startSplit = localSplit;
    const bodyH = bodyRef.current?.offsetHeight ?? 1;

    function onMove(ev: MouseEvent) {
      const delta = startY - ev.clientY;
      const newSplit = Math.max(0.15, Math.min(0.85, startSplit + delta / bodyH));
      if (listRef.current) listRef.current.style.flex = String(1 - newSplit);
      if (inspectorElRef.current) inspectorElRef.current.style.flex = String(newSplit);
    }

    function onUp(ev: MouseEvent) {
      document.removeEventListener("mousemove", onMove as EventListener);
      document.removeEventListener("mouseup", onUp as EventListener);
      const delta = startY - ev.clientY;
      const newSplit = Math.max(0.15, Math.min(0.85, startSplit + delta / bodyH));
      setLocalSplit(newSplit);
      update((s) => withPanel(s, tab.id, panel.id, (p) => ({ ...p, inspectorSplit: newSplit })));
    }

    document.addEventListener("mousemove", onMove as EventListener);
    document.addEventListener("mouseup", onUp as EventListener);
  }

  const listFlex = hasInspector ? 1 - localSplit : 1;

  return (
    <div style="display:flex; flex-direction:column; width:300px; min-width:200px; flex-shrink:0; border-right:1px solid #2a2a4a; background:#14142a; overflow:hidden; height:100%;">
      {/* Header */}
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a; flex-shrink:0;">
        <span>Constraints</span>
        <div style="display:flex; gap:2px; align-items:center;">
          <IconBtn label="+" title="Add constraint" onClick={addConstraint} />
          <IconBtn label="×" title="Close panel" onClick={closePanel} />
        </div>
      </div>

      {/* Body */}
      <div ref={bodyRef} style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
        <div
          ref={listRef}
          style={`flex:${listFlex}; overflow-y:auto; padding:4px 0; min-height:0;`}
        >
          {ws.constraints.length === 0 && (
            <div style="padding:8px 12px; font-size:12px; color:#333; font-style:italic;">
              No constraints. Press + to add one.
            </div>
          )}
          {ws.constraints.map((c) => (
            <ConstraintRow
              key={c.id}
              constraint={c}
              isSelected={c.id === selectedConstraintId}
              diagnosticCount={countDiagnostics(diagnostics, ws.constraintApplications, c.id)}
              onSelect={() => selectConstraint(c.id)}
              onDelete={() => deleteConstraint(c.id)}
            />
          ))}
        </div>

        {hasInspector && selectedConstraint && (
          <>
            <div
              style="height:5px; flex-shrink:0; cursor:ns-resize; background:#2a2a4a; border-top:1px solid #3a3a5a; border-bottom:1px solid #3a3a5a;"
              onMouseDown={handleDividerMouseDown}
            />
            <div
              ref={inspectorElRef}
              style={`flex:${localSplit}; display:flex; flex-direction:column; overflow:hidden; min-height:0;`}
            >
              <ConstraintInspector
                constraint={selectedConstraint}
                panel={panel}
                tab={tab}
                ws={ws}
                update={update}
                diagnostics={diagnostics}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConstraintRow
// ---------------------------------------------------------------------------

function ConstraintRow(
  { constraint, isSelected, diagnosticCount, onSelect, onDelete }: {
    constraint: Constraint;
    isSelected: boolean;
    diagnosticCount: number;
    onSelect: () => void;
    onDelete: () => void;
  },
) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={`display:flex; align-items:center; padding:3px 6px 3px 12px; font-size:13px; user-select:none; ${
        isSelected ? "background:#1e2a4a;" : hovered ? "background:#1a1a38;" : ""
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        style={`flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; ${
          isSelected ? "color:#b0c4ff;" : diagnosticCount > 0 ? "color:#c04040;" : ""
        }`}
        onClick={onSelect}
      >
        {constraint.label}
      </span>
      {diagnosticCount > 0 && (
        <span
          style="font-size:10px; color:#c04040; margin-right:4px; flex-shrink:0; opacity:0.7;"
          title={`${diagnosticCount} violation${diagnosticCount !== 1 ? "s" : ""}`}
        >
          {diagnosticCount}
        </span>
      )}
      {hovered && (
        <IconBtn
          label="×"
          title="Delete constraint"
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConstraintInspector
// ---------------------------------------------------------------------------

function ConstraintInspector(
  { constraint, panel, tab, ws, update, diagnostics }: {
    constraint: Constraint;
    panel: Panel;
    tab: Tab;
    ws: WorkspaceState;
    update: Updater;
    diagnostics: DiagnosticMap;
  },
) {
  const [editingLabel, setEditingLabel] = useState(false);
  const labelInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingLabel) {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    }
  }, [editingLabel]);

  function closeInspector() {
    update((s) => ({
      ...s,
      canvasSelected: s.canvasSelected?.type === "constraint" &&
          s.canvasSelected.id === constraint.id
        ? null
        : s.canvasSelected,
      tabs: s.tabs.map((t) =>
        t.id === tab.id
          ? {
            ...t,
            panels: t.panels.map((p) => p.id === panel.id ? { ...p, selected: null } : p),
          }
          : t
      ),
    }));
  }

  function finishLabelEdit() {
    const val = labelInputRef.current?.value.trim() ?? "";
    update((s) =>
      withConstraintMutation(
        s,
        (cs) =>
          cs.map((c) =>
            c.id === constraint.id ? { ...c, label: val || "Untitled", version: c.version + 1 } : c
          ),
      )
    );
    setEditingLabel(false);
  }

  function changeType(newType: string) {
    update((s) =>
      withConstraintMutation(
        s,
        (cs) =>
          cs.map((c) =>
            c.id === constraint.id ? { ...c, type: newType, data: {}, version: c.version + 1 } : c
          ),
      )
    );
  }

  function deleteConstraint() {
    update((s) => ({
      ...withApplicationMutation(
        withConstraintMutation(s, (cs) => cs.filter((c) => c.id !== constraint.id)),
        (apps) => apps.filter((a) => a.constraintId !== constraint.id),
      ),
      canvasSelected: s.canvasSelected?.type === "constraint" &&
          s.canvasSelected.id === constraint.id
        ? null
        : s.canvasSelected,
      tabs: s.tabs.map((t) => ({
        ...t,
        panels: t.panels.map((p) =>
          p.selected?.type === "constraint" && p.selected.id === constraint.id
            ? { ...p, selected: null }
            : p
        ),
      })),
    }));
  }

  function attachEntity(entityId: string) {
    const id = crypto.randomUUID();
    const newApp: ConstraintApplication = {
      id,
      constraintId: constraint.id,
      entityId,
      version: 1,
    };
    update((s) => withApplicationMutation(s, (apps) => [...apps, newApp]));
  }

  function detachEntity(appId: string) {
    update((s) => withApplicationMutation(s, (apps) => apps.filter((a) => a.id !== appId)));
  }

  const appliedEntityIds = getAppliedEntityIds(ws.constraintApplications, constraint.id);
  const appliedApps = ws.constraintApplications.filter((a) => a.constraintId === constraint.id);

  // Collect all nodes and edges flat, filtering out already-applied ones
  const allEntities: Array<{ id: string; label: string }> = [];
  function collectNodes(nodes: typeof ws.treeNodes) {
    for (const n of nodes) {
      if (!appliedEntityIds.includes(n.id)) allEntities.push({ id: n.id, label: n.label });
      collectNodes(n.children);
    }
  }
  collectNodes(ws.treeNodes);
  for (const e of ws.edges) {
    if (!appliedEntityIds.includes(e.id)) {
      const label = e.label || `${e.fromId} → ${e.toId}`;
      allEntities.push({ id: e.id, label });
    }
  }

  return (
    <InspectorShell title="Constraint" onClose={closeInspector}>
      {/* Editable label */}
      {editingLabel
        ? (
          <input
            ref={labelInputRef}
            style="background:#0f0f22; border:1px solid #4a4a7a; color:#e0e0e0; font-size:14px; font-weight:600; padding:0 4px; border-radius:2px; width:100%;"
            onBlur={finishLabelEdit}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") finishLabelEdit();
              if (e.key === "Escape") setEditingLabel(false);
            }}
          />
        )
        : (
          <div
            style="font-size:14px; font-weight:600; color:#c0c0e0; cursor:text; word-break:break-all;"
            title="Click to rename"
            onClick={() => setEditingLabel(true)}
          >
            {constraint.label}
          </div>
        )}

      {/* Actions */}
      <div style="display:flex; gap:4px; flex-wrap:wrap;">
        <SmallBtn label="Delete" onClick={deleteConstraint} />
      </div>

      {/* Identity */}
      <div style="display:flex; flex-direction:column; gap:1px;">
        <div style="font-size:11px; color:#333; font-family:monospace;">v{constraint.version}</div>
        {constraint.uri && (
          <div
            title="URI (click to copy)"
            style="font-size:11px; color:#333355; font-family:monospace; word-break:break-all; cursor:pointer;"
            onClick={() => navigator.clipboard.writeText(constraint.uri!)}
          >
            {constraint.uri}
          </div>
        )}
      </div>

      {/* Type */}
      <div style="display:flex; flex-direction:column; gap:3px;">
        <PropLabel text="Type" />
        <Dropdown
          items={registeredConstraintTypes().map((t) => ({ value: t, label: t }))}
          selectedValue={constraint.type}
          placeholder="Select type…"
          onSelect={changeType}
          width="fill"
        />
      </div>

      {/* Targets */}
      <div style="display:flex; flex-direction:column; gap:3px;">
        <PropLabel text="Targets" />
        {constraint.targets.length === 0
          ? <div style="font-size:11px; color:#333; font-style:italic;">none declared</div>
          : constraint.targets.map((t, i) => (
            <div key={i} style="font-size:12px; color:#7070a0;">{formatTarget(t)}</div>
          ))}
      </div>

      {/* Applied To */}
      <div style="display:flex; flex-direction:column; gap:4px;">
        <PropLabel text="Applied To" />
        {appliedApps.length === 0 && (
          <div style="font-size:11px; color:#333; font-style:italic;">not applied</div>
        )}
        {appliedApps.map((app) => {
          const entity = findNode(ws.treeNodes, app.entityId) ??
            ws.edges.find((e) => e.id === app.entityId);
          const label = entity ? ("label" in entity ? entity.label : app.entityId) : app.entityId;
          const hasDiags = (diagnostics[app.entityId] ?? []).some((d) => d.code === constraint.id);
          return (
            <div
              key={app.id}
              style={`display:flex; align-items:center; gap:6px; padding:4px 6px; border-radius:3px; font-size:12px; ${
                hasDiags ? "background:#2a1010;" : "background:#13132a;"
              }`}
            >
              <span
                style={`flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; ${
                  hasDiags ? "color:#c04040;" : "color:#7070a0;"
                }`}
              >
                {label}
              </span>
              <IconBtn
                label="×"
                title="Detach"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  detachEntity(app.id);
                }}
              />
            </div>
          );
        })}
        {allEntities.length > 0 && (
          <Dropdown
            items={allEntities.map((e) => ({ value: e.id, label: e.label }))}
            selectedValue={null}
            placeholder="+ Apply to entity…"
            onSelect={attachEntity}
            width="fill"
          />
        )}
      </div>

      {/* Data — schema-driven fields */}
      <ConstraintDataFields constraint={constraint} update={update} />
    </InspectorShell>
  );
}

// ---------------------------------------------------------------------------
// ConstraintDataFields — schema-driven editor for constraint.data
// ---------------------------------------------------------------------------

function ConstraintDataFields(
  { constraint, update }: { constraint: Constraint; update: Updater },
) {
  const schema = getConstraintDataSchema(constraint.type);
  const props = schema?.properties ?? {};
  const entries = Object.entries(props);
  if (entries.length === 0) return null;

  function setField(key: string, value: unknown) {
    update((s) =>
      withConstraintMutation(
        s,
        (cs) =>
          cs.map((c) =>
            c.id === constraint.id
              ? { ...c, data: { ...c.data, [key]: value }, version: c.version + 1 }
              : c
          ),
      )
    );
  }

  return (
    <div style="display:flex; flex-direction:column; gap:6px;">
      <PropLabel text="Data" />
      {entries.map(([key, prop]) => (
        <DataField
          key={key}
          fieldKey={key}
          schema={prop}
          value={constraint.data[key]}
          onChange={(v) => setField(key, v)}
        />
      ))}
    </div>
  );
}

function DataField(
  { fieldKey, schema, value, onChange }: {
    fieldKey: string;
    schema: DataPropertySchema;
    value: unknown;
    onChange: (v: unknown) => void;
  },
) {
  const inputStyle =
    "background:#0f0f22; border:1px solid #2a2a4a; color:#c0c0e0; font-size:12px; padding:3px 6px; border-radius:3px;";
  return (
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="font-size:11px; color:#555; min-width:60px; flex-shrink:0;">{fieldKey}</span>
      {(schema.type === "integer" || schema.type === "number") && (
        <input
          type="number"
          min={schema.minimum}
          value={String(typeof value === "number" ? value : (schema.default ?? 0))}
          style={inputStyle + " width:80px;"}
          onChange={(e: Event) => {
            const v = schema.type === "integer"
              ? parseInt((e.target as HTMLInputElement).value)
              : parseFloat((e.target as HTMLInputElement).value);
            if (
              Number.isFinite(v) &&
              (schema.minimum === undefined || v >= schema.minimum)
            ) onChange(v);
          }}
        />
      )}
      {schema.type === "string" && (
        <input
          type="text"
          value={String(typeof value === "string" ? value : (schema.default ?? ""))}
          style={inputStyle + " flex:1;"}
          onChange={(e: Event) => onChange((e.target as HTMLInputElement).value)}
        />
      )}
      {schema.type === "boolean" && (
        <input
          type="checkbox"
          checked={typeof value === "boolean" ? value : (schema.default ?? false)}
          onChange={(e: Event) => onChange((e.target as HTMLInputElement).checked)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTarget(t: ConstraintTarget): string {
  if (t.type === "entity") return t.class;
  return String(t.type);
}

function countDiagnostics(
  diagnostics: DiagnosticMap,
  apps: ConstraintApplication[],
  constraintId: string,
): number {
  let count = 0;
  for (const app of apps) {
    if (app.constraintId !== constraintId) continue;
    count += (diagnostics[app.entityId] ?? []).filter((d) => d.code === constraintId).length;
  }
  return count;
}

// ---------------------------------------------------------------------------
// ConstraintsAttachedSection — used inside Node/Edge inspectors
// ---------------------------------------------------------------------------

export function ConstraintsAttachedSection(
  { entityId, ws, update }: {
    entityId: string;
    ws: WorkspaceState;
    update: Updater;
  },
) {
  const attached = getConstraintsForEntity(ws.constraintApplications, ws.constraints, entityId);
  const unattached = ws.constraints.filter((c) => !attached.some((a) => a.id === c.id));

  function detach(constraintId: string) {
    update((s) =>
      withApplicationMutation(
        s,
        (apps) => apps.filter((a) => !(a.entityId === entityId && a.constraintId === constraintId)),
      )
    );
  }

  function attach(constraintId: string) {
    const newApp: ConstraintApplication = {
      id: crypto.randomUUID(),
      constraintId,
      entityId,
      version: 1,
    };
    update((s) => withApplicationMutation(s, (apps) => [...apps, newApp]));
  }

  return (
    <div style="display:flex; flex-direction:column; gap:4px;">
      <PropLabel text="Constraints" />
      {attached.length === 0 && (
        <div style="font-size:11px; color:#333; font-style:italic;">none applied</div>
      )}
      {attached.map((c) => (
        <div
          key={c.id}
          style="display:flex; align-items:center; gap:6px; padding:4px 6px; background:#13132a; border-radius:3px; font-size:12px;"
        >
          <span style="flex:1; color:#7070a0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            {c.label}
          </span>
          <IconBtn
            label="×"
            title="Detach constraint"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              detach(c.id);
            }}
          />
        </div>
      ))}
      {unattached.length > 0 && (
        <Dropdown
          items={unattached.map((c) => ({ value: c.id, label: c.label }))}
          selectedValue={null}
          placeholder="+ Apply constraint…"
          onSelect={attach}
          width="fill"
        />
      )}
    </div>
  );
}
