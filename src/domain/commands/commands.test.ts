import { describe, expect, it } from "vitest";
import {
  addChild,
  alignNodes,
  fitParentToChildren,
  moveNodes,
  repairSiblingOverlaps,
  reparentNode,
  resizeNode,
  runTransaction,
} from "./operations";
import { createSampleDocument } from "../fixtures/sample";

describe("commands", () => {
  it("adds children transactionally", () => {
    const doc = createSampleDocument();
    const result = runTransaction(doc, addChild("risk", "New risk capability"));
    expect(result.diagnostics).toHaveLength(0);
    expect(
      Object.values(result.doc.nodesById).some(
        (node) => node.label === "New risk capability",
      ),
    ).toBe(true);
  });

  it("rejects reparenting into a descendant", () => {
    const doc = createSampleDocument();
    const result = runTransaction(
      doc,
      reparentNode("channels", "digital-onboarding"),
    );
    expect(result.doc).toBe(doc);
    expect(result.diagnostics.some((diag) => diag.code === "cycle")).toBe(true);
  });

  it("aligns sibling selections as one transaction", () => {
    const doc = createSampleDocument();
    const result = runTransaction(
      doc,
      alignNodes(["credit-risk", "fraud-risk", "operational-risk"], "top"),
    );
    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById["credit-risk"]!.y).toBe(
      result.doc.nodesById["fraud-risk"]!.y,
    );
  });

  it("uses configured right and bottom padding for resize containment", () => {
    const doc = createSampleDocument();
    doc.settings.containerPaddingRight = 4;
    doc.settings.containerPaddingBottom = 8;

    const result = runTransaction(doc, resizeNode("risk", 1, 1));
    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById.risk).toMatchObject({ w: 436, h: 128 });
  });

  it("shrinks oversized parents when fitting to children", () => {
    const doc = createSampleDocument();
    const before = doc.nodesById.risk!;
    const oversized = {
      ...doc,
      nodesById: {
        ...doc.nodesById,
        risk: { ...before, w: before.w + 400, h: before.h + 200 },
      },
    };
    const result = runTransaction(oversized, fitParentToChildren("risk"));
    expect(result.doc.nodesById.risk!.w).toBeLessThan(before.w + 400);
    expect(result.doc.nodesById.risk!.h).toBeLessThan(before.h + 200);
  });

  it("annotates addChild with relayout meta scoped to the parent", () => {
    const txn = addChild("risk");
    expect(txn.meta?.relayout).toBeDefined();
    expect(txn.meta?.relayout?.scope).toEqual(["risk"]);
  });

  it("repairs sibling overlaps after a drag in auto mode", () => {
    const doc = createSampleDocument();
    const credit = doc.nodesById["credit-risk"]!;
    const moved = runTransaction(doc, moveNodes(["credit-risk"], 130, 0)).doc;
    expect(moved.nodesById["credit-risk"]!.x).toBe(credit.x + 130);
    const repaired = runTransaction(moved, repairSiblingOverlaps("risk")).doc;
    const a = repaired.nodesById["credit-risk"]!;
    const b = repaired.nodesById["fraud-risk"]!;
    const overlapping =
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    expect(overlapping).toBe(false);
  });
});
