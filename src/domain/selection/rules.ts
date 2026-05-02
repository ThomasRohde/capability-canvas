import { type CapabilityDocument, type NodeId } from "../document/types";

export interface SelectionRuleResult {
  valid: boolean;
  reason?: string;
}

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
      reason: "Text labels are excluded from multi-selection.",
    };
  }
  const parentId = nodes[0]!.parentId ?? null;
  if (nodes.every((node) => (node.parentId ?? null) === parentId))
    return { valid: true };
  return { valid: false, reason: "Bulk operations require sibling nodes." };
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

export function canMoveSelection(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
): SelectionRuleResult {
  const base = canMultiSelect(doc, nodeIds);
  if (!base.valid) return base;
  const first = doc.nodesById[nodeIds[0]!];
  if (!first?.parentId) return { valid: true };
  const parent = doc.nodesById[first.parentId];
  return parent?.isManualPositioningEnabled
    ? { valid: true }
    : {
        valid: false,
        reason:
          "Enable manual positioning on the parent before moving children.",
      };
}

export function canReparentSelection(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
): SelectionRuleResult {
  const base = canMultiSelect(doc, nodeIds);
  if (!base.valid) return base;
  return nodeIds.length === 1
    ? { valid: true }
    : { valid: false, reason: "Reparenting supports one node at a time." };
}
