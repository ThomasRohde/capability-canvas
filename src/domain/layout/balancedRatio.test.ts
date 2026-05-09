import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../document/defaults";
import { balancedRatioDpPackRows, type BalancedInputBox } from "./balancedRatio";

describe("balanced ratio DP row packing", () => {
  it("preserves sibling order row by row", () => {
    const doc = testDoc();
    const boxes = labeledBoxes(["A", "B", "C", "D", "E", "F", "G"]);

    const result = balancedRatioDpPackRows(boxes, 12, 16, 1.35, doc);

    expect(result.rows.flat().map((box) => box.id)).toEqual(
      boxes.map((box) => box.id),
    );
  });

  it("centers rows under the packed width", () => {
    const doc = testDoc({ gridEnabled: true, gridSize: 8 });
    const boxes = labeledBoxes(["A", "B", "C", "D", "E", "F", "G", "H"]);

    const result = balancedRatioDpPackRows(boxes, 16, 16, 1.35, doc);

    expect(result.rows.length).toBeGreaterThan(1);
    for (const row of result.rows) {
      const rowLeft = Math.min(...row.map((box) => box.x));
      const rowRight = Math.max(...row.map((box) => box.x + box.w));
      const rowCenter = (rowLeft + rowRight) / 2;
      expect(Math.abs(rowCenter - result.w / 2)).toBeLessThanOrEqual(
        doc.settings.gridSize,
      );
    }
  });

  it("avoids avoidable singleton-heavy layouts", () => {
    const doc = testDoc();
    const boxes = labeledBoxes(["A", "B", "C", "D", "E", "F", "G"]);

    const result = balancedRatioDpPackRows(boxes, 12, 16, 1.35, doc);
    const rowLengths = result.rows.map((row) => row.length);

    expect(Math.max(...rowLengths) - Math.min(...rowLengths)).toBeLessThanOrEqual(
      2,
    );
    expect(rowLengths.filter((count) => count === 1).length).toBeLessThan(2);
  });

  it("has lower raggedness than a simple greedy fixture", () => {
    const doc = testDoc();
    const boxes: BalancedInputBox[] = [
      { id: "A", w: 220, h: 48 },
      { id: "B", w: 90, h: 48 },
      { id: "C", w: 90, h: 48 },
      { id: "D", w: 210, h: 48 },
      { id: "E", w: 120, h: 48 },
      { id: "F", w: 120, h: 48 },
      { id: "G", w: 160, h: 48 },
      { id: "H", w: 160, h: 48 },
    ];

    const balanced = balancedRatioDpPackRows(boxes, 12, 16, 1.35, doc);
    const greedy = greedyRaggedness(boxes, 12, 460);

    expect(balanced.metrics.raggedness).toBeLessThan(greedy);
  });

  it("is deterministic", () => {
    const doc = testDoc();
    const boxes = labeledBoxes(["A", "B", "C", "D", "E", "F", "G", "H"]);

    const first = balancedRatioDpPackRows(boxes, 12, 16, 1.35, doc);
    const second = balancedRatioDpPackRows(boxes, 12, 16, 1.35, doc);

    expect(second).toEqual(first);
  });
});

function testDoc(
  settings: Partial<ReturnType<typeof createEmptyDocument>["settings"]> = {},
) {
  const doc = createEmptyDocument();
  doc.settings = { ...doc.settings, gridEnabled: false, ...settings };
  return doc;
}

function labeledBoxes(ids: string[]): BalancedInputBox[] {
  return ids.map((id, index) => ({
    id,
    w: index % 3 === 0 ? 150 : 112,
    h: index % 4 === 0 ? 56 : 48,
  }));
}

function greedyRaggedness(
  boxes: BalancedInputBox[],
  gapX: number,
  targetWidth: number,
): number {
  const rows: BalancedInputBox[][] = [];
  let row: BalancedInputBox[] = [];
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
  const rowWidths = rows.map((item) =>
    item.reduce((sum, box) => sum + box.w, 0) +
    Math.max(0, item.length - 1) * gapX,
  );
  return coefficientOfVariation(rowWidths);
}

function coefficientOfVariation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}
