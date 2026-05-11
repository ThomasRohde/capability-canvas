import { memo, type CSSProperties } from "react";
import type { CapabilityDocument, NodeId } from "../../domain/document/types";
import { resolveNodeFill } from "../heatmap/resolveNodeFill";
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH } from "./canvasGeometry";
import type { NodeViewModel } from "./selectors";

export const ContainerFrame = memo(function ContainerFrame({
  viewModel,
  viewDoc,
  selected,
  viewportZoom,
  drag,
  resize,
  reparentTargetId,
}: {
  viewModel: NodeViewModel;
  viewDoc: CapabilityDocument;
  selected: NodeId[];
  viewportZoom: number;
  drag: { nodeIds: NodeId[]; dx: number; dy: number } | null;
  resize: { nodeId: NodeId; dx: number; dy: number } | null;
  reparentTargetId: NodeId | null;
}) {
  const { node } = viewModel;
  const selectedState = selected.includes(node.id);
  const selectionModeClass = selectedState
    ? selected.length > 1
      ? "multi-selected"
      : "single-selected"
    : "";
  const fill = resolveNodeFill(
    node,
    viewDoc.heatmap,
    viewDoc.settings.colorPalette,
  );
  const dragDelta = drag?.nodeIds.includes(node.id)
    ? { x: drag.dx / viewportZoom, y: drag.dy / viewportZoom }
    : { x: 0, y: 0 };
  const resizeDelta =
    resize?.nodeId === node.id
      ? { w: resize.dx / viewportZoom, h: resize.dy / viewportZoom }
      : { w: 0, h: 0 };

  return (
    <div
      className={`cc-container-frame ${fill.isTransparent ? "transparent" : ""} ${selectedState ? "selected" : ""} ${selectionModeClass} ${reparentTargetId === node.id ? "drop-target" : ""}`}
      aria-hidden="true"
      style={
        {
          left: node.x + dragDelta.x,
          top: node.y + dragDelta.y,
          width: Math.max(MIN_NODE_WIDTH, node.w + resizeDelta.w),
          height: Math.max(MIN_NODE_HEIGHT, node.h + resizeDelta.h),
          zIndex: viewModel.zIndex + 1,
          pointerEvents: "none",
          "--node-border": fill.border,
        } as CSSProperties
      }
    />
  );
});
