import { childrenOf, type CapabilityDocument, type CapabilityNode, type LayoutMode, type NodeId } from '../document/types';
import { warning } from '../validation/diagnostics';
import { type LayoutPatch, type LayoutRequest, type LayoutResult } from './types';

const CONTAINER_TITLE_RESERVE = 28;

export function layoutDocument(request: LayoutRequest): LayoutResult {
  const doc = request.doc;
  const mode = request.mode ?? doc.layout.mode ?? doc.settings.layoutMode;
  if (doc.layout.preservePositions && !request.force && doc.layout.isUserArranged) {
    return { patches: [], diagnostics: [warning('positions-preserved', 'Imported or user-arranged positions were preserved.')] };
  }

  const patches: LayoutPatch[] = [];
  const roots = request.affectedNodeIds?.length ? request.affectedNodeIds : childrenOf(doc, null);
  let cursorY = 24;
  for (const rootId of roots) {
    const patch = layoutSubtree(doc, rootId, 24, cursorY, mode, request.force ?? false, patches);
    if (patch) cursorY = patch.y + patch.h + 32;
  }

  return { patches: stablePatches(patches), diagnostics: [] };
}

export function applyLayoutPatches(doc: CapabilityDocument, patches: LayoutPatch[]): CapabilityDocument {
  if (patches.length === 0) return doc;
  const nodesById = { ...doc.nodesById };
  for (const patch of patches) {
    const node = nodesById[patch.id];
    if (!node) continue;
    nodesById[patch.id] = { ...node, x: patch.x, y: patch.y, w: patch.w, h: patch.h, updatedAt: Date.now() };
  }
  const bounds = computeDocumentBounds({ ...doc, nodesById });
  return {
    ...doc,
    nodesById,
    layout: {
      ...doc.layout,
      isUserArranged: false,
      boundingBox: bounds
    },
    timestamp: Date.now()
  };
}

export function computeDocumentBounds(doc: CapabilityDocument) {
  const nodes = Object.values(doc.nodesById);
  if (nodes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.w));
  const maxY = Math.max(...nodes.map((node) => node.y + node.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function layoutSubtree(
  doc: CapabilityDocument,
  nodeId: NodeId,
  x: number,
  y: number,
  mode: LayoutMode,
  force: boolean,
  patches: LayoutPatch[]
): LayoutPatch | null {
  const node = doc.nodesById[nodeId];
  if (!node) return null;

  if (node.isLockedAsIs && !force) {
    return { id: node.id, x: node.x, y: node.y, w: node.w, h: node.h };
  }

  const childIds = childrenOf(doc, node.id);
  const margin = {
    top: node.layoutPreferences?.marginTop ?? doc.settings.containerPaddingTop,
    right: node.layoutPreferences?.marginRight ?? doc.settings.containerPaddingRight,
    bottom: node.layoutPreferences?.marginBottom ?? doc.settings.containerPaddingBottom,
    left: node.layoutPreferences?.marginLeft ?? doc.settings.containerPaddingLeft
  };
  const gapX = node.layoutPreferences?.gapX ?? doc.settings.childGapX;
  const gapY = node.layoutPreferences?.gapY ?? doc.settings.childGapY;

  if (childIds.length === 0 || (node.isManualPositioningEnabled && !force)) {
    const next = { id: node.id, x, y, w: node.w, h: node.h };
    patches.push(next);
    return next;
  }

  const arranged = arrangeChildren(
    doc,
    childIds,
    x + margin.left,
    y + margin.top + CONTAINER_TITLE_RESERVE,
    mode,
    gapX,
    gapY,
    force,
    patches
  );
  const maxX = Math.max(...arranged.map((patch) => patch.x + patch.w), x + doc.settings.defaultParentWidth);
  const maxY = Math.max(...arranged.map((patch) => patch.y + patch.h), y + doc.settings.defaultParentHeight);
  const next = {
    id: node.id,
    x,
    y,
    w: Math.max(node.w, maxX - x + margin.right),
    h: Math.max(node.h, maxY - y + margin.bottom)
  };
  patches.push(next);
  return next;
}

function arrangeChildren(
  doc: CapabilityDocument,
  childIds: NodeId[],
  startX: number,
  startY: number,
  mode: LayoutMode,
  gapX: number,
  gapY: number,
  force: boolean,
  patches: LayoutPatch[]
): LayoutPatch[] {
  const result: LayoutPatch[] = [];
  if (mode === 'uniform') {
    const columns = Math.max(1, Math.ceil(Math.sqrt(childIds.length)));
    childIds.forEach((childId, index) => {
      const child = doc.nodesById[childId]!;
      const x = startX + (index % columns) * (doc.settings.fixedLeafWidth + gapX);
      const y = startY + Math.floor(index / columns) * (doc.settings.fixedLeafHeight + gapY);
      const patch = layoutSubtree(doc, childId, x, y, mode, force, patches) ?? nodePatch(child, x, y);
      result.push(patch);
    });
    return result;
  }

  if (mode === 'flow' || mode === 'adaptive') {
    const maxWidth = mode === 'adaptive' ? 760 : 900;
    let x = startX;
    let y = startY;
    let rowHeight = 0;
    for (const childId of childIds) {
      const child = doc.nodesById[childId]!;
      const w = Math.max(child.w, child.type === 'leaf' ? doc.settings.fixedLeafWidth : child.w);
      if (x > startX && x + w > startX + maxWidth) {
        x = startX;
        y += rowHeight + gapY;
        rowHeight = 0;
      }
      const patch = layoutSubtree(doc, childId, x, y, mode, force, patches) ?? nodePatch(child, x, y);
      result.push(patch);
      x += patch.w + gapX;
      rowHeight = Math.max(rowHeight, patch.h);
    }
    return result;
  }

  childIds.forEach((childId) => {
    const child = doc.nodesById[childId]!;
    result.push(nodePatch(child, child.x, child.y));
  });
  return result;
}

function nodePatch(node: CapabilityNode, x: number, y: number): LayoutPatch {
  return { id: node.id, x, y, w: node.w, h: node.h };
}

function stablePatches(patches: LayoutPatch[]): LayoutPatch[] {
  const byId = new Map<NodeId, LayoutPatch>();
  for (const patch of patches) byId.set(patch.id, patch);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
