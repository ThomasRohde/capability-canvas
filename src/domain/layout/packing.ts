import ELK, {
  type ELK as ElkInstance,
  type ElkNode,
} from "elkjs/lib/elk-api.js";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import {
  type CapabilityDocument,
  type LayoutAspectRatioTarget,
  type LayoutMode,
  type NodeId,
} from "../document/types";
import type { Diagnostic } from "../validation/diagnostics";
import { warning } from "../validation/diagnostics";
import { localContainerRatio, ratioNumber } from "./aspectRatio";
import { balancedRatioDpPackRows } from "./balancedRatio";
import { boundsForBoxes } from "./bounds";
import { snapLayoutDelta, snapLayoutSize } from "./grid";

let elk: ElkInstance | undefined;

function getElk() {
  elk ??= new ELK({ algorithms: ["rectpacking"], workerUrl: elkWorkerUrl });
  return elk;
}

export interface Box {
  id: NodeId;
  w: number;
  h: number;
}

export interface PackedBox extends Box {
  x: number;
  y: number;
}

export interface PackedBoxes {
  boxes: PackedBox[];
  w: number;
  h: number;
  diagnostics: Diagnostic[];
}

export async function packBoxes(
  boxes: Box[],
  gapX: number,
  gapY: number,
  mode: LayoutMode,
  aspectRatioTarget: LayoutAspectRatioTarget | null,
  scopeId: string,
  doc: CapabilityDocument,
): Promise<PackedBoxes> {
  if (boxes.length === 0) return { boxes: [], w: 0, h: 0, diagnostics: [] };
  if (boxes.length === 1) {
    const only = boxes[0]!;
    return {
      boxes: [{ ...only, x: 0, y: 0 }],
      w: only.w,
      h: only.h,
      diagnostics: [],
    };
  }

  if (mode === "balanced") {
    const targetRatio =
      scopeId === "document-roots" && aspectRatioTarget
        ? ratioNumber(aspectRatioTarget)
        : localContainerRatio(aspectRatioTarget);
    const packed = balancedRatioDpPackRows(boxes, gapX, gapY, targetRatio, doc);
    return {
      boxes: packed.boxes,
      w: packed.w,
      h: packed.h,
      diagnostics: [],
    };
  }

  const target = snapLayoutSize(doc, targetWidthFor(boxes, gapX, gapY, mode));
  if (mode === "adaptive")
    return adaptivePackRows(boxes, gapX, gapY, target, doc);
  if (mode === "uniform")
    return fallbackPackRows(boxes, gapX, gapY, target, false, doc);

  const estimatedHeight = Math.max(1, totalArea(boxes) / Math.max(1, target));
  const graph: ElkNode = {
    id: `pack-${scopeId}`,
    layoutOptions: {
      "elk.algorithm": "rectpacking",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
      "elk.spacing.nodeNode": String(Math.max(gapX, gapY)),
      "elk.aspectRatio": String(Math.max(0.25, target / estimatedHeight)),
      "elk.rectpacking.trybox": "false",
      "elk.rectpacking.orderBySize": "false",
      "org.eclipse.elk.rectpacking.widthApproximation.targetWidth":
        String(target),
    },
    children: boxes.map((box, index) => ({
      id: box.id,
      width: box.w,
      height: box.h,
      layoutOptions: {
        "elk.rectpacking.currentPosition": String(index),
        "elk.rectpacking.desiredPosition": String(index),
      },
    })),
  };

  try {
    const elk = getElk();
    const packed = await elk.layout(graph);
    const byId = new Map(boxes.map((box) => [box.id, box]));
    const positioned = (packed.children ?? []).flatMap((child) => {
      const box = byId.get(child.id);
      if (!box || child.x === undefined || child.y === undefined) return [];
      return [{ ...box, x: child.x, y: child.y }];
    });
    if (positioned.length !== boxes.length)
      throw new Error("ELK did not return positions for every child.");
    return normalizePackedRows(positioned, gapX, gapY, false, doc);
  } catch (error) {
    const fallback = fallbackPackRows(boxes, gapX, gapY, target, false, doc);
    return {
      ...fallback,
      diagnostics: [
        warning(
          "elk-layout-fallback",
          `ELK layout failed for "${scopeId}", so a deterministic row layout was used. ${error instanceof Error ? error.message : ""}`.trim(),
        ),
      ],
    };
  }
}

function adaptivePackRows(
  boxes: Box[],
  gapX: number,
  gapY: number,
  targetWidth: number,
  doc: CapabilityDocument,
): PackedBoxes {
  const rows =
    boxes.length <= 16
      ? bestAdaptiveRows(boxes, gapX, gapY, targetWidth)
      : greedyAdaptiveRows(boxes, gapX, targetWidth);
  return packRows(rows, gapX, gapY, true, doc);
}

function bestAdaptiveRows(
  boxes: Box[],
  gapX: number,
  gapY: number,
  targetWidth: number,
): Box[][] {
  let bestRows: Box[][] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  const partitionCount = 1 << Math.max(0, boxes.length - 1);

  for (let mask = 0; mask < partitionCount; mask += 1) {
    const rows = rowsForPartitionMask(boxes, mask);
    const cost = adaptiveRowCost(rows, gapX, gapY, targetWidth);
    if (cost < bestCost) {
      bestCost = cost;
      bestRows = rows;
    }
  }

  return bestRows ?? [boxes];
}

function rowsForPartitionMask(boxes: Box[], mask: number): Box[][] {
  const rows: Box[][] = [];
  let row: Box[] = [boxes[0]!];

  for (let index = 1; index < boxes.length; index += 1) {
    const startsNewRow = (mask & (1 << (index - 1))) !== 0;
    if (startsNewRow) {
      rows.push(row);
      row = [];
    }
    row.push(boxes[index]!);
  }

  rows.push(row);
  return rows;
}

function adaptiveRowCost(
  rows: Box[][],
  gapX: number,
  gapY: number,
  targetWidth: number,
): number {
  const rowWidths = rows.map((row) => rowWidth(row, gapX));
  const width = Math.max(...rowWidths);
  const height =
    rows.reduce((sum, row) => sum + Math.max(...row.map((box) => box.h)), 0) +
    Math.max(0, rows.length - 1) * gapY;
  const area = rows.flat().reduce((sum, box) => sum + box.w * box.h, 0);
  const efficiency = area / Math.max(1, width * height);
  const balancedWidths = rowWidthsForBalance(rows, rowWidths);
  const rowBalance = coefficientOfVariation(balancedWidths);
  const aspectRatio = width / Math.max(1, height);
  const targetAspect = 2.1;
  const aspectPenalty = Math.abs(Math.log(aspectRatio / targetAspect));
  const targetPenalty =
    Math.abs(width - targetWidth) / Math.max(1, targetWidth);
  const singleChildRowPenalty = rows.reduce((sum, row, index) => {
    if (row.length !== 1 || rows.length === 1) return sum;
    return sum + (index === rows.length - 1 ? 0.08 : 0.2);
  }, 0);

  return (
    (1 - efficiency) * 1.2 +
    rowBalance * 0.45 +
    aspectPenalty * 0.16 +
    targetPenalty * 0.12 +
    singleChildRowPenalty +
    rows.length * 0.01
  );
}

function rowWidthsForBalance(rows: Box[][], rowWidths: number[]): number[] {
  if (rows.length <= 2) return rowWidths;
  const finalRow = rows[rows.length - 1]!;
  const previousMaxLength = Math.max(
    ...rows.slice(0, -1).map((row) => row.length),
  );
  if (finalRow.length < previousMaxLength) return rowWidths.slice(0, -1);
  return rowWidths;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function greedyAdaptiveRows(
  boxes: Box[],
  gapX: number,
  targetWidth: number,
): Box[][] {
  const rows: Box[][] = [];
  let row: Box[] = [];
  let width = 0;

  for (const box of boxes) {
    const nextWidth = row.length === 0 ? box.w : width + gapX + box.w;
    if (row.length > 0 && nextWidth > targetWidth) {
      rows.push(row);
      row = [];
      width = 0;
    }
    row.push(box);
    width = row.length === 1 ? box.w : width + gapX + box.w;
  }

  if (row.length > 0) rows.push(row);
  return rows;
}

function normalizePackedRows(
  boxes: PackedBox[],
  gapX: number,
  gapY: number,
  centerRows: boolean,
  doc: CapabilityDocument,
): PackedBoxes {
  const ordered = [...boxes].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
  );
  const rows: PackedBox[][] = [];
  for (const box of ordered) {
    const row = rows.find(
      (candidate) => Math.abs(candidate[0]!.y - box.y) <= 1,
    );
    if (row) row.push(box);
    else rows.push([box]);
  }

  for (const row of rows)
    row.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  return packRows(rows, gapX, gapY, centerRows, doc);
}

function packRows<T extends Box>(
  rows: T[][],
  gapX: number,
  gapY: number,
  centerRows: boolean,
  doc: CapabilityDocument,
): PackedBoxes {
  const rowWidths = rows.map((row) => rowWidth(row, gapX));
  const layoutWidth = rowWidths.length > 0 ? Math.max(...rowWidths) : 0;
  const packed: PackedBox[] = [];
  let cursorY = 0;

  for (const [index, row] of rows.entries()) {
    const rowHeight = Math.max(...row.map((box) => box.h));
    let cursorX = centerRows
      ? snapLayoutDelta(doc, (layoutWidth - rowWidths[index]!) / 2)
      : 0;
    for (const box of row) {
      packed.push({ ...box, x: cursorX, y: cursorY });
      cursorX += box.w + gapX;
    }
    cursorY += rowHeight + gapY;
  }

  const bounds = boundsForBoxes(packed);
  const width = bounds ? bounds.x + bounds.w : 0;
  const height = bounds ? bounds.y + bounds.h : 0;
  return { boxes: packed, w: width, h: height, diagnostics: [] };
}

function rowWidth(row: Box[], gapX: number): number {
  return (
    row.reduce((sum, box) => sum + box.w, 0) +
    Math.max(0, row.length - 1) * gapX
  );
}

function fallbackPackRows(
  boxes: Box[],
  gapX: number,
  gapY: number,
  targetWidth: number,
  centerRows: boolean,
  doc: CapabilityDocument,
): PackedBoxes {
  const rows: Box[][] = [];
  let row: Box[] = [];
  let rowWidth = 0;
  for (const box of boxes) {
    const nextWidth = row.length === 0 ? box.w : rowWidth + gapX + box.w;
    if (row.length > 0 && nextWidth > targetWidth) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(box);
    rowWidth = row.length === 1 ? box.w : rowWidth + gapX + box.w;
  }
  if (row.length > 0) rows.push(row);
  return packRows(rows, gapX, gapY, centerRows, doc);
}

function targetWidthFor(
  boxes: Box[],
  gapX: number,
  gapY: number,
  mode: LayoutMode,
): number {
  const widest = Math.max(...boxes.map((box) => box.w));
  if (mode === "uniform") {
    const columns = Math.max(1, Math.ceil(Math.sqrt(boxes.length)));
    return Math.max(widest, rowWidthForColumns(boxes, columns, gapX));
  }
  if (mode === "flow") return Math.max(widest, 900);
  const area = totalArea(boxes);
  const desired = Math.sqrt(area * 2.1);
  return Math.max(widest, desired + gapX);
}

function rowWidthForColumns(
  boxes: Box[],
  columns: number,
  gapX: number,
): number {
  let width = 0;
  for (let index = 0; index < boxes.length; index += columns) {
    const row = boxes.slice(index, index + columns);
    width = Math.max(
      width,
      row.reduce((sum, box) => sum + box.w, 0) +
        Math.max(0, row.length - 1) * gapX,
    );
  }
  return width;
}

function totalArea(boxes: Box[]): number {
  return boxes.reduce((sum, box) => sum + box.w * box.h, 0);
}
