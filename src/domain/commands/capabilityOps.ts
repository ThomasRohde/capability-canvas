import { createNode, makeId, nextColor } from "../document/defaults";
import { normalizeNodeLabel } from "../document/labels";
import { cloneDocument, rebuildChildren } from "../document/normalize";
import {
  childrenOf,
  now,
  ROOT_PARENT_ID,
  type CapabilityColor,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../document/types";
import { snapCoordinate } from "../layout/grid";
import { descendantsOf, isDescendantOf } from "../validation/validate";
import { canBulkEditNodes } from "./selectionGuards";
import { command, fail, ok, transaction } from "./transaction";
import type { Transaction } from "./types";

interface AddCapabilityOptions {
  isOnCanvas?: boolean;
}

export function addRoot(
  label = "New capability",
  options: AddCapabilityOptions = {},
): Transaction {
  return transaction("Add root capability", [
    command("add-root", { label }, "source", (doc) => {
      const next = cloneDocument(doc);
      const rootCount = childrenOf(next, null).length;
      const isOnCanvas = options.isOnCanvas ?? true;
      const id = makeId("root");
      next.nodesById[id] = createNode({
        id,
        label,
        parentId: null,
        type: "root",
        color: nextColor(rootCount),
        isOnCanvas,
        x: snapCoordinate(next, 48),
        y: snapCoordinate(next, 48 + rootCount * 168),
        w: next.settings.defaultParentWidth * 2,
        h: next.settings.defaultParentHeight,
      });
      next.childrenByParentId[ROOT_PARENT_ID] = [...childrenOf(next, null), id];
      next.childrenByParentId[id] = [];
      return ok(next);
    }),
  ]);
}

export function addChild(
  parentId: NodeId,
  label = "New capability",
  options: AddCapabilityOptions = {},
): Transaction {
  const isOnCanvas = options.isOnCanvas ?? true;
  return transaction(
    "Add child capability",
    [
      command("add-child", { parentId, label }, "source", (doc) => {
        const parent = doc.nodesById[parentId];
        if (!parent)
          return fail(
            doc,
            "missing-parent",
            "Select a valid parent before adding a child.",
          );
        if (parent.isTextLabel || parent.type === "text")
          return fail(
            doc,
            "text-label-parent",
            "Text labels cannot contain children.",
          );
        const next = cloneDocument(doc);
        const childCount = childrenOf(next, parentId).length;
        const id = makeId("cap");
        next.nodesById[id] = createNode({
          id,
          label,
          parentId,
          type: "leaf",
          color: parent.color,
          isOnCanvas,
          x: snapCoordinate(next, parent.x + 32 + childCount * 184),
          y: snapCoordinate(next, parent.y + 64),
          w: next.settings.fixedLeafWidth,
          h: next.settings.fixedLeafHeight,
        });
        next.nodesById[parentId] = {
          ...parent,
          type: parent.type === "root" ? "root" : "parent",
          updatedAt: now(),
        };
        next.childrenByParentId[parentId] = [...childrenOf(next, parentId), id];
        next.childrenByParentId[id] = [];
        return ok(next);
      }),
    ],
    isOnCanvas ? { relayout: { scope: [parentId], force: true } } : undefined,
  );
}

export function addTextLabel(
  parentId: NodeId | null,
  label = "Text label",
): Transaction {
  return transaction("Add text label", [
    command("add-text-label", { parentId, label }, "source", (doc) => {
      const next = cloneDocument(doc);
      const id = makeId("text");
      next.nodesById[id] = createNode({
        id,
        label,
        parentId,
        type: "text",
        color: "teal",
        isTextLabel: true,
        x: parentId ? (next.nodesById[parentId]?.x ?? 0) + 24 : 24,
        y: parentId ? (next.nodesById[parentId]?.y ?? 0) + 24 : 24,
        w: 180,
        h: 36,
      });
      const key = parentId ?? ROOT_PARENT_ID;
      next.childrenByParentId[key] = [
        ...(next.childrenByParentId[key] ?? []),
        id,
      ];
      next.childrenByParentId[id] = [];
      return ok(next);
    }),
  ]);
}

export function updateNode(
  nodeId: NodeId,
  patch: Partial<CapabilityNode>,
): Transaction {
  return transaction("Update capability", [
    command("update-node", { nodeId, patch }, "source", (doc) => {
      const node = doc.nodesById[nodeId];
      if (!node)
        return fail(
          doc,
          "missing-node",
          "The selected capability no longer exists.",
        );
      const next = cloneDocument(doc);
      const nodePatch = { ...patch };
      if (Object.hasOwn(patch, "label")) {
        nodePatch.label = normalizeNodeLabel(patch.label ?? "");
      }
      const colorPatch: Partial<CapabilityNode> = {};
      if (Object.hasOwn(patch, "color") && patch.color) {
        colorPatch.colorOverride = patch.color;
        delete nodePatch.color;
      } else if (Object.hasOwn(patch, "colorOverride")) {
        colorPatch.colorOverride = patch.colorOverride;
      }
      next.nodesById[nodeId] = {
        ...node,
        ...nodePatch,
        ...colorPatch,
        id: node.id,
        updatedAt: now(),
      };
      return ok(next);
    }),
  ]);
}

export function updateNodeColors(
  nodeIds: NodeId[],
  color: CapabilityColor,
): Transaction {
  return transaction(
    "Update capability colors",
    [
      command("update-node-colors", { nodeIds, color }, "source", (doc) => {
        if (nodeIds.length === 0) return ok(doc);
        const allowed = canBulkEditNodes(doc, nodeIds);
        if (!allowed.valid)
          return fail(
            doc,
            "invalid-selection",
            allowed.reason ?? "Invalid selection.",
          );
        const next = cloneDocument(doc);
        let changed = false;
        for (const nodeId of nodeIds) {
          const node = next.nodesById[nodeId];
          if (!node)
            return fail(
              doc,
              "missing-node",
              "The selected capability no longer exists.",
            );
          if (node.colorOverride === color) continue;
          next.nodesById[nodeId] = {
            ...node,
            colorOverride: color,
            updatedAt: now(),
          };
          changed = true;
        }
        return ok(changed ? next : doc);
      }),
    ],
    { source: "bulk" },
  );
}

export function updateNodeHeatmapValues(
  nodeIds: NodeId[],
  heatmapValue: number | undefined,
): Transaction {
  return transaction(
    heatmapValue === undefined
      ? "Clear selected heatmap values"
      : "Update selected heatmap values",
    [
      command(
        "update-node-heatmap-values",
        { nodeIds, heatmapValue },
        "source",
        (doc) => {
          if (nodeIds.length === 0) return ok(doc);
          const allowed = canBulkEditNodes(doc, nodeIds);
          if (!allowed.valid)
            return fail(
              doc,
              "invalid-selection",
              allowed.reason ?? "Invalid selection.",
            );
          if (
            heatmapValue !== undefined &&
            (!Number.isFinite(heatmapValue) ||
              heatmapValue < 0 ||
              heatmapValue > 1)
          ) {
            return fail(
              doc,
              "invalid-heatmap-value",
              "Heatmap value must be between 0 and 1.",
            );
          }
          const next = cloneDocument(doc);
          let changed = false;
          for (const nodeId of nodeIds) {
            const node = next.nodesById[nodeId];
            if (!node)
              return fail(
                doc,
                "missing-node",
                "The selected capability no longer exists.",
              );
            if (node.heatmapValue === heatmapValue) continue;
            next.nodesById[nodeId] = {
              ...node,
              heatmapValue,
              updatedAt: now(),
            };
            changed = true;
          }
          return ok(changed ? next : doc);
        },
      ),
    ],
    { source: "bulk" },
  );
}

export function updateDocumentTitle(title: string): Transaction {
  return transaction("Update document title", [
    command("update-document-title", { title }, "source", (doc) =>
      ok({ ...doc, title: title.trim() || "Untitled capability model" }),
    ),
  ]);
}

export function updateDocumentSettings(
  patch: Partial<CapabilityDocument["settings"]>,
): Transaction {
  return transaction("Update document settings", [
    command("update-document-settings", { patch }, "source", (doc) =>
      ok({
        ...doc,
        settings: {
          ...doc.settings,
          ...patch,
        },
        layout: {
          ...doc.layout,
          mode: patch.layoutMode ?? doc.layout.mode,
        },
      }),
    ),
  ]);
}

export function updateHeatmapSettings(
  patch: Partial<CapabilityDocument["heatmap"]>,
): Transaction {
  return transaction("Update heatmap settings", [
    command("update-heatmap-settings", { patch }, "source", (doc) =>
      ok({ ...doc, heatmap: { ...doc.heatmap, ...patch } }),
    ),
  ]);
}

export function deleteNodes(nodeIds: NodeId[]): Transaction {
  return transaction(
    "Delete from model",
    [
      command("delete-nodes", { nodeIds }, "source", (doc) => {
        const next = cloneDocument(doc);
        const toDelete = new Set<NodeId>();
        for (const id of nodeIds) {
          if (!next.nodesById[id]) continue;
          toDelete.add(id);
          for (const descendantId of descendantsOf(next, id))
            toDelete.add(descendantId);
        }
        for (const id of toDelete) delete next.nodesById[id];
        for (const [parentId, children] of Object.entries(
          next.childrenByParentId,
        )) {
          next.childrenByParentId[parentId] = children.filter(
            (childId) => !toDelete.has(childId),
          );
        }
        return ok(rebuildChildren(next));
      }),
    ],
    {
      relayout: {
        scope: (beforeDoc) => {
          const parents = new Set<NodeId>();
          for (const id of nodeIds) {
            const node = beforeDoc.nodesById[id];
            if (node?.parentId) parents.add(node.parentId);
          }
          return [...parents];
        },
        force: true,
      },
    },
  );
}

export function reparentNode(
  nodeId: NodeId,
  parentId: NodeId | null,
): Transaction {
  return transaction(
    "Reparent capability",
    [
      command("reparent-node", { nodeId, parentId }, "source", (doc) => {
        const node = doc.nodesById[nodeId];
        const parent = parentId ? doc.nodesById[parentId] : null;
        if (!node)
          return fail(
            doc,
            "missing-node",
            "The selected capability no longer exists.",
          );
        if (parent?.isTextLabel || parent?.type === "text")
          return fail(
            doc,
            "text-label-parent",
            "Text labels cannot be parents.",
          );
        if (parentId && isDescendantOf(doc, parentId, nodeId))
          return fail(
            doc,
            "cycle",
            "A node cannot be moved into its descendant.",
          );
        const next = cloneDocument(doc);
        next.nodesById[nodeId] = {
          ...node,
          parentId,
          type: parentId
            ? node.type === "root"
              ? "parent"
              : node.type
            : "root",
        };
        return ok(rebuildChildren(next));
      }),
    ],
    {
      relayout: {
        scope: (beforeDoc) => {
          const oldParent = beforeDoc.nodesById[nodeId]?.parentId ?? null;
          const scope = new Set<NodeId>();
          if (oldParent) scope.add(oldParent);
          if (parentId) scope.add(parentId);
          return [...scope];
        },
        force: true,
      },
    },
  );
}

export function duplicateNodes(nodeIds: NodeId[]): Transaction {
  return transaction("Duplicate capability", [
    command("duplicate-nodes", { nodeIds }, "source", (doc) => {
      const next = cloneDocument(doc);
      const idMap = new Map<NodeId, NodeId>();
      const sourceIds = new Set<NodeId>();
      for (const rootId of nodeIds) {
        sourceIds.add(rootId);
        for (const descendantId of descendantsOf(doc, rootId))
          sourceIds.add(descendantId);
      }
      for (const id of sourceIds) idMap.set(id, makeId("copy"));
      for (const id of sourceIds) {
        const node = doc.nodesById[id]!;
        const newId = idMap.get(id)!;
        const parentId =
          node.parentId && sourceIds.has(node.parentId)
            ? idMap.get(node.parentId)!
            : node.parentId;
        next.nodesById[newId] = {
          ...node,
          id: newId,
          parentId,
          label: `${node.label} copy`,
          x: node.x + 24,
          y: node.y + 24,
          createdAt: now(),
          updatedAt: now(),
        };
      }
      return ok(rebuildChildren(next));
    }),
  ]);
}
