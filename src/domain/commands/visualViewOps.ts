import { makeId } from "../document/defaults";
import { cloneDocument } from "../document/normalize";
import {
  isNodeOnCanvas,
  now,
  subtreeNodeIds,
  type CapabilityDocument,
  type NodeId,
  type VisualNodeState,
  type VisualView,
  type VisualViewId,
} from "../document/types";
import { computeDocumentBounds } from "../layout/engine";
import {
  createViewFromTemplate,
  DEFAULT_VISUAL_TEMPLATE_ID,
  resolveBuiltInTemplateId,
  type VisualTemplateId,
} from "../visual/templates";
import { attachViewBaseline } from "../visual/viewChanges";
import {
  activeVisualView,
  cloneVisualView,
  cloneVisualWorkspace,
  createVisualViewFromDocument,
  materializeActiveViewMetadata,
  resolveVisualDocument,
} from "../visual/workspace";
import { command, fail, ok, transaction } from "./transaction";
import type { Transaction } from "./types";

const COLLAPSED_VISIBILITY_KEY = "collapsedDescendantVisibilityById";

export function createVisualView(
  args: {
    name?: string;
    templateId?: VisualTemplateId;
    rootId?: NodeId;
  } = {},
): Transaction {
  const id = makeId("view");
  return transaction(
    "Create visual view",
    [
      command("create-visual-view", { ...args, id }, "source", (doc) => {
        const next = cloneDocument(doc);
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
              templateId: DEFAULT_VISUAL_TEMPLATE_ID,
            });
        const visual = cloneVisualWorkspace(next.visual);
        visual.viewsById[id] = view;
        visual.viewOrder.push(id);
        visual.activeViewId = id;
        next.visual = visual;
        return ok(
          attachViewBaseline(materializeActiveViewMetadata(next), id, "full"),
        );
      }),
    ],
    {
      baseline: { viewId: id, mode: "full" },
      ...(args.templateId
        ? { relayout: { scope: "document" as const, force: true, viewId: id } }
        : {}),
    },
  );
}

export function duplicateVisualView(viewId?: VisualViewId): Transaction {
  return transaction("Duplicate visual view", [
    command("duplicate-visual-view", { viewId }, "source", (doc) => {
      const sourceId = viewId ?? doc.visual.activeViewId;
      const source = doc.visual.viewsById[sourceId];
      if (!source)
        return fail(doc, "missing-view", "Select a valid view to duplicate.");
      const next = cloneDocument(doc);
      const visual = cloneVisualWorkspace(next.visual);
      const id = makeId("view");
      visual.viewsById[id] = {
        ...cloneVisualView(source),
        id,
        name: uniqueViewName(doc, `${source.name} copy`),
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
      return ok(
        attachViewBaseline(materializeActiveViewMetadata(next), id, "full"),
      );
    }),
  ]);
}

export function renameVisualView(
  viewId: VisualViewId,
  name: string,
): Transaction {
  return transaction("Rename visual view", [
    command("rename-visual-view", { viewId, name }, "source", (doc) =>
      updateView(doc, viewId, {
        name: name.trim() || "Untitled view",
        updatedAt: now(),
      }),
    ),
  ]);
}

export function deleteVisualView(viewId: VisualViewId): Transaction {
  return transaction("Delete visual view", [
    command("delete-visual-view", { viewId }, "source", (doc) => {
      if (doc.visual.viewOrder.length <= 1)
        return fail(
          doc,
          "delete-last-view",
          "The last visual view cannot be deleted.",
        );
      if (!doc.visual.viewsById[viewId])
        return fail(doc, "missing-view", "Select a valid view to delete.");
      const next = cloneDocument(doc);
      const visual = cloneVisualWorkspace(next.visual);
      delete visual.viewsById[viewId];
      visual.viewOrder = visual.viewOrder.filter((id) => id !== viewId);
      if (visual.defaultViewId === viewId)
        visual.defaultViewId = visual.viewOrder[0]!;
      if (visual.activeViewId === viewId)
        visual.activeViewId = visual.defaultViewId;
      next.visual = visual;
      return ok(materializeActiveViewMetadata(next));
    }),
  ]);
}

export function reorderVisualViews(viewOrder: VisualViewId[]): Transaction {
  return transaction("Reorder visual views", [
    command("reorder-visual-views", { viewOrder }, "source", (doc) => {
      const existing = new Set(doc.visual.viewOrder);
      const requested = viewOrder.filter((id) => existing.has(id));
      if (requested.length !== doc.visual.viewOrder.length)
        return fail(
          doc,
          "invalid-view-order",
          "View order must include every view exactly once.",
        );
      const next = cloneDocument(doc);
      next.visual = {
        ...cloneVisualWorkspace(next.visual),
        viewOrder: requested,
      };
      return ok(next);
    }),
  ]);
}

export function updateVisualView(
  viewId: VisualViewId,
  patch: Partial<VisualView>,
): Transaction {
  return transaction("Update visual view", [
    command("update-visual-view", { viewId, patch }, "source", (doc) =>
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
      command("update-visual-node-state", { viewId, nodeId, patch }, "source", (doc) => {
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
          boundingBox: computeDocumentBounds(
            resolveVisualDocument(next, viewId),
          ),
          aspectRatioFrame: undefined,
          aspectRatioTarget: undefined,
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
  return transaction(
    "Reset visual view",
    [
      command("reset-visual-view", { viewId }, "source", (doc) => {
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
            templateId: DEFAULT_VISUAL_TEMPLATE_ID,
          }),
          createdAt: previous.createdAt,
          updatedAt: now(),
        };
        next.visual = visual;
        return ok(
          attachViewBaseline(
            materializeActiveViewMetadata(next),
            viewId,
            "full",
          ),
        );
      }),
    ],
    { baseline: { viewId, mode: "full" } },
  );
}

export function resetVisualViewLayout(viewId: VisualViewId): Transaction {
  return transaction(
    "Reset visual view layout",
    [
      command("reset-visual-view-layout", { viewId }, "source", (doc) => {
        const existing = doc.visual.viewsById[viewId];
        if (!existing) return fail(doc, "missing-view", "Select a valid view.");
        const templateId = resolveBuiltInTemplateId(existing.templateId);
        const contextRootId = existing.templateContext?.rootId;
        const baseline = createViewFromTemplate(doc, {
          id: viewId,
          templateId,
          name: existing.name,
          context: { rootId: contextRootId },
        });
        const next = cloneDocument(doc);
        const visual = cloneVisualWorkspace(next.visual);
        const current = visual.viewsById[viewId]!;
        visual.viewsById[viewId] = {
          ...current,
          nodeStatesById: mergeLayoutNodeStates(
            current.nodeStatesById,
            baseline.nodeStatesById,
          ),
          layout: {
            ...baseline.layout,
            boundingBox: baseline.layout.boundingBox
              ? { ...baseline.layout.boundingBox }
              : undefined,
            aspectRatioFrame: baseline.layout.aspectRatioFrame
              ? { ...baseline.layout.aspectRatioFrame }
              : undefined,
            aspectRatioTarget: baseline.layout.aspectRatioTarget
              ? { ...baseline.layout.aspectRatioTarget }
              : undefined,
          },
          updatedAt: now(),
        };
        next.visual = visual;
        return ok(
          attachViewBaseline(
            materializeActiveViewMetadata(next),
            viewId,
            "layout",
          ),
        );
      }),
    ],
    {
      baseline: { viewId, mode: "layout" },
      relayout: { scope: "document", force: true, viewId },
    },
  );
}

export function resetVisualViewVisibility(viewId: VisualViewId): Transaction {
  return transaction("Reset visual view visibility", [
    command("reset-visual-view-visibility", { viewId }, "source", (doc) => {
      const existing = doc.visual.viewsById[viewId];
      if (!existing) return fail(doc, "missing-view", "Select a valid view.");
      const templateId = resolveBuiltInTemplateId(existing.templateId);
      const contextRootId = existing.templateContext?.rootId;
      const baseline = createViewFromTemplate(doc, {
        id: viewId,
        templateId,
        name: existing.name,
        context: { rootId: contextRootId },
      });
      const next = cloneDocument(doc);
      const visual = cloneVisualWorkspace(next.visual);
      const current = visual.viewsById[viewId]!;
      visual.viewsById[viewId] = {
        ...current,
        nodeStatesById: mergeVisibilityNodeStates(
          current.nodeStatesById,
          baseline.nodeStatesById,
        ),
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
  return transaction(
    "Reset visual view from template",
    [
      command(
        "reset-visual-view-from-template",
        { viewId, templateId, rootId },
        "source",
        (doc) => {
          const existing = doc.visual.viewsById[viewId];
          if (!existing)
            return fail(doc, "missing-view", "Select a valid view.");
          const contextRootId = rootId ?? existing.templateContext?.rootId;
          const next = cloneDocument(doc);
          const visual = cloneVisualWorkspace(next.visual);
          visual.viewsById[viewId] = {
            ...createViewFromTemplate(doc, {
              id: viewId,
              templateId,
              name: existing.name,
              context: { rootId: contextRootId },
            }),
            createdAt: existing.createdAt,
            updatedAt: now(),
          };
          next.visual = visual;
          return ok(
            attachViewBaseline(
              materializeActiveViewMetadata(next),
              viewId,
              "full",
            ),
          );
        },
      ),
    ],
    {
      baseline: { viewId, mode: "full" },
      relayout: { scope: "document", force: true, viewId },
    },
  );
}

export function setDefaultVisualView(viewId: VisualViewId): Transaction {
  return transaction("Set default visual view", [
    command("set-default-visual-view", { viewId }, "source", (doc) => {
      if (!doc.visual.viewsById[viewId])
        return fail(doc, "missing-view", "Select a valid view.");
      const next = cloneDocument(doc);
      next.visual = {
        ...cloneVisualWorkspace(next.visual),
        defaultViewId: viewId,
      };
      return ok(next);
    }),
  ]);
}

export function updateActiveViewHeatmapSettings(
  patch: Partial<VisualView["heatmap"]>,
): Transaction {
  return transaction("Update view heatmap settings", [
    command("update-active-view-heatmap-settings", { patch }, "source", (doc) => {
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
    command("update-active-view-layout-settings", { patch }, "source", (doc) => {
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

export function updateActiveViewExportSettings(
  patch: Partial<VisualView["export"]>,
): Transaction {
  return transaction("Update view export settings", [
    command("update-active-view-export-settings", { patch }, "source", (doc) => {
      const view = activeVisualView(doc);
      return updateView(doc, view.id, {
        export: {
          ...view.export,
          ...patch,
        },
        updatedAt: now(),
      });
    }),
  ]);
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
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
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
  const currentView = visual.viewsById[viewId]!;
  const nextLayout = {
    ...currentView.layout,
    ...(patch.layout ?? {}),
  };
  if (nextLayout.mode !== "balanced" || nextLayout.isUserArranged) {
    nextLayout.aspectRatioFrame = undefined;
    nextLayout.aspectRatioTarget = undefined;
  }
  visual.viewsById[viewId] = {
    ...currentView,
    ...patch,
    nodeStatesById: patch.nodeStatesById ?? currentView.nodeStatesById,
    layout: nextLayout,
    heatmap: {
      ...currentView.heatmap,
      ...(patch.heatmap ?? {}),
    },
    export: {
      ...currentView.export,
      ...(patch.export ?? {}),
    },
  };
  next.visual = visual;
  return ok(materializeActiveViewMetadata(next));
}

function mergeLayoutNodeStates(
  currentStates: Record<NodeId, VisualNodeState>,
  baselineStates: Record<NodeId, VisualNodeState>,
): Record<NodeId, VisualNodeState> {
  const next: Record<NodeId, VisualNodeState> = {};
  const nodeIds = new Set([
    ...Object.keys(currentStates),
    ...Object.keys(baselineStates),
  ]);
  for (const nodeId of nodeIds) {
    const current = currentStates[nodeId] ?? {};
    const baseline = baselineStates[nodeId];
    next[nodeId] = {
      ...current,
      ...(baseline
        ? {
            x: baseline.x,
            y: baseline.y,
            w: baseline.w,
            h: baseline.h,
            lockedForView: baseline.lockedForView,
            isManualPositioningEnabled: baseline.isManualPositioningEnabled,
          }
        : {}),
    };
  }
  return next;
}

function mergeVisibilityNodeStates(
  currentStates: Record<NodeId, VisualNodeState>,
  baselineStates: Record<NodeId, VisualNodeState>,
): Record<NodeId, VisualNodeState> {
  const next: Record<NodeId, VisualNodeState> = {};
  const nodeIds = new Set([
    ...Object.keys(currentStates),
    ...Object.keys(baselineStates),
  ]);
  for (const nodeId of nodeIds) {
    const current = currentStates[nodeId] ?? {};
    const baseline = baselineStates[nodeId];
    const merged: VisualNodeState = { ...current };
    if (baseline && "isOnCanvas" in baseline) {
      merged.isOnCanvas = baseline.isOnCanvas;
    } else {
      delete merged.isOnCanvas;
    }
    if (baseline?.isCollapsed === true) {
      merged.isCollapsed = true;
    } else {
      delete merged.isCollapsed;
    }
    delete merged[COLLAPSED_VISIBILITY_KEY];
    next[nodeId] = merged;
  }
  return next;
}

function uniqueViewName(doc: CapabilityDocument, baseName: string): string {
  const existing = new Set(
    Object.values(doc.visual.viewsById).map((view) => view.name),
  );
  if (!existing.has(baseName)) return baseName;
  let suffix = 2;
  while (existing.has(`${baseName} ${suffix}`)) suffix += 1;
  return `${baseName} ${suffix}`;
}
