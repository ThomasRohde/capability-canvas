import {
  lockSubtrees,
  setManualPositioningForNodes,
  updateNodeColors,
  updateNodeHeatmapValues,
  updateNodeSizes,
} from "../../domain/commands/operations";
import type {
  CapabilityDocument,
  CapabilityNode,
} from "../../domain/document/types";
import {
  AUTOMATIC_LAYOUT_GEOMETRY_LOCKED_MESSAGE,
  SOURCE_LOCKED_SEMANTIC_EDIT_MESSAGE,
  isAutomaticLayoutMode,
  isSourceModelEditable,
} from "../../domain/layout/canvasLayoutPolicy";
import { canMultiSelect } from "../../domain/selection/rules";
import { useDocumentStore } from "../../app/stores/documentStore";
import { BulkNumberField, CommitNumberInput } from "../shared/CommitTextInput";
import { ColorSwatchMatrix } from "../shared/ColorSwatchMatrix";
import { commonValue } from "./inspectorUtils";

type InspectorTab = "inspector" | "layout" | "data";

export function BulkInspector({
  doc,
  viewDoc,
  selected,
  tab,
}: {
  doc: CapabilityDocument;
  viewDoc: CapabilityDocument;
  selected: string[];
  tab: InspectorTab;
}) {
  const selectedNodes = selected
    .map((nodeId) => doc.nodesById[nodeId])
    .filter((node): node is CapabilityNode => !!node);
  const selectedViewNodes = selected
    .map((nodeId) => viewDoc.nodesById[nodeId])
    .filter((node): node is CapabilityNode => !!node);
  const allowed = canMultiSelect(viewDoc, selected, { hierarchy: "canvas" });
  const sourceEditable = isSourceModelEditable(doc);
  const sourceLockReason =
    doc.access?.reason || SOURCE_LOCKED_SEMANTIC_EDIT_MESSAGE;

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
            disabled={!sourceEditable}
            disabledReason={sourceLockReason}
          />
          <BulkHeatmapEditor
            selected={selected}
            nodes={selectedNodes}
            disabled={!sourceEditable}
            disabledReason={sourceLockReason}
          />
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

export function BulkSelectionSummary({
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

export function BulkColorEditor({
  selected,
  nodes,
  viewDoc,
  disabled,
  disabledReason,
}: {
  selected: string[];
  nodes: CapabilityNode[];
  viewDoc: CapabilityDocument;
  disabled: boolean;
  disabledReason?: string;
}) {
  const execute = useDocumentStore((state) => state.execute);
  const activeColor = commonValue(
    nodes.map(
      (node) =>
        node.colorOverride ?? viewDoc.nodesById[node.id]?.color ?? node.color,
    ),
  );
  return (
    <div className="cc-field">
      <span className="cc-section-title">Color</span>
      <div className="cc-bulk-field-head">
        <span>{activeColor === "" ? "Mixed" : activeColor}</span>
      </div>
      <ColorSwatchMatrix
        activeColor={activeColor}
        colorPalette={viewDoc.settings.colorPalette}
        disabled={disabled}
        labelForColor={(color) => `Set selected color ${color}`}
        onSelect={(color) => execute(updateNodeColors(selected, color))}
      />
      {disabled && <span className="cc-field-hint">{disabledReason}</span>}
    </div>
  );
}

export function BulkHeatmapEditor({
  selected,
  nodes,
  disabled,
  disabledReason,
}: {
  selected: string[];
  nodes: CapabilityNode[];
  disabled: boolean;
  disabledReason?: string;
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
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          onClick={() => execute(updateNodeHeatmapValues(selected, undefined))}
        >
          Clear selected
        </button>
      </div>
      <CommitNumberInput
        id="bulk-heatmap-value"
        className="cc-input"
        min={0}
        max={1}
        step={0.01}
        value={
          heatmapValue === "" || heatmapValue === undefined ? "" : heatmapValue
        }
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onCommit={(value) => execute(updateNodeHeatmapValues(selected, value))}
      />
      {disabled && <span className="cc-field-hint">{disabledReason}</span>}
    </div>
  );
}

export function BulkLayoutEditor({
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
  const directGeometryBlocked = isAutomaticLayoutMode(doc.settings.layoutMode);
  const resizeTitle = directGeometryBlocked
    ? AUTOMATIC_LAYOUT_GEOMETRY_LOCKED_MESSAGE
    : anyLocked
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
            onClick={() =>
              execute(setManualPositioningForNodes(selected, false))
            }
          >
            Auto layout
          </button>
          <button
            className={allManual ? "on" : ""}
            type="button"
            onClick={() =>
              execute(setManualPositioningForNodes(selected, true))
            }
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
          disabled={directGeometryBlocked || anyLocked}
          title={resizeTitle}
          onCommit={(w) =>
            execute(updateNodeSizes(selected, { w: Math.max(1, w) }))
          }
        />
        <BulkNumberField
          id="bulk-layout-height"
          label="H"
          value={height}
          disabled={directGeometryBlocked || anyLocked}
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
