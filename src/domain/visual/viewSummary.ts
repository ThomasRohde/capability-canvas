import {
  isNodeOnCanvas,
  type CapabilityDocument,
  type VisualView,
  type VisualViewId,
} from "../document/types";
import {
  BUILT_IN_VIEW_TEMPLATES,
  templateById,
  type VisualTemplateId,
} from "./templates";
import { resolveVisualDocument } from "./workspace";
import { viewChangeSummary } from "./viewChanges";

export interface VisualViewSummary {
  viewId: VisualViewId;
  name: string;
  templateId: VisualTemplateId;
  templateName: string;
  visibleNodeCount: number;
  fullChanged: boolean;
  layoutChanged: boolean;
  isActive: boolean;
  isDefault: boolean;
  updatedAt: number;
}

export function summarizeVisualView(
  doc: CapabilityDocument,
  viewId: VisualViewId,
): VisualViewSummary | null {
  const view = doc.visual.viewsById[viewId];
  if (!view) return null;
  const templateId = builtInTemplateId(view.templateId);
  const changes = viewChangeSummary(doc, viewId);
  return {
    viewId,
    name: view.name,
    templateId,
    templateName: templateById(templateId).name,
    visibleNodeCount: countVisibleNodes(doc, viewId),
    fullChanged: changes?.fullChanged ?? false,
    layoutChanged: changes?.layoutChanged ?? false,
    isActive: doc.visual.activeViewId === viewId,
    isDefault: doc.visual.defaultViewId === viewId,
    updatedAt: view.updatedAt,
  };
}

export function summarizeVisualViews(
  doc: CapabilityDocument,
): VisualViewSummary[] {
  return doc.visual.viewOrder
    .map((viewId) => summarizeVisualView(doc, viewId))
    .filter((summary): summary is VisualViewSummary => !!summary);
}

function countVisibleNodes(
  doc: CapabilityDocument,
  viewId: VisualViewId,
): number {
  const resolved = resolveVisualDocument(doc, viewId);
  return Object.values(resolved.nodesById).filter(isNodeOnCanvas).length;
}

function builtInTemplateId(value: VisualView["templateId"]): VisualTemplateId {
  if (
    typeof value === "string" &&
    BUILT_IN_VIEW_TEMPLATES.some((template) => template.id === value)
  ) {
    return value as VisualTemplateId;
  }
  return "full-model-default@1";
}
