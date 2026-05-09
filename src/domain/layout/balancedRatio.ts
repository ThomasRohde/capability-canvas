import type { CapabilityDocument, NodeId } from "../document/types";
import { boundsForBoxes } from "./bounds";
import { snapLayoutDelta, snapLayoutSize } from "./grid";

export interface BalancedInputBox {
  id: NodeId;
  w: number;
  h: number;
}

export interface BalancedPackedBox extends BalancedInputBox {
  x: number;
  y: number;
}

export interface BalancedPackMetrics {
  score: number;
  objective: number;
  targetRatio: number;
  actualRatio: number;
  ratioError: number;
  raggedness: number;
  adjacentRowDelta: number;
  balanceError: number;
  whitespace: number;
  whitespaceError: number;
  mirrorError: number;
  rowCount: number;
  targetWidth: number;
}

export interface BalancedPackResult {
  boxes: BalancedPackedBox[];
  rows: BalancedPackedBox[][];
  w: number;
  h: number;
  metrics: BalancedPackMetrics;
}

interface RowSlice {
  start: number;
  end: number;
  w: number;
  h: number;
}

interface DpCell {
  cost: number;
  previous: number;
  row: RowSlice | null;
}

export function balancedRatioDpPackRows(
  boxes: BalancedInputBox[],
  gapX: number,
  gapY: number,
  targetRatio: number,
  doc: CapabilityDocument,
): BalancedPackResult {
  const safeTargetRatio =
    Number.isFinite(targetRatio) && targetRatio > 0 ? targetRatio : 16 / 9;

  if (boxes.length === 0) return emptyBalancedPack(safeTargetRatio);
  if (boxes.length === 1) {
    const only = boxes[0]!;
    const placed = { ...only, x: 0, y: 0 };
    return {
      boxes: [placed],
      rows: [[placed]],
      w: only.w,
      h: only.h,
      metrics: metricsForPlacedPack(
        [placed],
        [[placed]],
        only.w,
        only.h,
        safeTargetRatio,
        only.w,
      ),
    };
  }
  if (boxes.length === 2) {
    return fallbackSingleRowPack(boxes, gapX, gapY, safeTargetRatio, doc);
  }

  let best: BalancedPackResult | null = null;
  for (const targetWidth of candidateTargetWidths(
    boxes,
    gapX,
    safeTargetRatio,
    doc,
  )) {
    const rowSlices = partitionRowsForTarget(boxes, gapX, targetWidth);
    const placed = placeRows(boxes, rowSlices, gapX, gapY, doc);
    const metrics = metricsForPlacedPack(
      placed.boxes,
      placed.rows,
      placed.w,
      placed.h,
      safeTargetRatio,
      targetWidth,
    );
    const candidate = { ...placed, metrics };
    if (!best || compareBalancedCandidates(candidate, best) < 0) {
      best = candidate;
    }
  }

  return best ?? fallbackSingleRowPack(boxes, gapX, gapY, safeTargetRatio, doc);
}

export function candidateTargetWidths(
  boxes: BalancedInputBox[],
  gapX: number,
  targetRatio: number,
  doc: CapabilityDocument,
): number[] {
  const n = boxes.length;
  if (n === 0) return [];

  const minTarget = Math.max(...boxes.map((box) => box.w));
  const maxTarget = rowWidth(boxes, gapX);
  const totalBoxArea = boxes.reduce((sum, box) => sum + box.w * box.h, 0);
  const areaTarget = Math.sqrt(Math.max(1, totalBoxArea) * targetRatio);
  const targets = new Set<number>();

  targets.add(minTarget);
  targets.add(maxTarget);
  targets.add(areaTarget);
  for (const multiplier of [
    0.72, 0.8, 0.88, 0.95, 1.0, 1.06, 1.14, 1.25, 1.4, 1.6,
  ]) {
    targets.add(areaTarget * multiplier);
  }

  const maxColumnProbe = Math.min(n, 12);
  for (let columns = 1; columns <= maxColumnProbe; columns += 1) {
    let widest = 0;
    for (let start = 0; start < n; start += columns) {
      widest = Math.max(
        widest,
        rowWidth(boxes.slice(start, start + columns), gapX),
      );
    }
    targets.add(widest);
  }

  const snapped = [...targets]
    .map((target) => snapLayoutSize(doc, target))
    .filter((target) => target >= minTarget && target <= maxTarget)
    .sort((a, b) => a - b)
    .filter(
      (target, index, sorted) => index === 0 || target !== sorted[index - 1],
    );

  return downsampleCandidateWidths(snapped, 24, areaTarget);
}

function partitionRowsForTarget(
  boxes: BalancedInputBox[],
  gapX: number,
  targetWidth: number,
): RowSlice[] {
  const n = boxes.length;
  const minTarget = Math.max(...boxes.map((box) => box.w));
  const prefixWidth = [0];
  for (const box of boxes) {
    prefixWidth.push(prefixWidth[prefixWidth.length - 1]! + box.w);
  }

  const dp: DpCell[] = Array.from({ length: n + 1 }, () => ({
    cost: Number.POSITIVE_INFINITY,
    previous: -1,
    row: null,
  }));
  dp[0] = { cost: 0, previous: -1, row: null };

  for (let end = 1; end <= n; end += 1) {
    let maxHeight = 0;
    for (let start = end - 1; start >= 0; start -= 1) {
      const count = end - start;
      const w = widthBetween(prefixWidth, start, end, gapX);
      if (count > 1 && w > Math.max(targetWidth * 1.85, minTarget * 1.1)) {
        break;
      }

      maxHeight = Math.max(maxHeight, boxes[start]!.h);
      const row = { start, end, w, h: maxHeight };
      const candidate = dp[start]!.cost + costRow(row, targetWidth, n);
      if (candidate < dp[end]!.cost) {
        dp[end] = {
          cost: candidate,
          previous: start,
          row,
        };
      }
    }
  }

  if (!Number.isFinite(dp[n]!.cost))
    return [
      { start: 0, end: n, w: rowWidth(boxes, gapX), h: rowHeight(boxes) },
    ];
  const rows: RowSlice[] = [];
  for (let cursor = n; cursor > 0; ) {
    const cell = dp[cursor]!;
    if (!cell.row || cell.previous < 0) break;
    rows.push(cell.row);
    cursor = cell.previous;
  }
  rows.reverse();
  return rows.length > 0
    ? rows
    : [{ start: 0, end: n, w: rowWidth(boxes, gapX), h: rowHeight(boxes) }];
}

function costRow(
  row: RowSlice,
  targetWidth: number,
  totalBoxes: number,
): number {
  const deviation = (row.w - targetWidth) / targetWidth;
  const widthCost = deviation * deviation;
  const overCost = Math.max(0, deviation) ** 2 * 3.0;
  const singletonCost = row.end - row.start === 1 && totalBoxes > 3 ? 0.035 : 0;
  const tinyRowCost = row.end - row.start === 1 && totalBoxes > 6 ? 0.025 : 0;
  const heightCost = row.h * 0.00002;

  return widthCost + overCost + singletonCost + tinyRowCost + heightCost;
}

function placeRows(
  boxes: BalancedInputBox[],
  rows: RowSlice[],
  gapX: number,
  gapY: number,
  doc: CapabilityDocument,
): Pick<BalancedPackResult, "boxes" | "rows" | "w" | "h"> {
  const layoutWidth =
    rows.length > 0 ? Math.max(...rows.map((row) => row.w)) : 0;
  const packedRows: BalancedPackedBox[][] = [];
  const packed: BalancedPackedBox[] = [];
  let cursorY = 0;

  for (const row of rows) {
    const rowBoxes: BalancedPackedBox[] = [];
    let cursorX = snapLayoutDelta(doc, (layoutWidth - row.w) / 2);
    for (let index = row.start; index < row.end; index += 1) {
      const box = boxes[index]!;
      const placed = { ...box, x: cursorX, y: cursorY };
      rowBoxes.push(placed);
      packed.push(placed);
      cursorX += box.w + gapX;
    }
    packedRows.push(rowBoxes);
    cursorY += row.h + gapY;
  }

  const bounds = boundsForBoxes(packed);
  return {
    boxes: packed,
    rows: packedRows,
    w: Math.max(layoutWidth, bounds ? bounds.x + bounds.w : 0),
    h:
      rows.reduce((sum, row) => sum + row.h, 0) +
      Math.max(0, rows.length - 1) * gapY,
  };
}

function metricsForPlacedPack(
  boxes: BalancedPackedBox[],
  rows: BalancedPackedBox[][],
  w: number,
  h: number,
  targetRatio: number,
  targetWidth: number,
): BalancedPackMetrics {
  const rowWidths = rows.map(placedRowWidth);
  const balancedRowWidths = rowWidthsForBalance(rows, rowWidths);
  const actualRatio = w / Math.max(1, h);
  const ratioError = Math.abs(Math.log(actualRatio / targetRatio));
  const raggedness = coefficientOfVariation(balancedRowWidths);
  const adjacentRowDelta = meanAdjacentDelta(rowWidths, Math.max(1, w));
  const rowCounts = rows.map((row) => row.length);
  const balanceError = coefficientOfVariation(rowCounts);
  const totalBoxArea = boxes.reduce((sum, box) => sum + box.w * box.h, 0);
  const whitespace = 1 - totalBoxArea / Math.max(1, w * h);
  const whitespaceError = Math.abs(whitespace - 0.25);
  const mirrorError = rowMirrorError(rowWidths, Math.max(1, w));
  const orphanPenalty = avoidableSingletonPenalty(rows);
  const objective =
    ratioError * 0.52 +
    raggedness * 1.35 +
    adjacentRowDelta * 0.42 +
    balanceError * 0.18 +
    whitespaceError * 0.28 +
    mirrorError * 0.12 +
    orphanPenalty +
    rows.length * 0.004;

  return {
    score: Math.max(0, 100 - objective * 100),
    objective,
    targetRatio,
    actualRatio,
    ratioError,
    raggedness,
    adjacentRowDelta,
    balanceError,
    whitespace,
    whitespaceError,
    mirrorError,
    rowCount: rows.length,
    targetWidth,
  };
}

function compareBalancedCandidates(
  candidate: BalancedPackResult,
  current: BalancedPackResult,
): number {
  const epsilon = 0.000001;
  const metricDiff = candidate.metrics.objective - current.metrics.objective;
  if (Math.abs(metricDiff) > epsilon) return metricDiff;

  if (candidate.metrics.raggedness !== current.metrics.raggedness) {
    return candidate.metrics.raggedness - current.metrics.raggedness;
  }
  if (candidate.metrics.adjacentRowDelta !== current.metrics.adjacentRowDelta) {
    return (
      candidate.metrics.adjacentRowDelta - current.metrics.adjacentRowDelta
    );
  }

  const candidateArea = candidate.w * candidate.h;
  const currentArea = current.w * current.h;
  if (candidateArea !== currentArea) return candidateArea - currentArea;
  if (candidate.metrics.rowCount !== current.metrics.rowCount) {
    return candidate.metrics.rowCount - current.metrics.rowCount;
  }
  return candidate.metrics.targetWidth - current.metrics.targetWidth;
}

function fallbackSingleRowPack(
  boxes: BalancedInputBox[],
  gapX: number,
  gapY: number,
  targetRatio: number,
  doc: CapabilityDocument,
): BalancedPackResult {
  const row = {
    start: 0,
    end: boxes.length,
    w: rowWidth(boxes, gapX),
    h: rowHeight(boxes),
  };
  const placed = placeRows(boxes, [row], gapX, gapY, doc);
  return {
    ...placed,
    metrics: metricsForPlacedPack(
      placed.boxes,
      placed.rows,
      placed.w,
      placed.h,
      targetRatio,
      row.w,
    ),
  };
}

function emptyBalancedPack(targetRatio: number): BalancedPackResult {
  return {
    boxes: [],
    rows: [],
    w: 0,
    h: 0,
    metrics: {
      score: 100,
      objective: 0,
      targetRatio,
      actualRatio: targetRatio,
      ratioError: 0,
      raggedness: 0,
      adjacentRowDelta: 0,
      balanceError: 0,
      whitespace: 0,
      whitespaceError: 0,
      mirrorError: 0,
      rowCount: 0,
      targetWidth: 0,
    },
  };
}

function downsampleCandidateWidths(
  sorted: number[],
  limit: number,
  areaTarget: number,
): number[] {
  if (sorted.length <= limit) return sorted;

  const keep = new Set<number>([0, sorted.length - 1]);
  let areaIndex = 0;
  let areaDistance = Number.POSITIVE_INFINITY;
  for (const [index, value] of sorted.entries()) {
    const distance = Math.abs(value - areaTarget);
    if (distance < areaDistance) {
      areaDistance = distance;
      areaIndex = index;
    }
  }
  keep.add(areaIndex);

  for (let slot = 0; keep.size < limit && slot < limit; slot += 1) {
    const index = Math.round(
      (slot * (sorted.length - 1)) / Math.max(1, limit - 1),
    );
    keep.add(index);
  }

  for (let index = 0; keep.size < limit && index < sorted.length; index += 1) {
    keep.add(index);
  }

  return [...keep]
    .sort((a, b) => a - b)
    .map((index) => sorted[index]!)
    .filter(
      (target, index, values) => index === 0 || target !== values[index - 1],
    );
}

function widthBetween(
  prefixWidth: number[],
  start: number,
  end: number,
  gapX: number,
): number {
  const count = end - start;
  if (count <= 0) return 0;
  return prefixWidth[end]! - prefixWidth[start]! + gapX * (count - 1);
}

function rowWidth(row: BalancedInputBox[], gapX: number): number {
  return (
    row.reduce((sum, box) => sum + box.w, 0) +
    Math.max(0, row.length - 1) * gapX
  );
}

function rowHeight(row: BalancedInputBox[]): number {
  return row.length === 0 ? 0 : Math.max(...row.map((box) => box.h));
}

function placedRowWidth(row: BalancedPackedBox[]): number {
  if (row.length === 0) return 0;
  const left = Math.min(...row.map((box) => box.x));
  const right = Math.max(...row.map((box) => box.x + box.w));
  return right - left;
}

function rowWidthsForBalance(
  rows: BalancedPackedBox[][],
  rowWidths: number[],
): number[] {
  if (rows.length <= 2) return rowWidths;
  const finalRow = rows[rows.length - 1]!;
  const previousMaxLength = Math.max(
    ...rows.slice(0, -1).map((row) => row.length),
  );
  return finalRow.length < previousMaxLength
    ? rowWidths.slice(0, -1)
    : rowWidths;
}

function meanAdjacentDelta(rowWidths: number[], width: number): number {
  if (rowWidths.length <= 1) return 0;
  const deltas: number[] = [];
  for (let index = 1; index < rowWidths.length; index += 1) {
    deltas.push(Math.abs(rowWidths[index]! - rowWidths[index - 1]!) / width);
  }
  return mean(deltas);
}

function rowMirrorError(rowWidths: number[], width: number): number {
  if (rowWidths.length <= 1) return 0;
  const errors: number[] = [];
  for (let index = 0; index < Math.floor(rowWidths.length / 2); index += 1) {
    errors.push(
      Math.abs(rowWidths[index]! - rowWidths[rowWidths.length - 1 - index]!) /
        width,
    );
  }
  return mean(errors);
}

function avoidableSingletonPenalty(rows: BalancedPackedBox[][]): number {
  if (rows.length <= 2) return 0;
  const singletonRows = rows.filter((row) => row.length === 1).length;
  if (singletonRows === 0) return 0;
  return singletonRows * 0.035;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length <= 1) return 0;
  const average = mean(values);
  if (average === 0) return 0;
  return (
    Math.sqrt(mean(values.map((value) => (value - average) ** 2))) / average
  );
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}
