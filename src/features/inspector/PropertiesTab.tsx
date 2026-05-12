import { Info } from "lucide-react";
import { updateNode } from "../../domain/commands/operations";
import { normalizeNodeLabel } from "../../domain/document/labels";
import type {
  CapabilityNode,
  ColorPalette,
  VisualNodeState,
} from "../../domain/document/types";
import { useDocumentStore } from "../../app/stores/documentStore";
import { ColorSwatchMatrix } from "../shared/ColorSwatchMatrix";
import {
  CommitNumberInput,
  CommitTextarea,
  CommitTextInput,
} from "../shared/CommitTextInput";
import { Breadcrumb, SourceViewStatus } from "./InspectorMeta";

export function PropertiesTab({
  node,
  viewNode,
  activeViewState,
}: {
  node: CapabilityNode;
  viewNode: CapabilityNode;
  activeViewState?: VisualNodeState;
}) {
  const execute = useDocumentStore((state) => state.execute);
  const colorPalette = useDocumentStore(
    (state) => state.doc.settings.colorPalette,
  );
  return (
    <>
      <Breadcrumb node={node} />
      <SourceViewStatus
        node={node}
        viewNode={viewNode}
        activeViewState={activeViewState}
      />
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
          className="cc-textarea"
          value={node.description ?? ""}
          onCommit={(description) =>
            execute(updateNode(node.id, { description }))
          }
          placeholder="Enter description..."
        />
      </div>
      <ColorEditor
        node={node}
        viewNode={viewNode}
        colorPalette={colorPalette}
      />
      <div className="cc-field">
        <label htmlFor="heatmap-value">Heatmap value</label>
        <CommitNumberInput
          id="heatmap-value"
          className="cc-input"
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

function ColorEditor({
  node,
  viewNode,
  colorPalette,
}: {
  node: CapabilityNode;
  viewNode: CapabilityNode;
  colorPalette: ColorPalette;
}) {
  const execute = useDocumentStore((state) => state.execute);
  const usesLeafDefault = viewNode.type === "leaf" && !viewNode.isTextLabel;
  const activeColor = node.colorOverride ?? viewNode.color;
  return (
    <div className="cc-field">
      <span className="cc-section-title">Color</span>
      <div className="cc-color-stack">
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
        <ColorSwatchMatrix
          activeColor={activeColor}
          colorPalette={colorPalette}
          labelForColor={(color) => `Set color ${color}`}
          onSelect={(color) => execute(updateNode(node.id, { color }))}
        />
      </div>
    </div>
  );
}
