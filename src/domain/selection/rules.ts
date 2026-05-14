import {
  isNodeOnCanvas,
  ROOT_PARENT_ID,
  type CapabilityDocument,
  type CapabilityNode,
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

export interface SelectionRuleOptions {
  hierarchy?: "source" | "canvas";
}

export const MIXED_PARENT_SELECTION_REASON =
  "Bulk operations require sibling capabilities.";
export const TEXT_LABEL_SELECTION_REASON =
  "Text labels are excluded from multi-selection.";

export function canMultiSelect(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
  options: SelectionRuleOptions = {},
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
  const parentKey = selectionParentKey(doc, nodes[0]!, options);
  if (nodes.every((node) => selectionParentKey(doc, node, options) === parentKey))
    return { valid: true };
  return { valid: false, reason: MIXED_PARENT_SELECTION_REASON };
}

export function resolveToggleSelection(
  doc: CapabilityDocument,
  currentNodeIds: NodeId[],
  nodeId: NodeId,
  options: SelectionRuleOptions = {},
): SelectionResolution {
  const candidate = currentNodeIds.includes(nodeId)
    ? currentNodeIds.filter((id) => id !== nodeId)
    : uniqueNodeIds([...currentNodeIds, nodeId]);
  const result = canMultiSelect(doc, candidate, options);
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
  options: SelectionRuleOptions = {},
): SelectionResolution {
  const candidate = uniqueNodeIds(candidateNodeIds);
  const result = canMultiSelect(doc, candidate, options);
  if (result.valid) {
    return { nodeIds: candidate, reduced: false };
  }
  return {
    nodeIds: largestSelectableSiblingGroup(doc, candidate, options),
    reason: result.reason,
    reduced: true,
  };
}

export function resolveSelectAllSelection(
  doc: CapabilityDocument,
  candidateNodeIds: NodeId[],
  anchorNodeIds: NodeId[],
  options: SelectionRuleOptions = {},
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
  if (!anchor) return resolveSiblingSelection(doc, candidate, options);

  const anchorParentKey = selectionParentKey(doc, anchor, options);
  const anchoredSiblings = candidate.filter((id) => {
    const node = doc.nodesById[id];
    return (
      !!node &&
      !node.isTextLabel &&
      node.type !== "text" &&
      selectionParentKey(doc, node, options) === anchorParentKey
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
  options: SelectionRuleOptions = {},
): NodeId[] {
  const buckets = new Map<string, NodeId[]>();
  for (const id of uniqueNodeIds(nodeIds)) {
    const node = doc.nodesById[id];
    if (!node || node.isTextLabel || node.type === "text") continue;
    const key = selectionParentKey(doc, node, options);
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
  options: SelectionRuleOptions = {},
): SelectionRuleResult {
  const base = canMultiSelect(doc, nodeIds, options);
  if (!base.valid) return base;
  return nodeIds.length >= 2
    ? { valid: true }
    : { valid: false, reason: "Alignment requires at least two nodes." };
}

export function canDistribute(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
  options: SelectionRuleOptions = {},
): SelectionRuleResult {
  const base = canMultiSelect(doc, nodeIds, options);
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

function selectionParentKey(
  doc: CapabilityDocument,
  node: CapabilityNode,
  options: SelectionRuleOptions,
): string {
  if (options.hierarchy !== "canvas") {
    return String(node.parentId ?? ROOT_PARENT_ID);
  }
  return String(canvasSelectionParentId(doc, node) ?? ROOT_PARENT_ID);
}

export function canvasSelectionParentId(
  doc: CapabilityDocument,
  node: CapabilityNode,
): NodeId | null {
  let parentId = node.parentId;
  while (parentId) {
    const parent = doc.nodesById[parentId];
    if (!parent) return null;
    if (isNodeOnCanvas(parent) && containsBounds(parent, node)) {
      return parent.id;
    }
    parentId = parent.parentId;
  }
  return null;
}

function containsBounds(parent: CapabilityNode, child: CapabilityNode): boolean {
  const epsilon = 0.0001;
  return (
    child.x + epsilon >= parent.x &&
    child.y + epsilon >= parent.y &&
    child.x + child.w <= parent.x + parent.w + epsilon &&
    child.y + child.h <= parent.y + parent.h + epsilon
  );
}
