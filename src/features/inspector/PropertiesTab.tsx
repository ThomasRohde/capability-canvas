import { Info } from "lucide-react";
import { updateNode } from "../../domain/commands/operations";
import { normalizeNodeLabel } from "../../domain/document/labels";
import {
  isCanvasLabelNode,
  isTextLabelNode,
} from "../../domain/document/types";
import type {
  CapabilityNode,
  ColorPalette,
  LabelShape,
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

const LABEL_SHAPES: Array<{ value: LabelShape; label: string }> = [
  { value: "none", label: "None" },
  { value: "box", label: "Box" },
  { value: "pill", label: "Pill" },
  { value: "sticky", label: "Sticky" },
  { value: "callout", label: "Callout" },
];

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
  const isLabel = isCanvasLabelNode(node);
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
      {!isLabel && (
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
      )}
      {isLabel && <LabelStyleEditor node={node} />}
      <ColorEditor
        node={node}
        viewNode={viewNode}
        colorPalette={colorPalette}
      />
      {!isLabel && (
        <>
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
      )}
    </>
  );
}

function LabelStyleEditor({ node }: { node: CapabilityNode }) {
  const execute = useDocumentStore((state) => state.execute);
  const textStyle = node.textStyle ?? {};
  const updateTextStyle = (patch: CapabilityNode["textStyle"]) =>
    execute(updateNode(node.id, { textStyle: { ...textStyle, ...patch } }));

  return (
    <>
      <div className="cc-field">
        <span className="cc-section-title">Shape</span>
        <div className="cc-seg">
          {LABEL_SHAPES.map((shape) => (
            <button
              key={shape.value}
              type="button"
              className={(textStyle.shape ?? "none") === shape.value ? "on" : ""}
              onClick={() => updateTextStyle({ shape: shape.value })}
            >
              {shape.label}
            </button>
          ))}
        </div>
      </div>
      <div className="cc-field">
        <label htmlFor="label-font-family">Font</label>
        <CommitTextInput
          id="label-font-family"
          className="cc-input"
          value={textStyle.fontFamily ?? "Segoe UI"}
          normalize={(value) => value.trim() || "Segoe UI"}
          onCommit={(fontFamily) => updateTextStyle({ fontFamily })}
        />
      </div>
      <div className="cc-field">
        <label htmlFor="label-font-size">Font size</label>
        <CommitNumberInput
          id="label-font-size"
          className="cc-input"
          min={8}
          max={72}
          step={1}
          value={textStyle.fontSize ?? 14}
          onCommit={(fontSize) => updateTextStyle({ fontSize: fontSize ?? 14 })}
        />
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
  const usesLeafDefault = viewNode.type === "leaf" && !isTextLabelNode(viewNode);
  const activeColor = node.colorOverride ?? viewNode.color;
  return (
    <div className="cc-field">
      <span className="cc-section-title">
        {isCanvasLabelNode(node) ? "Fill color" : "Color"}
      </span>
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
