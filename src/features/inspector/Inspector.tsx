import { Info, Lock, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  lockSubtree,
  moveNodes,
  resizeNode,
  setManualPositioning,
  updateNode,
} from "../../domain/commands/operations";
import type {
  CapabilityDocument,
  CapabilityNode,
} from "../../domain/document/types";
import { snapCoordinate } from "../../domain/layout/grid";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { CAPABILITY_COLORS, CATEGORY_STYLES } from "../heatmap/resolveNodeFill";

export function Inspector({
  readonly = false,
  displayDoc,
}: {
  readonly?: boolean;
  displayDoc?: CapabilityDocument;
}) {
  const storeDoc = useDocumentStore((state) => state.doc);
  const doc = displayDoc ?? storeDoc;
  const viewDoc = resolveVisualDocument(doc);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setInspectorOpen = useUiStore((state) => state.setInspectorOpen);
  const tab = useUiStore((state) => state.inspectorTab);
  const setTab = useUiStore((state) => state.setInspectorTab);
  const sourceNode = selected.length === 1 ? doc.nodesById[selected[0]!] : null;
  const viewNode =
    selected.length === 1 ? viewDoc.nodesById[selected[0]!] : null;

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
        {viewNode && readonly && <ViewerDetails node={viewNode} />}
        {sourceNode && !readonly && tab === "inspector" && viewNode && (
          <Properties node={sourceNode} viewNode={viewNode} />
        )}
        {viewNode && !readonly && tab === "layout" && (
          <LayoutProperties node={viewNode} />
        )}
        {sourceNode && !readonly && tab === "data" && (
          <DataProperties node={sourceNode} />
        )}
      </div>
    </aside>
  );
}

function Properties({
  node,
  viewNode,
}: {
  node: CapabilityNode;
  viewNode: CapabilityNode;
}) {
  const execute = useDocumentStore((state) => state.execute);
  return (
    <>
      <Breadcrumb node={node} />
      <div className="cc-field">
        <label htmlFor="node-label">Label</label>
        <CommitTextInput
          id="node-label"
          value={node.label}
          onCommit={(label) => execute(updateNode(node.id, { label }))}
        />
      </div>
      <div className="cc-field">
        <label htmlFor="node-description">Description</label>
        <CommitTextarea
          id="node-description"
          value={node.description ?? ""}
          onCommit={(description) =>
            execute(updateNode(node.id, { description }))
          }
          placeholder="Enter description..."
        />
      </div>
      <ColorEditor node={node} viewNode={viewNode} />
      <div className="cc-field">
        <label htmlFor="heatmap-value">Heatmap value</label>
        <CommitNumberInput
          id="heatmap-value"
          min={0}
          max={1}
          step={0.01}
          value={node.heatmapValue ?? ""}
          onCommit={(heatmapValue) =>
            execute(updateNode(node.id, { heatmapValue }))
          }
        />
      </div>
      <div className="cc-info-card">
        <Info size={16} />
        <span>
          Manual and preserved states control how auto layout treats this
          capability and its descendants.
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
        <span className="cc-section-title">Layout behavior</span>
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
            aria-label="Preserve from auto layout"
            title="Preserve from auto layout"
            onClick={() => execute(lockSubtree(node.id, !node.isLockedAsIs))}
          >
            Preserve
          </button>
        </div>
      </div>
      <div className="cc-info-card">
        <Info size={16} />
        <span>
          Preserved nodes are skipped by auto layout and cannot be resized, but
          can still be moved manually.
        </span>
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
          disabled={node.isLockedAsIs}
          title={
            node.isLockedAsIs
              ? "Preserved nodes cannot be resized."
              : undefined
          }
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
          disabled={node.isLockedAsIs}
          title={
            node.isLockedAsIs
              ? "Preserved nodes cannot be resized."
              : undefined
          }
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
        <Lock />{" "}
        {node.isLockedAsIs
          ? "Stop preserving layout"
          : "Preserve from auto layout"}
      </button>
    </>
  );
}

function DataProperties({ node }: { node: CapabilityNode }) {
  const execute = useDocumentStore((state) => state.execute);
  const metadataText = JSON.stringify(node.metadata, null, 2);
  const [draft, setDraft] = useState(metadataText);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(metadataText);
    setError(null);
  }, [metadataText, node.id]);
  const commitMetadata = () => {
    if (draft === metadataText) {
      setError(null);
      return;
    }
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("Metadata must be a JSON object.");
        return;
      }
      setError(null);
      execute(updateNode(node.id, { metadata: parsed as Record<string, unknown> }));
    } catch {
      setError("Metadata JSON is invalid.");
    }
  };
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
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onBlur={commitMetadata}
        />
        {error && <span className="cc-field-error">{error}</span>}
      </div>
      <button
        className="cc-btn"
        type="button"
        onClick={() =>
          execute(
            updateNode(node.id, {
              metadata: {
                ...node.metadata,
                [nextMetadataKey(node.metadata)]: "value",
              },
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

function ColorEditor({
  node,
  viewNode,
}: {
  node: CapabilityNode;
  viewNode: CapabilityNode;
}) {
  const execute = useDocumentStore((state) => state.execute);
  const usesLeafDefault = viewNode.type === "leaf" && !viewNode.isTextLabel;
  const activeColor = node.colorOverride ?? viewNode.color;
  return (
    <div className="cc-field">
      <span className="cc-section-title">Color</span>
      <div className="cc-color-row">
        {usesLeafDefault && node.colorOverride && (
          <button
            type="button"
            aria-label="Use default leaf color"
            className="cc-btn"
            onClick={() =>
              execute(updateNode(node.id, { colorOverride: undefined }))
            }
          >
            Default
          </button>
        )}
        {CAPABILITY_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Set color ${color}`}
            className={`cc-color-swatch ${activeColor === color ? "on" : ""}`}
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
  disabled = false,
  title,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  title?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => String(Math.round(value)));
  const skipCommit = useRef(false);
  const inputId = `layout-field-${label.toLowerCase()}`;
  useEffect(() => {
    setDraft(String(Math.round(value)));
  }, [value]);
  const commit = () => {
    if (disabled) return;
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
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
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className="cc-input"
        type="number"
        disabled={disabled}
        title={title}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            skipCommit.current = true;
            setDraft(String(Math.round(value)));
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function Breadcrumb({ node }: { node: CapabilityNode }) {
  const doc = useDocumentStore((state) => state.doc);
  const labels = capabilityPathLabels(doc, node);
  return (
    <div style={{ color: "var(--cc-brand-700)", fontSize: 12 }}>
      {labels.join(" > ")}
    </div>
  );
}

function CommitTextInput({
  id,
  value,
  onCommit,
}: {
  id: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const skipCommit = useRef(false);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      id={id}
      className="cc-input"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          (event.target as HTMLInputElement).blur();
        }
        if (event.key === "Escape") {
          skipCommit.current = true;
          setDraft(value);
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function CommitTextarea({
  id,
  value,
  placeholder,
  onCommit,
}: {
  id: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const skipCommit = useRef(false);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    if (draft !== value) onCommit(draft);
  };
  return (
    <textarea
      id={id}
      className="cc-textarea"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      placeholder={placeholder}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          skipCommit.current = true;
          setDraft(value);
          (event.target as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}

function CommitNumberInput({
  id,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  id: string;
  value: number | "";
  min: number;
  max: number;
  step: number;
  onCommit: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const skipCommit = useRef(false);
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = () => {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    if (draft === "") {
      if (value !== "") onCommit(undefined);
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setDraft(String(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <input
      id={id}
      className="cc-input"
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          (event.target as HTMLInputElement).blur();
        }
        if (event.key === "Escape") {
          skipCommit.current = true;
          setDraft(String(value));
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function capabilityPathLabels(
  doc: CapabilityDocument,
  node: CapabilityNode,
): string[] {
  const labels = [node.label];
  const seen = new Set([node.id]);
  let current = node.parentId ? doc.nodesById[node.parentId] : undefined;
  while (current && !seen.has(current.id)) {
    labels.unshift(current.label);
    seen.add(current.id);
    current = current.parentId ? doc.nodesById[current.parentId] : undefined;
  }
  return labels;
}

function nextMetadataKey(metadata: Record<string, unknown>): string {
  if (!Object.hasOwn(metadata, "key")) return "key";
  let index = 2;
  while (Object.hasOwn(metadata, `key${index}`)) index += 1;
  return `key${index}`;
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
