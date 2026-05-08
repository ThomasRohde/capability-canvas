import { describe, expect, it } from "vitest";
import { createNode } from "../document/defaults";
import { childrenOf } from "../document/types";
import { createSampleDocument } from "../fixtures/sample";
import {
  canAlign,
  canMultiSelect,
  resolveSelectAllSelection,
  resolveSiblingSelection,
  TEXT_LABEL_SELECTION_REASON,
  MIXED_PARENT_SELECTION_REASON,
} from "./rules";

describe("selection rules", () => {
  it("rejects multi-selection that mixes parents", () => {
    const doc = createSampleDocument();
    const result = canMultiSelect(doc, ["credit-risk", "process-management"]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe(MIXED_PARENT_SELECTION_REASON);
  });

  it("rejects text labels from multi-selection with the exact reason", () => {
    const doc = createSampleDocument();
    doc.nodesById.note = createNode({
      id: "note",
      label: "Note",
      parentId: "risk",
      type: "text",
      isTextLabel: true,
    });
    doc.childrenByParentId.risk = [...childrenOf(doc, "risk"), "note"];

    const result = canMultiSelect(doc, ["credit-risk", "note"]);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe(TEXT_LABEL_SELECTION_REASON);
  });

  it("resolves broad mixed-parent selections to the largest sibling group", () => {
    const doc = createSampleDocument();
    const result = resolveSiblingSelection(doc, [
      "credit-risk",
      "fraud-risk",
      "process-management",
      "data-management",
      "technology-operations",
    ]);

    expect(result.nodeIds).toEqual([
      "process-management",
      "data-management",
      "technology-operations",
    ]);
    expect(result.reason).toBe(MIXED_PARENT_SELECTION_REASON);
    expect(result.reduced).toBe(true);
  });

  it("resolves select-all from the current anchor sibling group", () => {
    const doc = createSampleDocument();
    const result = resolveSelectAllSelection(
      doc,
      [
        "credit-risk",
        "fraud-risk",
        "operational-risk",
        "process-management",
        "data-management",
        "technology-operations",
        "vendor-management",
      ],
      ["credit-risk"],
    );

    expect(result.nodeIds).toEqual([
      "credit-risk",
      "fraud-risk",
      "operational-risk",
    ]);
    expect(result.reason).toBeUndefined();
  });

  it("accepts a sibling group for alignment", () => {
    const doc = createSampleDocument();
    const result = canAlign(doc, ["credit-risk", "fraud-risk"]);
    expect(result.valid).toBe(true);
  });
});
