import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
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
import { warning } from "../validation/diagnostics";
import {
  type LayoutPatch,
  type LayoutRequest,
  type LayoutResult,
} from "./types";

const ROOT_OFFSET = 24;
const ROOT_GAP_Y = 32;

const elk = new ELK({ algorithms: ["rectpacking"] });

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

export async function layoutDocument(
  request: LayoutRequest,
): Promise<LayoutResult> {
  const doc = request.doc;
  const mode = request.mode ?? doc.layout.mode ?? doc.settings.layoutMode;
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
  const roots = request.affectedNodeIds?.length
    ? request.affectedNodeIds.filter((nodeId) =>
        isNodeOnCanvas(doc.nodesById[nodeId]),
      )
    : canvasRootChildren(doc);
  const measuredRoots = await Promise.all(
    roots.map((rootId) => measureSubtree(doc, rootId, mode)),
  );
  for (const measured of measuredRoots)
    diagnostics.push(...measured.diagnostics);

  if (request.affectedNodeIds?.length) {
    for (const measured of measuredRoots) {
      const node = doc.nodesById[measured.id];
      if (!node) continue;
      translatePatches(measured.patches, node.x, node.y, patches);
    }
    return { patches: stablePatches(patches), diagnostics };
  }

  if (measuredRoots.some((measured) => measured.blocked)) {
    let cursorY = ROOT_OFFSET;
    for (const measured of measuredRoots) {
      const node = doc.nodesById[measured.id];
      if (!node) continue;
      if (measured.blocked) {
        translatePatches(measured.patches, node.x, node.y, patches);
        cursorY = Math.max(cursorY, node.y + measured.h + ROOT_GAP_Y);
        continue;
      }
      translatePatches(measured.patches, ROOT_OFFSET, cursorY, patches);
      cursorY += measured.h + ROOT_GAP_Y;
    }
    return { patches: stablePatches(patches), diagnostics };
  }

  const packedRoots = await packBoxes(
    measuredRoots.map((measured) => ({
      id: measured.id,
      w: measured.w,
      h: measured.h,
    })),
    doc.settings.childGapX,
    ROOT_GAP_Y,
    mode,
    "document-roots",
  );
  diagnostics.push(...packedRoots.diagnostics);
  const byId = new Map(
    measuredRoots.map((measured) => [measured.id, measured]),
  );
  for (const packed of packedRoots.boxes) {
    const measured = byId.get(packed.id);
    if (!measured) continue;
    translatePatches(
      measured.patches,
      ROOT_OFFSET + packed.x,
      ROOT_OFFSET + packed.y,
      patches,
    );
  }

  return { patches: stablePatches(patches), diagnostics };
}

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
    if (parent.isManualPositioningEnabled) continue;
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
  const gapX = node.layoutPreferences?.gapX ?? doc.settings.childGapX;
  const gapY = node.layoutPreferences?.gapY ?? doc.settings.childGapY;
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
  );
  diagnostics.push(...packed.diagnostics);

  const childById = new Map(measuredChildren.map((child) => [child.id, child]));
  const childPatches: LayoutPatch[] = [];
  const childBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const packedChild of packed.boxes) {
    const child = childById.get(packedChild.id);
    if (!child) continue;
    const childX = Math.round(margin.left + packedChild.x);
    const childY = Math.round(childAreaTop(doc, node) + packedChild.y);
    translatePatches(child.patches, childX, childY, childPatches);
    childBoxes.push({
      x: childX,
      y: childY,
      w: Math.round(child.w),
      h: Math.round(child.h),
    });
  }

  const childBounds = boundsForBoxes(childBoxes);
  const minSize = nodeSize(doc, node);
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
      minSize.h,
      childBounds
        ? childBounds.y + childBounds.h + margin.bottom
        : childAreaTop(doc, node) + packed.h + margin.bottom,
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
    );
    diagnostics.push(...packed.diagnostics);
    const childById = new Map(freeChildren.map((child) => [child.id, child]));
    const startX = margin.left;
    const startY = Math.max(
      childAreaTop(doc, node),
      blockedBounds ? blockedBounds.y + blockedBounds.h + gapY : 0,
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
    diagnostics: [],
  };
}

async function packBoxes(
  boxes: Box[],
  gapX: number,
  gapY: number,
  mode: LayoutMode,
  scopeId: string,
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

  const target = targetWidthFor(boxes, gapX, gapY, mode);
  if (mode === "uniform") return fallbackPackRows(boxes, gapX, gapY, target);

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
    const packed = await elk.layout(graph);
    const byId = new Map(boxes.map((box) => [box.id, box]));
    const positioned = (packed.children ?? []).flatMap((child) => {
      const box = byId.get(child.id);
      if (!box || child.x === undefined || child.y === undefined) return [];
      return [{ ...box, x: child.x, y: child.y }];
    });
    if (positioned.length !== boxes.length)
      throw new Error("ELK did not return positions for every child.");
    return normalizePackedRows(positioned, gapX, gapY);
  } catch (error) {
    const fallback = fallbackPackRows(boxes, gapX, gapY, target);
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

function normalizePackedRows(
  boxes: PackedBox[],
  gapX: number,
  gapY: number,
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

  const packed: PackedBox[] = [];
  let cursorY = 0;
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    let cursorX = 0;
    let rowHeight = 0;
    for (const box of row) {
      packed.push({ ...box, x: cursorX, y: cursorY });
      cursorX += box.w + gapX;
      rowHeight = Math.max(rowHeight, box.h);
    }
    cursorY += rowHeight + gapY;
  }
  const bounds = boundsForBoxes(packed);
  const width = bounds ? bounds.x + bounds.w : 0;
  const height = bounds ? bounds.y + bounds.h : 0;
  return { boxes: packed, w: width, h: height, diagnostics: [] };
}

function fallbackPackRows(
  boxes: Box[],
  gapX: number,
  gapY: number,
  targetWidth: number,
): PackedBoxes {
  const packed: PackedBox[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (const box of boxes) {
    if (x > 0 && x + box.w > targetWidth) {
      x = 0;
      y += rowHeight + gapY;
      rowHeight = 0;
    }
    packed.push({ ...box, x, y });
    x += box.w + gapX;
    rowHeight = Math.max(rowHeight, box.h);
    width = Math.max(width, x - gapX);
  }
  return { boxes: packed, w: width, h: y + rowHeight, diagnostics: [] };
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
    return { w: Math.max(1, node.w), h: Math.max(1, node.h) };
  if (node.type === "leaf")
    return {
      w: Math.max(1, doc.settings.fixedLeafWidth),
      h: Math.max(1, doc.settings.fixedLeafHeight),
    };
  return {
    w: Math.max(1, doc.settings.defaultParentWidth),
    h: Math.max(1, doc.settings.defaultParentHeight),
  };
}

function nodeMargin(doc: CapabilityDocument, node: CapabilityNode) {
  return {
    top: node.layoutPreferences?.marginTop ?? doc.settings.containerPaddingTop,
    right:
      node.layoutPreferences?.marginRight ?? doc.settings.containerPaddingRight,
    bottom:
      node.layoutPreferences?.marginBottom ??
      doc.settings.containerPaddingBottom,
    left:
      node.layoutPreferences?.marginLeft ?? doc.settings.containerPaddingLeft,
  };
}

function childAreaTop(doc: CapabilityDocument, node: CapabilityNode) {
  return (
    (node.layoutPreferences?.marginTop ?? doc.settings.containerPaddingTop) +
    doc.settings.containerTitleHeight
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
