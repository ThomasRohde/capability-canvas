import {
  canvasChildrenOf,
  canvasRootChildren,
  computeHierarchyDepths,
  isNodeOnCanvas,
  type CapabilityDocument,
  type CapabilityNode,
  type LayoutAspectRatioTarget,
  type NodeId,
} from "../document/types";
import { expandBoundsToAspectRatioFrame } from "./aspectRatio";
import {
  boundsForBoxes,
  boundsForCanvasNodes,
  emptyBounds,
  sameBounds,
} from "./bounds";
import { ROOT_OFFSET } from "./constants";
import { snapLayoutSpacing } from "./grid";
import type { LayoutPatch, LayoutResult } from "./types";

/**
 * Applies layout-generated geometry patches. Persisted callers should still run
 * the full layout pipeline: layoutDocument -> applyLayoutPatches ->
 * ensureParentContainment.
 */
export function applyLayoutPatches(
  doc: CapabilityDocument,
  patches: LayoutPatch[],
): CapabilityDocument {
  if (patches.length === 0) return doc;
  const nodesById = { ...doc.nodesById };
  let changed = false;
  const patchedIds = new Set<NodeId>();
  for (const patch of patches) {
    const node = nodesById[patch.id];
    if (!node) continue;
    if (node.isLockedAsIs) continue;
    patchedIds.add(patch.id);
    const nextX = Math.round(patch.x);
    const nextY = Math.round(patch.y);
    if (
      node.x === nextX &&
      node.y === nextY &&
      node.w === patch.w &&
      node.h === patch.h
    ) {
      continue;
    }
    changed = true;
    nodesById[patch.id] = {
      ...node,
      x: nextX,
      y: nextY,
      w: patch.w,
      h: patch.h,
      updatedAt: Date.now(),
    };
  }
  if (changed)
    changed =
      normalizePatchedParentBounds(doc, nodesById, patchedIds) || changed;
  if (!changed) return doc;
  const bounds = computeDocumentBounds({ ...doc, nodesById });
  return {
    ...doc,
    nodesById,
    layout: {
      ...doc.layout,
      isUserArranged: false,
      boundingBox: bounds,
      aspectRatioFrame: undefined,
      aspectRatioTarget: undefined,
    },
    timestamp: Date.now(),
  };
}

export function applyLayoutMetadata(
  doc: CapabilityDocument,
  result: LayoutResult,
): CapabilityDocument {
  const boundingBox = computeDocumentBounds(doc);
  const aspectRatioFrame = result.aspectRatioTarget
    ? expandBoundsToAspectRatioFrame(
        doc,
        boundingBox,
        result.aspectRatioTarget,
        ROOT_OFFSET,
      )
    : undefined;
  const aspectRatioTarget = result.aspectRatioTarget
    ? { ...result.aspectRatioTarget }
    : undefined;
  if (
    sameBounds(doc.layout.boundingBox, boundingBox) &&
    sameBounds(doc.layout.aspectRatioFrame, aspectRatioFrame) &&
    sameAspectRatioTarget(doc.layout.aspectRatioTarget, aspectRatioTarget)
  ) {
    return doc;
  }

  return {
    ...doc,
    layout: {
      ...doc.layout,
      boundingBox,
      aspectRatioFrame,
      aspectRatioTarget,
    },
  };
}

export function computeDocumentBounds(doc: CapabilityDocument) {
  return boundsForCanvasNodes(doc);
}

export function computePatchedDocumentBounds(
  doc: CapabilityDocument,
  patches: LayoutPatch[],
) {
  const patchById = new Map(patches.map((patch) => [patch.id, patch]));
  const boxes = Object.values(doc.nodesById)
    .filter(isNodeOnCanvas)
    .map((node) => patchById.get(node.id) ?? node);
  return boundsForBoxes(boxes) ?? emptyBounds();
}

export function childAreaTop(doc: CapabilityDocument, node: CapabilityNode) {
  return snapLayoutSpacing(
    doc,
    (node.layoutPreferences?.marginTop ?? doc.settings.containerPaddingTop) +
      doc.settings.containerTitleHeight,
  );
}

export function boundsForIds(doc: CapabilityDocument, ids: NodeId[]) {
  const nodes = ids
    .map((id) => doc.nodesById[id])
    .filter((node): node is CapabilityNode => !!node && isNodeOnCanvas(node));
  return boundsForBoxes(nodes);
}

export function translatePatches(
  source: LayoutPatch[],
  offsetX: number,
  offsetY: number,
  target: LayoutPatch[],
) {
  for (const patch of source) {
    target.push({
      id: patch.id,
      x: Math.round(offsetX + patch.x),
      y: Math.round(offsetY + patch.y),
      w: Math.round(patch.w),
      h: Math.round(patch.h),
    });
  }
}

export function stablePatches(patches: LayoutPatch[]): LayoutPatch[] {
  const byId = new Map<NodeId, LayoutPatch>();
  for (const patch of patches) byId.set(patch.id, patch);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function normalizePatchedParentBounds(
  doc: CapabilityDocument,
  nodesById: CapabilityDocument["nodesById"],
  patchedIds: Set<NodeId>,
) {
  if (patchedIds.size === 0) return false;
  const nextDoc = { ...doc, nodesById };
  const depths = computeDepths(nextDoc);
  const parentIds = [...patchedIds]
    .filter((nodeId) => canvasChildrenOf(nextDoc, nodeId).length > 0)
    .sort((a, b) => (depths.get(b) ?? 0) - (depths.get(a) ?? 0));
  let changed = false;

  for (const parentId of parentIds) {
    const parent = nodesById[parentId];
    if (!parent) continue;
    if (parent.isLockedAsIs || parent.isManualPositioningEnabled) continue;
    const childBounds = boundsForIds(
      nextDoc,
      canvasChildrenOf(nextDoc, parentId),
    );
    if (!childBounds) continue;
    const margin = {
      top: childAreaTop(nextDoc, parent),
      right:
        parent.layoutPreferences?.marginRight ??
        nextDoc.settings.containerPaddingRight,
      bottom:
        parent.layoutPreferences?.marginBottom ??
        nextDoc.settings.containerPaddingBottom,
      left:
        parent.layoutPreferences?.marginLeft ??
        nextDoc.settings.containerPaddingLeft,
    };
    const x = Math.min(parent.x, childBounds.x - margin.left);
    const y = Math.min(parent.y, childBounds.y - margin.top);
    const right = Math.max(
      parent.x + parent.w,
      childBounds.x + childBounds.w + margin.right,
    );
    const bottom = Math.max(
      parent.y + parent.h,
      childBounds.y + childBounds.h + margin.bottom,
    );
    const w = right - x;
    const h = bottom - y;
    if (x === parent.x && y === parent.y && w === parent.w && h === parent.h)
      continue;
    changed = true;
    nodesById[parentId] = {
      ...parent,
      x,
      y,
      w,
      h,
      updatedAt: Date.now(),
    };
  }

  return changed;
}

function computeDepths(doc: CapabilityDocument): Map<NodeId, number> {
  return computeHierarchyDepths(doc, canvasRootChildren(doc), {
    canvasOnly: true,
  }).depths;
}

function sameAspectRatioTarget(
  left: LayoutAspectRatioTarget | undefined,
  right: LayoutAspectRatioTarget | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.w === right.w && left.h === right.h;
}
