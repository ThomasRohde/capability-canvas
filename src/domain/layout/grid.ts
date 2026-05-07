import type { CapabilityDocument } from "../document/types";

export function gridSizeFor(doc: CapabilityDocument): number {
  return Math.max(1, Math.round(doc.settings.gridSize || 1));
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapLengthUpToGrid(value: number, gridSize: number): number {
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  return Math.ceil(rounded / gridSize) * gridSize;
}

export function snapCoordinate(doc: CapabilityDocument, value: number): number {
  return snapLayoutCoordinate(doc, value);
}

export function snapLayoutCoordinate(
  doc: CapabilityDocument,
  value: number,
): number {
  const rounded = Math.round(value);
  return doc.settings.gridEnabled
    ? snapToGrid(rounded, gridSizeFor(doc))
    : rounded;
}

export function snapLayoutDelta(
  doc: CapabilityDocument,
  value: number,
): number {
  const rounded = Math.round(value);
  return doc.settings.gridEnabled
    ? snapToGrid(rounded, gridSizeFor(doc))
    : rounded;
}

export function snapLayoutSize(doc: CapabilityDocument, value: number): number {
  const rounded = Math.round(value);
  if (!doc.settings.gridEnabled) return Math.max(1, rounded);
  return Math.max(1, snapLengthUpToGrid(rounded, gridSizeFor(doc)));
}

export function snapLayoutSpacing(
  doc: CapabilityDocument,
  value: number,
): number {
  const rounded = Math.round(value);
  if (!doc.settings.gridEnabled) return Math.max(0, rounded);
  return snapLengthUpToGrid(rounded, gridSizeFor(doc));
}

export function snapLayoutStartAfter(
  doc: CapabilityDocument,
  value: number,
): number {
  const rounded = Math.round(value);
  if (!doc.settings.gridEnabled) return rounded;
  return snapLengthUpToGrid(rounded, gridSizeFor(doc));
}
