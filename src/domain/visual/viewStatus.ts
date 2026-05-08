import {
  collectAncestorIds,
  isNodeOnCanvas,
  type CapabilityDocument,
  type NodeId,
  type VisualView,
  type VisualViewId,
} from "../document/types";
import {
  BUILT_IN_VIEW_TEMPLATES,
  createViewFromTemplate,
  type VisualTemplateId,
} from "./templates";
import { activeVisualView, resolveVisualDocument } from "./workspace";

export type ActiveViewNodeVisibility =
  | "visible"
  | "hidden"
  | "outside-active-view";

export interface ActiveViewNodeContext {
  nodeId: NodeId;
  visibility: ActiveViewNodeVisibility;
  isCollapsed: boolean;
  collapsedAncestorId?: NodeId;
}

export function getNodeActiveViewContext(
  doc: CapabilityDocument,
  nodeId: NodeId,
  viewId: VisualViewId = doc.visual.activeViewId,
): ActiveViewNodeContext | null {
  return getActiveViewNodeContexts(doc, viewId)[nodeId] ?? null;
}

export function getActiveViewNodeContexts(
  doc: CapabilityDocument,
  viewId: VisualViewId = doc.visual.activeViewId,
): Record<NodeId, ActiveViewNodeContext> {
  const view = doc.visual.viewsById[viewId] ?? activeVisualView(doc);
  const baseline = baselineViewFor(doc, view);
  const resolved = resolveVisualDocument(doc, view.id);
  const contexts: Record<NodeId, ActiveViewNodeContext> = {};

  for (const nodeId of Object.keys(doc.nodesById)) {
    const node = doc.nodesById[nodeId];
    if (!node) continue;
    const resolvedNode = resolved.nodesById[nodeId];
    const baselineState = baseline.nodeStatesById[nodeId];
    const baselineVisible =
      typeof baselineState?.isOnCanvas === "boolean"
        ? baselineState.isOnCanvas
        : isNodeOnCanvas(node);
    const currentlyVisible = isNodeOnCanvas(resolvedNode);
    contexts[nodeId] = {
      nodeId,
      visibility: currentlyVisible
        ? "visible"
        : baselineVisible
          ? "hidden"
          : "outside-active-view",
      isCollapsed: view.nodeStatesById[nodeId]?.isCollapsed === true,
      collapsedAncestorId: collectAncestorIds(doc, nodeId).ids.find(
        (ancestorId) =>
          view.nodeStatesById[ancestorId]?.isCollapsed === true,
      ),
    };
  }

  return contexts;
}

function baselineViewFor(
  doc: CapabilityDocument,
  view: VisualView,
): VisualView {
  return createViewFromTemplate(doc, {
    id: view.id,
    templateId: builtInTemplateId(view.templateId),
    name: view.name,
    context: view.templateContext,
  });
}

function builtInTemplateId(value: unknown): VisualTemplateId {
  if (
    typeof value === "string" &&
    BUILT_IN_VIEW_TEMPLATES.some((template) => template.id === value)
  ) {
    return value as VisualTemplateId;
  }
  return "full-model-default@1";
}
