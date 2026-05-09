import {
  isNodeOnCanvas,
  type Bounds,
  type CapabilityDocument,
} from "../document/types";

export type BoxBounds = Pick<Bounds, "x" | "y" | "w" | "h">;

export function emptyBounds(): Bounds {
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function boundsForBoxes(boxes: readonly BoxBounds[]): Bounds | null {
  if (boxes.length === 0) return null;

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const box of boxes) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.w);
    bottom = Math.max(bottom, box.y + box.h);
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function boundsForCanvasNodes(doc: CapabilityDocument): Bounds {
  return (
    boundsForBoxes(Object.values(doc.nodesById).filter(isNodeOnCanvas)) ??
    emptyBounds()
  );
}

export function expandBounds(bounds: Bounds, padding: number): Bounds {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    w: bounds.w + padding * 2,
    h: bounds.h + padding * 2,
  };
}

export function isUsableBounds(bounds: Bounds | undefined): bounds is Bounds {
  return (
    !!bounds &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.w) &&
    Number.isFinite(bounds.h) &&
    bounds.w > 0 &&
    bounds.h > 0
  );
}

export function rectanglesOverlap(left: BoxBounds, right: BoxBounds): boolean {
  return (
    left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y
  );
}
