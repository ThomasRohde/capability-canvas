import { Info, Lock, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  lockSubtree,
  lockSubtrees,
  moveNodes,
  resizeNode,
  setManualPositioning,
  setManualPositioningForNodes,
  updateNodeColors,
  updateNodeHeatmapValues,
  updateNodeSizes,
  updateNode,
} from "../../domain/commands/operations";
import { normalizeNodeLabel } from "../../domain/document/labels";
import {
  isNodeOnCanvas,
  type CapabilityDocument,
  type CapabilityNode,
} from "../../domain/document/types";
import { snapCoordinate } from "../../domain/layout/grid";
import { canMultiSelect } from "../../domain/selection/rules";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { CAPABILITY_COLORS, CATEGORY_STYLES } from "../heatmap/resolveNodeFill";
import { CommitTextInput } from "../shared/CommitTextInput";

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
        {selected.length > 1 && readonly && (
          <MultiSelectionSummary count={selected.length} />
        )}
        {selected.length > 1 && !readonly && (
          <BulkInspector
            doc={doc}
            viewDoc={viewDoc}
            selected={selected}
            tab={tab}
          />
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

function BulkInspector({
  doc,
  viewDoc,
  selected,
  tab,
}: {
  doc: CapabilityDocument;
  viewDoc: CapabilityDocument;
  selected: string[];
  tab: "inspector" | "layout" | "data";
}) {
  const selectedNodes = selected
    .map((nodeId) => doc.nodesById[nodeId])
    .filter((node): node is CapabilityNode => !!node);
  const selectedViewNodes = selected
    .map((nodeId) => viewDoc.nodesById[nodeId])
    .filter((node): node is CapabilityNode => !!node);
  const allowed = canMultiSelect(viewDoc, selected);

  return (
    <>
      <BulkSelectionSummary
        count={selected.length}
        valid={allowed.valid}
        reason={allowed.reason}
      />
      {!allowed.valid ? null : tab === "inspector" ? (
        <>
          <BulkColorEditor
            selected={selected}
            nodes={selectedNodes}
            viewDoc={viewDoc}
          />
          <BulkHeatmapEditor selected={selected} nodes={selectedNodes} />
        </>
      ) : tab === "layout" ? (
        <BulkLayoutEditor
          doc={doc}
          selected={selected}
          nodes={selectedViewNodes}
        />
      ) : (
        <div className="cc-info-card">
          Bulk metadata editing is not available for multi-selection.
        </div>
      )}
    </>
  );
}

function BulkSelectionSummary({
  count,
  valid,
  reason,
}: {
  count: number;
  valid: boolean;
  reason?: string;
}) {
  return (
    <div className={`cc-info-card ${valid ? "" : "warning"}`}>
      {valid
        ? `${count} sibling capabilities selected. Bulk edits commit as one undo step.`
        : (reason ?? "This selection cannot be edited in bulk.")}
    </div>
  );
}

function BulkColorEditor({
  selected,
  nodes,
  viewDoc,
}: {
  selected: string[];
  nodes: CapabilityNode[];
  viewDoc: CapabilityDocument;
}) {
  const execute = useDocumentStore((state) => state.execute);
  const activeColor = commonValue(
    nodes.map(
      (node) => node.colorOverride ?? viewDoc.nodesById[node.id]?.color ?? node.color,
    ),
  );
  return (
    <div className="cc-field">
      <span className="cc-section-title">Color</span>
      <div className="cc-bulk-field-head">
        <span>{activeColor === "" ? "Mixed" : activeColor}</span>
      </div>
      <div className="cc-color-row">
        {CAPABILITY_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Set selected color ${color}`}
            aria-pressed={activeColor === color}
            className={`cc-color-swatch ${activeColor === color ? "on" : ""}`}
            style={{
              color: CATEGORY_STYLES[color].border,
              background: CATEGORY_STYLES[color].background,
            }}
            onClick={() => execute(updateNodeColors(selected, color))}
          />
        ))}
      </div>
    </div>
  );
}

function BulkHeatmapEditor({
  selected,
  nodes,
}: {
  selected: string[];
  nodes: CapabilityNode[];
}) {
  const execute = useDocumentStore((state) => state.execute);
  const heatmapValue = commonValue(nodes.map((node) => node.heatmapValue));
  return (
    <div className="cc-field">
      <label htmlFor="bulk-heatmap-value">Heatmap value</label>
      <div className="cc-bulk-field-head">
        <span>{heatmapValue === "" ? "Mixed" : "Common"}</span>
        <button
          className="cc-status-link-btn"
          type="button"
          onClick={() => execute(updateNodeHeatmapValues(selected, undefined))}
        >
          Clear selected
        </button>
      </div>
      <CommitNumberInput
        id="bulk-heatmap-value"
        min={0}
        max={1}
        step={0.01}
        value={
          heatmapValue === "" || heatmapValue === undefined ? "" : heatmapValue
        }
        onCommit={(value) => execute(updateNodeHeatmapValues(selected, value))}
      />
    </div>
  );
}

function BulkLayoutEditor({
  doc,
  selected,
  nodes,
}: {
  doc: CapabilityDocument;
  selected: string[];
  nodes: CapabilityNode[];
}) {
  const execute = useDocumentStore((state) => state.execute);
  const width = commonValue(nodes.map((node) => Math.round(node.w)));
  const height = commonValue(nodes.map((node) => Math.round(node.h)));
  const allManual = nodes.every((node) => node.isManualPositioningEnabled);
  const noneManual = nodes.every((node) => !node.isManualPositioningEnabled);
  const allLocked = nodes.every((node) => node.isLockedAsIs);
  const anyLocked = nodes.some((node) => node.isLockedAsIs);
  const resizeTitle = anyLocked
    ? "Preserved capabilities cannot be resized."
    : undefined;
  return (
    <>
      <div className="cc-field">
        <span className="cc-section-title">Layout behavior</span>
        <div className="cc-seg">
          <button
            className={noneManual ? "on" : ""}
            type="button"
            onClick={() => execute(setManualPositioningForNodes(selected, false))}
          >
            Auto layout
          </button>
          <button
            className={allManual ? "on" : ""}
            type="button"
            onClick={() => execute(setManualPositioningForNodes(selected, true))}
          >
            Manual
          </button>
          <button
            className={allLocked ? "on" : ""}
            type="button"
            aria-label="Preserve selected from auto layout"
            title="Preserve selected from auto layout"
            onClick={() => execute(lockSubtrees(selected, !allLocked))}
          >
            Preserve
          </button>
        </div>
        {!allManual && !noneManual && (
          <span className="cc-field-hint">Manual positioning is mixed.</span>
        )}
      </div>
      <div className="cc-field-row">
        <BulkNumberField
          id="bulk-layout-width"
          label="W"
          value={width}
          disabled={anyLocked}
          title={resizeTitle}
          onCommit={(w) =>
            execute(updateNodeSizes(selected, { w: Math.max(1, w) }))
          }
        />
        <BulkNumberField
          id="bulk-layout-height"
          label="H"
          value={height}
          disabled={anyLocked}
          title={resizeTitle}
          onCommit={(h) =>
            execute(updateNodeSizes(selected, { h: Math.max(1, h) }))
          }
        />
      </div>
      <div className="cc-info-card">
        Preserving selected layouts also preserves their descendants. Size edits
        use the active document grid and remain one undo step.
      </div>
      <span className="cc-field-hint">
        Grid size: {doc.settings.gridEnabled ? doc.settings.gridSize : "off"}
      </span>
    </>
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
      <SourceViewStatus node={node} viewNode={viewNode} />
      <div className="cc-field">
        <label htmlFor="node-label">Label</label>
        <CommitTextInput
          id="node-label"
          className="cc-input"
          value={node.label}
          normalize={normalizeNodeLabel}
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
            aria-pressed={activeColor === color}
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

function BulkNumberField({
  id,
  label,
  value,
  disabled = false,
  title,
  onCommit,
}: {
  id: string;
  label: string;
  value: number | "";
  disabled?: boolean;
  title?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value === "" ? "" : String(value));
  const skipCommit = useRef(false);
  useEffect(() => {
    setDraft(value === "" ? "" : String(value));
  }, [value]);
  const commit = () => {
    if (disabled) return;
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    if (draft === "") return;
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(value === "" ? "" : String(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <div className="cc-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="cc-input"
        type="number"
        min={1}
        value={draft}
        disabled={disabled}
        title={title}
        placeholder={value === "" ? "Mixed" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            skipCommit.current = true;
            setDraft(value === "" ? "" : String(value));
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
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

function SourceViewStatus({
  node,
  viewNode,
}: {
  node: CapabilityNode;
  viewNode: CapabilityNode;
}) {
  const doc = useDocumentStore((state) => state.doc);
  const activeView =
    doc.visual.viewsById[doc.visual.activeViewId]?.nodeStatesById[node.id];
  const sourceId =
    typeof node.metadata.id === "string" ||
    typeof node.metadata.id === "number"
      ? String(node.metadata.id)
      : null;
  const layoutState = viewNode.isLockedAsIs
    ? "Preserved from auto layout"
    : viewNode.isManualPositioningEnabled
      ? "Manual active view layout"
      : "Auto layout";

  return (
    <div className="cc-field">
      <span className="cc-section-title">Source model and active view</span>
      <dl className="cc-meta-list">
        <FragmentRow
          label="Model path"
          value={capabilityPathLabels(doc, node).join(" > ")}
        />
        <FragmentRow
          label="Visibility"
          value={
            isNodeOnCanvas(viewNode)
              ? "Visible in active view"
              : "Hidden in active view"
          }
        />
        <FragmentRow
          label="Collapse"
          value={
            activeView?.isCollapsed
              ? "Collapsed in active view"
              : "Expanded in active view"
          }
        />
        <FragmentRow label="Layout" value={layoutState} />
        {sourceId && <FragmentRow label="Source ID" value={sourceId} />}
      </dl>
    </div>
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

function commonValue<T>(values: T[]): T | "" {
  if (values.length === 0) return "";
  const first = values[0]!;
  return values.every((value) => Object.is(value, first)) ? first : "";
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
