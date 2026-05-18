import { describe, expect, it } from "vitest";
import { createEmptyDocument, createNode } from "../document/defaults";
import { ROOT_PARENT_ID } from "../document/types";
import { findTopLeftFreeLabelPlacement } from "./labelPlacement";

describe("label placement", () => {
  it("uses the default origin on an empty canvas", () => {
    const doc = createEmptyDocument();

    expect(findTopLeftFreeLabelPlacement(doc)).toEqual({
      x: 24,
      y: 24,
      w: 180,
      h: 40,
    });
  });

  it("scans from the visible content top-left until it finds a free slot", () => {
    const doc = createEmptyDocument();
    const first = createNode({
      id: "first",
      label: "First",
      x: 48,
      y: 48,
      w: 180,
      h: 40,
    });
    const second = createNode({
      id: "second",
      label: "Second",
      x: 240,
      y: 48,
      w: 180,
      h: 40,
    });
    doc.nodesById = { first, second };
    doc.childrenByParentId = {
      [ROOT_PARENT_ID]: ["first", "second"],
      first: [],
      second: [],
    };

    expect(findTopLeftFreeLabelPlacement(doc)).toEqual({
      x: 432,
      y: 48,
      w: 180,
      h: 40,
    });
  });

  it("snaps candidate positions to the configured grid", () => {
    const doc = createEmptyDocument();
    doc.settings.gridSize = 16;
    const occupied = createNode({
      id: "occupied",
      label: "Occupied",
      x: 50,
      y: 50,
      w: 180,
      h: 40,
    });
    doc.nodesById = { occupied };
    doc.childrenByParentId = {
      [ROOT_PARENT_ID]: ["occupied"],
      occupied: [],
    };

    const placement = findTopLeftFreeLabelPlacement(doc);

    expect(placement).toEqual({
      x: 256,
      y: 48,
      w: 180,
      h: 40,
    });
    expect(placement.x % 16).toBe(0);
    expect(placement.y % 16).toBe(0);
  });
});
