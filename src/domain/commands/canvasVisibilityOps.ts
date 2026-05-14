import { cloneDocument } from "../document/normalize";
import {
  canvasChildrenOf,
  isNodeOnCanvas,
  now,
  subtreeNodeIds,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../document/types";
import { boundsForBoxes } from "../layout/bounds";
import { command, fail, ok, transaction } from "./transaction";
import type { Transaction } from "./types";

interface DocumentPoint {
  x: number;
  y: number;
}

export function addSubtreeToCanvas(
  nodeId: NodeId,
  targetCenter: DocumentPoint,
): Transaction {
  return transaction(
    "Add subtree to active view",
    [
      command("add-subtree-to-canvas", { nodeId, targetCenter }, "visual", (doc) => {
        const node = doc.nodesById[nodeId];
        if (!node)
          return fail(
            doc,
            "missing-node",
            "The selected capability no longer exists.",
          );
        const next = cloneDocument(doc);
        const ids = subtreeNodeIds(next, nodeId);
        const shouldPlaceSubtree = !isNodeOnCanvas(node);
        const bounds = shouldPlaceSubtree
          ? boundsForNodesIncludingHidden(next, ids)
          : null;
        const dx = bounds ? targetCenter.x - bounds.x - bounds.w / 2 : 0;
        const dy = bounds ? targetCenter.y - bounds.y - bounds.h / 2 : 0;
        let changed = false;

        for (const id of ids) {
          const current = next.nodesById[id];
          if (!current) continue;
          const patch = {
            ...current,
            isOnCanvas: true,
            x: current.x + dx,
            y: current.y + dy,
            updatedAt: now(),
          };
          if (
            current.isOnCanvas === patch.isOnCanvas &&
            current.x === patch.x &&
            current.y === patch.y
          )
            continue;
          next.nodesById[id] = patch;
          changed = true;
        }

        return ok(changed ? next : doc);
      }),
    ],
    {
      relayout: {
        scope: (_beforeDoc, afterDoc) =>
          canvasAdditionRelayoutScope(afterDoc, nodeId),
        force: true,
      },
    },
  );
}

export function removeSubtreeFromCanvas(nodeId: NodeId): Transaction {
  return transaction(
    "Remove subtree from active view",
    [
      command("remove-subtree-from-canvas", { nodeId }, "visual", (doc) => {
        if (!doc.nodesById[nodeId])
          return fail(
            doc,
            "missing-node",
            "The selected capability no longer exists.",
          );
        const next = cloneDocument(doc);
        let changed = false;
        for (const id of subtreeNodeIds(next, nodeId)) {
          const node = next.nodesById[id];
          if (!node || !isNodeOnCanvas(node)) continue;
          next.nodesById[id] = {
            ...node,
            isOnCanvas: false,
            updatedAt: now(),
          };
          changed = true;
        }
        return ok(changed ? next : doc);
      }),
    ],
    {
      relayout: {
        scope: (beforeDoc) => {
          const parentId = beforeDoc.nodesById[nodeId]?.parentId ?? null;
          const parent = parentId ? beforeDoc.nodesById[parentId] : undefined;
          return parent && isNodeOnCanvas(parent) ? [parent.id] : [];
        },
        force: true,
      },
    },
  );
}

export function removeNodesFromCanvas(nodeIds: NodeId[]): Transaction {
  return transaction(
    "Remove from active view",
    [
      command("remove-nodes-from-canvas", { nodeIds }, "visual", (doc) => {
        const next = cloneDocument(doc);
        const toRemove = new Set<NodeId>();
        for (const nodeId of nodeIds) {
          if (!next.nodesById[nodeId]) continue;
          for (const id of subtreeNodeIds(next, nodeId)) toRemove.add(id);
        }

        let changed = false;
        for (const id of toRemove) {
          const node = next.nodesById[id];
          if (!node || !isNodeOnCanvas(node)) continue;
          next.nodesById[id] = {
            ...node,
            isOnCanvas: false,
            updatedAt: now(),
          };
          changed = true;
        }
        return ok(changed ? next : doc);
      }),
    ],
    {
      relayout: {
        scope: (beforeDoc) => canvasRemovalRelayoutScope(beforeDoc, nodeIds),
        force: true,
      },
    },
  );
}

function canvasRemovalRelayoutScope(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
): NodeId[] {
  const parents = new Set<NodeId>();
  for (const nodeId of nodeIds) {
    const node = doc.nodesById[nodeId];
    if (!node || !isNodeOnCanvas(node)) continue;
    const parent = node.parentId ? doc.nodesById[node.parentId] : undefined;
    if (parent && isNodeOnCanvas(parent)) parents.add(parent.id);
  }
  return [...parents];
}

function canvasAdditionRelayoutScope(
  doc: CapabilityDocument,
  nodeId: NodeId,
): NodeId[] {
  const node = doc.nodesById[nodeId];
  if (!node || !isNodeOnCanvas(node)) return [];
  const parent = node.parentId ? doc.nodesById[node.parentId] : undefined;
  if (parent && isNodeOnCanvas(parent)) return [parent.id];
  return canvasChildrenOf(doc, node.id);
}

function boundsForNodesIncludingHidden(doc: CapabilityDocument, ids: NodeId[]) {
  const nodes = ids
    .map((id) => doc.nodesById[id])
    .filter((node): node is CapabilityNode => !!node);
  return boundsForBoxes(nodes);
}
