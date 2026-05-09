import type { CapabilityDocument, NodeId } from "../document/types";
import { canMultiSelect } from "../selection/rules";

export function canBulkEditNodes(doc: CapabilityDocument, nodeIds: NodeId[]) {
  const nodes = nodeIds.map((id) => doc.nodesById[id]).filter(Boolean);
  if (nodes.length !== nodeIds.length) {
    return { valid: false, reason: "One or more selected nodes are missing." };
  }
  if (nodes.some((node) => node.isTextLabel || node.type === "text")) {
    return {
      valid: false,
      reason: "Text labels are excluded from multi-selection.",
    };
  }
  return canMultiSelect(doc, nodeIds);
}
