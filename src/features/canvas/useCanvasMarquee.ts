import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useMemo,
} from "react";
import {
  isNodeOnCanvas,
  type CapabilityDocument,
  type NodeId,
} from "../../domain/document/types";
import { intersectsBounds } from "../../domain/layout/bounds";
import { resolveSiblingSelection } from "../../domain/selection/rules";
import type { ViewportState } from "../../app/stores/uiStore";
import { useTransientStore } from "../../app/stores/transientStore";
import { useUiStore } from "../../app/stores/uiStore";
import { screenPointToDocumentPoint } from "./canvasGeometry";

export function useCanvasMarquee({
  canvasRef,
  viewDoc,
  viewport,
  showSelectionNotice,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  viewDoc: CapabilityDocument;
  viewport: ViewportState;
  showSelectionNotice: (message: string) => void;
}) {
  const selectionRect = useTransientStore((state) => state.selectionRect);
  const marqueePreviewCount = useMemo(() => {
    if (!selectionRect) return 0;
    const ids = Object.values(viewDoc.nodesById)
      .filter(
        (node) =>
          isNodeOnCanvas(node) &&
          !node.isTextLabel &&
          node.type !== "text" &&
          intersectsBounds(node, selectionRect),
      )
      .map((node) => node.id);
    return resolveSiblingSelection(viewDoc, ids, {
      hierarchy: "canvas",
    }).nodeIds.length;
  }, [selectionRect, viewDoc]);

  const startMarquee = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const start = screenPointToDocumentPoint(
        { x: event.clientX, y: event.clientY },
        rect,
        viewport,
      );
      const additive = event.shiftKey;
      const baseSelection = additive
        ? new Set(useUiStore.getState().selectedNodeIds)
        : new Set<NodeId>();

      const onMove = (move: PointerEvent) => {
        const point = screenPointToDocumentPoint(
          { x: move.clientX, y: move.clientY },
          rect,
          viewport,
        );
        useTransientStore.getState().setSelectionRect({
          x: Math.min(start.x, point.x),
          y: Math.min(start.y, point.y),
          w: Math.abs(point.x - start.x),
          h: Math.abs(point.y - start.y),
        });
      };

      const onUp = () => {
        const rectBounds = useTransientStore.getState().selectionRect;
        useTransientStore.getState().setSelectionRect(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (!rectBounds || rectBounds.w < 4 || rectBounds.h < 4) return;
        const candidate = new Set(baseSelection);
        for (const node of Object.values(viewDoc.nodesById)) {
          if (!isNodeOnCanvas(node)) continue;
          if (node.isTextLabel || node.type === "text") continue;
          if (intersectsBounds(node, rectBounds)) candidate.add(node.id);
        }
        const ids = [...candidate];
        if (ids.length === 0) {
          if (!additive) useUiStore.getState().clearSelection();
          return;
        }
        const resolution = resolveSiblingSelection(viewDoc, ids, {
          hierarchy: "canvas",
        });
        useUiStore.getState().setSelection(resolution.nodeIds);
        if (resolution.reason) showSelectionNotice(resolution.reason);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [canvasRef, showSelectionNotice, viewDoc, viewport],
  );

  return {
    selectionRect,
    marqueePreviewCount,
    startMarquee,
  };
}
