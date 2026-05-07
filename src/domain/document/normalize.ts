import { createEmptyDocument } from './defaults';
import { buildSafeChildrenByParentId, ROOT_PARENT_ID, type CapabilityDocument, type CapabilityNode } from './types';
import { cloneVisualWorkspace } from '../visual/workspace';

export function normalizeNodes(nodes: CapabilityNode[], title = 'Untitled capability model'): CapabilityDocument {
  const doc = createEmptyDocument(title);
  for (const node of nodes) {
    doc.nodesById[node.id] = { ...node, metadata: { ...node.metadata } };
  }

  doc.childrenByParentId = { [ROOT_PARENT_ID]: [] };
  for (const node of nodes) {
    const parentKey = node.parentId ?? ROOT_PARENT_ID;
    doc.childrenByParentId[parentKey] ??= [];
    doc.childrenByParentId[parentKey]!.push(node.id);
    doc.childrenByParentId[node.id] ??= [];
  }

  return doc;
}

export function cloneDocument(doc: CapabilityDocument): CapabilityDocument {
  return {
    ...doc,
    nodesById: Object.fromEntries(Object.entries(doc.nodesById).map(([id, node]) => [id, cloneNode(node)])),
    childrenByParentId: Object.fromEntries(
      Object.entries(doc.childrenByParentId).map(([id, children]) => [id, [...children]])
    ),
    settings: { ...doc.settings },
    layout: { ...doc.layout, boundingBox: { ...doc.layout.boundingBox } },
    heatmap: { ...doc.heatmap },
    visual: cloneVisualWorkspace(doc.visual)
  };
}

export function cloneNode(node: CapabilityNode): CapabilityNode {
  return {
    ...node,
    metadata: { ...node.metadata },
    layoutPreferences: node.layoutPreferences ? { ...node.layoutPreferences } : undefined,
    textStyle: node.textStyle ? { ...node.textStyle } : undefined
  };
}

export function rebuildChildren(doc: CapabilityDocument): CapabilityDocument {
  const next = cloneDocument(doc);
  next.childrenByParentId = { [ROOT_PARENT_ID]: [] };
  for (const nodeId of Object.keys(next.nodesById)) {
    next.childrenByParentId[nodeId] = [];
  }
  for (const node of Object.values(next.nodesById)) {
    const parentKey = node.parentId ?? ROOT_PARENT_ID;
    next.childrenByParentId[parentKey] ??= [];
    next.childrenByParentId[parentKey]!.push(node.id);
  }
  return next;
}

export function sortedNodes(doc: CapabilityDocument): CapabilityNode[] {
  const out: CapabilityNode[] = [];
  const safeChildren = buildSafeChildrenByParentId(doc).childrenByParentId;
  const stack = [...(safeChildren[ROOT_PARENT_ID] ?? [])].reverse();
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    const node = doc.nodesById[nodeId];
    if (!node) continue;
    out.push(node);
    const childIds = safeChildren[nodeId] ?? [];
    for (let index = childIds.length - 1; index >= 0; index -= 1) {
      stack.push(childIds[index]!);
    }
  }
  const seen = new Set(out.map((node) => node.id));
  for (const node of Object.values(doc.nodesById)) {
    if (!seen.has(node.id)) out.push(node);
  }
  return out;
}
