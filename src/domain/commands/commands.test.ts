import { describe, expect, it } from "vitest";
import {
  addChild,
  addSubtreeToCanvas,
  alignNodes,
  deleteNodes,
  fitParentToChildren,
  lockSubtrees,
  lockSubtree,
  mergePromptCapabilities,
  moveNodes,
  repairSiblingOverlaps,
  removeNodesFromCanvas,
  removeSubtreeFromCanvas,
  reparentNode,
  resizeNode,
  runTransaction,
  setManualPositioning,
  setManualPositioningForNodes,
  updateActiveViewExportSettings,
  updateNodeColors,
  updateNodeHeatmapValues,
  updateNodeSizes,
} from "./operations";
import { createEmptyDocument, createNode } from "../document/defaults";
import { createSampleDocument } from "../fixtures/sample";
import { childrenOf, ROOT_PARENT_ID } from "../document/types";
import { ensureParentContainment } from "../layout/containment";
import { applyLayoutPatches, layoutDocument } from "../layout/engine";
import {
  PROMPT_MERGE_SCHEMA,
  PROMPT_MERGE_VERSION,
  type PromptMergePayload,
} from "../promptMerge/payload";

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
    expect(
      Object.values(result.doc.nodesById).find(
        (node) => node.label === "New risk capability",
      )?.heatmapValue,
    ).toBeUndefined();
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
    for (const nodeId of nodeIds) {
      expect(result.doc.nodesById[nodeId]!.color).toBe("coral");
      expect(result.doc.nodesById[nodeId]!.colorOverride).toBe("lavender");
    }
  });

  it("updates selected sizes as one bulk transaction command", () => {
    const doc = createSampleDocument();
    const nodeIds = ["credit-risk", "fraud-risk", "operational-risk"];
    const txn = updateNodeSizes(nodeIds, { w: 144, h: 64 });

    const result = runTransaction(doc, txn);

    expect(txn.commands).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(0);
    for (const nodeId of nodeIds) {
      expect(result.doc.nodesById[nodeId]).toMatchObject({ w: 144, h: 64 });
    }
  });

  it("updates and clears selected heatmap values in bulk", () => {
    const doc = createSampleDocument();
    const nodeIds = ["credit-risk", "fraud-risk", "operational-risk"];

    const updated = runTransaction(
      doc,
      updateNodeHeatmapValues(nodeIds, 0.27),
    ).doc;
    const cleared = runTransaction(
      updated,
      updateNodeHeatmapValues(nodeIds, undefined),
    );

    expect(cleared.diagnostics).toHaveLength(0);
    for (const nodeId of nodeIds) {
      expect(updated.nodesById[nodeId]!.heatmapValue).toBe(0.27);
      expect(cleared.doc.nodesById[nodeId]!.heatmapValue).toBeUndefined();
    }
  });

  it("updates active view export settings", () => {
    const doc = createSampleDocument();
    const viewId = doc.visual.activeViewId;

    const result = runTransaction(
      doc,
      updateActiveViewExportSettings({
        pagePreset: "16:9",
        showTitle: true,
        includeGrid: false,
      }),
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.visual.viewsById[viewId]?.export).toMatchObject({
      pagePreset: "16:9",
      showTitle: true,
      includeGrid: false,
    });
    expect(result.doc.nodesById).toEqual(doc.nodesById);
  });

  it("updates selected manual and preserve flags in bulk", () => {
    const doc = createSampleDocument();
    const nodeIds = ["credit-risk", "fraud-risk", "operational-risk"];

    const manual = runTransaction(
      doc,
      setManualPositioningForNodes(nodeIds, true),
    ).doc;
    const preserved = runTransaction(manual, lockSubtrees(nodeIds, true));

    expect(preserved.diagnostics).toHaveLength(0);
    for (const nodeId of nodeIds) {
      expect(manual.nodesById[nodeId]!.isManualPositioningEnabled).toBe(true);
      expect(preserved.doc.nodesById[nodeId]!.isLockedAsIs).toBe(true);
    }
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
    const risk = doc.nodesById.risk!;
    const children = childrenOf(doc, "risk").map((id) => doc.nodesById[id]!);
    const childRight = Math.max(...children.map((child) => child.x + child.w));
    const childBottom = Math.max(...children.map((child) => child.y + child.h));
    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById.risk).toMatchObject({
      w: childRight - risk.x + doc.settings.containerPaddingRight,
      h: childBottom - risk.y + doc.settings.containerPaddingBottom,
    });
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

  it("keeps a snapped auto-laid parent stable when fitting to children", async () => {
    const doc = subGridPaddingDocument();
    const layout = await layoutDocument({
      doc,
      force: true,
      mode: "adaptive",
    });
    const laidOut = ensureParentContainment(
      applyLayoutPatches(doc, layout.patches),
    ).doc;
    const before = laidOut.nodesById.root!;

    const result = runTransaction(laidOut, fitParentToChildren("root"));

    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById.root).toMatchObject({
      x: before.x,
      y: before.y,
      w: before.w,
      h: before.h,
    });
  });

  it("annotates addChild with relayout meta scoped to the parent", () => {
    const txn = addChild("risk");
    expect(txn.meta?.relayout).toBeDefined();
    expect(txn.meta?.relayout?.scope).toEqual(["risk"]);
  });

  it("creates children under a selected leaf from prompt merge output", () => {
    const doc = createSampleDocument();
    const payload = promptPayload("digital-onboarding", [
      {
        id: "identity-verification",
        name: "Identity Verification",
        description: "Confirms customer identity for digital onboarding.",
      },
      {
        id: "application-capture",
        name: "Application Capture",
      },
    ]);

    const result = runTransaction(doc, mergePromptCapabilities(payload));

    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById["digital-onboarding"]).toMatchObject({
      type: "parent",
    });
    expect(childrenOf(result.doc, "digital-onboarding")).toEqual([
      "identity-verification",
      "application-capture",
    ]);
    expect(result.doc.nodesById["identity-verification"]).toMatchObject({
      parentId: "digital-onboarding",
      type: "leaf",
      isOnCanvas: true,
      description: "Confirms customer identity for digital onboarding.",
    });
    expect(
      result.doc.nodesById["identity-verification"]?.heatmapValue,
    ).toBeUndefined();
  });

  it("merges prompt output into a non-leaf without removing existing children", () => {
    const doc = createSampleDocument();
    const payload = promptPayload("risk", [
      {
        id: "credit-risk",
        name: "Credit Risk Management",
        description: "Manages retail credit risk exposure.",
        metadata: { source: "prompt" },
      },
      {
        id: "model-risk",
        name: "Model Risk",
      },
    ]);

    const result = runTransaction(doc, mergePromptCapabilities(payload));
    const riskChildren = childrenOf(result.doc, "risk");

    expect(result.diagnostics).toHaveLength(0);
    expect(riskChildren).toContain("credit-risk");
    expect(riskChildren).toContain("fraud-risk");
    expect(riskChildren).toContain("operational-risk");
    expect(riskChildren).toContain("model-risk");
    expect(result.doc.nodesById["credit-risk"]).toMatchObject({
      label: "Credit Risk Management",
      description: "Manages retail credit risk exposure.",
      metadata: { source: "prompt" },
    });
  });

  it("matches prompt capabilities by id then normalized sibling label", () => {
    const doc = createSampleDocument();
    const beforeChildren = childrenOf(doc, "risk");
    const payload = promptPayload("risk", [
      {
        id: "fraud-risk",
        name: "Fraud Risk",
        description: "Updated by id.",
      },
      {
        name: "operational   risk",
        description: "Updated by label.",
      },
    ]);

    const result = runTransaction(doc, mergePromptCapabilities(payload));

    expect(result.diagnostics).toHaveLength(0);
    expect(childrenOf(result.doc, "risk")).toEqual(beforeChildren);
    expect(result.doc.nodesById["fraud-risk"]?.description).toBe(
      "Updated by id.",
    );
    expect(result.doc.nodesById["operational-risk"]?.description).toBe(
      "Updated by label.",
    );
  });

  it("rejects prompt merge output with an invalid target", () => {
    const doc = createSampleDocument();
    const result = runTransaction(
      doc,
      mergePromptCapabilities(promptPayload("missing", [{ name: "New" }])),
    );

    expect(result.doc).toBe(doc);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.code === "missing-target"),
    ).toBe(true);
  });

  it("uses source-model and active-view transaction labels", () => {
    expect(addSubtreeToCanvas("digital", { x: 0, y: 0 }).label).toBe(
      "Add subtree to active view",
    );
    expect(removeSubtreeFromCanvas("digital").label).toBe(
      "Remove subtree from active view",
    );
    expect(removeNodesFromCanvas(["digital"]).label).toBe(
      "Remove from active view",
    );
    expect(deleteNodes(["digital"]).label).toBe("Delete from model");
  });

  it("can add and remove a subtree from the active view without changing hierarchy", () => {
    const doc = createSampleDocument();
    const hidden = runTransaction(
      doc,
      removeSubtreeFromCanvas("digital"),
    ).doc;

    expect(hidden.nodesById.digital!.isOnCanvas).toBe(false);
    expect(hidden.nodesById["digital-onboarding"]!.isOnCanvas).toBe(false);
    expect(hidden.nodesById.digital!.parentId).toBe(
      doc.nodesById.digital!.parentId,
    );

    const visible = runTransaction(
      hidden,
      addSubtreeToCanvas("digital", { x: 500, y: 400 }),
    ).doc;

    expect(visible.nodesById.digital!.isOnCanvas).toBe(true);
    expect(visible.nodesById["digital-onboarding"]!.isOnCanvas).toBe(true);
    expect(visible.nodesById.digital!.parentId).toBe(
      doc.nodesById.digital!.parentId,
    );
    expect(visible.nodesById.digital!.x).toBeGreaterThan(200);
    expect(visible.nodesById.digital!.y).toBeGreaterThan(200);
  });

  it("can remove multiple selected subtrees from the active view without deleting them", () => {
    const doc = createSampleDocument();
    const hidden = runTransaction(
      doc,
      removeNodesFromCanvas(["digital", "risk"]),
    ).doc;

    expect(hidden.nodesById.digital).toBeDefined();
    expect(hidden.nodesById.risk).toBeDefined();
    expect(hidden.nodesById["digital-onboarding"]).toBeDefined();
    expect(hidden.nodesById["credit-risk"]).toBeDefined();
    expect(hidden.nodesById.digital!.isOnCanvas).toBe(false);
    expect(hidden.nodesById["digital-onboarding"]!.isOnCanvas).toBe(false);
    expect(hidden.nodesById.risk!.isOnCanvas).toBe(false);
    expect(hidden.nodesById["credit-risk"]!.isOnCanvas).toBe(false);
    expect(childrenOf(hidden, "channels")).toContain("digital");
    expect(childrenOf(hidden, "retail-banking")).toContain("risk");
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

function subGridPaddingDocument() {
  const doc = createEmptyDocument();
  doc.layout.preservePositions = false;
  doc.layout.isUserArranged = false;
  doc.settings.gridEnabled = true;
  doc.settings.gridSize = 16;
  doc.settings.fixedLeafWidth = 168;
  doc.settings.fixedLeafHeight = 56;
  doc.settings.defaultParentWidth = 200;
  doc.settings.defaultParentHeight = 40;
  doc.settings.containerPaddingTop = 8;
  doc.settings.containerPaddingRight = 8;
  doc.settings.containerPaddingBottom = 8;
  doc.settings.containerPaddingLeft = 8;
  doc.settings.containerTitleHeight = 36;

  doc.nodesById.root = createNode({
    id: "root",
    label: "Root",
    type: "root",
  });
  doc.nodesById.child = createNode({
    id: "child",
    parentId: "root",
    label: "Child",
  });
  doc.childrenByParentId[ROOT_PARENT_ID] = ["root"];
  doc.childrenByParentId.root = ["child"];
  doc.childrenByParentId.child = [];
  return doc;
}

function promptPayload(
  targetId: string,
  capabilities: PromptMergePayload["capabilities"],
): PromptMergePayload {
  return {
    schema: PROMPT_MERGE_SCHEMA,
    version: PROMPT_MERGE_VERSION,
    targetId,
    capabilities,
  };
}
