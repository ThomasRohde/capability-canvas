import type { Bounds } from "../../domain/document/types";
import type { CanvasSizeState, ViewportState } from "../../app/stores/uiStore";

interface FitViewportOptions {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
}

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

export function fitViewportToBounds(
  bounds: Bounds,
  canvasSize: CanvasSizeState,
  options: FitViewportOptions = {},
): ViewportState | null {
  if (bounds.w <= 0 || bounds.h <= 0) return null;
  const padding = options.padding ?? 40;
  const minZoom = options.minZoom ?? 0.25;
  const maxZoom = options.maxZoom ?? 1.5;
  const availableWidth = Math.max(1, canvasSize.w - padding * 2);
  const availableHeight = Math.max(1, canvasSize.h - padding * 2);
  const zoom = Math.max(
    minZoom,
    Math.min(maxZoom, Math.min(availableWidth / bounds.w, availableHeight / bounds.h)),
  );
  return {
    zoom,
    x: padding - bounds.x * zoom,
    y: padding - bounds.y * zoom,
  };
}
