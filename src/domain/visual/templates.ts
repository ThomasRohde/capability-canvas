import {
  childrenOf,
  collectDescendantIds,
  computeHierarchyDepths,
  type CapabilityDocument,
  type NodeId,
} from "../document/types";
import { createVisualViewFromDocument } from "./workspace";

export type VisualTemplateId =
  | "full-model-default@1"
  | "level-1-map@1"
  | "level-2-map@1"
  | "level-3-map@1"
  | "level-4-map@1"
  | "executive-overview@1"
  | "domain-deep-dive@1"
  | "heatmap-overview@1"
  | "presentation-slide@1";

export const DEFAULT_VISUAL_TEMPLATE_ID: VisualTemplateId =
  "full-model-default@1";

export interface VisualTemplateContext {
  rootId?: NodeId;
}

export interface VisualTemplateDefinition {
  id: VisualTemplateId;
  name: string;
  description: string;
}

export const BUILT_IN_VIEW_TEMPLATES: VisualTemplateDefinition[] = [
  {
    id: "full-model-default@1",
    name: "Full model default",
    description:
      "Current active view with no level filter or export framing.",
  },
  {
    id: "level-1-map@1",
    name: "Level 1 map",
    description: "Roots and direct children only; hides level 2 and deeper.",
  },
  {
    id: "level-2-map@1",
    name: "Level 2 map",
    description: "Roots through grandchildren; hides level 3 and deeper.",
  },
  {
    id: "level-3-map@1",
    name: "Level 3 map",
    description: "Roots through level 3; hides deeper detail.",
  },
  {
    id: "level-4-map@1",
    name: "Level 4 map",
    description: "Roots through level 4; hides deeper detail.",
  },
  {
    id: "executive-overview@1",
    name: "Executive overview",
    description:
      "Top three levels with deeper branches collapsed and 16:9 export framing.",
  },
  {
    id: "domain-deep-dive@1",
    name: "Domain deep-dive",
    description:
      "Selected capability plus up to four descendant levels; hides the rest.",
  },
  {
    id: "heatmap-overview@1",
    name: "Heatmap overview",
    description:
      "Level 3 map with heatmap enabled and legend shown bottom-right.",
  },
  {
    id: "presentation-slide@1",
    name: "Presentation slide",
    description:
      "Current active view with 16:9 slide export settings.",
  },
];

export function createViewFromTemplate(
  doc: CapabilityDocument,
  args: {
    id: string;
    templateId: VisualTemplateId;
    name?: string;
    context?: VisualTemplateContext;
  },
) {
  const definition = templateById(args.templateId);
  const visibleNodeIds = visibleNodesForTemplate(doc, args.templateId, args.context);
  return createVisualViewFromDocument(doc, {
    id: args.id,
    name: args.name ?? definition.name,
    description: definition.description,
    templateId: args.templateId,
    templateContext: cloneTemplateContext(args.context),
    visibleNodeIds,
    collapsedNodeIds:
      args.templateId === "executive-overview@1"
        ? collapsedExecutiveNodes(doc)
        : undefined,
    layoutMode:
      args.templateId === "heatmap-overview@1" ? "adaptive" : doc.settings.layoutMode,
    heatmap:
      args.templateId === "heatmap-overview@1"
        ? {
            enabled: true,
            showLegend: true,
            legendPosition: "bottom-right",
          }
        : args.templateId === "executive-overview@1"
          ? { showLegend: doc.heatmap.enabled }
          : undefined,
    exportSettings:
      args.templateId === "presentation-slide@1"
        ? {
            pagePreset: "16:9",
            showTitle: true,
            showFooter: true,
            includeGrid: false,
          }
        : args.templateId === "executive-overview@1"
          ? {
              pagePreset: "16:9",
              showTitle: true,
              includeGrid: false,
            }
          : undefined,
  });
}

export function templateById(id: VisualTemplateId): VisualTemplateDefinition {
  return (
    BUILT_IN_VIEW_TEMPLATES.find((template) => template.id === id) ??
    BUILT_IN_VIEW_TEMPLATES[0]!
  );
}

export function isBuiltInTemplateId(value: unknown): value is VisualTemplateId {
  return (
    typeof value === "string" &&
    BUILT_IN_VIEW_TEMPLATES.some((template) => template.id === value)
  );
}

export function resolveBuiltInTemplateId(value: unknown): VisualTemplateId {
  return isBuiltInTemplateId(value) ? value : DEFAULT_VISUAL_TEMPLATE_ID;
}

function visibleNodesForTemplate(
  doc: CapabilityDocument,
  templateId: VisualTemplateId,
  context: VisualTemplateContext | undefined,
): Set<NodeId> | undefined {
  if (templateId === "full-model-default@1" || templateId === "presentation-slide@1") {
    return undefined;
  }
  if (templateId === "level-1-map@1") {
    return new Set(nodesAtDepthOrLess(doc, 1));
  }
  if (templateId === "level-2-map@1" || templateId === "executive-overview@1") {
    return new Set(nodesAtDepthOrLess(doc, 2));
  }
  if (templateId === "level-3-map@1") {
    return new Set(nodesAtDepthOrLess(doc, 3));
  }
  if (templateId === "level-4-map@1") {
    return new Set(nodesAtDepthOrLess(doc, 4));
  }
  if (templateId === "domain-deep-dive@1") {
    const rootId = context?.rootId ?? childrenOf(doc, null)[0];
    return rootId ? new Set(subtreeIds(doc, rootId, 4)) : undefined;
  }
  if (templateId === "heatmap-overview@1") {
    return new Set(nodesAtDepthOrLess(doc, 3));
  }
  return undefined;
}

function collapsedExecutiveNodes(doc: CapabilityDocument): Set<NodeId> {
  return new Set(nodesAtDepth(doc, 2).filter((id) => childrenOf(doc, id).length > 0));
}

function nodesAtDepthOrLess(doc: CapabilityDocument, maxDepth: number): NodeId[] {
  const out: NodeId[] = [];
  const seen = new Set<NodeId>();
  for (const rootId of childrenOf(doc, null)) {
    for (const nodeId of collectDescendantIds(doc, rootId, {
      includeRoot: true,
      maxDepth,
    }).ids) {
      if (seen.has(nodeId)) continue;
      seen.add(nodeId);
      out.push(nodeId);
    }
  }
  return out;
}

function nodesAtDepth(doc: CapabilityDocument, targetDepth: number): NodeId[] {
  const depths = computeHierarchyDepths(doc, childrenOf(doc, null)).depths;
  return nodesAtDepthOrLess(doc, targetDepth).filter(
    (nodeId) => depths.get(nodeId) === targetDepth,
  );
}

function subtreeIds(
  doc: CapabilityDocument,
  rootId: NodeId,
  maxDepth: number,
): NodeId[] {
  return collectDescendantIds(doc, rootId, {
    includeRoot: true,
    maxDepth,
  }).ids;
}

function cloneTemplateContext(
  context: VisualTemplateContext | undefined,
): VisualTemplateContext | undefined {
  return context?.rootId ? { rootId: context.rootId } : undefined;
}
