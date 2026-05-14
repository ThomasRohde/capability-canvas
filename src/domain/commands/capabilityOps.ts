import { createNode, makeId, nextColor } from "../document/defaults";
import { normalizeNodeLabel } from "../document/labels";
import { cloneDocument, rebuildChildren } from "../document/normalize";
import {
  canvasChildrenOf,
  childrenOf,
  isNodeOnCanvas,
  now,
  ROOT_PARENT_ID,
  type CapabilityColor,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../document/types";
import { rectanglesOverlap } from "../layout/bounds";
import {
  evaluateCanvasLayoutIntent,
} from "../layout/canvasLayoutPolicy";
import { snapCoordinate, snapLayoutSpacing } from "../layout/grid";
import { descendantsOf, isDescendantOf } from "../validation/validate";
import { resolveVisualDocument } from "../visual/workspace";
import { moveNodesWithLayoutIntent } from "./geometryOps";
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
  const id = makeId("cap");
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
      command(
        "place-added-child-for-layout-intent",
        { parentId, nodeId: id },
        "visual",
        (doc) => {
          if (!isOnCanvas) return ok(doc);
          const intent = evaluateCanvasLayoutIntent({
            doc,
            action: "add-child",
            rootNodeIds: [parentId],
          });
          if (!intent.allowed)
            return fail(
              doc,
              intent.diagnosticCode ?? "add-child-rejected",
              intent.message ?? "The child could not be placed.",
            );
          if (intent.requestAutoRelayout) return ok(doc);

          return placeAddedChildWithoutRelayout(doc, parentId, id);
        },
      ),
    ],
    isOnCanvas
      ? {
          relayout: {
            scope: (_beforeDoc, afterDoc) =>
              shouldRelayoutAddedChild(afterDoc, parentId) ? [parentId] : [],
            force: true,
          },
        }
      : undefined,
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
        const affectedParentIds = new Set<NodeId>();
        for (const id of toDelete) {
          const parentId = next.nodesById[id]?.parentId;
          if (parentId) affectedParentIds.add(parentId);
        }
        for (const id of toDelete) delete next.nodesById[id];
        for (const [parentId, children] of Object.entries(
          next.childrenByParentId,
        )) {
          next.childrenByParentId[parentId] = children.filter(
            (childId) => !toDelete.has(childId),
          );
        }
        return ok(
          collapseEmptiedParentsToLeafSize(
            rebuildChildren(next),
            affectedParentIds,
          ),
        );
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
        const oldParentId = node.parentId;
        next.nodesById[nodeId] = {
          ...node,
          parentId,
          type: parentId
            ? node.type === "root"
              ? "parent"
              : node.type
            : "root",
        };
        return ok(
          collapseEmptiedParentsToLeafSize(
            rebuildChildren(next),
            oldParentId ? [oldParentId] : [],
          ),
        );
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

export function reparentNodeWithLayoutIntent(
  nodeId: NodeId,
  parentId: NodeId | null,
  dx = 0,
  dy = 0,
): Transaction {
  const reparentTxn = reparentNode(nodeId, parentId);
  const moveTxn = moveNodesWithLayoutIntent([nodeId], dx, dy, {
    action: "reparent",
    targetParentId: parentId,
  });
  return transaction(
    "Reparent capability",
    [...reparentTxn.commands, ...moveTxn.commands],
    { source: "drag" },
  );
}

export function duplicateNodes(nodeIds: NodeId[]): Transaction {
  return transaction("Duplicate capability", [
    command("duplicate-nodes", { nodeIds }, "source", (doc) => {
      const next = cloneDocument(doc);
      const idMap = new Map<NodeId, NodeId>();
      const sourceIds = new Set<NodeId>();
      for (const rootId of nodeIds) {
        if (!doc.nodesById[rootId]) continue;
        sourceIds.add(rootId);
        for (const descendantId of descendantsOf(doc, rootId))
          sourceIds.add(descendantId);
      }
      if (sourceIds.size === 0) return ok(doc);
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
      const rebuilt = rebuildChildren(next);
      return ok({
        ...rebuilt,
        layout: { ...rebuilt.layout, isUserArranged: true },
      });
    }),
  ]);
}

function shouldRelayoutAddedChild(
  doc: CapabilityDocument,
  parentId: NodeId,
): boolean {
  const resolved = resolveVisualDocument(doc);
  return evaluateCanvasLayoutIntent({
    doc: resolved,
    action: "add-child",
    rootNodeIds: [parentId],
  }).requestAutoRelayout;
}

function placeAddedChildWithoutRelayout(
  doc: CapabilityDocument,
  parentId: NodeId,
  childId: NodeId,
) {
  const parent = doc.nodesById[parentId];
  const child = doc.nodesById[childId];
  if (!parent || !child) return ok(doc);

  const placement = manualChildPlacement(doc, parent, child);
  const nextChild = {
    ...child,
    x: placement.x,
    y: placement.y,
    updatedAt: now(),
  };
  const parentPatch =
    parent.isLockedAsIs || !isNodeOnCanvas(parent)
      ? {}
      : expandedParentSize(doc, parent, nextChild);
  const parentChanged =
    Object.hasOwn(parentPatch, "w") || Object.hasOwn(parentPatch, "h");
  const childChanged = child.x !== nextChild.x || child.y !== nextChild.y;
  if (!childChanged && !parentChanged) return ok(doc);

  const next = cloneDocument(doc);
  next.nodesById[childId] = nextChild;
  if (parentChanged) {
    next.nodesById[parentId] = {
      ...parent,
      ...parentPatch,
      updatedAt: now(),
    };
  }
  return ok({
    ...next,
    layout: { ...next.layout, isUserArranged: true },
  });
}

function manualChildPlacement(
  doc: CapabilityDocument,
  parent: CapabilityNode,
  child: CapabilityNode,
): { x: number; y: number } {
  const margin = childPlacementMargin(doc, parent);
  const gapX = snapLayoutSpacing(doc, doc.settings.childGapX);
  const gapY = snapLayoutSpacing(doc, doc.settings.childGapY);
  const startX = snapCoordinate(doc, parent.x + margin.left);
  const startY = snapCoordinate(doc, parent.y + margin.top);
  const maxX = parent.x + parent.w - margin.right - child.w;
  const maxY = parent.y + parent.h - margin.bottom - child.h;
  const existing = canvasChildrenOf(doc, parent.id)
    .filter((id) => id !== child.id)
    .map((id) => doc.nodesById[id])
    .filter((node): node is CapabilityNode => !!node && isNodeOnCanvas(node));

  if (startX <= maxX && startY <= maxY) {
    const stepX = Math.max(1, child.w + gapX);
    const stepY = Math.max(1, child.h + gapY);
    for (let row = 0; row < 32; row += 1) {
      const y = snapCoordinate(doc, startY + row * stepY);
      if (y > maxY) break;
      for (let column = 0; column < 32; column += 1) {
        const x = snapCoordinate(doc, startX + column * stepX);
        if (x > maxX) break;
        const candidate = { x, y, w: child.w, h: child.h };
        if (!existing.some((node) => rectanglesOverlap(candidate, node))) {
          return { x, y };
        }
      }
    }
  }

  if (parent.isLockedAsIs) {
    return {
      x: clampToRange(startX, parent.x, maxX),
      y: clampToRange(startY, parent.y, maxY),
    };
  }

  const fallbackY =
    existing.length > 0
      ? Math.max(...existing.map((node) => node.y + node.h)) + gapY
      : startY;
  return {
    x: startX,
    y: snapCoordinate(doc, fallbackY),
  };
}

function childPlacementMargin(
  doc: CapabilityDocument,
  parent: CapabilityNode,
) {
  return {
    top: snapLayoutSpacing(
      doc,
      (parent.layoutPreferences?.marginTop ??
        doc.settings.containerPaddingTop) + doc.settings.containerTitleHeight,
    ),
    right: snapLayoutSpacing(
      doc,
      parent.layoutPreferences?.marginRight ??
        doc.settings.containerPaddingRight,
    ),
    bottom: snapLayoutSpacing(
      doc,
      parent.layoutPreferences?.marginBottom ??
        doc.settings.containerPaddingBottom,
    ),
    left: snapLayoutSpacing(
      doc,
      parent.layoutPreferences?.marginLeft ??
        doc.settings.containerPaddingLeft,
    ),
  };
}

function expandedParentSize(
  doc: CapabilityDocument,
  parent: CapabilityNode,
  child: CapabilityNode,
): Partial<CapabilityNode> {
  const margin = childPlacementMargin(doc, parent);
  const w = Math.max(parent.w, child.x + child.w + margin.right - parent.x);
  const h = Math.max(parent.h, child.y + child.h + margin.bottom - parent.y);
  return {
    ...(w !== parent.w ? { w } : {}),
    ...(h !== parent.h ? { h } : {}),
  };
}

function clampToRange(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function collapseEmptiedParentsToLeafSize(
  doc: CapabilityDocument,
  parentIds: Iterable<NodeId>,
): CapabilityDocument {
  const collapsedIds: NodeId[] = [];
  const timestamp = now();
  for (const parentId of parentIds) {
    const node = doc.nodesById[parentId];
    if (!node || node.isTextLabel || node.type === "text") {
      continue;
    }
    if (childrenOf(doc, parentId).length > 0) continue;
    if (
      node.type === "leaf" &&
      node.w === doc.settings.fixedLeafWidth &&
      node.h === doc.settings.fixedLeafHeight
    ) {
      continue;
    }
    doc.nodesById[parentId] = {
      ...node,
      type: "leaf",
      w: doc.settings.fixedLeafWidth,
      h: doc.settings.fixedLeafHeight,
      updatedAt: timestamp,
    };
    collapsedIds.push(parentId);
  }
  if (collapsedIds.length === 0) return doc;

  for (const view of Object.values(doc.visual.viewsById)) {
    let changed = false;
    for (const nodeId of collapsedIds) {
      const state = view.nodeStatesById[nodeId];
      if (!state) continue;
      if (
        state.w === doc.settings.fixedLeafWidth &&
        state.h === doc.settings.fixedLeafHeight
      ) {
        continue;
      }
      view.nodeStatesById[nodeId] = {
        ...state,
        w: doc.settings.fixedLeafWidth,
        h: doc.settings.fixedLeafHeight,
      };
      changed = true;
    }
    if (changed) view.updatedAt = timestamp;
  }
  return doc;
}
