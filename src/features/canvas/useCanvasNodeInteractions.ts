import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
} from "react";
import {
  moveNodesWithLayoutIntent,
  reparentNodeWithLayoutIntent,
  resizeNode,
} from "../../domain/commands/operations";
import {
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../../domain/document/types";
import {
  findDropTarget,
  isAcceptableDropTarget,
} from "../../domain/selection/dropTarget";
import { resolveToggleSelection } from "../../domain/selection/rules";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useTransientStore } from "../../app/stores/transientStore";
import { useUiStore, type ViewportState } from "../../app/stores/uiStore";
import {
  screenPointToDocumentPoint,
  snapDragDelta,
  snapResizeDelta,
} from "./canvasGeometry";
import { descendantIds } from "./selectors";
import { showManualPositioningNoticeForDiagnostics } from "../shared/layoutIntentNotice";

export function useCanvasNodeInteractions({
  canvasRef,
  viewDoc,
  viewport,
  selected,
  readonly,
  closeContextMenu,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  viewDoc: CapabilityDocument;
  viewport: ViewportState;
  selected: NodeId[];
  readonly: boolean;
  closeContextMenu: () => void;
}) {
  const execute = useDocumentStore((state) => state.execute);
  const setSelection = useUiStore((state) => state.setSelection);

  const nodeIdsWithDescendants = useCallback(
    (nodeIds: NodeId[]) => {
      const expanded = new Set<NodeId>();
      for (const nodeId of nodeIds) {
        if (!viewDoc.nodesById[nodeId]) continue;
        expanded.add(nodeId);
        for (const descendantId of descendantIds(viewDoc, nodeId))
          expanded.add(descendantId);
      }
      return [...expanded];
    },
    [viewDoc],
  );

  const handleNodePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      nodeId: NodeId,
      isEditing: boolean,
    ) => {
      closeContextMenu();
      event.stopPropagation();
      if (event.button > 0) return;
      if (isEditing) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        const ui = useUiStore.getState();
        const resolution = resolveToggleSelection(
          viewDoc,
          ui.selectedNodeIds,
          nodeId,
          { hierarchy: "canvas" },
        );
        ui.setSelection(resolution.nodeIds);
        if (resolution.reason) ui.showSelectionNotice(resolution.reason);
      } else if (!selected.includes(nodeId)) {
        setSelection([nodeId]);
      }
      if (readonly) return;
      const selectionRoots = selected.includes(nodeId) ? selected : [nodeId];
      const dragRootId = nodeId;
      const activeSelection = nodeIdsWithDescendants(selectionRoots);
      const draggedSet = new Set(activeSelection);
      const canReparent = selectionRoots.length === 1;
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      let pendingReparentTarget: NodeId | null | undefined;
      const dragStart = {
        nodeIds: activeSelection,
        startX: event.clientX,
        startY: event.clientY,
        dx: 0,
        dy: 0,
      };

      const onMove = (move: PointerEvent) => {
        const screenDx = move.clientX - dragStart.startX;
        const screenDy = move.clientY - dragStart.startY;
        if (!useTransientStore.getState().drag) {
          if (Math.abs(screenDx) <= 2 && Math.abs(screenDy) <= 2) return;
          useTransientStore.getState().startDrag(dragStart);
        }
        const current = useTransientStore.getState().drag;
        if (!current) return;
        const snapped = snapDragDelta(
          viewDoc,
          current.nodeIds,
          viewport,
          screenDx,
          screenDy,
        );
        useTransientStore.getState().updateDrag(snapped.dx, snapped.dy);
        if (!canReparent || !canvasRect) {
          useTransientStore.getState().setReparentTargetId(null);
          return;
        }
        const dragRoot = viewDoc.nodesById[dragRootId];
        if (!dragRoot) return;
        const point = screenPointToDocumentPoint(
          { x: move.clientX, y: move.clientY },
          canvasRect,
          viewport,
        );
        const candidate = findDropTarget({
          doc: viewDoc,
          pointDocX: point.x,
          pointDocY: point.y,
          draggedIds: draggedSet,
        });
        const currentParent = dragRoot.parentId ?? null;
        if (candidate.parentId === currentParent) {
          pendingReparentTarget = undefined;
          useTransientStore.getState().setReparentTargetId(null);
          return;
        }
        const acceptable = isAcceptableDropTarget(
          viewDoc,
          dragRootId,
          candidate.parentId,
        );
        useTransientStore
          .getState()
          .setReparentTargetId(acceptable.accepted ? candidate.parentId : null);
        pendingReparentTarget = acceptable.accepted
          ? candidate.parentId
          : undefined;
      };

      const onUp = () => {
        const current = useTransientStore.getState().endDrag();
        const reparentTargetId = pendingReparentTarget;
        useTransientStore.getState().setReparentTargetId(null);
        if (
          current &&
          (Math.abs(current.dx) > 1 ||
            Math.abs(current.dy) > 1 ||
            reparentTargetId !== undefined)
        ) {
          const dx = current.dx / viewport.zoom;
          const dy = current.dy / viewport.zoom;
          const dragRoot = viewDoc.nodesById[dragRootId];
          const currentParent = dragRoot?.parentId ?? null;
          const wantsReparent =
            canReparent &&
            reparentTargetId !== undefined &&
            reparentTargetId !== currentParent;
          if (wantsReparent) {
            showManualPositioningNoticeForDiagnostics(
              execute(
                reparentNodeWithLayoutIntent(
                  dragRootId,
                  reparentTargetId,
                  dx,
                  dy,
                ),
              ),
            );
          } else if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
            showManualPositioningNoticeForDiagnostics(
              execute(moveNodesWithLayoutIntent(selectionRoots, dx, dy)),
            );
          }
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [
      canvasRef,
      closeContextMenu,
      execute,
      nodeIdsWithDescendants,
      readonly,
      selected,
      setSelection,
      viewDoc,
      viewport,
    ],
  );

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>, node: CapabilityNode) => {
      event.stopPropagation();
      const startClientX = event.clientX;
      const startClientY = event.clientY;
      useTransientStore.getState().startResize({
        nodeId: node.id,
        startW: node.w,
        startH: node.h,
        dx: 0,
        dy: 0,
      });
      const onMove = (move: PointerEvent) => {
        const current = useTransientStore.getState().resize;
        if (current) {
          const snapped = snapResizeDelta(
            viewDoc,
            current.nodeId,
            current.startW,
            current.startH,
            viewport,
            move.clientX - startClientX,
            move.clientY - startClientY,
          );
          useTransientStore.getState().updateResize(snapped.dx, snapped.dy);
        }
      };
      const onUp = () => {
        const current = useTransientStore.getState().endResize();
        if (current) {
          execute(
            resizeNode(
              current.nodeId,
              current.startW + current.dx / viewport.zoom,
              current.startH + current.dy / viewport.zoom,
            ),
          );
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [execute, viewDoc, viewport],
  );

  return {
    handleNodePointerDown,
    handleResizePointerDown,
  };
}
