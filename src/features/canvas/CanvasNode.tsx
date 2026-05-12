import {
  memo,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useState,
} from "react";
import {
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../../domain/document/types";
import { resolveNodeFill } from "../heatmap/resolveNodeFill";
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH } from "./canvasGeometry";
import type { NodeViewModel } from "./selectors";

export const CanvasNode = memo(function CanvasNode({
  viewModel,
  viewDoc,
  selected,
  readonly,
  viewportZoom,
  drag,
  resize,
  reparentTargetId,
  isEditing,
  labelInputRef,
  onCommitLabel,
  onCancelLabel,
  onStartLabelEdit,
  onNodeRef,
  onNodeKeyDown,
  onNodePointerDown,
  onNodeContextMenu,
  onResizePointerDown,
}: {
  viewModel: NodeViewModel;
  viewDoc: CapabilityDocument;
  selected: NodeId[];
  readonly: boolean;
  viewportZoom: number;
  drag: { nodeIds: NodeId[]; dx: number; dy: number } | null;
  resize: { nodeId: NodeId; dx: number; dy: number } | null;
  reparentTargetId: NodeId | null;
  isEditing: boolean;
  labelInputRef: RefObject<HTMLInputElement | null>;
  onCommitLabel: (draft: string) => void;
  onCancelLabel: () => void;
  onStartLabelEdit: (nodeId: NodeId) => void;
  onNodeRef: (nodeId: NodeId, element: HTMLDivElement | null) => void;
  onNodeKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
    nodeId: NodeId,
  ) => void;
  onNodePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    nodeId: NodeId,
    isEditing: boolean,
  ) => void;
  onNodeContextMenu: (
    event: ReactMouseEvent<HTMLDivElement>,
    nodeId: NodeId,
  ) => void;
  onResizePointerDown: (
    event: ReactPointerEvent<HTMLSpanElement>,
    node: CapabilityNode,
  ) => void;
}) {
  const { node } = viewModel;
  const selectedState = selected.includes(node.id);
  const fill = resolveNodeFill(
    node,
    viewDoc.heatmap,
    viewDoc.settings.colorPalette,
  );
  const isContainer = node.type !== "leaf" && !node.isTextLabel;
  const heatmapScore =
    viewDoc.heatmap.enabled &&
    viewDoc.heatmap.showValuePills &&
    node.heatmapValue !== undefined
      ? node.heatmapValue.toFixed(2)
      : null;
  const hasHeatmapScore = heatmapScore !== null;
  const selectedNodeClass = selectedState && !isContainer ? "selected" : "";
  const selectionModeClass = selectedState
    ? selected.length > 1
      ? "multi-selected"
      : "single-selected"
    : "";
  const dragDelta = drag?.nodeIds.includes(node.id)
    ? { x: drag.dx / viewportZoom, y: drag.dy / viewportZoom }
    : { x: 0, y: 0 };
  const resizeDelta =
    resize?.nodeId === node.id
      ? { w: resize.dx / viewportZoom, h: resize.dy / viewportZoom }
      : { w: 0, h: 0 };

  return (
    <div
      ref={(element) => onNodeRef(node.id, element)}
      className={`cc-node ${isContainer ? "cc-node-container" : ""} ${fill.isTransparent ? "transparent" : ""} ${hasHeatmapScore ? "has-heatmap-score" : ""} ${selectedNodeClass} ${selectionModeClass} ${isEditing ? "editing" : ""} ${drag?.nodeIds.includes(node.id) ? "dragging" : ""} ${reparentTargetId === node.id ? "drop-target" : ""}`}
      role="button"
      tabIndex={selectedState ? 0 : -1}
      aria-label={canvasNodeAriaLabel(
        node,
        selectedState,
        selected.length,
        viewDoc.heatmap.enabled,
      )}
      aria-pressed={selectedState}
      style={
        {
          left: node.x + dragDelta.x,
          top: node.y + dragDelta.y,
          width: Math.max(MIN_NODE_WIDTH, node.w + resizeDelta.w),
          height: Math.max(MIN_NODE_HEIGHT, node.h + resizeDelta.h),
          zIndex: viewModel.zIndex,
          "--node-bg": fill.background,
          "--node-border": fill.border,
          "--node-text": fill.text,
          "--container-label-offset-top": `${Math.max(
            0,
            viewDoc.settings.containerLabelOffsetTop,
          )}px`,
        } as CSSProperties
      }
      onKeyDown={(event) => onNodeKeyDown(event, node.id)}
      onPointerDown={(event) => onNodePointerDown(event, node.id, isEditing)}
      onContextMenu={(event) => onNodeContextMenu(event, node.id)}
    >
      {isContainer ? (
        <div className="cc-node-title">
          <NodeLabel
            nodeId={node.id}
            label={node.label}
            isEditing={isEditing}
            inputRef={labelInputRef}
            onCommit={onCommitLabel}
            onCancel={onCancelLabel}
            onStartEdit={onStartLabelEdit}
          />
        </div>
      ) : (
        <NodeLabel
          nodeId={node.id}
          label={node.label}
          isEditing={isEditing}
          inputRef={labelInputRef}
          onCommit={onCommitLabel}
          onCancel={onCancelLabel}
          onStartEdit={onStartLabelEdit}
        />
      )}
      {hasHeatmapScore && (
        <span
          className={`cc-node-score ${isContainer ? "container-score" : "leaf-score"}`}
          aria-label={`Heatmap score ${heatmapScore}`}
        >
          {heatmapScore}
        </span>
      )}
      {!readonly && selectedState && !isEditing && (
        <span
          className="cc-resize"
          onPointerDown={(event) => onResizePointerDown(event, node)}
        />
      )}
    </div>
  );
});

function NodeLabel({
  nodeId,
  label,
  isEditing,
  inputRef,
  onCommit,
  onCancel,
  onStartEdit,
}: {
  nodeId: NodeId;
  label: string;
  isEditing: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onCommit: (draft: string) => void;
  onCancel: () => void;
  onStartEdit: (nodeId: NodeId) => void;
}) {
  const [draft, setDraft] = useState(label);

  useEffect(() => {
    if (isEditing) setDraft(label);
  }, [isEditing, label, nodeId]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="cc-node-label-input"
        aria-label={`Edit label for ${label}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
    );
  }

  return (
    <span
      className="cc-node-label"
      onPointerDown={(event) => {
        if (event.detail > 1) event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onStartEdit(nodeId);
      }}
    >
      {label}
    </span>
  );
}

function canvasNodeAriaLabel(
  node: CapabilityNode,
  selected: boolean,
  selectionCount: number,
  heatmapEnabled: boolean,
): string {
  const nodeType =
    node.isTextLabel || node.type === "text"
      ? "text label"
      : node.type === "leaf"
        ? "leaf capability"
        : "parent capability";
  const selectedCopy = selected
    ? selectionCount > 1
      ? `selected, ${selectionCount} capabilities selected`
      : "selected"
    : "not selected";
  const scoreCopy = heatmapEnabled
    ? node.heatmapValue === undefined
      ? "No score"
      : `Score ${node.heatmapValue.toFixed(2)}`
    : null;
  return [node.label, nodeType, selectedCopy, scoreCopy]
    .filter(Boolean)
    .join(", ");
}
