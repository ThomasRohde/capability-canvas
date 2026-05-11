import { Maximize, Minus, Plus } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Bounds } from "../../domain/document/types";

export function Minimap({
  bounds,
  viewport,
  nodes,
  onFit,
  onZoomIn,
  onZoomOut,
  onCenter,
}: {
  bounds: Bounds;
  viewport: Bounds;
  nodes: Array<
    Bounds & {
      fill: {
        background: string;
        border: string;
        isTransparent?: boolean;
      };
    }
  >;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: (x: number, y: number) => void;
}) {
  const minimapWidth = 132;
  const minimapHeight = 90;
  const scale =
    bounds.w > 0 && bounds.h > 0
      ? Math.min(minimapWidth / bounds.w, minimapHeight / bounds.h)
      : 1;
  const centerFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (bounds.w <= 0 || bounds.h <= 0 || !Number.isFinite(scale) || scale <= 0)
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clientX = Number.isFinite(event.clientX)
      ? event.clientX
      : rect.left + rect.width / 2;
    const clientY = Number.isFinite(event.clientY)
      ? event.clientY
      : rect.top + rect.height / 2;
    const rawX = bounds.x + (clientX - rect.left) / scale;
    const rawY = bounds.y + (clientY - rect.top) / scale;
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return;
    const x = Math.max(bounds.x, Math.min(bounds.x + bounds.w, rawX));
    const y = Math.max(bounds.y, Math.min(bounds.y + bounds.h, rawY));
    onCenter(x, y);
  };
  const viewportWidth = Math.min(minimapWidth, Math.max(8, viewport.w * scale));
  const viewportHeight = Math.min(
    minimapHeight,
    Math.max(8, viewport.h * scale),
  );
  const viewportLeft = Math.max(
    0,
    Math.min(minimapWidth - viewportWidth, (viewport.x - bounds.x) * scale),
  );
  const viewportTop = Math.max(
    0,
    Math.min(minimapHeight - viewportHeight, (viewport.y - bounds.y) * scale),
  );

  return (
    <div
      className="cc-minimap"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="cc-minimap-canvas"
        role="button"
        tabIndex={0}
        aria-label="Move viewport"
        onPointerDown={(event) => {
          centerFromEvent(event);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) centerFromEvent(event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onFit();
          }
        }}
      >
        {nodes.slice(0, 300).map((node, index) => (
          <span
            key={index}
            className="cc-minimap-blob"
            style={{
              left: (node.x - bounds.x) * scale,
              top: (node.y - bounds.y) * scale,
              width: Math.max(2, node.w * scale),
              height: Math.max(2, node.h * scale),
              background: node.fill.background,
              border: node.fill.isTransparent
                ? "0"
                : `1px solid ${node.fill.border}`,
            }}
          />
        ))}
        <span
          className="cc-minimap-vp"
          style={{
            left: viewportLeft,
            top: viewportTop,
            width: viewportWidth,
            height: viewportHeight,
          }}
        />
      </div>
      <div className="cc-minimap-controls">
        <button type="button" aria-label="Fit view" onClick={onFit}>
          <Maximize size={14} />
        </button>
        <button type="button" aria-label="Zoom in" onClick={onZoomIn}>
          <Plus size={14} />
        </button>
        <button type="button" aria-label="Zoom out" onClick={onZoomOut}>
          <Minus size={14} />
        </button>
      </div>
    </div>
  );
}
