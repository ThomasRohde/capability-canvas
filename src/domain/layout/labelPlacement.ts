import {
  isNodeOnCanvas,
  type Bounds,
  type CapabilityDocument,
} from "../document/types";
import { boundsForBoxes, rectanglesOverlap } from "./bounds";
import { snapCoordinate, snapLayoutSpacing } from "./grid";

export const DEFAULT_CANVAS_LABEL_WIDTH = 180;
export const DEFAULT_CANVAS_LABEL_HEIGHT = 40;
const DEFAULT_LABEL_ORIGIN = 24;
const MAX_SCAN_ROWS = 32;
const MAX_SCAN_COLUMNS = 32;

export interface LabelPlacementOptions {
  w?: number;
  h?: number;
}

export function findTopLeftFreeLabelPlacement(
  doc: CapabilityDocument,
  options: LabelPlacementOptions = {},
): Bounds {
  const w = options.w ?? DEFAULT_CANVAS_LABEL_WIDTH;
  const h = options.h ?? DEFAULT_CANVAS_LABEL_HEIGHT;
  const occupied = Object.values(doc.nodesById)
    .filter(isNodeOnCanvas)
    .map(({ x, y, w: nodeW, h: nodeH }) => ({
      x,
      y,
      w: nodeW,
      h: nodeH,
    }));
  const contentBounds = boundsForBoxes(occupied);
  const startX = snapCoordinate(doc, contentBounds?.x ?? DEFAULT_LABEL_ORIGIN);
  const startY = snapCoordinate(doc, contentBounds?.y ?? DEFAULT_LABEL_ORIGIN);
  const gapX = snapLayoutSpacing(doc, doc.settings.childGapX);
  const gapY = snapLayoutSpacing(doc, doc.settings.childGapY);
  const stepX = snapLayoutSpacing(doc, w + gapX);
  const stepY = snapLayoutSpacing(doc, h + gapY);

  for (let row = 0; row < MAX_SCAN_ROWS; row += 1) {
    const y = snapCoordinate(doc, startY + row * stepY);
    for (let column = 0; column < MAX_SCAN_COLUMNS; column += 1) {
      const x = snapCoordinate(doc, startX + column * stepX);
      const candidate = { x, y, w, h };
      if (!occupied.some((node) => rectanglesOverlap(candidate, node))) {
        return candidate;
      }
    }
  }

  const fallbackY = contentBounds
    ? contentBounds.y + contentBounds.h + doc.settings.childGapY
    : DEFAULT_LABEL_ORIGIN;
  return {
    x: startX,
    y: snapCoordinate(doc, fallbackY),
    w,
    h,
  };
}
