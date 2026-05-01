import { childrenOf, ROOT_PARENT_ID, type CapabilityDocument, type NodeId } from '../document/types';
import { type Diagnostic, error } from './diagnostics';

export function validateDocument(doc: CapabilityDocument): { valid: boolean; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const ids = new Set(Object.keys(doc.nodesById));

  for (const node of Object.values(doc.nodesById)) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.w) || !Number.isFinite(node.h)) {
      diagnostics.push(error('invalid-geometry', `Node ${node.id} has non-finite geometry.`, node.id));
    }
    if (node.w <= 0 || node.h <= 0) {
      diagnostics.push(error('invalid-dimensions', `Node ${node.id} has non-positive dimensions.`, node.id));
    }
    if (node.parentId && !ids.has(node.parentId)) {
      diagnostics.push(error('missing-parent', `Node ${node.id} references missing parent ${node.parentId}.`, node.id));
    }
    if (!node.parentId && node.type !== 'root') {
      diagnostics.push(error('invalid-root-type', `Top-level node ${node.id} must be type root.`, node.id));
    }
    if (node.type === 'root' && node.parentId) {
      diagnostics.push(error('root-has-parent', `Root node ${node.id} cannot have a parent.`, node.id));
    }
    if (node.isTextLabel || node.type === 'text') {
      const children = childrenOf(doc, node.id);
      if (children.length > 0) {
        diagnostics.push(error('text-label-has-children', `Text label ${node.id} cannot have children.`, node.id));
      }
    }
    if (node.heatmapValue !== undefined && (node.heatmapValue < 0 || node.heatmapValue > 1)) {
      diagnostics.push(error('invalid-heatmap-value', `Node ${node.id} heatmap value must be between 0 and 1.`, node.id));
    }
  }

  diagnostics.push(...detectCycles(doc));
  diagnostics.push(...detectOrphans(doc));

  return { valid: diagnostics.every((diag) => diag.severity !== 'error'), diagnostics };
}

export function descendantsOf(doc: CapabilityDocument, nodeId: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const walk = (id: NodeId) => {
    for (const childId of childrenOf(doc, id)) {
      out.push(childId);
      walk(childId);
    }
  };
  walk(nodeId);
  return out;
}

export function isDescendantOf(doc: CapabilityDocument, nodeId: NodeId, maybeAncestorId: NodeId): boolean {
  return descendantsOf(doc, maybeAncestorId).includes(nodeId);
}

function detectCycles(doc: CapabilityDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const visiting = new Set<NodeId>();
  const visited = new Set<NodeId>();

  const visit = (nodeId: NodeId) => {
    if (visiting.has(nodeId)) {
      diagnostics.push(error('cycle', `Hierarchy contains a cycle at ${nodeId}.`, nodeId));
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const childId of childrenOf(doc, nodeId)) visit(childId);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const rootId of doc.childrenByParentId[ROOT_PARENT_ID] ?? []) visit(rootId);
  for (const nodeId of Object.keys(doc.nodesById)) visit(nodeId);
  return diagnostics;
}

function detectOrphans(doc: CapabilityDocument): Diagnostic[] {
  const reachable = new Set<NodeId>();
  const walk = (nodeId: NodeId) => {
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);
    for (const childId of childrenOf(doc, nodeId)) walk(childId);
  };

  for (const rootId of doc.childrenByParentId[ROOT_PARENT_ID] ?? []) walk(rootId);
  return Object.keys(doc.nodesById)
    .filter((nodeId) => !reachable.has(nodeId))
    .map((nodeId) => error('orphan-node', `Node ${nodeId} is unreachable from root list.`, nodeId));
}

