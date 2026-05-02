import { Info, Lock, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  lockSubtree,
  moveNodes,
  resizeNode,
  setManualPositioning,
  updateNode,
} from "../../domain/commands/operations";
import type {
  CapabilityColor,
  CapabilityNode,
} from "../../domain/document/types";
import { snapCoordinate } from "../../domain/layout/grid";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { CATEGORY_STYLES } from "../heatmap/resolveNodeFill";

const COLORS: CapabilityColor[] = [
  "mint",
  "sky",
  "coral",
  "amber",
  "lavender",
  "peach",
  "teal",
];

export function Inspector({ readonly = false }: { readonly?: boolean }) {
  const doc = useDocumentStore((state) => state.doc);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setInspectorOpen = useUiStore((state) => state.setInspectorOpen);
  const tab = useUiStore((state) => state.inspectorTab);
  const setTab = useUiStore((state) => state.setInspectorTab);
  const node = selected.length === 1 ? doc.nodesById[selected[0]!] : null;

  return (
    <aside className="cc-inspector">
      <div className="cc-inspector-header">
        <div className="cc-panel-title">
          {readonly ? "Details" : "Inspector"}
        </div>
        <button
          className="cc-icon-btn"
          type="button"
          aria-label="Collapse inspector"
          onClick={() => setInspectorOpen(false)}
        >
          <X />
        </button>
      </div>
      {!readonly && (
        <div className="cc-tabs">
          {(["inspector", "layout", "data"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`cc-tab ${tab === item ? "on" : ""}`}
              onClick={() => setTab(item)}
            >
              {item === "inspector"
                ? "Inspector"
                : item === "layout"
                  ? "Layout"
                  : "Data"}
            </button>
          ))}
        </div>
      )}
      <div className="cc-inspector-body">
        {selected.length > 1 && (
          <MultiSelectionSummary count={selected.length} />
        )}
        {selected.length === 0 && <EmptyInspector />}
        {node && readonly && <ViewerDetails node={node} />}
        {node && !readonly && tab === "inspector" && <Properties node={node} />}
        {node && !readonly && tab === "layout" && (
          <LayoutProperties node={node} />
        )}
        {node && !readonly && tab === "data" && <DataProperties node={node} />}
      </div>
    </aside>
  );
}

function Properties({ node }: { node: CapabilityNode }) {
  const execute = useDocumentStore((state) => state.execute);
  return (
    <>
      <Breadcrumb node={node} />
      <div className="cc-field">
        <label htmlFor="node-label">Label</label>
        <input
          id="node-label"
          className="cc-input"
          value={node.label}
          onChange={(event) =>
            execute(updateNode(node.id, { label: event.target.value }))
          }
        />
      </div>
      <div className="cc-field">
        <label htmlFor="node-description">Description</label>
        <textarea
          id="node-description"
          className="cc-textarea"
          value={node.description ?? ""}
          onChange={(event) =>
            execute(updateNode(node.id, { description: event.target.value }))
          }
          placeholder="Enter description..."
        />
      </div>
      <ColorEditor node={node} />
      <div className="cc-field">
        <label htmlFor="heatmap-value">Heatmap value</label>
        <input
          id="heatmap-value"
          className="cc-input"
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={node.heatmapValue ?? ""}
          onChange={(event) => {
            const value =
              event.target.value === ""
                ? undefined
                : Number(event.target.value);
            execute(updateNode(node.id, { heatmapValue: value }));
          }}
        />
      </div>
      <div className="cc-info-card">
        <Info size={16} />
        <span>
          Manual positioning lets selected children be dragged directly while
          hierarchy validation remains active.
        </span>
      </div>
    </>
  );
}

function LayoutProperties({ node }: { node: CapabilityNode }) {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const snap = (value: number) => snapCoordinate(doc, value);
  return (
    <>
      <div className="cc-field">
        <span className="cc-section-title">Manual positioning</span>
        <div className="cc-seg">
          <button
            className={
              !node.isManualPositioningEnabled && !node.isLockedAsIs ? "on" : ""
            }
            onClick={() => execute(setManualPositioning(node.id, false))}
          >
            Auto layout
          </button>
          <button
            className={node.isManualPositioningEnabled ? "on" : ""}
            onClick={() => execute(setManualPositioning(node.id, true))}
          >
            Manual
          </button>
          <button
            className={node.isLockedAsIs ? "on" : ""}
            onClick={() => execute(lockSubtree(node.id, !node.isLockedAsIs))}
          >
            Locked
          </button>
        </div>
      </div>
      <div className="cc-field-row">
        <NumberField
          key={`x-${node.id}-${node.x}`}
          label="X"
          value={node.x}
          onCommit={(x) => {
            const delta = snap(x) - node.x;
            if (delta !== 0) execute(moveNodes([node.id], delta, 0));
          }}
        />
        <NumberField
          key={`y-${node.id}-${node.y}`}
          label="Y"
          value={node.y}
          onCommit={(y) => {
            const delta = snap(y) - node.y;
            if (delta !== 0) execute(moveNodes([node.id], 0, delta));
          }}
        />
        <NumberField
          key={`w-${node.id}-${node.w}`}
          label="W"
          value={node.w}
          onCommit={(w) => {
            const next =
              doc.settings.gridEnabled && doc.settings.resizeSnapToGrid
                ? snap(node.x + w) - node.x
                : w;
            execute(resizeNode(node.id, Math.max(1, next), node.h));
          }}
        />
        <NumberField
          key={`h-${node.id}-${node.h}`}
          label="H"
          value={node.h}
          onCommit={(h) => {
            const next =
              doc.settings.gridEnabled && doc.settings.resizeSnapToGrid
                ? snap(node.y + h) - node.y
                : h;
            execute(resizeNode(node.id, node.w, Math.max(1, next)));
          }}
        />
      </div>
      <button
        className="cc-btn"
        type="button"
        onClick={() => execute(lockSubtree(node.id, !node.isLockedAsIs))}
      >
        <Lock /> {node.isLockedAsIs ? "Unlock layout" : "Lock layout"}
      </button>
    </>
  );
}

function DataProperties({ node }: { node: CapabilityNode }) {
  const execute = useDocumentStore((state) => state.execute);
  const metadataText = JSON.stringify(node.metadata, null, 2);
  return (
    <>
      <dl className="cc-meta-list">
        <dt>ID</dt>
        <dd>{node.id}</dd>
        <dt>Type</dt>
        <dd>{node.type}</dd>
        <dt>Parent</dt>
        <dd>{node.parentId ?? "Root"}</dd>
        <dt>Updated</dt>
        <dd>{new Date(node.updatedAt).toLocaleString()}</dd>
      </dl>
      <div className="cc-field">
        <label htmlFor="metadata-json">Metadata JSON</label>
        <textarea
          id="metadata-json"
          className="cc-textarea"
          value={metadataText}
          onChange={(event) => {
            try {
              execute(
                updateNode(node.id, {
                  metadata: JSON.parse(event.target.value) as Record<
                    string,
                    unknown
                  >,
                }),
              );
            } catch {
              // Keep the textarea editable while the user is halfway through JSON.
            }
          }}
        />
      </div>
      <button
        className="cc-btn"
        type="button"
        onClick={() =>
          execute(
            updateNode(node.id, {
              metadata: { ...node.metadata, key: "value" },
            }),
          )
        }
      >
        <Plus /> Add metadata
      </button>
    </>
  );
}

function ViewerDetails({ node }: { node: CapabilityNode }) {
  return (
    <>
      <Breadcrumb node={node} />
      <h2 style={{ margin: 0, fontSize: 18 }}>{node.label}</h2>
      <dl className="cc-meta-list">
        <dt>Score</dt>
        <dd>{node.heatmapValue?.toFixed(2) ?? "No value"}</dd>
        <dt>Type</dt>
        <dd>{node.type}</dd>
        <dt>ID</dt>
        <dd>{String(node.metadata.id ?? node.id)}</dd>
        <dt>Status</dt>
        <dd>{String(node.metadata.status ?? "Active")}</dd>
      </dl>
      <div className="cc-field">
        <span className="cc-section-title">Description</span>
        <p style={{ margin: 0, color: "var(--cc-slate-700)", lineHeight: 1.5 }}>
          {node.description ?? "No description provided."}
        </p>
      </div>
      <div className="cc-field">
        <span className="cc-section-title">Metadata</span>
        <dl className="cc-meta-list">
          {Object.entries(node.metadata).map(([key, value]) => (
            <FragmentRow key={key} label={key} value={String(value)} />
          ))}
        </dl>
      </div>
    </>
  );
}

function ColorEditor({ node }: { node: CapabilityNode }) {
  const execute = useDocumentStore((state) => state.execute);
  return (
    <div className="cc-field">
      <span className="cc-section-title">Color</span>
      <div className="cc-color-row">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Set color ${color}`}
            className={`cc-color-swatch ${node.color === color ? "on" : ""}`}
            style={{
              color: CATEGORY_STYLES[color].border,
              background: CATEGORY_STYLES[color].background,
            }}
            onClick={() => execute(updateNode(node.id, { color }))}
          />
        ))}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => String(Math.round(value)));
  useEffect(() => {
    setDraft(String(Math.round(value)));
  }, [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(Math.round(value)));
      return;
    }
    if (parsed === Math.round(value)) return;
    onCommit(parsed);
  };
  return (
    <div className="cc-field">
      <label>{label}</label>
      <input
        className="cc-input"
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            setDraft(String(Math.round(value)));
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function Breadcrumb({ node }: { node: CapabilityNode }) {
  return (
    <div style={{ color: "var(--cc-brand-700)", fontSize: 12 }}>
      {node.parentId ? `${node.parentId} > ` : ""}
      {node.label}
    </div>
  );
}

function EmptyInspector() {
  return (
    <div className="cc-info-card">
      Select a capability to edit its properties.
    </div>
  );
}

function MultiSelectionSummary({ count }: { count: number }) {
  return (
    <div className="cc-info-card">
      {count} selected. Use the floating toolbar or top toolbar for bulk layout
      operations.
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
