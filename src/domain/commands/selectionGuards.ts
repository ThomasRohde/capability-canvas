import { isTextLabelNode, type CapabilityDocument, type NodeId } from "../document/types";
import { canMultiSelect, type SelectionRuleOptions } from "../selection/rules";

export function canBulkEditNodes(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
  options?: SelectionRuleOptions,
) {
  const nodes = nodeIds.map((id) => doc.nodesById[id]).filter(Boolean);
  if (nodes.length !== nodeIds.length) {
    return { valid: false, reason: "One or more selected nodes are missing." };
  }
  if (nodes.some(isTextLabelNode)) {
    return {
      valid: false,
      reason: "Text labels are excluded from multi-selection.",
    };
  }
  return canMultiSelect(doc, nodeIds, options);
}
