import {
  childrenOf,
  collectDescendantIds,
  collectHierarchyIssues,
  computeHierarchyDepths,
  isHierarchyAncestorOf,
  ROOT_PARENT_ID,
  type CapabilityDocument,
  type HierarchyTraversalIssue,
  type NodeId,
} from '../document/types';
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
  return collectDescendantIds(doc, nodeId).ids;
}

export function isDescendantOf(doc: CapabilityDocument, nodeId: NodeId, maybeAncestorId: NodeId): boolean {
  return isHierarchyAncestorOf(doc, maybeAncestorId, nodeId);
}

function detectCycles(doc: CapabilityDocument): Diagnostic[] {
  return collectHierarchyIssues(doc)
    .filter((issue) => issue.code === 'cycle' || issue.code === 'missing-child')
    .map(hierarchyIssueToDiagnostic);
}

function detectOrphans(doc: CapabilityDocument): Diagnostic[] {
  const reachable = new Set(
    computeHierarchyDepths(doc, doc.childrenByParentId[ROOT_PARENT_ID] ?? [])
      .depths.keys(),
  );
  return Object.keys(doc.nodesById)
    .filter((nodeId) => !reachable.has(nodeId))
    .map((nodeId) => error('orphan-node', `Node ${nodeId} is unreachable from root list.`, nodeId));
}

function hierarchyIssueToDiagnostic(issue: HierarchyTraversalIssue): Diagnostic {
  if (issue.code === 'cycle') {
    return error('cycle', `Hierarchy contains a cycle at ${issue.nodeId}.`, issue.nodeId);
  }
  if (issue.code === 'missing-child') {
    return error(
      'missing-child',
      `Parent ${issue.parentId ?? ROOT_PARENT_ID} references missing child ${issue.nodeId}.`,
      issue.parentId ?? undefined,
    );
  }
  return error(
    'missing-parent',
    `Node ${issue.nodeId} references missing parent ${issue.parentId}.`,
    issue.nodeId,
  );
}
