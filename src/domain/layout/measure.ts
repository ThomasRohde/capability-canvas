import {
  canvasChildrenOf,
  collectDescendantIds,
  isNodeOnCanvas,
  type CapabilityDocument,
  type CapabilityNode,
  type LayoutAspectRatioTarget,
  type LayoutMode,
  type NodeId,
} from "../document/types";
import type { Diagnostic } from "../validation/diagnostics";
import { info, warning } from "../validation/diagnostics";
import { boundsForBoxes } from "./bounds";
import {
  snapLayoutDelta,
  snapLayoutSize,
  snapLayoutSpacing,
  snapLayoutStartAfter,
} from "./grid";
import {
  boundsForIds,
  childAreaTop,
  translatePatches,
} from "./patches";
import { packBoxes, type PackedBox } from "./packing";
import type { LayoutPatch } from "./types";

export interface MeasuredSubtree {
  id: NodeId;
  w: number;
  h: number;
  patches: LayoutPatch[];
  blocked: boolean;
  diagnostics: Diagnostic[];
}

export async function placeMeasuredDocumentRoots(
  doc: CapabilityDocument,
  measuredRoots: MeasuredSubtree[],
  mode: LayoutMode,
  aspectRatioTarget: LayoutAspectRatioTarget | null,
  rootOffset: number,
  rootGapY: number,
): Promise<{ patches: LayoutPatch[]; diagnostics: Diagnostic[] }> {
  const patches: LayoutPatch[] = [];
  const diagnostics: Diagnostic[] = [];
  const blockedRoots = measuredRoots.filter((measured) => measured.blocked);
  const freeRoots = measuredRoots.filter((measured) => !measured.blocked);
  const byId = new Map(
    measuredRoots.map((measured) => [measured.id, measured]),
  );

  if (blockedRoots.length > 0) {
    const blockedBoxes: Array<{ x: number; y: number; w: number; h: number }> =
      [];
    for (const measured of blockedRoots) {
      const node = doc.nodesById[measured.id];
      if (!node) continue;
      translatePatches(measured.patches, node.x, node.y, patches);
      blockedBoxes.push({ x: node.x, y: node.y, w: measured.w, h: measured.h });
    }

    if (freeRoots.length > 0) {
      const packedFreeRoots = await packBoxes(
        freeRoots.map((measured) => ({
          id: measured.id,
          w: measured.w,
          h: measured.h,
        })),
        snapLayoutSpacing(doc, doc.settings.childGapX),
        rootGapY,
        mode,
        aspectRatioTarget,
        "document-roots",
        doc,
      );
      diagnostics.push(...packedFreeRoots.diagnostics);
      const blockedBounds = boundsForBoxes(blockedBoxes);
      const startY = snapLayoutStartAfter(
        doc,
        Math.max(
          rootOffset,
          blockedBounds ? blockedBounds.y + blockedBounds.h + rootGapY : 0,
        ),
      );
      for (const packed of packedFreeRoots.boxes) {
        const measured = byId.get(packed.id);
        if (!measured) continue;
        translatePatches(
          measured.patches,
          rootOffset + packed.x,
          startY + packed.y,
          patches,
        );
      }
    }

    return { patches, diagnostics };
  }

  const packedRoots = await packBoxes(
    measuredRoots.map((measured) => ({
      id: measured.id,
      w: measured.w,
      h: measured.h,
    })),
    snapLayoutSpacing(doc, doc.settings.childGapX),
    rootGapY,
    mode,
    aspectRatioTarget,
    "document-roots",
    doc,
  );
  diagnostics.push(...packedRoots.diagnostics);
  for (const packed of packedRoots.boxes) {
    const measured = byId.get(packed.id);
    if (!measured) continue;
    translatePatches(
      measured.patches,
      rootOffset + packed.x,
      rootOffset + packed.y,
      patches,
    );
  }

  return { patches, diagnostics };
}

export async function measureSubtree(
  doc: CapabilityDocument,
  nodeId: NodeId,
  mode: LayoutMode,
  aspectRatioTarget: LayoutAspectRatioTarget | null,
  activePath = new Set<NodeId>(),
): Promise<MeasuredSubtree> {
  if (activePath.has(nodeId)) {
    return {
      id: nodeId,
      w: 0,
      h: 0,
      patches: [],
      blocked: true,
      diagnostics: [
        warning(
          "layout-cycle-skipped",
          `Auto layout skipped cyclic subtree at "${nodeId}".`,
          nodeId,
        ),
      ],
    };
  }

  const node = doc.nodesById[nodeId];
  if (!node) return emptyMeasured(nodeId);
  if (!isNodeOnCanvas(node)) return emptyMeasured(nodeId);
  const nextPath = new Set(activePath);
  nextPath.add(nodeId);

  if (node.isLockedAsIs) {
    return {
      id: node.id,
      w: node.w,
      h: node.h,
      patches: [],
      blocked: true,
      diagnostics: [
        warning(
          "locked-subtree-preserved",
          `Locked node "${node.label}" was preserved.`,
          node.id,
        ),
      ],
    };
  }

  const childIds = canvasChildrenOf(doc, node.id);
  if (childIds.length === 0) {
    const size = nodeSize(doc, node);
    return {
      id: node.id,
      w: size.w,
      h: size.h,
      patches: [{ id: node.id, x: 0, y: 0, w: size.w, h: size.h }],
      blocked: false,
      diagnostics: [],
    };
  }

  if (node.isManualPositioningEnabled) {
    return measureManualSubtree(doc, node);
  }

  const margin = nodeMargin(doc, node);
  const gapX = snapLayoutSpacing(
    doc,
    node.layoutPreferences?.gapX ?? doc.settings.childGapX,
  );
  const gapY = snapLayoutSpacing(
    doc,
    node.layoutPreferences?.gapY ?? doc.settings.childGapY,
  );
  const localMode = node.layoutPreferences?.mode ?? mode;
  const measuredChildren = await Promise.all(
    childIds.map((childId) =>
      measureSubtree(doc, childId, localMode, aspectRatioTarget, nextPath),
    ),
  );
  const diagnostics = measuredChildren.flatMap((child) => child.diagnostics);

  if (measuredChildren.some((child) => child.blocked)) {
    return measureAnchoredSubtree(
      doc,
      node,
      measuredChildren,
      margin,
      gapX,
      gapY,
      localMode,
      aspectRatioTarget,
      diagnostics,
    );
  }

  const packed = await packBoxes(
    measuredChildren.map((child) => ({ id: child.id, w: child.w, h: child.h })),
    gapX,
    gapY,
    localMode,
    aspectRatioTarget,
    node.id,
    doc,
  );
  diagnostics.push(...packed.diagnostics);

  const childById = new Map(measuredChildren.map((child) => [child.id, child]));
  const uniformHeightById = uniformLeafGroupHeights(
    doc,
    packed.boxes,
    measuredChildren,
    localMode,
  );
  const childPatches: LayoutPatch[] = [];
  const childBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const packedChild of packed.boxes) {
    const child = childById.get(packedChild.id);
    if (!child) continue;
    const childX = Math.round(margin.left + packedChild.x);
    const childY = Math.round(childAreaTop(doc, node) + packedChild.y);
    const childHeight = uniformHeightById.get(child.id) ?? child.h;
    translatePatches(
      patchesWithRootHeight(child.patches, child.id, childHeight),
      childX,
      childY,
      childPatches,
    );
    childBoxes.push({
      x: childX,
      y: childY,
      w: Math.round(child.w),
      h: Math.round(childHeight),
    });
  }

  const minSize = nodeSize(doc, node);
  const initialChildBounds = boundsForBoxes(childBoxes);
  const initialW = Math.max(
    minSize.w,
    initialChildBounds
      ? initialChildBounds.x + initialChildBounds.w + margin.right
      : margin.left + packed.w + margin.right,
  );
  const childBounds =
    localMode === "adaptive"
      ? centerChildPatchesHorizontally(
          doc,
          childPatches,
          childBoxes,
          initialW,
          margin,
        )
      : initialChildBounds;
  const contentHeight = childBounds
    ? childBounds.y + childBounds.h + margin.bottom
    : childAreaTop(doc, node) + packed.h + margin.bottom;
  const next = {
    id: node.id,
    x: 0,
    y: 0,
    w: Math.max(
      minSize.w,
      childBounds
        ? childBounds.x + childBounds.w + margin.right
        : margin.left + packed.w + margin.right,
    ),
    h: Math.max(localMode === "flow" ? 1 : minSize.h, contentHeight),
  };

  return {
    id: node.id,
    w: next.w,
    h: next.h,
    patches: [next, ...childPatches],
    blocked: false,
    diagnostics,
  };
}

function uniformLeafGroupHeights(
  doc: CapabilityDocument,
  boxes: PackedBox[],
  measuredChildren: MeasuredSubtree[],
  mode: LayoutMode,
) {
  const heights = new Map<NodeId, number>();
  if (mode !== "uniform") return heights;

  const measuredById = new Map(
    measuredChildren.map((child) => [child.id, child]),
  );
  const rows: PackedBox[][] = [];
  for (const box of boxes) {
    const row = rows.find(
      (candidate) => Math.abs(candidate[0]!.y - box.y) <= 1,
    );
    if (row) row.push(box);
    else rows.push([box]);
  }

  for (const row of rows) {
    const leafGroupBoxes = row.filter((box) =>
      isLeafGroupContainer(doc, box.id),
    );
    if (leafGroupBoxes.length < 2) continue;
    const rowHeight = Math.max(
      ...leafGroupBoxes.map((box) => measuredById.get(box.id)?.h ?? box.h),
    );
    for (const box of leafGroupBoxes) heights.set(box.id, rowHeight);
  }

  return heights;
}

function isLeafGroupContainer(doc: CapabilityDocument, nodeId: NodeId) {
  const childIds = canvasChildrenOf(doc, nodeId);
  return (
    childIds.length > 0 &&
    childIds.every((childId) => canvasChildrenOf(doc, childId).length === 0)
  );
}

function patchesWithRootHeight(
  patches: LayoutPatch[],
  rootId: NodeId,
  rootHeight: number,
) {
  return patches.map((patch) =>
    patch.id === rootId ? { ...patch, h: rootHeight } : patch,
  );
}

function centerChildPatchesHorizontally(
  doc: CapabilityDocument,
  childPatches: LayoutPatch[],
  childBoxes: Array<{ x: number; y: number; w: number; h: number }>,
  parentWidth: number,
  margin: ReturnType<typeof nodeMargin>,
) {
  const bounds = boundsForBoxes(childBoxes);
  if (!bounds) return bounds;

  const availableWidth = parentWidth - margin.left - margin.right;
  const spareWidth = availableWidth - bounds.w;
  if (spareWidth <= 0) return bounds;

  const targetX = margin.left + spareWidth / 2;
  const offsetX = snapLayoutDelta(doc, targetX - bounds.x);
  if (offsetX === 0) return bounds;

  for (const patch of childPatches) patch.x += offsetX;
  for (const box of childBoxes) box.x += offsetX;
  return boundsForBoxes(childBoxes);
}

async function measureAnchoredSubtree(
  doc: CapabilityDocument,
  node: CapabilityNode,
  measuredChildren: MeasuredSubtree[],
  margin: ReturnType<typeof nodeMargin>,
  gapX: number,
  gapY: number,
  mode: LayoutMode,
  aspectRatioTarget: LayoutAspectRatioTarget | null,
  diagnostics: Diagnostic[],
): Promise<MeasuredSubtree> {
  const childPatches: LayoutPatch[] = [];
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  const blockedChildren = measuredChildren.filter((child) => child.blocked);
  const freeChildren = measuredChildren.filter((child) => !child.blocked);

  for (const child of blockedChildren) {
    const childNode = doc.nodesById[child.id];
    if (!childNode) continue;
    const x = childNode.x - node.x;
    const y = childNode.y - node.y;
    translatePatches(child.patches, x, y, childPatches);
    boxes.push({ x, y, w: child.w, h: child.h });
  }

  const blockedBounds = boundsForBoxes(boxes);
  if (freeChildren.length > 0) {
    const packed = await packBoxes(
      freeChildren.map((child) => ({ id: child.id, w: child.w, h: child.h })),
      gapX,
      gapY,
      mode,
      aspectRatioTarget,
      node.id,
      doc,
    );
    diagnostics.push(...packed.diagnostics);
    const childById = new Map(freeChildren.map((child) => [child.id, child]));
    const startX = margin.left;
    const startY = snapLayoutStartAfter(
      doc,
      Math.max(
        childAreaTop(doc, node),
        blockedBounds ? blockedBounds.y + blockedBounds.h + gapY : 0,
      ),
    );
    for (const packedChild of packed.boxes) {
      const child = childById.get(packedChild.id);
      if (!child) continue;
      const x = startX + packedChild.x;
      const y = startY + packedChild.y;
      translatePatches(child.patches, x, y, childPatches);
      boxes.push({ x, y, w: child.w, h: child.h });
    }
  }

  const contentBounds = boundsForBoxes(boxes);
  const next = {
    id: node.id,
    x: 0,
    y: 0,
    w: Math.max(
      node.w,
      contentBounds
        ? contentBounds.x + contentBounds.w + margin.right
        : doc.settings.defaultParentWidth,
    ),
    h: Math.max(
      node.h,
      contentBounds
        ? contentBounds.y + contentBounds.h + margin.bottom
        : doc.settings.defaultParentHeight,
    ),
  };

  return {
    id: node.id,
    w: next.w,
    h: next.h,
    patches: [next, ...childPatches],
    blocked: true,
    diagnostics,
  };
}

function measureManualSubtree(
  doc: CapabilityDocument,
  node: CapabilityNode,
): MeasuredSubtree {
  const patches: LayoutPatch[] = [];
  const margin = nodeMargin(doc, node);
  const childIds = canvasChildrenOf(doc, node.id);
  const childBounds = boundsForIds(doc, childIds);
  const requiredW = childBounds
    ? childBounds.x - node.x + childBounds.w + margin.right
    : doc.settings.defaultParentWidth;
  const requiredH = childBounds
    ? childBounds.y - node.y + childBounds.h + margin.bottom
    : doc.settings.defaultParentHeight;
  const parentPatch = {
    id: node.id,
    x: 0,
    y: 0,
    w: Math.max(node.w, requiredW),
    h: Math.max(node.h, requiredH),
  };
  patches.push(parentPatch);
  collectCurrentSubtreePatches(doc, node.id, node.x, node.y, patches);
  const traversalDiagnostics = collectDescendantIds(doc, node.id, {
    canvasOnly: true,
  })
    .issues.filter((issue) => issue.code === "cycle")
    .map((issue) =>
      warning(
        "layout-cycle-skipped",
        `Auto layout skipped cyclic subtree at "${issue.nodeId}".`,
        issue.nodeId,
      ),
    );
  return {
    id: node.id,
    w: parentPatch.w,
    h: parentPatch.h,
    patches,
    blocked: true,
    diagnostics: [
      info(
        "manual-subtree-preserved",
        `Manual child positions under "${node.label}" were preserved.`,
        node.id,
      ),
      ...traversalDiagnostics,
    ],
  };
}

function nodeSize(doc: CapabilityDocument, node: CapabilityNode) {
  if (node.isTextLabel || node.type === "text")
    return {
      w: snapLayoutSize(doc, node.w),
      h: snapLayoutSize(doc, node.h),
    };
  if (node.type === "leaf")
    return {
      w: snapLayoutSize(doc, doc.settings.fixedLeafWidth),
      h: snapLayoutSize(doc, doc.settings.fixedLeafHeight),
    };
  return {
    w: snapLayoutSize(doc, doc.settings.defaultParentWidth),
    h: snapLayoutSize(doc, doc.settings.defaultParentHeight),
  };
}

function nodeMargin(doc: CapabilityDocument, node: CapabilityNode) {
  return {
    top: snapLayoutSpacing(
      doc,
      node.layoutPreferences?.marginTop ?? doc.settings.containerPaddingTop,
    ),
    right: snapLayoutSpacing(
      doc,
      node.layoutPreferences?.marginRight ?? doc.settings.containerPaddingRight,
    ),
    bottom: snapLayoutSpacing(
      doc,
      node.layoutPreferences?.marginBottom ??
        doc.settings.containerPaddingBottom,
    ),
    left: snapLayoutSpacing(
      doc,
      node.layoutPreferences?.marginLeft ?? doc.settings.containerPaddingLeft,
    ),
  };
}

function collectCurrentSubtreePatches(
  doc: CapabilityDocument,
  nodeId: NodeId,
  originX: number,
  originY: number,
  patches: LayoutPatch[],
  activePath = new Set<NodeId>(),
) {
  if (activePath.has(nodeId)) return;
  const nextPath = new Set(activePath);
  nextPath.add(nodeId);
  for (const childId of canvasChildrenOf(doc, nodeId)) {
    if (nextPath.has(childId)) continue;
    const child = doc.nodesById[childId];
    if (!child) continue;
    patches.push({
      id: child.id,
      x: child.x - originX,
      y: child.y - originY,
      w: child.w,
      h: child.h,
    });
    collectCurrentSubtreePatches(
      doc,
      child.id,
      originX,
      originY,
      patches,
      nextPath,
    );
  }
}

function emptyMeasured(nodeId: NodeId): MeasuredSubtree {
  return {
    id: nodeId,
    w: 0,
    h: 0,
    patches: [],
    blocked: true,
    diagnostics: [],
  };
}
