import { cloneDocument } from "../document/normalize";
import {
  canvasChildrenOf,
  canvasRootChildren,
  computeHierarchyDepths,
  isNodeOnCanvas,
  type Bounds,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../document/types";

export interface ContainmentResult {
  doc: CapabilityDocument;
  changedNodeIds: NodeId[];
}

export function findParentContainmentViolations(
  doc: CapabilityDocument,
): string[] {
  const violations: string[] = [];
  for (const parent of Object.values(doc.nodesById)) {
    if (!isNodeOnCanvas(parent)) continue;
    for (const childId of canvasChildrenOf(doc, parent.id)) {
      const child = doc.nodesById[childId];
      if (!child) continue;
      if (
        child.x < parent.x ||
        child.y < parent.y ||
        child.x + child.w > parent.x + parent.w ||
        child.y + child.h > parent.y + parent.h
      ) {
        violations.push(`${parent.id}->${child.id}`);
      }
    }
  }
  return violations;
}

export function ensureParentContainment(
  doc: CapabilityDocument,
): ContainmentResult {
  const depths = computeDepths(doc);
  const parentIds = Object.keys(doc.nodesById)
    .filter(
      (nodeId) =>
        isNodeOnCanvas(doc.nodesById[nodeId]) &&
        canvasChildrenOf(doc, nodeId).length > 0,
    )
    .sort((a, b) => (depths.get(b) ?? 0) - (depths.get(a) ?? 0));

  let next = doc;
  const changedNodeIds: NodeId[] = [];

  for (const parentId of parentIds) {
    const parent = next.nodesById[parentId];
    if (!parent || parent.isLockedAsIs || parent.isManualPositioningEnabled)
      continue;

    const childBounds = boundsForIds(next, canvasChildrenOf(next, parentId));
    if (!childBounds) continue;

    const margin = containmentMargin(next, parentId);
    const currentRight = parent.x + parent.w;
    const currentBottom = parent.y + parent.h;
    const x = Math.min(parent.x, childBounds.x - margin.left);
    const y = Math.min(parent.y, childBounds.y - margin.top);
    const right = Math.max(
      currentRight,
      childBounds.x + childBounds.w + margin.right,
    );
    const bottom = Math.max(
      currentBottom,
      childBounds.y + childBounds.h + margin.bottom,
    );
    const w = right - x;
    const h = bottom - y;

    if (x !== parent.x || y !== parent.y || w !== parent.w || h !== parent.h) {
      if (next === doc) next = cloneDocument(doc);
      next.nodesById[parentId] = {
        ...parent,
        x,
        y,
        w,
        h,
        updatedAt: Date.now(),
      };
      changedNodeIds.push(parentId);
    }
  }

  if (next === doc) return { doc, changedNodeIds };
  return {
    doc: {
      ...next,
      layout: {
        ...next.layout,
        boundingBox: computeBounds(next),
        aspectRatioFrame: undefined,
        aspectRatioTarget: undefined,
      },
    },
    changedNodeIds,
  };
}

function containmentMargin(doc: CapabilityDocument, parentId: NodeId) {
  const parent = doc.nodesById[parentId];
  return {
    top:
      (parent?.layoutPreferences?.marginTop ??
        doc.settings.containerPaddingTop) + doc.settings.containerTitleHeight,
    right:
      parent?.layoutPreferences?.marginRight ??
      doc.settings.containerPaddingRight,
    bottom:
      parent?.layoutPreferences?.marginBottom ??
      doc.settings.containerPaddingBottom,
    left:
      parent?.layoutPreferences?.marginLeft ??
      doc.settings.containerPaddingLeft,
  };
}

function computeDepths(doc: CapabilityDocument): Map<NodeId, number> {
  return computeHierarchyDepths(doc, canvasRootChildren(doc), {
    canvasOnly: true,
  }).depths;
}

function boundsForIds(doc: CapabilityDocument, ids: NodeId[]): Bounds | null {
  const nodes = ids
    .map((id) => doc.nodesById[id])
    .filter((node): node is CapabilityNode => !!node && isNodeOnCanvas(node));
  if (nodes.length === 0) return null;
  const x = Math.min(...nodes.map((node) => node.x));
  const y = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.w));
  const maxY = Math.max(...nodes.map((node) => node.y + node.h));
  return { x, y, w: maxX - x, h: maxY - y };
}

function computeBounds(doc: CapabilityDocument): Bounds {
  const nodes = Object.values(doc.nodesById).filter(isNodeOnCanvas);
  if (nodes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...nodes.map((node) => node.x));
  const y = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.w));
  const maxY = Math.max(...nodes.map((node) => node.y + node.h));
  return { x, y, w: maxX - x, h: maxY - y };
}
