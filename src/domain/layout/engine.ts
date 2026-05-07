import ELK, {
  type ELK as ElkInstance,
  type ElkNode,
} from "elkjs/lib/elk-api.js";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import {
  canvasChildrenOf,
  canvasRootChildren,
  isNodeOnCanvas,
  type CapabilityDocument,
  type CapabilityNode,
  type LayoutMode,
  type NodeId,
} from "../document/types";
import type { Diagnostic } from "../validation/diagnostics";
import { info, warning } from "../validation/diagnostics";
import {
  snapLayoutCoordinate,
  snapLayoutDelta,
  snapLayoutSize,
  snapLayoutSpacing,
  snapLayoutStartAfter,
} from "./grid";
import {
  type LayoutPatch,
  type LayoutRequest,
  type LayoutResult,
} from "./types";

const ROOT_OFFSET = 24;
const ROOT_GAP_Y = 32;

let elk: ElkInstance | undefined;

function getElk() {
  elk ??= new ELK({ algorithms: ["rectpacking"], workerUrl: elkWorkerUrl });
  return elk;
}

interface MeasuredSubtree {
  id: NodeId;
  w: number;
  h: number;
  patches: LayoutPatch[];
  blocked: boolean;
  diagnostics: Diagnostic[];
}

interface Box {
  id: NodeId;
  w: number;
  h: number;
}

interface PackedBox extends Box {
  x: number;
  y: number;
}

interface PackedBoxes {
  boxes: PackedBox[];
  w: number;
  h: number;
  diagnostics: Diagnostic[];
}

interface NormalizedLayoutScope {
  rootIds: NodeId[];
  documentScope: boolean;
  diagnostics: Diagnostic[];
}

export async function layoutDocument(
  request: LayoutRequest,
): Promise<LayoutResult> {
  const doc = request.doc;
  const mode = request.mode ?? doc.layout.mode ?? doc.settings.layoutMode;
  const rootOffset = snapLayoutSpacing(doc, ROOT_OFFSET);
  const rootGapY = snapLayoutSpacing(doc, ROOT_GAP_Y);
  if (mode === "free") {
    return {
      patches: [],
      diagnostics: [
        {
          code: "free-layout-preserved",
          severity: "info",
          message: "Freeform layout preserves the current positions.",
        },
      ],
    };
  }

  if (
    doc.layout.preservePositions &&
    !request.force &&
    doc.layout.isUserArranged
  ) {
    return {
      patches: [],
      diagnostics: [
        warning(
          "positions-preserved",
          "Imported or user-arranged positions were preserved.",
        ),
      ],
    };
  }

  const patches: LayoutPatch[] = [];
  const diagnostics: Diagnostic[] = [];
  const scopedRequest = !!request.affectedNodeIds?.length;
  const scope = scopedRequest
    ? normalizeScopedLayoutRoots(doc, request.affectedNodeIds!)
    : {
        rootIds: canvasRootChildren(doc),
        documentScope: true,
        diagnostics: [],
      };
  diagnostics.push(...scope.diagnostics);
  const roots = scope.rootIds;
  if (roots.length === 0) {
    return {
      patches: [],
      diagnostics: [
        ...diagnostics,
        info(
          scopedRequest
            ? "layout-scope-empty"
            : "layout-document-empty",
          scopedRequest
            ? "Auto layout skipped because no visible nodes matched the requested scope."
            : "Auto layout skipped because the document has no visible root capabilities.",
        ),
      ],
    };
  }
  const measuredRoots = await Promise.all(
    roots.map((rootId) => measureSubtree(doc, rootId, mode)),
  );
  for (const measured of measuredRoots)
    diagnostics.push(...measured.diagnostics);

  if (scopedRequest && !scope.documentScope) {
    for (const measured of measuredRoots) {
      const node = doc.nodesById[measured.id];
      if (!node) continue;
      translatePatches(
        measured.patches,
        snapLayoutCoordinate(doc, node.x),
        snapLayoutCoordinate(doc, node.y),
        patches,
      );
    }
    return finishLayoutResult(
      request,
      mode,
      patches,
      diagnostics,
      measuredRoots,
    );
  }

  const placedRoots = await placeMeasuredDocumentRoots(
    doc,
    measuredRoots,
    mode,
    rootOffset,
    rootGapY,
  );
  patches.push(...placedRoots.patches);
  diagnostics.push(...placedRoots.diagnostics);

  return finishLayoutResult(request, mode, patches, diagnostics, measuredRoots);
}

function normalizeScopedLayoutRoots(
  doc: CapabilityDocument,
  affectedNodeIds: NodeId[],
): NormalizedLayoutScope {
  const rootIds = new Set<NodeId>();
  const diagnostics: Diagnostic[] = [];
  let documentScope = false;

  for (const affectedNodeId of affectedNodeIds) {
    const node = doc.nodesById[affectedNodeId];
    if (!isNodeOnCanvas(node)) continue;

    const ancestors = canvasAncestorsOf(doc, node.id);
    const lockedAncestor = ancestors.find((ancestor) => ancestor.isLockedAsIs);
    if (lockedAncestor) {
      diagnostics.push(
        warning(
          "layout-scope-blocked-by-locked-ancestor",
          `Scoped auto layout for "${node.label}" was skipped because locked ancestor "${lockedAncestor.label}" preserves that subtree.`,
          node.id,
        ),
      );
      continue;
    }

    const manualAncestor = ancestors.find(
      (ancestor) => ancestor.isManualPositioningEnabled,
    );
    if (manualAncestor) {
      rootIds.add(manualAncestor.id);
      diagnostics.push(
        info(
          "layout-scope-promoted",
          `Scoped auto layout for "${node.label}" was promoted to manual ancestor "${manualAncestor.label}".`,
          manualAncestor.id,
        ),
      );
      continue;
    }

    const parent = ancestors[0];
    if (!parent) {
      documentScope = true;
      continue;
    }
    rootIds.add(parent.id);
  }

  if (documentScope) {
    return {
      rootIds: canvasRootChildren(doc),
      documentScope: true,
      diagnostics,
    };
  }

  return {
    rootIds: pruneDescendantScopeRoots(doc, [...rootIds]),
    documentScope: false,
    diagnostics,
  };
}

async function placeMeasuredDocumentRoots(
  doc: CapabilityDocument,
  measuredRoots: MeasuredSubtree[],
  mode: LayoutMode,
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
    },
    timestamp: Date.now(),
  };
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
  const depths = new Map<NodeId, number>();
  const visit = (nodeId: NodeId, depth: number) => {
    depths.set(nodeId, depth);
    for (const childId of canvasChildrenOf(doc, nodeId))
      visit(childId, depth + 1);
  };
  for (const rootId of canvasRootChildren(doc)) visit(rootId, 0);
  return depths;
}

function canvasAncestorsOf(
  doc: CapabilityDocument,
  nodeId: NodeId,
): CapabilityNode[] {
  const ancestors: CapabilityNode[] = [];
  const seen = new Set<NodeId>();
  let current = doc.nodesById[nodeId];
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    const parent = doc.nodesById[current.parentId];
    if (!parent) break;
    if (isNodeOnCanvas(parent)) ancestors.push(parent);
    current = parent;
  }
  return ancestors;
}

function pruneDescendantScopeRoots(
  doc: CapabilityDocument,
  rootIds: NodeId[],
): NodeId[] {
  return rootIds.filter(
    (rootId) =>
      !rootIds.some(
        (candidateId) =>
          candidateId !== rootId && isAncestorOf(doc, candidateId, rootId),
      ),
  );
}

function isAncestorOf(
  doc: CapabilityDocument,
  ancestorId: NodeId,
  nodeId: NodeId,
): boolean {
  const seen = new Set<NodeId>();
  let current = doc.nodesById[nodeId];
  while (current?.parentId && !seen.has(current.parentId)) {
    if (current.parentId === ancestorId) return true;
    seen.add(current.parentId);
    current = doc.nodesById[current.parentId];
  }
  return false;
}

export function computeDocumentBounds(doc: CapabilityDocument) {
  const nodes = Object.values(doc.nodesById).filter(isNodeOnCanvas);
  if (nodes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.w));
  const maxY = Math.max(...nodes.map((node) => node.y + node.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

async function measureSubtree(
  doc: CapabilityDocument,
  nodeId: NodeId,
  mode: LayoutMode,
): Promise<MeasuredSubtree> {
  const node = doc.nodesById[nodeId];
  if (!node) return emptyMeasured(nodeId);
  if (!isNodeOnCanvas(node)) return emptyMeasured(nodeId);

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
    childIds.map((childId) => measureSubtree(doc, childId, localMode)),
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
      diagnostics,
    );
  }

  const packed = await packBoxes(
    measuredChildren.map((child) => ({ id: child.id, w: child.w, h: child.h })),
    gapX,
    gapY,
    localMode,
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
    h: Math.max(
      localMode === "flow" ? 1 : minSize.h,
      contentHeight,
    ),
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
    const leafGroupBoxes = row.filter((box) => isLeafGroupContainer(doc, box.id));
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
    ],
  };
}

function finishLayoutResult(
  request: LayoutRequest,
  mode: LayoutMode,
  patches: LayoutPatch[],
  diagnostics: Diagnostic[],
  measuredRoots: MeasuredSubtree[],
): LayoutResult {
  const stable = stablePatches(patches);
  if (measuredRoots.some((measured) => measured.blocked)) {
    diagnostics.push(
      info(
        "layout-partial",
        "Auto layout preserved locked or manual areas and arranged the remaining eligible nodes.",
      ),
    );
  }
  diagnostics.push(
    info(
      stable.length === 0 ? "layout-noop" : "layout-applied",
      layoutOutcomeMessage(request, mode, stable.length),
    ),
  );
  return { patches: stable, diagnostics };
}

function layoutOutcomeMessage(
  request: LayoutRequest,
  mode: LayoutMode,
  patchCount: number,
): string {
  const scope = request.affectedNodeIds?.length ? "Scoped" : "Full";
  const force = request.force ? " with force" : "";
  const changes =
    patchCount === 0
      ? "made no geometry changes"
      : `applied ${patchCount} geometry ${patchCount === 1 ? "change" : "changes"}`;
  return `${scope} ${mode} auto layout ${changes}${force}.`;
}

async function packBoxes(
  boxes: Box[],
  gapX: number,
  gapY: number,
  mode: LayoutMode,
  scopeId: string,
  doc: CapabilityDocument,
): Promise<PackedBoxes> {
  if (boxes.length === 0) return { boxes: [], w: 0, h: 0, diagnostics: [] };
  if (boxes.length === 1) {
    const only = boxes[0]!;
    return {
      boxes: [{ ...only, x: 0, y: 0 }],
      w: only.w,
      h: only.h,
      diagnostics: [],
    };
  }

  const target = snapLayoutSize(doc, targetWidthFor(boxes, gapX, gapY, mode));
  if (mode === "adaptive")
    return adaptivePackRows(boxes, gapX, gapY, target, doc);
  if (mode === "uniform")
    return fallbackPackRows(boxes, gapX, gapY, target, false, doc);

  const estimatedHeight = Math.max(1, totalArea(boxes) / Math.max(1, target));
  const graph: ElkNode = {
    id: `pack-${scopeId}`,
    layoutOptions: {
      "elk.algorithm": "rectpacking",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
      "elk.spacing.nodeNode": String(Math.max(gapX, gapY)),
      "elk.aspectRatio": String(Math.max(0.25, target / estimatedHeight)),
      "elk.rectpacking.trybox": "false",
      "elk.rectpacking.orderBySize": "false",
      "org.eclipse.elk.rectpacking.widthApproximation.targetWidth":
        String(target),
    },
    children: boxes.map((box, index) => ({
      id: box.id,
      width: box.w,
      height: box.h,
      layoutOptions: {
        "elk.rectpacking.currentPosition": String(index),
        "elk.rectpacking.desiredPosition": String(index),
      },
    })),
  };

  try {
    const elk = getElk();
    const packed = await elk.layout(graph);
    const byId = new Map(boxes.map((box) => [box.id, box]));
    const positioned = (packed.children ?? []).flatMap((child) => {
      const box = byId.get(child.id);
      if (!box || child.x === undefined || child.y === undefined) return [];
      return [{ ...box, x: child.x, y: child.y }];
    });
    if (positioned.length !== boxes.length)
      throw new Error("ELK did not return positions for every child.");
    return normalizePackedRows(positioned, gapX, gapY, false, doc);
  } catch (error) {
    const fallback = fallbackPackRows(boxes, gapX, gapY, target, false, doc);
    return {
      ...fallback,
      diagnostics: [
        warning(
          "elk-layout-fallback",
          `ELK layout failed for "${scopeId}", so a deterministic row layout was used. ${error instanceof Error ? error.message : ""}`.trim(),
        ),
      ],
    };
  }
}

function adaptivePackRows(
  boxes: Box[],
  gapX: number,
  gapY: number,
  targetWidth: number,
  doc: CapabilityDocument,
): PackedBoxes {
  const rows =
    boxes.length <= 16
      ? bestAdaptiveRows(boxes, gapX, gapY, targetWidth)
      : greedyAdaptiveRows(boxes, gapX, targetWidth);
  return packRows(rows, gapX, gapY, true, doc);
}

function bestAdaptiveRows(
  boxes: Box[],
  gapX: number,
  gapY: number,
  targetWidth: number,
): Box[][] {
  let bestRows: Box[][] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  const partitionCount = 1 << Math.max(0, boxes.length - 1);

  for (let mask = 0; mask < partitionCount; mask += 1) {
    const rows = rowsForPartitionMask(boxes, mask);
    const cost = adaptiveRowCost(rows, gapX, gapY, targetWidth);
    if (cost < bestCost) {
      bestCost = cost;
      bestRows = rows;
    }
  }

  return bestRows ?? [boxes];
}

function rowsForPartitionMask(boxes: Box[], mask: number): Box[][] {
  const rows: Box[][] = [];
  let row: Box[] = [boxes[0]!];

  for (let index = 1; index < boxes.length; index += 1) {
    const startsNewRow = (mask & (1 << (index - 1))) !== 0;
    if (startsNewRow) {
      rows.push(row);
      row = [];
    }
    row.push(boxes[index]!);
  }

  rows.push(row);
  return rows;
}

function adaptiveRowCost(
  rows: Box[][],
  gapX: number,
  gapY: number,
  targetWidth: number,
): number {
  const rowWidths = rows.map((row) => rowWidth(row, gapX));
  const width = Math.max(...rowWidths);
  const height =
    rows.reduce(
      (sum, row) => sum + Math.max(...row.map((box) => box.h)),
      0,
    ) + Math.max(0, rows.length - 1) * gapY;
  const area = rows.flat().reduce((sum, box) => sum + box.w * box.h, 0);
  const efficiency = area / Math.max(1, width * height);
  const balancedWidths = rowWidthsForBalance(rows, rowWidths);
  const rowBalance = coefficientOfVariation(balancedWidths);
  const aspectRatio = width / Math.max(1, height);
  const targetAspect = 2.1;
  const aspectPenalty = Math.abs(Math.log(aspectRatio / targetAspect));
  const targetPenalty = Math.abs(width - targetWidth) / Math.max(1, targetWidth);
  const singleChildRowPenalty = rows.reduce((sum, row, index) => {
    if (row.length !== 1 || rows.length === 1) return sum;
    return sum + (index === rows.length - 1 ? 0.08 : 0.2);
  }, 0);

  return (
    (1 - efficiency) * 1.2 +
    rowBalance * 0.45 +
    aspectPenalty * 0.16 +
    targetPenalty * 0.12 +
    singleChildRowPenalty +
    rows.length * 0.01
  );
}

function rowWidthsForBalance(rows: Box[][], rowWidths: number[]): number[] {
  if (rows.length <= 2) return rowWidths;
  const finalRow = rows[rows.length - 1]!;
  const previousMaxLength = Math.max(
    ...rows.slice(0, -1).map((row) => row.length),
  );
  if (finalRow.length < previousMaxLength) return rowWidths.slice(0, -1);
  return rowWidths;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance) / mean;
}

function greedyAdaptiveRows(
  boxes: Box[],
  gapX: number,
  targetWidth: number,
): Box[][] {
  const rows: Box[][] = [];
  let row: Box[] = [];
  let width = 0;

  for (const box of boxes) {
    const nextWidth = row.length === 0 ? box.w : width + gapX + box.w;
    if (row.length > 0 && nextWidth > targetWidth) {
      rows.push(row);
      row = [];
      width = 0;
    }
    row.push(box);
    width = row.length === 1 ? box.w : width + gapX + box.w;
  }

  if (row.length > 0) rows.push(row);
  return rows;
}

function normalizePackedRows(
  boxes: PackedBox[],
  gapX: number,
  gapY: number,
  centerRows: boolean,
  doc: CapabilityDocument,
): PackedBoxes {
  const ordered = [...boxes].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
  );
  const rows: PackedBox[][] = [];
  for (const box of ordered) {
    const row = rows.find(
      (candidate) => Math.abs(candidate[0]!.y - box.y) <= 1,
    );
    if (row) row.push(box);
    else rows.push([box]);
  }

  for (const row of rows)
    row.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  return packRows(rows, gapX, gapY, centerRows, doc);
}

function packRows<T extends Box>(
  rows: T[][],
  gapX: number,
  gapY: number,
  centerRows: boolean,
  doc: CapabilityDocument,
): PackedBoxes {
  const rowWidths = rows.map((row) => rowWidth(row, gapX));
  const layoutWidth = rowWidths.length > 0 ? Math.max(...rowWidths) : 0;
  const packed: PackedBox[] = [];
  let cursorY = 0;

  for (const [index, row] of rows.entries()) {
    const rowHeight = Math.max(...row.map((box) => box.h));
    let cursorX = centerRows
      ? snapLayoutDelta(doc, (layoutWidth - rowWidths[index]!) / 2)
      : 0;
    for (const box of row) {
      packed.push({ ...box, x: cursorX, y: cursorY });
      cursorX += box.w + gapX;
    }
    cursorY += rowHeight + gapY;
  }

  const bounds = boundsForBoxes(packed);
  const width = bounds ? bounds.x + bounds.w : 0;
  const height = bounds ? bounds.y + bounds.h : 0;
  return { boxes: packed, w: width, h: height, diagnostics: [] };
}

function rowWidth(row: Box[], gapX: number): number {
  return (
    row.reduce((sum, box) => sum + box.w, 0) +
    Math.max(0, row.length - 1) * gapX
  );
}

function fallbackPackRows(
  boxes: Box[],
  gapX: number,
  gapY: number,
  targetWidth: number,
  centerRows: boolean,
  doc: CapabilityDocument,
): PackedBoxes {
  const rows: Box[][] = [];
  let row: Box[] = [];
  let rowWidth = 0;
  for (const box of boxes) {
    const nextWidth = row.length === 0 ? box.w : rowWidth + gapX + box.w;
    if (row.length > 0 && nextWidth > targetWidth) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(box);
    rowWidth = row.length === 1 ? box.w : rowWidth + gapX + box.w;
  }
  if (row.length > 0) rows.push(row);
  return packRows(rows, gapX, gapY, centerRows, doc);
}

function targetWidthFor(
  boxes: Box[],
  gapX: number,
  gapY: number,
  mode: LayoutMode,
): number {
  const widest = Math.max(...boxes.map((box) => box.w));
  if (mode === "uniform") {
    const columns = Math.max(1, Math.ceil(Math.sqrt(boxes.length)));
    return Math.max(widest, rowWidthForColumns(boxes, columns, gapX));
  }
  if (mode === "flow") return Math.max(widest, 900);
  const area = totalArea(boxes);
  const desired = Math.sqrt(area * 2.1);
  return Math.max(widest, desired + gapX);
}

function rowWidthForColumns(
  boxes: Box[],
  columns: number,
  gapX: number,
): number {
  let width = 0;
  for (let index = 0; index < boxes.length; index += columns) {
    const row = boxes.slice(index, index + columns);
    width = Math.max(
      width,
      row.reduce((sum, box) => sum + box.w, 0) +
        Math.max(0, row.length - 1) * gapX,
    );
  }
  return width;
}

function totalArea(boxes: Box[]): number {
  return boxes.reduce((sum, box) => sum + box.w * box.h, 0);
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
    right:
      snapLayoutSpacing(
        doc,
        node.layoutPreferences?.marginRight ??
          doc.settings.containerPaddingRight,
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

function childAreaTop(doc: CapabilityDocument, node: CapabilityNode) {
  return snapLayoutSpacing(
    doc,
    (node.layoutPreferences?.marginTop ?? doc.settings.containerPaddingTop) +
      doc.settings.containerTitleHeight,
  );
}

function collectCurrentSubtreePatches(
  doc: CapabilityDocument,
  nodeId: NodeId,
  originX: number,
  originY: number,
  patches: LayoutPatch[],
) {
  for (const childId of canvasChildrenOf(doc, nodeId)) {
    const child = doc.nodesById[childId];
    if (!child) continue;
    patches.push({
      id: child.id,
      x: child.x - originX,
      y: child.y - originY,
      w: child.w,
      h: child.h,
    });
    collectCurrentSubtreePatches(doc, child.id, originX, originY, patches);
  }
}

function boundsForIds(doc: CapabilityDocument, ids: NodeId[]) {
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

function boundsForBoxes(
  boxes: Array<{ x: number; y: number; w: number; h: number }>,
) {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  return { x, y, w: maxX - x, h: maxY - y };
}

function translatePatches(
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

function stablePatches(patches: LayoutPatch[]): LayoutPatch[] {
  const byId = new Map<NodeId, LayoutPatch>();
  for (const patch of patches) byId.set(patch.id, patch);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
