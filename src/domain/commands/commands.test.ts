import { describe, expect, it } from "vitest";
import {
  addChild,
  alignNodes,
  fitParentToChildren,
  lockSubtree,
  moveNodes,
  repairSiblingOverlaps,
  reparentNode,
  resizeNode,
  runTransaction,
  setManualPositioning,
  updateNodeColors,
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

  it("promotes a leaf drop target to parent when reparenting into it", () => {
    const doc = createSampleDocument();
    const result = runTransaction(
      doc,
      reparentNode("fraud-risk", "operational-risk"),
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById["operational-risk"]).toMatchObject({
      type: "parent",
    });
    expect(result.doc.nodesById["fraud-risk"]).toMatchObject({
      parentId: "operational-risk",
      type: "leaf",
    });
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

  it("updates selected capability colors as one transaction", () => {
    const doc = createSampleDocument();
    const nodeIds = ["credit-risk", "fraud-risk", "operational-risk"];

    const result = runTransaction(doc, updateNodeColors(nodeIds, "lavender"));

    expect(result.diagnostics).toHaveLength(0);
    for (const nodeId of nodeIds)
      expect(result.doc.nodesById[nodeId]!.color).toBe("lavender");
  });

  it("aligns centers to the selected group center", () => {
    const doc = createSampleDocument();
    const nodeIds = ["credit-risk", "fraud-risk", "operational-risk"];
    const selected = nodeIds.map((id) => doc.nodesById[id]!);
    const minX = Math.min(...selected.map((node) => node.x));
    const maxX = Math.max(...selected.map((node) => node.x + node.w));
    const targetCenter = minX + (maxX - minX) / 2;

    const result = runTransaction(doc, alignNodes(nodeIds, "center"));

    expect(result.diagnostics).toHaveLength(0);
    for (const nodeId of nodeIds) {
      const node = result.doc.nodesById[nodeId]!;
      expect(node.x + node.w / 2).toBe(targetCenter);
    }
  });

  it("uses configured right and bottom padding for resize containment", () => {
    const doc = createSampleDocument();
    doc.settings.containerPaddingRight = 4;
    doc.settings.containerPaddingBottom = 8;

    const result = runTransaction(doc, resizeNode("risk", 1, 1));
    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById.risk).toMatchObject({ w: 416, h: 120 });
  });

  it("preserves explicit resize dimensions for manual-positioning parents", () => {
    const manual = runTransaction(
      createSampleDocument(),
      setManualPositioning("risk", true),
    ).doc;

    const result = runTransaction(manual, resizeNode("risk", 100, 60));

    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById.risk).toMatchObject({
      w: 100,
      h: 60,
      isManualPositioningEnabled: true,
    });
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

  it("allows direct movement of locked capabilities while preserving resize lock semantics", () => {
    const locked = runTransaction(
      createSampleDocument(),
      lockSubtree("risk", true),
    ).doc;
    const riskBefore = locked.nodesById.risk!;
    const childBefore = locked.nodesById["credit-risk"]!;

    const moved = runTransaction(locked, moveNodes(["risk"], 32, 16));

    expect(moved.diagnostics).toHaveLength(0);
    expect(moved.doc.nodesById.risk).toMatchObject({
      x: riskBefore.x + 32,
      y: riskBefore.y + 16,
      isLockedAsIs: true,
    });
    expect(moved.doc.nodesById["credit-risk"]).toMatchObject({
      x: childBefore.x + 32,
      y: childBefore.y + 16,
      isLockedAsIs: true,
    });
  });
});
