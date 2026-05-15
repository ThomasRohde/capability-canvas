import { sortedNodes } from "../../domain/document/normalize";
import {
  isNodeOnCanvas,
  isCanvasLabelNode,
  isTextLabelNode,
  type Bounds,
  type CapabilityDocument,
  type CapabilityNode,
  type LabelShape,
  type LegendPosition,
  type VisualView,
} from "../../domain/document/types";
import {
  activeVisualView,
  resolveVisualDocument,
} from "../../domain/visual/workspace";
import {
  boundsForBoxes,
  expandBounds,
  isUsableBounds,
} from "../../domain/layout/bounds";
import { layoutDisplayBounds } from "../../domain/layout/displayBounds";
import {
  heatmapPaletteStops,
  resolveNodeFill,
  type NodeFill,
} from "../heatmap/resolveNodeFill";

const EXPORT_PADDING = 48;
const LEGEND_GAP = 24;
const LEGEND_WIDTH = 210;
const LEGEND_HEIGHT = 58;
const LEGEND_PADDING_X = 12;
const LEGEND_TITLE_BASELINE = 18;
const LEGEND_BAR_TOP = 28;
const LEGEND_BAR_HEIGHT = 8;
const LEGEND_LABEL_BASELINE = 50;
const LEAF_FONT_SIZE = 13;
const LEAF_LINE_HEIGHT = 15.6;
const CONTAINER_FONT_SIZE = 14;
const CONTAINER_LINE_HEIGHT = 17;
const SCORE_BADGE_FONT_SIZE = 10;
const SCORE_BADGE_HEIGHT = 16;
const SCORE_BADGE_INSET = 4;
const SCORE_BADGE_GAP = 4;
export const EXPORT_FONT_FAMILY = "Segoe UI";

export interface VisualExportModel {
  title: string;
  fontFamily: string;
  background: string;
  documentBounds: Bounds;
  contentBounds: Bounds;
  surfaceBounds: Bounds;
  nodes: VisualExportNodeModel[];
  legend?: VisualExportLegendModel;
  exportSettings: VisualView["export"];
}

export interface VisualExportNodeModel {
  id: string;
  description?: string;
  bounds: Bounds;
  isContainer: boolean;
  isLabel?: boolean;
  labelShape?: LabelShape;
  fill: NodeFill;
  radius: number;
  strokeWidth: number;
  label: VisualExportLabelModel;
  score?: VisualExportScoreModel;
}

export interface VisualExportLabelModel {
  lines: string[];
  x: number;
  firstBaselineY: number;
  lineHeight: number;
  fontSize: number;
  fontWeight: number;
  fontFamily?: string;
  align?: "left" | "center" | "right";
}

export interface VisualExportScoreModel {
  kind: "badge";
  value: string;
  bounds: Bounds;
  textX: number;
  textY: number;
  fontSize: number;
  fontWeight: number;
}

export interface VisualExportLegendModel {
  title: string;
  position: LegendPosition;
  bounds: Bounds;
  barBounds: Bounds;
  titleX: number;
  titleY: number;
  labelY: number;
  lowLabel: string;
  highLabel: string;
  stops: string[];
}

export function buildVisualExportModel(
  doc: CapabilityDocument,
): VisualExportModel {
  const visualDoc = resolveVisualDocument(doc);
  const activeView = activeVisualView(visualDoc);
  const documentBounds = resolveDocumentBounds(visualDoc);
  const nodes = sortedNodes(visualDoc)
    .filter(isNodeOnCanvas)
    .map((node) => buildNodeModel(visualDoc, node));
  const legend = buildLegendModel(
    documentBounds,
    visualDoc.heatmap,
    activeView.heatmap,
  );
  const contentBounds =
    boundsForBoxes(
      legend ? [documentBounds, legend.bounds] : [documentBounds],
    ) ?? documentBounds;

  return {
    title: visualDoc.title,
    fontFamily: EXPORT_FONT_FAMILY,
    background: "#ffffff",
    documentBounds,
    contentBounds,
    surfaceBounds: expandBounds(contentBounds, EXPORT_PADDING),
    nodes,
    legend,
    exportSettings: { ...activeView.export },
  };
}

function buildNodeModel(
  doc: CapabilityDocument,
  node: CapabilityNode,
): VisualExportNodeModel {
  const isLabel = isCanvasLabelNode(node);
  const labelShape = isLabel ? (node.textStyle?.shape ?? "none") : "box";
  const isContainer = node.type !== "leaf" && !isTextLabelNode(node);
  const hasScore =
    !isLabel &&
    doc.heatmap.enabled &&
    doc.heatmap.showValuePills &&
    node.heatmapValue !== undefined;
  const maxLines = resolveMaxLabelLines(node, isContainer);
  const label = buildLabelModel(doc, node, isContainer, hasScore, maxLines);
  const score = hasScore ? buildScoreModel(node) : undefined;
  const resolvedFill = resolveNodeFill(
    node,
    doc.heatmap,
    doc.settings.colorPalette,
  );
  const fill =
    isLabel && labelShape === "none"
      ? {
          ...resolvedFill,
          background: "transparent",
          border: "transparent",
          isTransparent: true,
        }
      : resolvedFill;

  return {
    id: node.id,
    description: node.description?.trim() || undefined,
    bounds: { x: node.x, y: node.y, w: node.w, h: node.h },
    isContainer,
    ...(isLabel ? { isLabel: true, labelShape } : {}),
    fill,
    radius: isLabel ? labelRadius(labelShape, node) : isContainer ? 8 : 6,
    strokeWidth: isLabel || fill.isTransparent ? 0 : isContainer ? 1.5 : 1,
    label,
    score,
  };
}

function buildLabelModel(
  doc: CapabilityDocument,
  node: CapabilityNode,
  isContainer: boolean,
  hasScore: boolean,
  maxLines: number,
): VisualExportLabelModel {
  const isLabel = isCanvasLabelNode(node);
  const labelShape = node.textStyle?.shape ?? "none";
  const fontSize = isLabel
    ? (node.textStyle?.fontSize ?? 14)
    : isContainer
      ? CONTAINER_FONT_SIZE
      : LEAF_FONT_SIZE;
  const lineHeight = isLabel
    ? fontSize * 1.2
    : isContainer
      ? CONTAINER_LINE_HEIGHT
      : LEAF_LINE_HEIGHT;
  const fontWeight = isLabel
    ? (node.textStyle?.fontWeight ?? 500)
    : isContainer
      ? 600
      : 500;
  const horizontalPadding = isLabel
    ? labelShape === "none"
      ? 12
      : 20
    : isContainer
      ? 28
      : 12;
  const averageCharWidth = Math.max(4, fontSize * 0.52);
  const scoreClearance =
    !isContainer && hasScore
      ? scoreBadgeWidth(node.heatmapValue?.toFixed(2) ?? "") +
        SCORE_BADGE_INSET +
        SCORE_BADGE_GAP
      : 0;
  const maxChars = Math.max(
    4,
    Math.floor((node.w - horizontalPadding - scoreClearance) / averageCharWidth),
  );
  const lines = wrapLabel(node.label, maxChars, maxLines);
  const firstBaselineY = isContainer
    ? node.y + Math.max(0, doc.settings.containerLabelOffsetTop) + 12
    : leafLabelBaselineY(node, lines.length, fontSize, lineHeight);
  const x =
    !isContainer && hasScore
      ? node.x + horizontalPadding / 2 + (node.w - horizontalPadding - scoreClearance) / 2
      : node.x + node.w / 2;

  return {
    lines,
    x,
    firstBaselineY,
    lineHeight,
    fontSize,
    fontWeight,
    ...(isLabel
      ? {
          fontFamily: node.textStyle?.fontFamily ?? doc.settings.fontFamily,
          align: node.textStyle?.align ?? "center",
        }
      : {}),
  };
}

function labelRadius(shape: LabelShape, node: CapabilityNode): number {
  if (shape === "pill") return Math.max(1, Math.min(node.w, node.h) / 2);
  if (shape === "sticky") return 3;
  if (shape === "none") return 0;
  return 6;
}

function buildScoreModel(node: CapabilityNode): VisualExportScoreModel {
  const value = node.heatmapValue?.toFixed(2) ?? "";
  const width = scoreBadgeWidth(value);
  const bounds = {
    x: node.x + node.w - width - SCORE_BADGE_INSET,
    y: node.y + SCORE_BADGE_INSET,
    w: width,
    h: SCORE_BADGE_HEIGHT,
  };
  return {
    kind: "badge",
    value,
    bounds,
    textX: bounds.x + bounds.w / 2,
    textY: bounds.y + 11,
    fontSize: SCORE_BADGE_FONT_SIZE,
    fontWeight: 600,
  };
}

function scoreBadgeWidth(value: string): number {
  return Math.max(28, value.length * 5.8 + 12);
}

function buildLegendModel(
  documentBounds: Bounds,
  heatmap: CapabilityDocument["heatmap"],
  viewHeatmap: VisualView["heatmap"],
): VisualExportLegendModel | undefined {
  if (!heatmap.enabled || !heatmap.showLegend) return undefined;

  const position = viewHeatmap.legendPosition ?? "bottom-left";
  const bounds =
    position === "custom" && isUsableBounds(viewHeatmap.legendBounds)
      ? { ...viewHeatmap.legendBounds }
      : legendBoundsForPosition(documentBounds, position);

  return {
    title: "Heatmap",
    position,
    bounds,
    barBounds: {
      x: bounds.x + LEGEND_PADDING_X,
      y: bounds.y + LEGEND_BAR_TOP,
      w: bounds.w - LEGEND_PADDING_X * 2,
      h: LEGEND_BAR_HEIGHT,
    },
    titleX: bounds.x + LEGEND_PADDING_X,
    titleY: bounds.y + LEGEND_TITLE_BASELINE,
    labelY: bounds.y + LEGEND_LABEL_BASELINE,
    lowLabel: "Low",
    highLabel: "High",
    stops: heatmapPaletteStops(heatmap.palette),
  };
}

function resolveMaxLabelLines(
  node: CapabilityNode,
  isContainer: boolean,
): number {
  if (isContainer) return 2;
  const availableHeight = Math.max(LEAF_LINE_HEIGHT, node.h - 4);
  return Math.max(
    1,
    Math.min(3, Math.floor(availableHeight / LEAF_LINE_HEIGHT)),
  );
}

function leafLabelBaselineY(
  node: CapabilityNode,
  lineCount: number,
  fontSize: number,
  lineHeight: number,
): number {
  const totalHeight = lineCount * lineHeight;
  const top = node.y + Math.max(0, (node.h - totalHeight) / 2);
  return top + fontSize;
}

function legendBoundsForPosition(
  documentBounds: Bounds,
  position: LegendPosition,
): Bounds {
  const bottomY = documentBounds.y + documentBounds.h + LEGEND_GAP;
  const topY = documentBounds.y - LEGEND_HEIGHT - LEGEND_GAP;
  const leftX = documentBounds.x;
  const rightX = documentBounds.x + documentBounds.w - LEGEND_WIDTH;

  switch (position) {
    case "top-left":
      return { x: leftX, y: topY, w: LEGEND_WIDTH, h: LEGEND_HEIGHT };
    case "top-right":
      return { x: rightX, y: topY, w: LEGEND_WIDTH, h: LEGEND_HEIGHT };
    case "bottom-right":
      return { x: rightX, y: bottomY, w: LEGEND_WIDTH, h: LEGEND_HEIGHT };
    case "custom":
    case "bottom-left":
    default:
      return { x: leftX, y: bottomY, w: LEGEND_WIDTH, h: LEGEND_HEIGHT };
  }
}

function resolveDocumentBounds(doc: CapabilityDocument): Bounds {
  const displayBounds = layoutDisplayBounds(doc);
  if (isUsableBounds(displayBounds)) {
    return { ...displayBounds };
  }
  return { x: 0, y: 0, w: 1200, h: 800 };
}

function wrapLabel(
  label: string,
  maxChars: number,
  maxLines: number,
): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  let truncated = false;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    const normalizedWord = truncateLine(word, maxChars);
    truncated ||= normalizedWord !== word;
    const candidate = current ? `${current} ${normalizedWord}` : normalizedWord;

    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (lines.length === maxLines) {
        truncated = true;
        break;
      }
      current = normalizedWord;
    }

    if (lines.length === maxLines) {
      truncated ||= index < words.length - 1 || current.length > 0;
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  } else if (current) {
    truncated = true;
  }

  if (truncated && lines.length > 0) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = appendEllipsis(lines[lastIndex]!, maxChars);
  }

  return lines.length > 0 ? lines : [""];
}

function truncateLine(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return appendEllipsis(value, maxChars);
}

function appendEllipsis(value: string, maxChars: number): string {
  if (value.endsWith("...")) return value;
  if (maxChars <= 3) return ".".repeat(maxChars);
  return `${value.slice(0, Math.max(1, maxChars - 3))}...`;
}
