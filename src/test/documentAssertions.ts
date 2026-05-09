import { expect } from "vitest";
import { useDocumentStore } from "../app/stores/documentStore";
import type {
  Bounds,
  CapabilityDocument,
  NodeId,
} from "../domain/document/types";
import { resolveVisualDocument } from "../domain/visual/workspace";

export function expectActiveViewNodeOnCanvas(nodeId: NodeId) {
  expect(activeVisualNode(nodeId)?.isOnCanvas).toBe(true);
}

export function expectActiveViewNodeHidden(nodeId: NodeId) {
  expect(activeVisualNode(nodeId)?.isOnCanvas).toBe(false);
}

export function expectNodeBounds(nodeId: NodeId, bounds: Partial<Bounds>) {
  expect(activeVisualNode(nodeId)).toMatchObject(bounds);
}

export function normalizeCssColor(color: string): string {
  if (!color.startsWith("#")) return color;
  const value = color.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgb(${red}, ${green}, ${blue})`;
}

export function geometrySnapshot(doc: CapabilityDocument, ids: NodeId[]) {
  return Object.fromEntries(
    ids.map((id) => {
      const node = doc.nodesById[id]!;
      return [id, { x: node.x, y: node.y, w: node.w, h: node.h }];
    }),
  );
}

export function expectChildrenInsideParent(
  doc: CapabilityDocument,
  parentId: NodeId,
  childIds: NodeId[],
) {
  const parent = doc.nodesById[parentId]!;
  for (const childId of childIds) {
    const child = doc.nodesById[childId]!;
    expect(child.x).toBeGreaterThanOrEqual(parent.x);
    expect(child.y).toBeGreaterThanOrEqual(parent.y);
    expect(child.x + child.w).toBeLessThanOrEqual(parent.x + parent.w);
    expect(child.y + child.h).toBeLessThanOrEqual(parent.y + parent.h);
  }
}

function activeVisualNode(nodeId: NodeId) {
  return resolveVisualDocument(useDocumentStore.getState().doc).nodesById[
    nodeId
  ];
}
