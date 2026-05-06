import { createNode, makeId, nextColor } from "../document/defaults";
import { cloneDocument, rebuildChildren } from "../document/normalize";
import {
  canvasChildrenOf,
  childrenOf,
  hasChildren,
  isNodeOnCanvas,
  now,
  ROOT_PARENT_ID,
  subtreeNodeIds,
  type CapabilityColor,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
  type VisualNodeState,
  type VisualView,
  type VisualViewId,
} from "../document/types";
import { ensureParentContainment } from "../layout/containment";
import { computeDocumentBounds } from "../layout/engine";
import { snapCoordinate } from "../layout/grid";
import { canAlign, canDistribute } from "../selection/rules";
import {
  descendantsOf,
  isDescendantOf,
  validateDocument,
} from "../validation/validate";
import { error, type Diagnostic } from "../validation/diagnostics";
import {
  createViewFromTemplate,
  type VisualTemplateId,
} from "../visual/templates";
import {
  activeVisualView,
  cloneVisualView,
  cloneVisualWorkspace,
  createVisualViewFromDocument,
  materializeActiveViewMetadata,
  reconcileVisualWorkspaceWithNodes,
  resolveVisualDocument,
} from "../visual/workspace";
import {
  type AlignDirection,
  type Command,
  type DistributionAxis,
  type SizeAxis,
  type Transaction,
} from "./types";

type MutableDoc = CapabilityDocument;
const COLLAPSED_VISIBILITY_KEY = "collapsedDescendantVisibilityById";

interface AddCapabilityOptions {
  isOnCanvas?: boolean;
}

interface DocumentPoint {
  x: number;
  y: number;
}

export function transaction(
  label: string,
  commands: Command[],
  meta?: Transaction["meta"],
): Transaction {
  return { label, commands, meta };
}

export function runTransaction(
  doc: CapabilityDocument,
  txn: Transaction,
): { doc: CapabilityDocument; diagnostics: Diagnostic[] } {
  let next = cloneDocument(doc);
  const diagnostics: Diagnostic[] = [];
  for (const command of txn.commands) {
    const result = command.apply(next);
    diagnostics.push(...result.diagnostics);
    if (result.diagnostics.some((diag) => diag.severity === "error")) {
      return { doc, diagnostics };
    }
    next = result.doc;
  }
  const typed = refreshHierarchyTypes(next);
  const contained = ensureParentContainment(typed).doc;
  const validation = validateDocument(contained);
  if (!validation.valid) {
    return { doc, diagnostics: [...diagnostics, ...validation.diagnostics] };
  }
  const reconciled = reconcileVisualWorkspaceWithNodes(doc, contained);
  return {
    doc: materializeActiveViewMetadata({
      ...reconciled,
      timestamp: now(),
      layout: {
        ...reconciled.layout,
        boundingBox: computeDocumentBounds(reconciled),
      },
    }),
    diagnostics,
  };
}

export function addRoot(
  label = "New capability",
  options: AddCapabilityOptions = {},
): Transaction {
  return transaction("Add root capability", [
    command("add-root", { label }, (doc) => {
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
      command("add-child", { parentId, label }, (doc) => {
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
          heatmapValue: 0,
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

export function addSubtreeToCanvas(
  nodeId: NodeId,
  targetCenter: DocumentPoint,
): Transaction {
  return transaction(
    "Add subtree to canvas",
    [
      command("add-subtree-to-canvas", { nodeId, targetCenter }, (doc) => {
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
        scope: (_beforeDoc, afterDoc) => {
          const node = afterDoc.nodesById[nodeId];
          const parent = node?.parentId
            ? afterDoc.nodesById[node.parentId]
            : undefined;
          return parent && isNodeOnCanvas(parent) ? [parent.id] : [nodeId];
        },
        force: true,
      },
    },
  );
}

export function removeSubtreeFromCanvas(nodeId: NodeId): Transaction {
  return transaction(
    "Remove subtree from canvas",
    [
      command("remove-subtree-from-canvas", { nodeId }, (doc) => {
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

export function addTextLabel(
  parentId: NodeId | null,
  label = "Text label",
): Transaction {
  return transaction("Add text label", [
    command("add-text-label", { parentId, label }, (doc) => {
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
    command("update-node", { nodeId, patch }, (doc) => {
      const node = doc.nodesById[nodeId];
      if (!node)
        return fail(
          doc,
          "missing-node",
          "The selected capability no longer exists.",
        );
      const next = cloneDocument(doc);
      next.nodesById[nodeId] = {
        ...node,
        ...patch,
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
      command("update-node-colors", { nodeIds, color }, (doc) => {
        if (nodeIds.length === 0) return ok(doc);
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
          if (node.color === color) continue;
          next.nodesById[nodeId] = { ...node, color, updatedAt: now() };
          changed = true;
        }
        return ok(changed ? next : doc);
      }),
    ],
    { source: "bulk" },
  );
}

export function updateDocumentTitle(title: string): Transaction {
  return transaction("Update document title", [
    command("update-document-title", { title }, (doc) =>
      ok({ ...doc, title: title.trim() || "Untitled capability model" }),
    ),
  ]);
}

export function updateDocumentSettings(
  patch: Partial<CapabilityDocument["settings"]>,
): Transaction {
  return transaction("Update document settings", [
    command("update-document-settings", { patch }, (doc) =>
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
    command("update-heatmap-settings", { patch }, (doc) =>
      ok({ ...doc, heatmap: { ...doc.heatmap, ...patch } }),
    ),
  ]);
}

export function createVisualView(args: {
  name?: string;
  templateId?: VisualTemplateId;
  rootId?: NodeId;
} = {}): Transaction {
  return transaction("Create visual view", [
    command("create-visual-view", args, (doc) => {
      const next = cloneDocument(doc);
      const id = makeId("view");
      const view = args.templateId
        ? createViewFromTemplate(doc, {
            id,
            templateId: args.templateId,
            name: args.name,
            context: { rootId: args.rootId },
          })
        : createVisualViewFromDocument(doc, {
            id,
            name: args.name?.trim() || "New view",
            templateId: "full-model-default@1",
          });
      const visual = cloneVisualWorkspace(next.visual);
      visual.viewsById[id] = view;
      visual.viewOrder.push(id);
      visual.activeViewId = id;
      next.visual = visual;
      return ok(materializeActiveViewMetadata(next));
    }),
  ]);
}

export function duplicateVisualView(viewId?: VisualViewId): Transaction {
  return transaction("Duplicate visual view", [
    command("duplicate-visual-view", { viewId }, (doc) => {
      const sourceId = viewId ?? doc.visual.activeViewId;
      const source = doc.visual.viewsById[sourceId];
      if (!source) return fail(doc, "missing-view", "Select a valid view to duplicate.");
      const next = cloneDocument(doc);
      const visual = cloneVisualWorkspace(next.visual);
      const id = makeId("view");
      visual.viewsById[id] = {
        ...cloneVisualView(source),
        id,
        name: `${source.name} copy`,
        createdAt: now(),
        updatedAt: now(),
      };
      const sourceIndex = visual.viewOrder.indexOf(sourceId);
      visual.viewOrder =
        sourceIndex >= 0
          ? [
              ...visual.viewOrder.slice(0, sourceIndex + 1),
              id,
              ...visual.viewOrder.slice(sourceIndex + 1),
            ]
          : [...visual.viewOrder, id];
      visual.activeViewId = id;
      next.visual = visual;
      return ok(materializeActiveViewMetadata(next));
    }),
  ]);
}

export function renameVisualView(
  viewId: VisualViewId,
  name: string,
): Transaction {
  return transaction("Rename visual view", [
    command("rename-visual-view", { viewId, name }, (doc) =>
      updateView(doc, viewId, {
        name: name.trim() || "Untitled view",
        updatedAt: now(),
      }),
    ),
  ]);
}

export function deleteVisualView(viewId: VisualViewId): Transaction {
  return transaction("Delete visual view", [
    command("delete-visual-view", { viewId }, (doc) => {
      if (doc.visual.viewOrder.length <= 1)
        return fail(doc, "delete-last-view", "The last visual view cannot be deleted.");
      if (!doc.visual.viewsById[viewId])
        return fail(doc, "missing-view", "Select a valid view to delete.");
      const next = cloneDocument(doc);
      const visual = cloneVisualWorkspace(next.visual);
      delete visual.viewsById[viewId];
      visual.viewOrder = visual.viewOrder.filter((id) => id !== viewId);
      if (visual.defaultViewId === viewId) visual.defaultViewId = visual.viewOrder[0]!;
      if (visual.activeViewId === viewId) visual.activeViewId = visual.defaultViewId;
      next.visual = visual;
      return ok(materializeActiveViewMetadata(next));
    }),
  ]);
}

export function reorderVisualViews(viewOrder: VisualViewId[]): Transaction {
  return transaction("Reorder visual views", [
    command("reorder-visual-views", { viewOrder }, (doc) => {
      const existing = new Set(doc.visual.viewOrder);
      const requested = viewOrder.filter((id) => existing.has(id));
      if (requested.length !== doc.visual.viewOrder.length)
        return fail(doc, "invalid-view-order", "View order must include every view exactly once.");
      const next = cloneDocument(doc);
      next.visual = { ...cloneVisualWorkspace(next.visual), viewOrder: requested };
      return ok(next);
    }),
  ]);
}

export function updateVisualView(
  viewId: VisualViewId,
  patch: Partial<VisualView>,
): Transaction {
  return transaction("Update visual view", [
    command("update-visual-view", { viewId, patch }, (doc) =>
      updateView(doc, viewId, { ...patch, updatedAt: now() }),
    ),
  ]);
}

export function updateVisualNodeState(
  viewId: VisualViewId,
  nodeId: NodeId,
  patch: VisualNodeState,
): Transaction {
  const isCollapseToggle = typeof patch.isCollapsed === "boolean";
  const label =
    patch.isCollapsed === true
      ? "Collapse capability"
      : patch.isCollapsed === false
        ? "Expand capability"
        : "Update visual node state";

  return transaction(
    label,
    [
      command("update-visual-node-state", { viewId, nodeId, patch }, (doc) => {
        if (!doc.nodesById[nodeId])
          return fail(
            doc,
            "missing-node",
            "The selected capability no longer exists.",
          );
        const view = doc.visual.viewsById[viewId];
        if (!view) return fail(doc, "missing-view", "Select a valid view.");
        const next = cloneDocument(doc);
        const visual = cloneVisualWorkspace(next.visual);
        const nextView = visual.viewsById[viewId]!;
        let nodeState: VisualNodeState = {
          ...(nextView.nodeStatesById[nodeId] ?? {}),
          ...patch,
        };
        if (patch.isCollapsed === true) {
          const visibility: Record<NodeId, boolean> = {};
          for (const descendantId of subtreeNodeIds(doc, nodeId).slice(1)) {
            const descendant = doc.nodesById[descendantId];
            if (!descendant) continue;
            const descendantState = nextView.nodeStatesById[descendantId];
            visibility[descendantId] =
              typeof descendantState?.isOnCanvas === "boolean"
                ? descendantState.isOnCanvas
                : isNodeOnCanvas(descendant);
          }
          nodeState = {
            ...nodeState,
            [COLLAPSED_VISIBILITY_KEY]: visibility,
          };
        }
        if (patch.isCollapsed === false) {
          const savedVisibility = readCollapsedVisibility(nodeState);
          for (const descendantId of subtreeNodeIds(doc, nodeId).slice(1)) {
            const descendant = doc.nodesById[descendantId];
            if (!descendant) continue;
            nextView.nodeStatesById[descendantId] = {
              ...(nextView.nodeStatesById[descendantId] ?? {}),
              isOnCanvas:
                savedVisibility?.[descendantId] ?? isNodeOnCanvas(descendant),
            };
          }
          delete nodeState.isCollapsed;
          delete nodeState[COLLAPSED_VISIBILITY_KEY];
        }
        nextView.nodeStatesById[nodeId] = nodeState;
        next.visual = visual;
        nextView.layout = {
          ...nextView.layout,
          boundingBox: computeDocumentBounds(resolveVisualDocument(next, viewId)),
        };
        nextView.updatedAt = now();
        return ok(materializeActiveViewMetadata(next));
      }),
    ],
    isCollapseToggle
      ? {
          relayout: {
            scope: (_beforeDoc, afterDoc) =>
              visualNodeParentRelayoutScope(afterDoc, nodeId),
            force: true,
          },
        }
      : undefined,
  );
}

export function resetVisualView(viewId: VisualViewId): Transaction {
  return transaction("Reset visual view", [
    command("reset-visual-view", { viewId }, (doc) => {
      if (!doc.visual.viewsById[viewId])
        return fail(doc, "missing-view", "Select a valid view.");
      const next = cloneDocument(doc);
      const visual = cloneVisualWorkspace(next.visual);
      const previous = visual.viewsById[viewId]!;
      visual.viewsById[viewId] = {
        ...createVisualViewFromDocument(doc, {
          id: viewId,
          name: previous.name,
          description: previous.description,
          templateId: "full-model-default@1",
        }),
        createdAt: previous.createdAt,
        updatedAt: now(),
      };
      next.visual = visual;
      return ok(materializeActiveViewMetadata(next));
    }),
  ]);
}

export function resetVisualViewFromTemplate(
  viewId: VisualViewId,
  templateId: VisualTemplateId,
  rootId?: NodeId,
): Transaction {
  return transaction("Reset visual view from template", [
    command("reset-visual-view-from-template", { viewId, templateId, rootId }, (doc) => {
      const existing = doc.visual.viewsById[viewId];
      if (!existing) return fail(doc, "missing-view", "Select a valid view.");
      const next = cloneDocument(doc);
      const visual = cloneVisualWorkspace(next.visual);
      visual.viewsById[viewId] = {
        ...createViewFromTemplate(doc, {
          id: viewId,
          templateId,
          name: existing.name,
          context: { rootId },
        }),
        createdAt: existing.createdAt,
        updatedAt: now(),
      };
      next.visual = visual;
      return ok(materializeActiveViewMetadata(next));
    }),
  ]);
}

export function setDefaultVisualView(viewId: VisualViewId): Transaction {
  return transaction("Set default visual view", [
    command("set-default-visual-view", { viewId }, (doc) => {
      if (!doc.visual.viewsById[viewId])
        return fail(doc, "missing-view", "Select a valid view.");
      const next = cloneDocument(doc);
      next.visual = { ...cloneVisualWorkspace(next.visual), defaultViewId: viewId };
      return ok(next);
    }),
  ]);
}

export function updateActiveViewHeatmapSettings(
  patch: Partial<VisualView["heatmap"]>,
): Transaction {
  return transaction("Update view heatmap settings", [
    command("update-active-view-heatmap-settings", { patch }, (doc) => {
      const view = activeVisualView(doc);
      return updateView(doc, view.id, {
        heatmap: {
          ...view.heatmap,
          ...patch,
        },
        updatedAt: now(),
      });
    }),
  ]);
}

export function updateActiveViewLayoutSettings(
  patch: Partial<VisualView["layout"]>,
): Transaction {
  return transaction("Update view layout settings", [
    command("update-active-view-layout-settings", { patch }, (doc) => {
      const view = activeVisualView(doc);
      return updateView(doc, view.id, {
        layout: {
          ...view.layout,
          ...patch,
        },
        updatedAt: now(),
      });
    }),
  ]);
}

export function deleteNodes(nodeIds: NodeId[]): Transaction {
  return transaction(
    "Delete capability",
    [
      command("delete-nodes", { nodeIds }, (doc) => {
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

export function moveNodes(
  nodeIds: NodeId[],
  dx: number,
  dy: number,
): Transaction {
  return transaction(
    "Move capability",
    [
      command("move-nodes", { nodeIds, dx, dy }, (doc) => {
        const next = cloneDocument(doc);
        const toMove = new Set<NodeId>();
        for (const nodeId of nodeIds) {
          if (!next.nodesById[nodeId]) continue;
          toMove.add(nodeId);
          for (const descendantId of descendantsOf(next, nodeId))
            toMove.add(descendantId);
        }
        for (const id of toMove) {
          const node = next.nodesById[id];
          if (!node) continue;
          next.nodesById[id] = {
            ...node,
            x: node.x + dx,
            y: node.y + dy,
            updatedAt: now(),
          };
        }
        return ok({
          ...next,
          layout: { ...next.layout, isUserArranged: true },
        });
      }),
    ],
    { source: "drag" },
  );
}

export function resizeNode(nodeId: NodeId, w: number, h: number): Transaction {
  return transaction(
    "Resize capability",
    [
      command("resize-node", { nodeId, w, h }, (doc) => {
        const node = doc.nodesById[nodeId];
        if (!node)
          return fail(
            doc,
            "missing-node",
            "The selected capability no longer exists.",
          );
        if (node.isLockedAsIs)
          return fail(
            doc,
            "locked-node",
            "Locked capabilities cannot be resized.",
          );
        const childBounds = node.isManualPositioningEnabled
          ? null
          : boundsForNodes(doc, canvasChildrenOf(doc, nodeId));
        const minW = childBounds
          ? childBounds.x +
            childBounds.w -
            node.x +
            (node.layoutPreferences?.marginRight ??
              doc.settings.containerPaddingRight)
          : 80;
        const minH = childBounds
          ? childBounds.y +
            childBounds.h -
            node.y +
            (node.layoutPreferences?.marginBottom ??
              doc.settings.containerPaddingBottom)
          : 40;
        return updateOnly(doc, nodeId, {
          w: Math.max(w, minW),
          h: Math.max(h, minH),
        });
      }),
    ],
    {
      relayout: {
        scope: (beforeDoc, afterDoc) => {
          const node =
            afterDoc.nodesById[nodeId] ?? beforeDoc.nodesById[nodeId];
          if (!node) return [];
          if (canvasChildrenOf(afterDoc, nodeId).length === 0) return [];
          if (node.isManualPositioningEnabled) return [];
          return [nodeId];
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
      command("reparent-node", { nodeId, parentId }, (doc) => {
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
    command("duplicate-nodes", { nodeIds }, (doc) => {
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

export function alignNodes(
  nodeIds: NodeId[],
  direction: AlignDirection,
): Transaction {
  return transaction(
    `Align ${direction}`,
    [
      command("align-nodes", { nodeIds, direction }, (doc) => {
        const allowed = canAlign(doc, nodeIds);
        if (!allowed.valid)
          return fail(
            doc,
            "invalid-selection",
            allowed.reason ?? "Invalid selection.",
          );
        const nodes = nodeIds.map((id) => doc.nodesById[id]!);
        const next = cloneDocument(doc);
        const target = alignTarget(nodes, direction);
        for (const node of nodes) {
          const patch =
            direction === "left"
              ? { x: target }
              : direction === "center"
                ? { x: target - node.w / 2 }
                : direction === "right"
                  ? { x: target - node.w }
                  : direction === "top"
                    ? { y: target }
                    : direction === "middle"
                      ? { y: target - node.h / 2 }
                      : { y: target - node.h };
          next.nodesById[node.id] = { ...node, ...patch, updatedAt: now() };
        }
        return ok({
          ...next,
          layout: { ...next.layout, isUserArranged: true },
        });
      }),
    ],
    { source: "bulk" },
  );
}

export function distributeNodes(
  nodeIds: NodeId[],
  axis: DistributionAxis,
): Transaction {
  return transaction(
    `Distribute ${axis}`,
    [
      command("distribute-nodes", { nodeIds, axis }, (doc) => {
        const allowed = canDistribute(doc, nodeIds);
        if (!allowed.valid)
          return fail(
            doc,
            "invalid-selection",
            allowed.reason ?? "Invalid selection.",
          );
        const nodes = nodeIds
          .map((id) => doc.nodesById[id]!)
          .sort((a, b) => (axis === "horizontal" ? a.x - b.x : a.y - b.y));
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        const totalSize = nodes.reduce(
          (sum, node) => sum + (axis === "horizontal" ? node.w : node.h),
          0,
        );
        const span =
          axis === "horizontal"
            ? last.x + last.w - first.x
            : last.y + last.h - first.y;
        const gap = (span - totalSize) / (nodes.length - 1);
        const next = cloneDocument(doc);
        let cursor = axis === "horizontal" ? first.x : first.y;
        for (const node of nodes) {
          next.nodesById[node.id] =
            axis === "horizontal"
              ? { ...node, x: cursor, updatedAt: now() }
              : { ...node, y: cursor, updatedAt: now() };
          cursor += (axis === "horizontal" ? node.w : node.h) + gap;
        }
        return ok({
          ...next,
          layout: { ...next.layout, isUserArranged: true },
        });
      }),
    ],
    { source: "bulk" },
  );
}

export function sameSize(
  nodeIds: NodeId[],
  anchorId: NodeId,
  axis: SizeAxis = "both",
): Transaction {
  return transaction(
    "Same size",
    [
      command("same-size", { nodeIds, anchorId, axis }, (doc) => {
        const anchor = doc.nodesById[anchorId];
        if (!anchor)
          return fail(doc, "missing-anchor", "Anchor node no longer exists.");
        const next = cloneDocument(doc);
        for (const id of nodeIds) {
          const node = next.nodesById[id];
          if (!node || node.isLockedAsIs) continue;
          next.nodesById[id] = {
            ...node,
            w: axis === "height" ? node.w : anchor.w,
            h: axis === "width" ? node.h : anchor.h,
            updatedAt: now(),
          };
        }
        return ok(next);
      }),
    ],
    { source: "bulk" },
  );
}

export function fitParentToChildren(nodeId: NodeId): Transaction {
  return transaction("Fit parent to children", [
    command("fit-parent-to-children", { nodeId }, (doc) => {
      const node = doc.nodesById[nodeId];
      if (!node)
        return fail(
          doc,
          "missing-node",
          "The selected capability no longer exists.",
        );
      if (node.isLockedAsIs)
        return fail(
          doc,
          "locked-node",
          "Locked capabilities cannot be resized.",
        );
      const bounds = boundsForNodes(doc, canvasChildrenOf(doc, nodeId));
      if (!bounds) return ok(doc);
      const margin = {
        top:
          (node.layoutPreferences?.marginTop ??
            doc.settings.containerPaddingTop) +
          doc.settings.containerTitleHeight,
        right:
          node.layoutPreferences?.marginRight ??
          doc.settings.containerPaddingRight,
        bottom:
          node.layoutPreferences?.marginBottom ??
          doc.settings.containerPaddingBottom,
        left:
          node.layoutPreferences?.marginLeft ??
          doc.settings.containerPaddingLeft,
      };
      const x = bounds.x - margin.left;
      const y = bounds.y - margin.top;
      return updateOnly(doc, nodeId, {
        x,
        y,
        w: bounds.x + bounds.w - x + margin.right,
        h: bounds.y + bounds.h - y + margin.bottom,
      });
    }),
  ]);
}

export function repairSiblingOverlaps(parentId: NodeId): Transaction {
  return transaction("Resolve sibling overlap", [
    command("repair-sibling-overlaps", { parentId }, (doc) => {
      const parent = doc.nodesById[parentId];
      if (!parent) return ok(doc);
      const childIds = canvasChildrenOf(doc, parentId);
      if (childIds.length < 2) return ok(doc);
      const next = cloneDocument(doc);
      const movable = childIds
        .map((id) => next.nodesById[id])
        .filter(
          (node): node is NonNullable<typeof node> =>
            !!node && !node.isLockedAsIs && !node.isManualPositioningEnabled,
        );
      if (movable.length < 2) return ok(doc);
      let changed = false;
      const placed: typeof movable = [];
      for (const node of [...movable].sort(
        (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
      )) {
        const x = node.x;
        let y = node.y;
        let nudges = 0;
        while (
          placed.some((other) => rectanglesOverlap({ ...node, x, y }, other)) &&
          nudges < 64
        ) {
          y += doc.settings.childGapY;
          nudges += 1;
        }
        if (y !== node.y) {
          changed = true;
          next.nodesById[node.id] = { ...node, x, y, updatedAt: now() };
          placed.push(next.nodesById[node.id]!);
        } else {
          placed.push(node);
        }
      }
      if (!changed) return ok(doc);
      return ok(next);
    }),
  ]);
}

function rectanglesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function lockSubtree(nodeId: NodeId, locked: boolean): Transaction {
  return transaction(locked ? "Lock subtree" : "Unlock subtree", [
    command("lock-subtree", { nodeId, locked }, (doc) => {
      const next = cloneDocument(doc);
      for (const id of [nodeId, ...descendantsOf(next, nodeId)]) {
        const node = next.nodesById[id];
        if (node)
          next.nodesById[id] = {
            ...node,
            isLockedAsIs: locked,
            updatedAt: now(),
          };
      }
      return ok(next);
    }),
  ]);
}

export function setManualPositioning(
  nodeId: NodeId,
  enabled: boolean,
): Transaction {
  return transaction("Set manual positioning", [
    command("set-manual-positioning", { nodeId, enabled }, (doc) => {
      const node = doc.nodesById[nodeId];
      if (!node)
        return fail(
          doc,
          "missing-node",
          "The selected capability no longer exists.",
        );
      const next = cloneDocument(doc);
      next.nodesById[nodeId] = {
        ...node,
        isManualPositioningEnabled: enabled,
        updatedAt: now(),
      };
      return ok(next);
    }),
  ]);
}

function command<TArgs>(
  type: string,
  args: TArgs,
  apply: (doc: MutableDoc) => {
    doc: CapabilityDocument;
    diagnostics: Diagnostic[];
  },
): Command<TArgs> {
  return { type, args, apply };
}

function ok(doc: CapabilityDocument) {
  return { doc, diagnostics: [] };
}

function fail(doc: CapabilityDocument, code: string, message: string) {
  return { doc, diagnostics: [error(code, message)] };
}

function visualNodeParentRelayoutScope(
  doc: CapabilityDocument,
  nodeId: NodeId,
): NodeId[] {
  const node = doc.nodesById[nodeId];
  if (!node || !isNodeOnCanvas(node)) return [];
  const parent = node.parentId ? doc.nodesById[node.parentId] : undefined;
  return parent && isNodeOnCanvas(parent) ? [parent.id] : [nodeId];
}

function readCollapsedVisibility(
  state: VisualNodeState,
): Record<NodeId, boolean> | null {
  const value = state[COLLAPSED_VISIBILITY_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value))
    return null;
  const visibility: Record<NodeId, boolean> = {};
  for (const [nodeId, visible] of Object.entries(value)) {
    if (typeof visible === "boolean") visibility[nodeId] = visible;
  }
  return visibility;
}

function updateView(
  doc: CapabilityDocument,
  viewId: VisualViewId,
  patch: Partial<VisualView>,
) {
  if (!doc.visual.viewsById[viewId])
    return fail(doc, "missing-view", "Select a valid view.");
  const next = cloneDocument(doc);
  const visual = cloneVisualWorkspace(next.visual);
  visual.viewsById[viewId] = {
    ...visual.viewsById[viewId]!,
    ...patch,
    nodeStatesById:
      patch.nodeStatesById ?? visual.viewsById[viewId]!.nodeStatesById,
    layout: {
      ...visual.viewsById[viewId]!.layout,
      ...(patch.layout ?? {}),
    },
    heatmap: {
      ...visual.viewsById[viewId]!.heatmap,
      ...(patch.heatmap ?? {}),
    },
    export: {
      ...visual.viewsById[viewId]!.export,
      ...(patch.export ?? {}),
    },
  };
  next.visual = visual;
  return ok(materializeActiveViewMetadata(next));
}

function updateOnly(
  doc: CapabilityDocument,
  nodeId: NodeId,
  patch: Partial<CapabilityNode>,
) {
  const next = cloneDocument(doc);
  const node = next.nodesById[nodeId];
  if (!node)
    return fail(
      doc,
      "missing-node",
      "The selected capability no longer exists.",
    );
  next.nodesById[nodeId] = { ...node, ...patch, updatedAt: now() };
  return ok(next);
}

function alignTarget(
  nodes: CapabilityNode[],
  direction: AlignDirection,
): number {
  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x + node.w));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y + node.h));
  if (direction === "left") return minX;
  if (direction === "center") return minX + (maxX - minX) / 2;
  if (direction === "right") return maxX;
  if (direction === "top") return minY;
  if (direction === "middle") return minY + (maxY - minY) / 2;
  return maxY;
}

function boundsForNodes(doc: CapabilityDocument, ids: NodeId[]) {
  const nodes = ids
    .map((id) => doc.nodesById[id])
    .filter((node): node is CapabilityNode => !!node && isNodeOnCanvas(node));
  if (nodes.length === 0) return null;
  return boundsForNodeList(nodes);
}

function boundsForNodesIncludingHidden(doc: CapabilityDocument, ids: NodeId[]) {
  const nodes = ids
    .map((id) => doc.nodesById[id])
    .filter((node): node is CapabilityNode => !!node);
  if (nodes.length === 0) return null;
  return boundsForNodeList(nodes);
}

function boundsForNodeList(nodes: CapabilityNode[]) {
  const x = Math.min(...nodes.map((node) => node.x));
  const y = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.w));
  const maxY = Math.max(...nodes.map((node) => node.y + node.h));
  return { x, y, w: maxX - x, h: maxY - y };
}

export function deriveNodeType(
  doc: CapabilityDocument,
  node: CapabilityNode,
): CapabilityNode["type"] {
  if (!node.parentId) return "root";
  if (node.isTextLabel || node.type === "text") return "text";
  return hasChildren(doc, node.id) ? "parent" : "leaf";
}

function refreshHierarchyTypes(doc: CapabilityDocument): CapabilityDocument {
  let next = doc;
  for (const node of Object.values(doc.nodesById)) {
    const type = deriveNodeType(doc, node);
    if (type === node.type) continue;
    if (next === doc) next = cloneDocument(doc);
    next.nodesById[node.id] = { ...next.nodesById[node.id]!, type };
  }
  return next;
}
