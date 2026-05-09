import { describe, expect, it } from "vitest";
import {
  boundsForBoxes,
  emptyBounds,
  expandBounds,
  isUsableBounds,
  rectanglesOverlap,
} from "./bounds";

describe("bounds utilities", () => {
  it("returns null for an empty box list", () => {
    expect(boundsForBoxes([])).toBeNull();
  });

  it("computes the union of positive and negative boxes", () => {
    expect(
      boundsForBoxes([
        { x: 10, y: 20, w: 30, h: 40 },
        { x: -5, y: 12, w: 10, h: 8 },
      ]),
    ).toEqual({ x: -5, y: 12, w: 45, h: 48 });
  });

  it("returns a fresh empty bounds object", () => {
    const first = emptyBounds();
    const second = emptyBounds();

    first.w = 10;

    expect(second).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it("expands bounds by symmetric padding", () => {
    expect(expandBounds({ x: 10, y: 20, w: 30, h: 40 }, 6)).toEqual({
      x: 4,
      y: 14,
      w: 42,
      h: 52,
    });
  });

  it("rejects non-positive and non-finite usable bounds", () => {
    expect(isUsableBounds({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(isUsableBounds({ x: 0, y: 0, w: 0, h: 1 })).toBe(false);
    expect(isUsableBounds({ x: Number.NaN, y: 0, w: 1, h: 1 })).toBe(false);
  });

  it("treats touching edges as non-overlapping", () => {
    expect(
      rectanglesOverlap(
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 10, y: 0, w: 10, h: 10 },
      ),
    ).toBe(false);
    expect(
      rectanglesOverlap(
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 9, y: 0, w: 10, h: 10 },
      ),
    ).toBe(true);
  });
});
