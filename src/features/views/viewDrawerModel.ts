import type {
  CapabilityDocument,
  NodeId,
  VisualView,
} from "../../domain/document/types";
import {
  buildSafeChildrenByParentId,
  ROOT_PARENT_ID,
} from "../../domain/document/types";
import {
  DEFAULT_VISUAL_TEMPLATE_ID,
  isBuiltInTemplateId,
  templateById,
  type VisualTemplateId,
} from "../../domain/visual/templates";

export interface RootTarget {
  id: NodeId;
  path: string;
}

export function orderedVisualViews(doc: CapabilityDocument): VisualView[] {
  return doc.visual.viewOrder
    .map((viewId) => doc.visual.viewsById[viewId])
    .filter((view): view is VisualView => Boolean(view));
}

export function normalizeViewName(value: string) {
  return value.trim() || "Untitled view";
}

export function normalizeCreateName(value: string, fallback: string) {
  return value.trim() || fallback;
}

export function createDescriptionPreview(
  description: string,
  templateId: VisualTemplateId,
  doc: CapabilityDocument,
  rootId: NodeId,
): string {
  if (templateId !== "domain-deep-dive@1") return description;
  const target = doc.nodesById[rootId];
  return target ? `${description} Target: ${target.label}.` : description;
}

export function viewChangeLabel(
  fullChanged: boolean,
  layoutChanged: boolean,
): string {
  if (!fullChanged) return "Unchanged";
  return layoutChanged ? "Layout changed" : "View changed";
}

export function formatUpdatedAt(updatedAt: number): string {
  const ageMs = Math.max(0, Date.now() - updatedAt);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (ageMs < minute) return "Updated just now";
  if (ageMs < hour) return `Updated ${Math.floor(ageMs / minute)}m ago`;
  if (ageMs < day) return `Updated ${Math.floor(ageMs / hour)}h ago`;
  return `Updated ${new Date(updatedAt).toISOString().slice(0, 10)}`;
}

export function templateIdForView(view: VisualView): VisualTemplateId {
  return isBuiltInTemplateId(view.templateId)
    ? view.templateId
    : DEFAULT_VISUAL_TEMPLATE_ID;
}

export function descriptionForView(
  view: VisualView,
  doc?: CapabilityDocument,
): string {
  const viewTemplateId = templateIdForView(view);
  const description = isBuiltInTemplateId(view.templateId)
    ? templateById(viewTemplateId).description
    : view.description || templateById(viewTemplateId).description;
  if (viewTemplateId !== "domain-deep-dive@1" || !doc) return description;
  const target = view.templateContext?.rootId
    ? doc.nodesById[view.templateContext.rootId]
    : undefined;
  return target ? `${description} Target: ${target.label}.` : description;
}

export function rootIdForTemplate(
  doc: CapabilityDocument,
  templateId: VisualTemplateId,
  selectedNodeIds: NodeId[],
): NodeId | undefined {
  if (templateId !== "domain-deep-dive@1") return undefined;
  return selectedNodeIds.find((nodeId) => {
    const node = doc.nodesById[nodeId];
    return node && !node.isTextLabel && node.type !== "text";
  });
}

export function defaultRootIdForDeepDive(
  doc: CapabilityDocument,
  selectedNodeIds: NodeId[],
  rootTargets: RootTarget[],
): NodeId {
  return (
    rootIdForTemplate(doc, "domain-deep-dive@1", selectedNodeIds) ??
    rootTargets[0]?.id ??
    ""
  );
}

export function orderedRootTargets(doc: CapabilityDocument): RootTarget[] {
  const safeChildren = buildSafeChildrenByParentId(doc).childrenByParentId;
  const out: RootTarget[] = [];
  const emitted = new Set<NodeId>();

  const visit = (parentId: NodeId, path: string[]) => {
    for (const childId of safeChildren[parentId] ?? []) {
      if (emitted.has(childId)) continue;
      emitted.add(childId);
      const node = doc.nodesById[childId];
      if (!node) continue;
      const nextPath = [...path, node.label];
      if (!node.isTextLabel && node.type !== "text") {
        out.push({ id: childId, path: nextPath.join(" > ") });
      }
      visit(childId, nextPath);
    }
  };

  visit(ROOT_PARENT_ID, []);
  for (const nodeId of Object.keys(doc.nodesById).sort()) {
    if (emitted.has(nodeId)) continue;
    const node = doc.nodesById[nodeId];
    if (!node || node.isTextLabel || node.type === "text") continue;
    out.push({ id: nodeId, path: node.label });
  }
  return out;
}
