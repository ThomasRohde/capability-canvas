import type { ViewportState } from "../../app/stores/uiStore";
import {
  type Bounds,
  type CapabilityDocument,
  type NodeId,
} from "../../domain/document/types";
import { gridSizeFor, snapToGrid } from "../../domain/layout/grid";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
export const MIN_NODE_WIDTH = 40;
export const MIN_NODE_HEIGHT = 32;

export interface ScreenDelta {
  dx: number;
  dy: number;
}

export function isCanvasBackgroundTarget(
  target: EventTarget | null,
  currentTarget: EventTarget,
): boolean {
  if (target === currentTarget) return true;
  return (
    target instanceof HTMLElement &&
    target.classList.contains("cc-canvas-stage")
  );
}

export function intersectsCanvasBounds(
  a: Pick<Bounds, "x" | "y" | "w" | "h">,
  b: Pick<Bounds, "x" | "y" | "w" | "h">,
): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function screenPointToDocumentPoint(
  clientPoint: { x: number; y: number },
  canvasRect: Pick<DOMRect, "left" | "top">,
  viewport: ViewportState,
): { x: number; y: number } {
  return {
    x: (clientPoint.x - canvasRect.left - viewport.x) / viewport.zoom,
    y: (clientPoint.y - canvasRect.top - viewport.y) / viewport.zoom,
  };
}

export function snapDragDelta(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
  viewport: ViewportState,
  screenDx: number,
  screenDy: number,
): ScreenDelta {
  if (!doc.settings.gridEnabled || nodeIds.length === 0)
    return { dx: screenDx, dy: screenDy };
  const anchor = doc.nodesById[nodeIds[0]!];
  if (!anchor) return { dx: screenDx, dy: screenDy };
  const gridSize = gridSizeFor(doc);
  const rawDocDx = screenDx / viewport.zoom;
  const rawDocDy = screenDy / viewport.zoom;
  const snappedDocDx = snapToGrid(anchor.x + rawDocDx, gridSize) - anchor.x;
  const snappedDocDy = snapToGrid(anchor.y + rawDocDy, gridSize) - anchor.y;
  return {
    dx: snappedDocDx * viewport.zoom,
    dy: snappedDocDy * viewport.zoom,
  };
}

export function snapResizeDelta(
  doc: CapabilityDocument,
  nodeId: NodeId,
  startW: number,
  startH: number,
  viewport: ViewportState,
  screenDx: number,
  screenDy: number,
): ScreenDelta {
  if (!doc.settings.gridEnabled || !doc.settings.resizeSnapToGrid)
    return { dx: screenDx, dy: screenDy };
  const node = doc.nodesById[nodeId];
  if (!node) return { dx: screenDx, dy: screenDy };
  const gridSize = gridSizeFor(doc);
  const rawW = startW + screenDx / viewport.zoom;
  const rawH = startH + screenDy / viewport.zoom;
  const snappedW = Math.max(1, snapToGrid(node.x + rawW, gridSize) - node.x);
  const snappedH = Math.max(1, snapToGrid(node.y + rawH, gridSize) - node.y);
  return {
    dx: (snappedW - startW) * viewport.zoom,
    dy: (snappedH - startH) * viewport.zoom,
  };
}
