import { childrenOf, type CapabilityDocument, type NodeId } from "../document/types";
import { createVisualViewFromDocument } from "./workspace";

export type VisualTemplateId =
  | "full-model-default@1"
  | "level-1-map@1"
  | "level-2-map@1"
  | "level-3-map@1"
  | "executive-overview@1"
  | "domain-deep-dive@1"
  | "heatmap-overview@1"
  | "presentation-slide@1";

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
      "Shows exactly the nodes that are currently visible on the canvas, using the current layout and export settings. Use this when you want a view that mirrors the working model without hiding levels.",
  },
  {
    id: "level-1-map@1",
    name: "Level 1 map",
    description:
      "Shows root capabilities and their direct children only. Grandchildren and deeper nodes are hidden so the view stays at the first decomposition level.",
  },
  {
    id: "level-2-map@1",
    name: "Level 2 map",
    description:
      "Shows root capabilities, their children, and grandchildren. Level 3 and deeper nodes are hidden for a mid-level capability map.",
  },
  {
    id: "level-3-map@1",
    name: "Level 3 map",
    description:
      "Shows root capabilities down through level 3, including great-grandchildren. Any deeper nodes are hidden while more operational detail remains visible.",
  },
  {
    id: "executive-overview@1",
    name: "Executive overview",
    description:
      "Shows the top three structural levels and collapses level-2 parents that have children. Uses 16:9 export framing and shows the heatmap legend when heatmap is active.",
  },
  {
    id: "domain-deep-dive@1",
    name: "Domain deep-dive",
    description:
      "Focuses on the selected capability subtree, or the first root when nothing is selected. Includes up to four descendant levels and hides the rest of the model.",
  },
  {
    id: "heatmap-overview@1",
    name: "Heatmap overview",
    description:
      "Shows root capabilities down through level 3, enables heatmap mode, and places the legend in the bottom-right. Use this to compare scores across a compact model overview.",
  },
  {
    id: "presentation-slide@1",
    name: "Presentation slide",
    description:
      "Shows the full current visible model but applies presentation export defaults: 16:9 page, title and footer on, and grid off. Use this when preparing a slide export.",
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
  const walk = (nodeId: NodeId, depth: number) => {
    if (depth > maxDepth) return;
    out.push(nodeId);
    for (const childId of childrenOf(doc, nodeId)) walk(childId, depth + 1);
  };
  for (const rootId of childrenOf(doc, null)) walk(rootId, 0);
  return out;
}

function nodesAtDepth(doc: CapabilityDocument, targetDepth: number): NodeId[] {
  const out: NodeId[] = [];
  const walk = (nodeId: NodeId, depth: number) => {
    if (depth === targetDepth) out.push(nodeId);
    if (depth >= targetDepth) return;
    for (const childId of childrenOf(doc, nodeId)) walk(childId, depth + 1);
  };
  for (const rootId of childrenOf(doc, null)) walk(rootId, 0);
  return out;
}

function subtreeIds(
  doc: CapabilityDocument,
  rootId: NodeId,
  maxDepth: number,
): NodeId[] {
  const out: NodeId[] = [];
  const walk = (nodeId: NodeId, depth: number) => {
    if (!doc.nodesById[nodeId] || depth > maxDepth) return;
    out.push(nodeId);
    for (const childId of childrenOf(doc, nodeId)) walk(childId, depth + 1);
  };
  walk(rootId, 0);
  return out;
}

function cloneTemplateContext(
  context: VisualTemplateContext | undefined,
): VisualTemplateContext | undefined {
  return context?.rootId ? { rootId: context.rootId } : undefined;
}
