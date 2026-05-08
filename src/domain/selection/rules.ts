import {
  ROOT_PARENT_ID,
  type CapabilityDocument,
  type NodeId,
} from "../document/types";

export interface SelectionRuleResult {
  valid: boolean;
  reason?: string;
}

export interface SelectionResolution {
  nodeIds: NodeId[];
  reason?: string;
  reduced: boolean;
}

export const MIXED_PARENT_SELECTION_REASON =
  "Bulk operations require sibling capabilities.";
export const TEXT_LABEL_SELECTION_REASON =
  "Text labels are excluded from multi-selection.";

export function canMultiSelect(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
): SelectionRuleResult {
  if (nodeIds.length <= 1) return { valid: true };
  const nodes = nodeIds.map((id) => doc.nodesById[id]).filter(Boolean);
  if (nodes.length !== nodeIds.length)
    return { valid: false, reason: "One or more selected nodes are missing." };
  if (nodes.some((node) => node.isTextLabel || node.type === "text")) {
    return {
      valid: false,
      reason: TEXT_LABEL_SELECTION_REASON,
    };
  }
  const parentId = nodes[0]!.parentId ?? null;
  if (nodes.every((node) => (node.parentId ?? null) === parentId))
    return { valid: true };
  return { valid: false, reason: MIXED_PARENT_SELECTION_REASON };
}

export function resolveToggleSelection(
  doc: CapabilityDocument,
  currentNodeIds: NodeId[],
  nodeId: NodeId,
): SelectionResolution {
  const candidate = currentNodeIds.includes(nodeId)
    ? currentNodeIds.filter((id) => id !== nodeId)
    : uniqueNodeIds([...currentNodeIds, nodeId]);
  const result = canMultiSelect(doc, candidate);
  if (result.valid) {
    return { nodeIds: candidate, reduced: false };
  }
  return {
    nodeIds: [nodeId],
    reason: result.reason,
    reduced: true,
  };
}

export function resolveSiblingSelection(
  doc: CapabilityDocument,
  candidateNodeIds: NodeId[],
): SelectionResolution {
  const candidate = uniqueNodeIds(candidateNodeIds);
  const result = canMultiSelect(doc, candidate);
  if (result.valid) {
    return { nodeIds: candidate, reduced: false };
  }
  return {
    nodeIds: largestSelectableSiblingGroup(doc, candidate),
    reason: result.reason,
    reduced: true,
  };
}

export function resolveSelectAllSelection(
  doc: CapabilityDocument,
  candidateNodeIds: NodeId[],
  anchorNodeIds: NodeId[],
): SelectionResolution {
  const candidate = uniqueNodeIds(candidateNodeIds);
  const anchor = anchorNodeIds
    .map((id) => doc.nodesById[id])
    .find(
      (node) =>
        node &&
        !node.isTextLabel &&
        node.type !== "text" &&
        candidate.includes(node.id),
    );
  if (!anchor) return resolveSiblingSelection(doc, candidate);

  const anchorParentId = anchor.parentId ?? null;
  const anchoredSiblings = candidate.filter((id) => {
    const node = doc.nodesById[id];
    return (
      !!node &&
      !node.isTextLabel &&
      node.type !== "text" &&
      (node.parentId ?? null) === anchorParentId
    );
  });
  return {
    nodeIds: anchoredSiblings,
    reduced: anchoredSiblings.length !== candidate.length,
  };
}

export function largestSelectableSiblingGroup(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
): NodeId[] {
  const buckets = new Map<string, NodeId[]>();
  for (const id of uniqueNodeIds(nodeIds)) {
    const node = doc.nodesById[id];
    if (!node || node.isTextLabel || node.type === "text") continue;
    const key = String(node.parentId ?? ROOT_PARENT_ID);
    const bucket = buckets.get(key) ?? [];
    bucket.push(id);
    buckets.set(key, bucket);
  }
  let best: NodeId[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length > best.length) best = bucket;
  }
  return best;
}

export function canAlign(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
): SelectionRuleResult {
  const base = canMultiSelect(doc, nodeIds);
  if (!base.valid) return base;
  return nodeIds.length >= 2
    ? { valid: true }
    : { valid: false, reason: "Alignment requires at least two nodes." };
}

export function canDistribute(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
): SelectionRuleResult {
  const base = canMultiSelect(doc, nodeIds);
  if (!base.valid) return base;
  return nodeIds.length >= 3
    ? { valid: true }
    : { valid: false, reason: "Distribution requires at least three nodes." };
}

function uniqueNodeIds(nodeIds: NodeId[]): NodeId[] {
  const seen = new Set<NodeId>();
  const result: NodeId[] = [];
  for (const nodeId of nodeIds) {
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    result.push(nodeId);
  }
  return result;
}
