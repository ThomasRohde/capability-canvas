import {
  type CapabilityColor,
  type CapabilityDocument,
  type CapabilityNode,
  DOCUMENT_SCHEMA,
  DOCUMENT_VERSION,
  ROOT_PARENT_ID,
  type NodeId,
} from "./types";
import { createVisualWorkspaceFromDocument } from "../visual/workspace";

export const CATEGORY_COLORS: CapabilityColor[] = [
  "mint",
  "sky",
  "coral",
  "amber",
  "lavender",
  "peach",
];

export const DEFAULT_SETTINGS = {
  gridEnabled: true,
  gridSize: 8,
  resizeSnapToGrid: true,
  fixedLeafWidth: 175,
  fixedLeafHeight: 40,
  leafColor: "slate" as const,
  colorPalette: "default" as const,
  defaultParentWidth: 175,
  defaultParentHeight: 40,
  containerPaddingTop: 8,
  containerPaddingRight: 8,
  containerPaddingBottom: 8,
  containerPaddingLeft: 8,
  containerTitleHeight: 28,
  containerLabelOffsetTop: 4,
  childGapX: 4,
  childGapY: 4,
  fontFamily: "Segoe UI",
  borderRadius: 8,
  layoutMode: "uniform" as const,
  layoutAspectRatioPreset: "16:9" as const,
  customLayoutAspectRatioWidth: 16,
  customLayoutAspectRatioHeight: 9,
};

export const DEFAULT_LAYOUT = {
  mode: "uniform" as const,
  isUserArranged: false,
  preservePositions: true,
  boundingBox: { x: 0, y: 0, w: 0, h: 0 },
};

export const DEFAULT_HEATMAP = {
  enabled: false,
  showLegend: true,
  showValuePills: true,
  palette: "green-yellow-red" as const,
  fallbackColor: "mint" as const,
};

export function createNode(
  partial: Partial<CapabilityNode> & Pick<CapabilityNode, "id" | "label">,
): CapabilityNode {
  const timestamp = Date.now();
  return {
    id: partial.id,
    parentId: partial.parentId ?? null,
    label: partial.label,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    w: partial.w ?? DEFAULT_SETTINGS.fixedLeafWidth,
    h: partial.h ?? DEFAULT_SETTINGS.fixedLeafHeight,
    type: partial.type ?? "leaf",
    color: partial.color ?? "mint",
    colorOverride: partial.colorOverride,
    description: partial.description,
    metadata: partial.metadata ?? {},
    layoutPreferences: partial.layoutPreferences,
    isManualPositioningEnabled: partial.isManualPositioningEnabled ?? false,
    isLockedAsIs: partial.isLockedAsIs ?? false,
    isTextLabel:
      partial.isTextLabel ??
      (partial.type === "text" || partial.type === "label"),
    isOnCanvas: partial.isOnCanvas ?? true,
    textStyle: partial.textStyle,
    heatmapValue: partial.heatmapValue,
    createdAt: partial.createdAt ?? timestamp,
    updatedAt: partial.updatedAt ?? timestamp,
  };
}

export function createEmptyDocument(
  title = "Untitled capability model",
): CapabilityDocument {
  const doc: CapabilityDocument = {
    schema: DOCUMENT_SCHEMA,
    version: DOCUMENT_VERSION,
    nodesById: {},
    childrenByParentId: { [ROOT_PARENT_ID]: [] },
    settings: { ...DEFAULT_SETTINGS },
    layout: {
      ...DEFAULT_LAYOUT,
      boundingBox: { ...DEFAULT_LAYOUT.boundingBox },
    },
    heatmap: { ...DEFAULT_HEATMAP },
    visual: undefined as never,
    timestamp: Date.now(),
    title,
  };
  doc.visual = createVisualWorkspaceFromDocument(doc);
  return doc;
}

export function nextColor(index: number): CapabilityColor {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length]!;
}

export function makeId(prefix = "cap"): NodeId {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${random}`;
}
