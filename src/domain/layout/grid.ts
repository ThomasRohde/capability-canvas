import type { CapabilityDocument } from "../document/types";

export function gridSizeFor(doc: CapabilityDocument): number {
  return Math.max(1, Math.round(doc.settings.gridSize || 1));
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapCoordinate(doc: CapabilityDocument, value: number): number {
  const rounded = Math.round(value);
  return doc.settings.gridEnabled
    ? snapToGrid(rounded, gridSizeFor(doc))
    : rounded;
}
