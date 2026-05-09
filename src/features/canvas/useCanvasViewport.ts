import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Bounds } from "../../domain/document/types";
import { useDocumentStore } from "../../app/stores/documentStore";
import { type ViewportState, useUiStore } from "../../app/stores/uiStore";
import { MAX_ZOOM, MIN_ZOOM } from "./canvasGeometry";
import { viewportToDocumentBounds } from "./selectors";
import { fitViewportToBounds } from "./viewport";

export function useCanvasViewport({
  canvasRef,
  displayBounds,
  readonly,
  onViewportChange,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  displayBounds: Bounds;
  readonly: boolean;
  onViewportChange?: (viewport: ViewportState) => void;
}) {
  const setActiveViewViewport = useDocumentStore(
    (state) => state.setActiveViewViewport,
  );
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const setCanvasSize = useUiStore((state) => state.setCanvasSize);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const docViewport = useMemo(
    () => viewportToDocumentBounds(viewport, size),
    [viewport, size],
  );

  const commitViewport = useCallback(
    (nextViewport: ViewportState) => {
      if (onViewportChange) {
        onViewportChange(nextViewport);
        return;
      }
      if (!readonly) setActiveViewViewport(nextViewport);
    },
    [onViewportChange, readonly, setActiveViewViewport],
  );

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const nextSize = {
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        };
        setSize(nextSize);
        setCanvasSize(nextSize);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [canvasRef, setCanvasSize]);

  const fitView = useCallback(() => {
    const nextViewport = fitViewportToBounds(
      displayBounds,
      { w: size.w, h: size.h },
      {
        minZoom: MIN_ZOOM,
        maxZoom: 1.5,
        padding: 40,
      },
    );
    if (!nextViewport) return;
    setViewport(nextViewport);
    commitViewport(nextViewport);
  }, [commitViewport, displayBounds, setViewport, size.h, size.w]);

  const zoomAround = useCallback(
    (delta: number, anchorX: number, anchorY: number) => {
      const nextZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, viewport.zoom + delta),
      );
      if (nextZoom === viewport.zoom) return;
      const docAnchorX = (anchorX - viewport.x) / viewport.zoom;
      const docAnchorY = (anchorY - viewport.y) / viewport.zoom;
      const nextViewport = {
        zoom: nextZoom,
        x: anchorX - docAnchorX * nextZoom,
        y: anchorY - docAnchorY * nextZoom,
      };
      setViewport(nextViewport);
      commitViewport(nextViewport);
    },
    [commitViewport, setViewport, viewport],
  );

  const zoomBy = useCallback(
    (delta: number) => {
      zoomAround(delta, size.w / 2, size.h / 2);
    },
    [size.h, size.w, zoomAround],
  );

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      const rect = element.getBoundingClientRect();
      zoomAround(delta, event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [canvasRef, zoomAround]);

  const centerOnDocumentPoint = useCallback(
    (x: number, y: number) => {
      const nextViewport = {
        ...viewport,
        x: size.w / 2 - x * viewport.zoom,
        y: size.h / 2 - y * viewport.zoom,
      };
      setViewport(nextViewport);
      commitViewport(nextViewport);
    },
    [commitViewport, setViewport, size.h, size.w, viewport],
  );

  const startPan = useCallback(
    (event: ReactPointerEvent<HTMLElement>, onClick?: () => void) => {
      const startX = event.clientX;
      const startY = event.clientY;
      const startViewport = viewport;
      let didMove = false;
      const onMove = (move: PointerEvent) => {
        if (
          Math.abs(move.clientX - startX) > 2 ||
          Math.abs(move.clientY - startY) > 2
        ) {
          didMove = true;
        }
        setViewport({
          ...startViewport,
          x: startViewport.x + move.clientX - startX,
          y: startViewport.y + move.clientY - startY,
        });
      };
      const onUp = () => {
        if (!didMove && event.button === 0) onClick?.();
        else commitViewport(useUiStore.getState().viewport);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [commitViewport, setViewport, viewport],
  );

  return {
    size,
    viewport,
    docViewport,
    fitView,
    zoomBy,
    centerOnDocumentPoint,
    startPan,
  };
}
