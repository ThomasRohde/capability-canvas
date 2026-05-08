import type { Bounds } from "../../domain/document/types";
import type { CanvasSizeState, ViewportState } from "../../app/stores/uiStore";

export function focusNodeInViewport(
  bounds: Bounds,
  viewport: ViewportState,
  canvasSize: CanvasSizeState,
): ViewportState {
  return {
    ...viewport,
    x: canvasSize.w / 2 - (bounds.x + bounds.w / 2) * viewport.zoom,
    y: canvasSize.h / 2 - (bounds.y + bounds.h / 2) * viewport.zoom,
  };
}
