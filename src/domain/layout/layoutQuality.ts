import {
  canvasChildrenOf,
  isNodeOnCanvas,
  type Bounds,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../document/types";

const ROW_ALIGNMENT_TOLERANCE = 1;
const GAP_TOLERANCE = 1;
const MAX_ROW_CENTER_ERROR = 2;
const P95_ROW_CENTER_ERROR = 1;
const CONTENT_PADDING_TOLERANCE = 2;
const LEAF_PACKING_EFFICIENCY = 0.55;
const MIXED_PACKING_EFFICIENCY = 0.45;
const ROW_WIDTH_CV_LIMIT = 0.35;

export interface AdaptiveLayoutHardViolation {
  code:
    | "sibling-overlap"
    | "containment"
    | "row-alignment"
    | "horizontal-gap"
    | "row-centering"
    | "content-centering"
    | "packing-efficiency"
    | "row-balance"
    | "reading-order"
    | "tight-parent-sizing";
  parentId: NodeId;
  nodeId?: NodeId;
  message: string;
  value?: number;
  threshold?: number;
}

export interface AdaptiveParentQualityMetrics {
  parentId: NodeId;
  childCount: number;
  rowCount: number;
  rowAlignmentMaxError: number;
  horizontalGapMaxError: number;
  maxRowCenterError: number;
  p95RowCenterError: number;
  contentPaddingDifference: number;
  packingEfficiency: number;
  packingEfficiencyThreshold: number;
  rowWidthCoefficientOfVariation: number;
  readingOrderInversions: number;
  bottomWhitespace: number;
  bottomWhitespaceLimit: number;
  isLeafOnly: boolean;
  isMinimumWidthBinding: boolean;
  isMinimumHeightBinding: boolean;
  rowWidths: number[];
}

export interface AdaptiveLayoutQuality {
  score: number;
  hardViolations: AdaptiveLayoutHardViolation[];
  metricsByParentId: Record<NodeId, AdaptiveParentQualityMetrics>;
}

interface VisualRow {
  y: number;
  children: CapabilityNode[];
}

export function evaluateAdaptiveLayoutQuality(
  doc: CapabilityDocument,
): AdaptiveLayoutQuality {
  const metricsByParentId: Record<NodeId, AdaptiveParentQualityMetrics> = {};
  const hardViolations: AdaptiveLayoutHardViolation[] = [];

  for (const parent of Object.values(doc.nodesById)) {
    if (!isNodeOnCanvas(parent)) continue;

    const visibleChildren = canvasChildrenOf(doc, parent.id)
      .map((id) => doc.nodesById[id])
      .filter((node): node is CapabilityNode => !!node);
    hardViolations.push(
      ...findSiblingOverlapViolations(parent.id, visibleChildren),
      ...findContainmentViolations(doc, parent, visibleChildren),
    );

    if (
      parent.isManualPositioningEnabled ||
      parent.isLockedAsIs ||
      visibleChildren.length < 2
    ) {
      continue;
    }

    const metrics = evaluateParentQuality(doc, parent, visibleChildren);
    metricsByParentId[parent.id] = metrics;
    hardViolations.push(...metricViolations(metrics));
  }

  return {
    score: qualityScore(Object.values(metricsByParentId), hardViolations),
    hardViolations,
    metricsByParentId,
  };
}

function evaluateParentQuality(
  doc: CapabilityDocument,
  parent: CapabilityNode,
  children: CapabilityNode[],
): AdaptiveParentQualityMetrics {
  const margin = contentMargin(doc, parent);
  const rows = visualRows(children);
  const rowBounds = rows.map((row) => boundsForNodes(row.children)!);
  const rowWidths = rowBounds.map((bounds) => bounds.w);
  const rowCenterErrors = rowBounds.map((bounds) =>
    Math.abs(centerX(bounds) - contentCenterX(parent, margin)),
  );
  const childBounds = boundsForNodes(children)!;
  const contentLeft = parent.x + margin.left;
  const contentRight = parent.x + parent.w - margin.right;
  const contentWidth = contentRight - contentLeft;
  const leftPadding = childBounds.x - contentLeft;
  const rightPadding = contentRight - (childBounds.x + childBounds.w);
  const spareHorizontalSpace = contentWidth - childBounds.w;
  const isLeafOnly = children.every(
    (child) => canvasChildrenOf(doc, child.id).length === 0,
  );
  const packingEfficiency =
    totalArea(children) / Math.max(1, childBounds.w * childBounds.h);
  const minimumSize = minimumNodeSize(doc, parent);
  const tightWidth = childBounds.x + childBounds.w - parent.x + margin.right;
  const tightHeight = childBounds.y + childBounds.h - parent.y + margin.bottom;

  return {
    parentId: parent.id,
    childCount: children.length,
    rowCount: rows.length,
    rowAlignmentMaxError: maxRowAlignmentError(rows),
    horizontalGapMaxError: maxHorizontalGapError(doc, parent, rows),
    maxRowCenterError: max(rowCenterErrors),
    p95RowCenterError: percentile(rowCenterErrors, 0.95),
    contentPaddingDifference:
      spareHorizontalSpace > 0 ? Math.abs(leftPadding - rightPadding) : 0,
    packingEfficiency,
    packingEfficiencyThreshold: isLeafOnly
      ? LEAF_PACKING_EFFICIENCY
      : MIXED_PACKING_EFFICIENCY,
    rowWidthCoefficientOfVariation: coefficientOfVariation(
      rowWidthsForBalance(rows, rowWidths),
    ),
    readingOrderInversions: readingOrderInversions(doc, parent.id, rows),
    bottomWhitespace: parent.y + parent.h - (childBounds.y + childBounds.h),
    bottomWhitespaceLimit: margin.bottom + 1,
    isLeafOnly,
    isMinimumWidthBinding:
      parent.w <= minimumSize.w + 1 && minimumSize.w >= tightWidth - 1,
    isMinimumHeightBinding:
      parent.h <= minimumSize.h + 1 && minimumSize.h >= tightHeight - 1,
    rowWidths,
  };
}

function metricViolations(
  metrics: AdaptiveParentQualityMetrics,
): AdaptiveLayoutHardViolation[] {
  const violations: AdaptiveLayoutHardViolation[] = [];

  if (metrics.rowAlignmentMaxError > ROW_ALIGNMENT_TOLERANCE) {
    violations.push({
      code: "row-alignment",
      parentId: metrics.parentId,
      message: "Sibling row tops are not aligned.",
      value: metrics.rowAlignmentMaxError,
      threshold: ROW_ALIGNMENT_TOLERANCE,
    });
  }

  if (metrics.horizontalGapMaxError > GAP_TOLERANCE) {
    violations.push({
      code: "horizontal-gap",
      parentId: metrics.parentId,
      message: "Adjacent siblings do not use the configured horizontal gap.",
      value: metrics.horizontalGapMaxError,
      threshold: GAP_TOLERANCE,
    });
  }

  if (
    metrics.maxRowCenterError > MAX_ROW_CENTER_ERROR ||
    metrics.p95RowCenterError > P95_ROW_CENTER_ERROR
  ) {
    violations.push({
      code: "row-centering",
      parentId: metrics.parentId,
      message: "Visual rows are not centered in the parent content area.",
      value: Math.max(metrics.maxRowCenterError, metrics.p95RowCenterError),
      threshold: Math.max(MAX_ROW_CENTER_ERROR, P95_ROW_CENTER_ERROR),
    });
  }

  if (metrics.contentPaddingDifference > CONTENT_PADDING_TOLERANCE) {
    violations.push({
      code: "content-centering",
      parentId: metrics.parentId,
      message: "Child content is not horizontally balanced in the parent.",
      value: metrics.contentPaddingDifference,
      threshold: CONTENT_PADDING_TOLERANCE,
    });
  }

  if (metrics.packingEfficiency < metrics.packingEfficiencyThreshold) {
    violations.push({
      code: "packing-efficiency",
      parentId: metrics.parentId,
      message: "Child packing is not compact enough.",
      value: metrics.packingEfficiency,
      threshold: metrics.packingEfficiencyThreshold,
    });
  }

  if (metrics.rowWidthCoefficientOfVariation > ROW_WIDTH_CV_LIMIT) {
    violations.push({
      code: "row-balance",
      parentId: metrics.parentId,
      message: "Sibling row widths are not balanced.",
      value: metrics.rowWidthCoefficientOfVariation,
      threshold: ROW_WIDTH_CV_LIMIT,
    });
  }

  if (metrics.readingOrderInversions > 0) {
    violations.push({
      code: "reading-order",
      parentId: metrics.parentId,
      message: "Visual sibling order does not match document order.",
      value: metrics.readingOrderInversions,
      threshold: 0,
    });
  }

  if (
    !metrics.isMinimumHeightBinding &&
    metrics.bottomWhitespace > metrics.bottomWhitespaceLimit
  ) {
    violations.push({
      code: "tight-parent-sizing",
      parentId: metrics.parentId,
      message: "Parent height leaves avoidable whitespace below children.",
      value: metrics.bottomWhitespace,
      threshold: metrics.bottomWhitespaceLimit,
    });
  }

  return violations;
}

function findSiblingOverlapViolations(
  parentId: NodeId,
  siblings: CapabilityNode[],
): AdaptiveLayoutHardViolation[] {
  const violations: AdaptiveLayoutHardViolation[] = [];
  for (let leftIndex = 0; leftIndex < siblings.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < siblings.length;
      rightIndex += 1
    ) {
      const left = siblings[leftIndex]!;
      const right = siblings[rightIndex]!;
      if (!rectanglesOverlap(left, right)) continue;
      violations.push({
        code: "sibling-overlap",
        parentId,
        nodeId: left.id,
        message: `${left.id} overlaps ${right.id}.`,
      });
    }
  }
  return violations;
}

function findContainmentViolations(
  doc: CapabilityDocument,
  parent: CapabilityNode,
  children: CapabilityNode[],
): AdaptiveLayoutHardViolation[] {
  const margin = contentMargin(doc, parent);
  const left = parent.x + margin.left;
  const top = parent.y + margin.top + doc.settings.containerTitleHeight;
  const right = parent.x + parent.w - margin.right;
  const bottom = parent.y + parent.h - margin.bottom;

  return children.flatMap((child) => {
    if (
      child.x >= left &&
      child.y >= top &&
      child.x + child.w <= right &&
      child.y + child.h <= bottom
    ) {
      return [];
    }
    return [
      {
        code: "containment" as const,
        parentId: parent.id,
        nodeId: child.id,
        message: `${child.id} is outside ${parent.id}'s content area.`,
      },
    ];
  });
}

function visualRows(children: CapabilityNode[]): VisualRow[] {
  const rows: VisualRow[] = [];
  const ordered = [...children].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
  );

  for (const child of ordered) {
    const row = rows.find(
      (candidate) => Math.abs(candidate.y - child.y) <= ROW_ALIGNMENT_TOLERANCE,
    );
    if (row) row.children.push(child);
    else rows.push({ y: child.y, children: [child] });
  }

  rows.sort((a, b) => a.y - b.y);
  for (const row of rows)
    row.children.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  return rows;
}

function maxRowAlignmentError(rows: VisualRow[]): number {
  return max(
    rows.map((row) => {
      const yValues = row.children.map((child) => child.y);
      return max(yValues) - Math.min(...yValues);
    }),
  );
}

function maxHorizontalGapError(
  doc: CapabilityDocument,
  parent: CapabilityNode,
  rows: VisualRow[],
): number {
  const expectedGap = parent.layoutPreferences?.gapX ?? doc.settings.childGapX;
  const errors = rows.flatMap((row) => {
    const rowErrors: number[] = [];
    for (let index = 1; index < row.children.length; index += 1) {
      const previous = row.children[index - 1]!;
      const current = row.children[index]!;
      const actualGap = current.x - (previous.x + previous.w);
      rowErrors.push(Math.abs(actualGap - expectedGap));
    }
    return rowErrors;
  });
  return max(errors);
}

function readingOrderInversions(
  doc: CapabilityDocument,
  parentId: NodeId,
  rows: VisualRow[],
): number {
  const visualIndex = new Map<NodeId, number>();
  rows
    .flatMap((row) => row.children)
    .forEach((child, index) => visualIndex.set(child.id, index));
  const orderedChildIds = canvasChildrenOf(doc, parentId);
  let inversions = 0;

  for (let leftIndex = 0; leftIndex < orderedChildIds.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < orderedChildIds.length;
      rightIndex += 1
    ) {
      const leftVisualIndex = visualIndex.get(orderedChildIds[leftIndex]!);
      const rightVisualIndex = visualIndex.get(orderedChildIds[rightIndex]!);
      if (
        leftVisualIndex !== undefined &&
        rightVisualIndex !== undefined &&
        leftVisualIndex > rightVisualIndex
      ) {
        inversions += 1;
      }
    }
  }

  return inversions;
}

function rowWidthsForBalance(rows: VisualRow[], rowWidths: number[]): number[] {
  if (rows.length <= 2) return rowWidths;
  const finalRow = rows[rows.length - 1]!;
  const previousMaxLength = Math.max(
    ...rows.slice(0, -1).map((row) => row.children.length),
  );
  if (finalRow.children.length < previousMaxLength)
    return rowWidths.slice(0, -1);
  return rowWidths;
}

function qualityScore(
  metrics: AdaptiveParentQualityMetrics[],
  hardViolations: AdaptiveLayoutHardViolation[],
): number {
  if (metrics.length === 0) return hardViolations.length === 0 ? 100 : 0;
  const average =
    metrics.reduce((sum, metric) => sum + parentQualityScore(metric), 0) /
    metrics.length;
  return clamp(average - hardViolations.length * 15, 0, 100);
}

function parentQualityScore(metric: AdaptiveParentQualityMetrics): number {
  const efficiencyTarget = metric.packingEfficiencyThreshold + 0.15;
  let score = 100;
  score -= Math.min(8, metric.maxRowCenterError * 2);
  score -= Math.min(6, metric.p95RowCenterError * 2);
  score -= Math.min(8, metric.contentPaddingDifference * 2);
  score -= Math.min(
    12,
    Math.max(0, efficiencyTarget - metric.packingEfficiency) * 40,
  );
  score -= Math.min(8, metric.rowWidthCoefficientOfVariation * 12);
  score -= Math.min(12, metric.horizontalGapMaxError * 4);
  score -= Math.min(20, metric.readingOrderInversions * 5);
  if (!metric.isMinimumHeightBinding)
    score -= Math.min(
      8,
      Math.max(0, metric.bottomWhitespace - metric.bottomWhitespaceLimit) * 2,
    );
  return clamp(score, 0, 100);
}

function contentMargin(doc: CapabilityDocument, node: CapabilityNode) {
  return {
    top: node.layoutPreferences?.marginTop ?? doc.settings.containerPaddingTop,
    right:
      node.layoutPreferences?.marginRight ?? doc.settings.containerPaddingRight,
    bottom:
      node.layoutPreferences?.marginBottom ??
      doc.settings.containerPaddingBottom,
    left:
      node.layoutPreferences?.marginLeft ?? doc.settings.containerPaddingLeft,
  };
}

function minimumNodeSize(doc: CapabilityDocument, node: CapabilityNode) {
  if (node.isTextLabel || node.type === "text")
    return { w: Math.max(1, node.w), h: Math.max(1, node.h) };
  if (node.type === "leaf")
    return {
      w: Math.max(1, doc.settings.fixedLeafWidth),
      h: Math.max(1, doc.settings.fixedLeafHeight),
    };
  return {
    w: Math.max(1, doc.settings.defaultParentWidth),
    h: Math.max(1, doc.settings.defaultParentHeight),
  };
}

function boundsForNodes(nodes: CapabilityNode[]): Bounds | null {
  if (nodes.length === 0) return null;
  const x = Math.min(...nodes.map((node) => node.x));
  const y = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.w));
  const maxY = Math.max(...nodes.map((node) => node.y + node.h));
  return { x, y, w: maxX - x, h: maxY - y };
}

function totalArea(nodes: CapabilityNode[]): number {
  return nodes.reduce((sum, node) => sum + node.w * node.h, 0);
}

function centerX(bounds: Bounds): number {
  return bounds.x + bounds.w / 2;
}

function contentCenterX(
  parent: CapabilityNode,
  margin: ReturnType<typeof contentMargin>,
): number {
  return parent.x + margin.left + (parent.w - margin.left - margin.right) / 2;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance) / mean;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.ceil(sorted.length * percentileValue) - 1,
  );
  return sorted[Math.min(index, sorted.length - 1)]!;
}

function max(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function rectanglesOverlap(left: Bounds, right: Bounds): boolean {
  return (
    left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y
  );
}

function clamp(value: number, min: number, maxValue: number): number {
  return Math.min(maxValue, Math.max(min, value));
}
