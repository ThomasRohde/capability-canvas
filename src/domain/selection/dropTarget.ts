import {
  childrenOf,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../document/types";

export interface DropTargetCandidate {
  parentId: NodeId | null;
  reason?: string;
}

interface DropTargetOptions {
  doc: CapabilityDocument;
  pointDocX: number;
  pointDocY: number;
  draggedIds: Set<NodeId>;
}

export function findDropTarget(
  options: DropTargetOptions,
): DropTargetCandidate {
  const { doc, pointDocX, pointDocY, draggedIds } = options;
  const depths = computeDepths(doc);
  const candidates = Object.values(doc.nodesById).filter((node) =>
    couldBeParent(node, draggedIds),
  );
  candidates.sort((a, b) => (depths.get(b.id) ?? 0) - (depths.get(a.id) ?? 0));
  for (const node of candidates) {
    if (
      pointDocX >= node.x &&
      pointDocX <= node.x + node.w &&
      pointDocY >= node.y &&
      pointDocY <= node.y + node.h
    ) {
      return { parentId: node.id };
    }
  }
  return { parentId: null };
}

function couldBeParent(node: CapabilityNode, draggedIds: Set<NodeId>): boolean {
  if (draggedIds.has(node.id)) return false;
  if (node.isTextLabel || node.type === "text") return false;
  if (node.isLockedAsIs) return false;
  return true;
}

function computeDepths(doc: CapabilityDocument): Map<NodeId, number> {
  const depths = new Map<NodeId, number>();
  for (const node of Object.values(doc.nodesById)) {
    let depth = 0;
    let current: CapabilityNode | undefined = node;
    const seen = new Set<NodeId>();
    while (current?.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      depth += 1;
      current = doc.nodesById[current.parentId];
    }
    depths.set(node.id, depth);
  }
  return depths;
}

export function isAcceptableDropTarget(
  doc: CapabilityDocument,
  draggedNodeId: NodeId,
  targetParentId: NodeId | null,
): { accepted: boolean; reason?: string } {
  if (targetParentId === null) return { accepted: true };
  const target = doc.nodesById[targetParentId];
  if (!target)
    return { accepted: false, reason: "Drop target no longer exists." };
  if (target.isTextLabel || target.type === "text") {
    return { accepted: false, reason: "Text labels cannot contain children." };
  }
  if (target.isLockedAsIs) {
    return { accepted: false, reason: "Drop target is locked." };
  }
  if (isDescendantOf(doc, targetParentId, draggedNodeId)) {
    return {
      accepted: false,
      reason: "A node cannot be moved into its descendant.",
    };
  }
  return { accepted: true };
}

function isDescendantOf(
  doc: CapabilityDocument,
  candidate: NodeId,
  ancestor: NodeId,
): boolean {
  const stack: NodeId[] = [...childrenOf(doc, ancestor)];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === candidate) return true;
    stack.push(...childrenOf(doc, id));
  }
  return false;
}
