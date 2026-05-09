import { createNode } from "../document/defaults";
import { cloneDocument, rebuildChildren } from "../document/normalize";
import {
  childrenOf,
  isNodeOnCanvas,
  now,
  subtreeNodeIds,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../document/types";
import { snapCoordinate } from "../layout/grid";
import type {
  PromptMergeCapability,
  PromptMergePayload,
} from "../promptMerge/payload";
import { command, fail, ok, transaction } from "./transaction";
import type { Transaction } from "./types";

type PromptParentResolution =
  | { status: "resolved"; parentId: NodeId }
  | { status: "defer" }
  | { status: "invalid"; message: string };

type PromptCapabilityMergeResult =
  | { status: "ok"; changed: boolean }
  | { status: "invalid"; code: string; message: string };

export function mergePromptCapabilities(
  payload: PromptMergePayload,
): Transaction {
  return transaction(
    "Merge prompt capabilities",
    [
      command("merge-prompt-capabilities", { payload }, (doc) => {
        const target = doc.nodesById[payload.targetId];
        if (!target)
          return fail(
            doc,
            "missing-target",
            "The prompt merge target no longer exists.",
          );
        if (target.isTextLabel || target.type === "text")
          return fail(
            doc,
            "text-label-target",
            "Text labels cannot be expanded with prompt output.",
          );
        if (payload.capabilities.length === 0)
          return fail(
            doc,
            "prompt-merge-empty",
            "Prompt output must include at least one capability.",
          );

        const next = cloneDocument(doc);
        const sourceIds = declaredPromptSourceIds(payload.capabilities);
        const sourceIdToNodeId = new Map<NodeId, NodeId>([
          [payload.targetId, payload.targetId],
        ]);
        const scopedNodeIds = new Set(subtreeNodeIds(doc, payload.targetId));
        let pending = [...payload.capabilities];
        let changed = false;

        while (pending.length > 0) {
          const remaining: PromptMergeCapability[] = [];
          let progressed = false;

          for (const item of pending) {
            const parent = resolvePromptMergeParent(
              next,
              item,
              payload.targetId,
              sourceIds,
              sourceIdToNodeId,
              scopedNodeIds,
            );
            if (parent.status === "defer") {
              remaining.push(item);
              continue;
            }
            if (parent.status === "invalid") {
              return fail(doc, "prompt-merge-parent", parent.message);
            }

            const result = mergePromptCapability(
              next,
              item,
              parent.parentId,
              sourceIdToNodeId,
              scopedNodeIds,
            );
            if (result.status === "invalid") {
              return fail(doc, result.code, result.message);
            }
            changed = result.changed || changed;
            progressed = true;
          }

          if (!progressed) {
            const parentId = remaining[0]?.parentId ?? "unknown";
            return fail(
              doc,
              "prompt-merge-parent",
              `Could not resolve generated parent ${parentId}.`,
            );
          }
          pending = remaining;
        }

        return ok(changed ? rebuildChildren(next) : doc);
      }),
    ],
    {
      source: "import",
      relayout: { scope: [payload.targetId], force: true },
    },
  );
}

function declaredPromptSourceIds(
  capabilities: PromptMergeCapability[],
): Set<NodeId> {
  const ids = new Set<NodeId>();
  for (const capability of capabilities) {
    if (capability.id) ids.add(capability.id);
    ids.add(stableCapabilityId(capability.name));
  }
  return ids;
}

function resolvePromptMergeParent(
  doc: CapabilityDocument,
  item: PromptMergeCapability,
  targetId: NodeId,
  sourceIds: Set<NodeId>,
  sourceIdToNodeId: Map<NodeId, NodeId>,
  scopedNodeIds: Set<NodeId>,
): PromptParentResolution {
  const rawParentId = item.parentId?.trim();
  if (!rawParentId || rawParentId === targetId) {
    return { status: "resolved", parentId: targetId };
  }

  const mapped = sourceIdToNodeId.get(rawParentId);
  if (mapped) return { status: "resolved", parentId: mapped };

  if (doc.nodesById[rawParentId]) {
    if (scopedNodeIds.has(rawParentId)) {
      return { status: "resolved", parentId: rawParentId };
    }
    return {
      status: "invalid",
      message: `Parent ${rawParentId} is outside the selected capability subtree.`,
    };
  }

  if (sourceIds.has(rawParentId)) return { status: "defer" };
  return {
    status: "invalid",
    message: `Parent ${rawParentId} does not exist in the selected subtree or generated payload.`,
  };
}

function mergePromptCapability(
  doc: CapabilityDocument,
  item: PromptMergeCapability,
  parentId: NodeId,
  sourceIdToNodeId: Map<NodeId, NodeId>,
  scopedNodeIds: Set<NodeId>,
): PromptCapabilityMergeResult {
  const parent = doc.nodesById[parentId];
  if (!parent) {
    return {
      status: "invalid",
      code: "missing-parent",
      message: `Parent ${parentId} no longer exists.`,
    };
  }
  if (parent.isTextLabel || parent.type === "text") {
    return {
      status: "invalid",
      code: "text-label-parent",
      message: "Text labels cannot contain prompt-generated capabilities.",
    };
  }

  const matchId = findPromptMergeMatch(doc, parentId, item);
  if (matchId) {
    const node = doc.nodesById[matchId]!;
    const metadata = item.metadata
      ? { ...node.metadata, ...item.metadata }
      : node.metadata;
    doc.nodesById[matchId] = {
      ...node,
      label: item.name,
      description: Object.hasOwn(item, "description")
        ? item.description
        : node.description,
      metadata,
      updatedAt: now(),
    };
    addPromptSourceMappings(item, matchId, sourceIdToNodeId);
    scopedNodeIds.add(matchId);
    return { status: "ok", changed: true };
  }

  const id = uniquePromptCapabilityId(
    item.id ?? stableCapabilityId(item.name),
    doc.nodesById,
  );
  const childCount = childrenOf(doc, parentId).length;
  doc.nodesById[id] = createNode({
    id,
    label: item.name,
    parentId,
    type: "leaf",
    color: parent.color,
    description: Object.hasOwn(item, "description")
      ? item.description
      : undefined,
    metadata: item.metadata ? { ...item.metadata } : {},
    isOnCanvas: isNodeOnCanvas(parent),
    x: snapCoordinate(doc, parent.x + 32 + childCount * 184),
    y: snapCoordinate(doc, parent.y + 64),
    w: doc.settings.fixedLeafWidth,
    h: doc.settings.fixedLeafHeight,
  });
  doc.childrenByParentId[parentId] = [...childrenOf(doc, parentId), id];
  doc.childrenByParentId[id] = [];
  addPromptSourceMappings(item, id, sourceIdToNodeId);
  scopedNodeIds.add(id);
  return { status: "ok", changed: true };
}

function addPromptSourceMappings(
  item: PromptMergeCapability,
  nodeId: NodeId,
  sourceIdToNodeId: Map<NodeId, NodeId>,
) {
  if (item.id) sourceIdToNodeId.set(item.id, nodeId);
  const stableId = stableCapabilityId(item.name);
  if (!sourceIdToNodeId.has(stableId)) sourceIdToNodeId.set(stableId, nodeId);
}

function findPromptMergeMatch(
  doc: CapabilityDocument,
  parentId: NodeId,
  item: PromptMergeCapability,
): NodeId | null {
  const childIds = childrenOf(doc, parentId);
  if (item.id && childIds.includes(item.id)) return item.id;
  const normalizedName = normalizeCapabilityLabel(item.name);
  return (
    childIds.find((childId) => {
      const child = doc.nodesById[childId];
      return (
        child &&
        !child.isTextLabel &&
        child.type !== "text" &&
        normalizeCapabilityLabel(child.label) === normalizedName
      );
    }) ?? null
  );
}

function uniquePromptCapabilityId(
  requestedId: string,
  nodesById: Record<NodeId, CapabilityNode>,
): NodeId {
  const baseId = stableCapabilityId(requestedId);
  let id = baseId;
  let suffix = 2;
  while (nodesById[id]) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function stableCapabilityId(value: string): NodeId {
  const id = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || "capability";
}

function normalizeCapabilityLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}
