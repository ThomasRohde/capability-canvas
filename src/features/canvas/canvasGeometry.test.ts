import { describe, expect, it } from "vitest";
import {
  createEmptyDocument,
  createNode,
} from "../../domain/document/defaults";
import { snapDragDelta, snapResizeDelta } from "./canvasGeometry";

describe("canvas geometry", () => {
  it("snaps drag deltas in screen space using the anchor node", () => {
    const doc = createEmptyDocument();
    doc.nodesById.node = createNode({
      id: "node",
      label: "Node",
      x: 5,
      y: 9,
    });
    doc.settings.gridSize = 8;

    expect(
      snapDragDelta(doc, ["node"], { x: 0, y: 0, zoom: 2 }, 11, 11),
    ).toEqual({ dx: 6, dy: 14 });
  });

  it("snaps resize deltas against the node edge", () => {
    const doc = createEmptyDocument();
    doc.nodesById.node = createNode({
      id: "node",
      label: "Node",
      x: 5,
      y: 9,
      w: 30,
      h: 30,
    });
    doc.settings.gridSize = 8;

    expect(
      snapResizeDelta(doc, "node", 30, 30, { x: 0, y: 0, zoom: 2 }, 11, 11),
    ).toEqual({ dx: 10, dy: 18 });
  });
});
