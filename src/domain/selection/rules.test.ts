import { describe, expect, it } from "vitest";
import { createSampleDocument } from "../fixtures/sample";
import { canAlign, canMoveSelection, canMultiSelect } from "./rules";

describe("selection rules", () => {
  it("rejects multi-selection that mixes parents", () => {
    const doc = createSampleDocument();
    const result = canMultiSelect(doc, ["credit-risk", "process-management"]);
    expect(result.valid).toBe(false);
  });

  it("accepts a sibling group for alignment", () => {
    const doc = createSampleDocument();
    const result = canAlign(doc, ["credit-risk", "fraud-risk"]);
    expect(result.valid).toBe(true);
  });

  it("rejects mixed-parent moves at the canMoveSelection layer too", () => {
    const doc = createSampleDocument();
    const result = canMoveSelection(doc, ["risk", "fraud-risk"]);
    expect(result.valid).toBe(false);
  });
});
