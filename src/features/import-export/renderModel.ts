import { sortedNodes } from '../../domain/document/normalize';
import {
  isNodeOnCanvas,
  type Bounds,
  type CapabilityDocument,
  type CapabilityNode,
  type LegendPosition,
  type VisualView,
} from '../../domain/document/types';
import {
  activeVisualView,
  resolveVisualDocument,
} from '../../domain/visual/workspace';
import {
  heatmapPaletteStops,
  resolveNodeFill,
  type NodeFill,
} from '../heatmap/resolveNodeFill';

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
const LEAF_SCORE_FONT_SIZE = 11;
const CONTAINER_SCORE_FONT_SIZE = 10;
const LEAF_SCORE_GAP = 3;

export interface VisualExportModel {
  title: string;
  fontFamily: string;
  background: string;
  documentBounds: Bounds;
  contentBounds: Bounds;
  surfaceBounds: Bounds;
  nodes: VisualExportNodeModel[];
  legend?: VisualExportLegendModel;
  exportSettings: VisualView['export'];
}

export interface VisualExportNodeModel {
  id: string;
  description?: string;
  bounds: Bounds;
  isContainer: boolean;
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
}

export type VisualExportScoreModel =
  | {
      kind: 'badge';
      value: string;
      bounds: Bounds;
      textX: number;
      textY: number;
      fontSize: number;
      fontWeight: number;
    }
  | {
      kind: 'text';
      value: string;
      x: number;
      y: number;
      fontSize: number;
      fontWeight: number;
    };

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
  const contentBounds = unionBounds(
    legend ? [documentBounds, legend.bounds] : [documentBounds],
  );

  return {
    title: visualDoc.title,
    fontFamily: visualDoc.settings.fontFamily || 'Inter',
    background: '#f1f5f9',
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
  const isContainer = node.type !== 'leaf' && !node.isTextLabel;
  const hasScore = doc.heatmap.enabled && node.heatmapValue !== undefined;
  const maxLines = resolveMaxLabelLines(node, isContainer, hasScore);
  const label = buildLabelModel(doc, node, isContainer, hasScore, maxLines);
  const score = hasScore ? buildScoreModel(node, isContainer, label) : undefined;

  return {
    id: node.id,
    description: node.description?.trim() || undefined,
    bounds: { x: node.x, y: node.y, w: node.w, h: node.h },
    isContainer,
    fill: resolveNodeFill(node, doc.heatmap),
    radius: isContainer ? 8 : 6,
    strokeWidth: isContainer ? 1.5 : 1,
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
  const fontSize = isContainer ? CONTAINER_FONT_SIZE : LEAF_FONT_SIZE;
  const lineHeight = isContainer ? CONTAINER_LINE_HEIGHT : LEAF_LINE_HEIGHT;
  const fontWeight = isContainer ? 600 : 500;
  const horizontalPadding = isContainer ? 28 : 12;
  const averageCharWidth = isContainer ? 7.4 : 6.8;
  const maxChars = Math.max(
    4,
    Math.floor((node.w - horizontalPadding) / averageCharWidth),
  );
  const lines = wrapLabel(node.label, maxChars, maxLines);
  const firstBaselineY = isContainer
    ? node.y + Math.max(0, doc.settings.containerLabelOffsetTop) + 12
    : leafLabelBaselineY(node, lines.length, hasScore, fontSize, lineHeight);

  return {
    lines,
    x: node.x + node.w / 2,
    firstBaselineY,
    lineHeight,
    fontSize,
    fontWeight,
  };
}

function buildScoreModel(
  node: CapabilityNode,
  isContainer: boolean,
  label: VisualExportLabelModel,
): VisualExportScoreModel {
  const value = node.heatmapValue?.toFixed(2) ?? '';
  if (isContainer) {
    const width = Math.max(28, value.length * 5.8 + 12);
    const bounds = {
      x: node.x + node.w - width - 10,
      y: node.y + 7,
      w: width,
      h: 16,
    };
    return {
      kind: 'badge',
      value,
      bounds,
      textX: bounds.x + bounds.w / 2,
      textY: bounds.y + 11,
      fontSize: CONTAINER_SCORE_FONT_SIZE,
      fontWeight: 600,
    };
  }

  return {
    kind: 'text',
    value,
    x: node.x + node.w / 2,
    y:
      label.firstBaselineY +
      (label.lines.length - 1) * label.lineHeight +
      LEAF_SCORE_GAP +
      LEAF_SCORE_FONT_SIZE,
    fontSize: LEAF_SCORE_FONT_SIZE,
    fontWeight: 500,
  };
}

function buildLegendModel(
  documentBounds: Bounds,
  heatmap: CapabilityDocument['heatmap'],
  viewHeatmap: VisualView['heatmap'],
): VisualExportLegendModel | undefined {
  if (!heatmap.enabled || !heatmap.showLegend) return undefined;

  const position = viewHeatmap.legendPosition ?? 'bottom-left';
  const bounds =
    position === 'custom' && isUsableBounds(viewHeatmap.legendBounds)
      ? { ...viewHeatmap.legendBounds }
      : legendBoundsForPosition(documentBounds, position);

  return {
    title: 'Heatmap',
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
    lowLabel: 'Low',
    highLabel: 'High',
    stops: heatmapPaletteStops(heatmap.palette),
  };
}

function resolveMaxLabelLines(
  node: CapabilityNode,
  isContainer: boolean,
  hasScore: boolean,
): number {
  if (isContainer) return 2;
  const reservedForScore = hasScore
    ? LEAF_SCORE_FONT_SIZE + LEAF_SCORE_GAP + 4
    : 4;
  const availableHeight = Math.max(LEAF_LINE_HEIGHT, node.h - reservedForScore);
  return Math.max(1, Math.min(3, Math.floor(availableHeight / LEAF_LINE_HEIGHT)));
}

function leafLabelBaselineY(
  node: CapabilityNode,
  lineCount: number,
  hasScore: boolean,
  fontSize: number,
  lineHeight: number,
): number {
  const scoreHeight = hasScore ? LEAF_SCORE_GAP + LEAF_SCORE_FONT_SIZE : 0;
  const totalHeight = lineCount * lineHeight + scoreHeight;
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
    case 'top-left':
      return { x: leftX, y: topY, w: LEGEND_WIDTH, h: LEGEND_HEIGHT };
    case 'top-right':
      return { x: rightX, y: topY, w: LEGEND_WIDTH, h: LEGEND_HEIGHT };
    case 'bottom-right':
      return { x: rightX, y: bottomY, w: LEGEND_WIDTH, h: LEGEND_HEIGHT };
    case 'custom':
    case 'bottom-left':
    default:
      return { x: leftX, y: bottomY, w: LEGEND_WIDTH, h: LEGEND_HEIGHT };
  }
}

function resolveDocumentBounds(doc: CapabilityDocument): Bounds {
  if (isUsableBounds(doc.layout.boundingBox)) {
    return { ...doc.layout.boundingBox };
  }
  return { x: 0, y: 0, w: 1200, h: 800 };
}

function unionBounds(bounds: Bounds[]): Bounds {
  const [first, ...rest] = bounds;
  if (!first) return { x: 0, y: 0, w: 0, h: 0 };
  let left = first.x;
  let top = first.y;
  let right = first.x + first.w;
  let bottom = first.y + first.h;

  for (const item of rest) {
    left = Math.min(left, item.x);
    top = Math.min(top, item.y);
    right = Math.max(right, item.x + item.w);
    bottom = Math.max(bottom, item.y + item.h);
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}

function expandBounds(bounds: Bounds, padding: number): Bounds {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    w: bounds.w + padding * 2,
    h: bounds.h + padding * 2,
  };
}

function isUsableBounds(bounds: Bounds | undefined): bounds is Bounds {
  return (
    !!bounds &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.w) &&
    Number.isFinite(bounds.h) &&
    bounds.w > 0 &&
    bounds.h > 0
  );
}

function wrapLabel(
  label: string,
  maxChars: number,
  maxLines: number,
): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
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

  return lines.length > 0 ? lines : [''];
}

function truncateLine(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return appendEllipsis(value, maxChars);
}

function appendEllipsis(value: string, maxChars: number): string {
  if (value.endsWith('...')) return value;
  if (maxChars <= 3) return '.'.repeat(maxChars);
  return `${value.slice(0, Math.max(1, maxChars - 3))}...`;
}
