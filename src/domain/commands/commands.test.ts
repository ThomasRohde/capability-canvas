import { describe, expect, it } from "vitest";
import {
  addChild,
  addLabel,
  addSubtreeToCanvas,
  alignNodes,
  deleteNodes,
  distributeNodes,
  duplicateNodes,
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
  sameSize,
  setManualPositioning,
  setManualPositioningForNodes,
  updateActiveViewExportSettings,
  updateNodeColors,
  updateNodeHeatmapValues,
  updateNodeSizes,
} from "./operations";
import { createEmptyDocument, createNode } from "../document/defaults";
import { createSampleDocument } from "../fixtures/sample";
import {
  childrenOf,
  ROOT_PARENT_ID,
  type CapabilityDocument,
  type LayoutMode,
} from "../document/types";
import {
  ensureParentContainment,
  findParentContainmentViolations,
} from "../layout/containment";
import { AUTOMATIC_LAYOUT_GEOMETRY_LOCKED } from "../layout/canvasLayoutPolicy";
import { applyLayoutPatches, layoutDocument } from "../layout/engine";
import {
  createVisualWorkspaceFromDocument,
  resolveVisualDocument,
} from "../visual/workspace";
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

  it("adds manual canvas labels as top-level annotations", () => {
    const doc = createSampleDocument();
    const result = runTransaction(
      doc,
      addLabel("Planning note", {
        id: "label-planning",
        center: { x: 500, y: 300 },
        shape: "sticky",
      }),
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById["label-planning"]).toMatchObject({
      label: "Planning note",
      type: "label",
      parentId: null,
      isTextLabel: true,
      isManualPositioningEnabled: true,
      x: 408,
      y: 280,
      w: 180,
      h: 40,
      textStyle: {
        shape: "sticky",
        fontSize: 14,
      },
    });
    expect(result.doc.childrenByParentId[ROOT_PARENT_ID]).toContain(
      "label-planning",
    );
    expect(result.doc.layout.isUserArranged).toBe(doc.layout.isUserArranged);
  });

  it("rejects child and reparent operations for labels", () => {
    const withLabel = runTransaction(
      createSampleDocument(),
      addLabel("Planning note", { id: "label-planning" }),
    ).doc;

    const addChildResult = runTransaction(
      withLabel,
      addChild("label-planning", "Invalid child"),
    );
    const reparentResult = runTransaction(
      withLabel,
      reparentNode("label-planning", "risk"),
    );

    expect(addChildResult.doc).toBe(withLabel);
    expect(addChildResult.diagnostics.map((diag) => diag.code)).toContain(
      "text-label-parent",
    );
    expect(reparentResult.doc).toBe(withLabel);
    expect(reparentResult.diagnostics.map((diag) => diag.code)).toContain(
      "label-reparent-rejected",
    );
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
    const doc = useFreeformLayout(createSampleDocument());
    const result = runTransaction(
      doc,
      alignNodes(["credit-risk", "fraud-risk", "operational-risk"], "top"),
    );
    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById["credit-risk"]!.y).toBe(
      result.doc.nodesById["fraud-risk"]!.y,
    );
  });

  it.each(["left", "center", "right", "top", "middle", "bottom"] as const)(
    "aligns parent containers %s without resizing their subtrees",
    (direction) => {
      const doc = createSampleDocument();
      useFreeformLayout(doc);
      const before: Record<
        string,
        { w: number; h: number; childDx: number; childDy: number }
      > = {};
      for (const [parentId, childId] of [
        ["risk", "credit-risk"],
        ["operations", "process-management"],
      ] as const) {
        const parent = doc.nodesById[parentId]!;
        const child = doc.nodesById[childId]!;
        before[parentId] = {
          w: parent.w,
          h: parent.h,
          childDx: child.x - parent.x,
          childDy: child.y - parent.y,
        };
      }

      const result = runTransaction(
        doc,
        alignNodes(["risk", "operations"], direction),
      );

      expect(result.diagnostics).toHaveLength(0);
      for (const [parentId, childId] of [
        ["risk", "credit-risk"],
        ["operations", "process-management"],
      ] as const) {
        const parent = result.doc.nodesById[parentId]!;
        const child = result.doc.nodesById[childId]!;
        expect(parent).toMatchObject({
          w: before[parentId]!.w,
          h: before[parentId]!.h,
        });
        expect(child.x - parent.x).toBe(before[parentId]!.childDx);
        expect(child.y - parent.y).toBe(before[parentId]!.childDy);
      }
      expect(findParentContainmentViolations(result.doc)).toEqual([]);
    },
  );

  it.each(["horizontal", "vertical"] as const)(
    "distributes parent containers %s without resizing their subtrees",
    (axis) => {
      const doc = parentSiblingDocument();
      const parentIds = ["group-a", "group-b", "group-c"];
      const before = parentSubtreeOffsets(doc, parentIds);

      const result = runTransaction(doc, distributeNodes(parentIds, axis));

      expect(result.diagnostics).toHaveLength(0);
      expect(result.doc.layout.isUserArranged).toBe(true);
      for (const parentId of parentIds) {
        const childId = `${parentId}-child`;
        const parent = result.doc.nodesById[parentId]!;
        const child = result.doc.nodesById[childId]!;
        expect(parent).toMatchObject({
          w: before[parentId]!.w,
          h: before[parentId]!.h,
        });
        expect(child.x - parent.x).toBe(before[parentId]!.childDx);
        expect(child.y - parent.y).toBe(before[parentId]!.childDy);
      }
      expect(findParentContainmentViolations(result.doc)).toEqual([]);
    },
  );

  it.each(["uniform", "flow", "adaptive", "balanced"] satisfies LayoutMode[])(
    "blocks same-size direct geometry in %s mode",
    (mode) => {
      const doc = parentSiblingDocument(mode);

      const result = runTransaction(
        doc,
        sameSize(["group-a", "group-b", "group-c"], "group-a"),
      );

      expect(result.doc).toBe(doc);
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        AUTOMATIC_LAYOUT_GEOMETRY_LOCKED,
      );
    },
  );

  it("marks same-size bulk geometry as user-arranged in free mode", () => {
    const doc = parentSiblingDocument("free");

    const result = runTransaction(
      doc,
      sameSize(["group-a", "group-b", "group-c"], "group-a"),
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.layout.mode).toBe("free");
    expect(result.doc.layout.isUserArranged).toBe(true);
    expect(result.doc.layout.aspectRatioFrame).toBeUndefined();
    expect(result.doc.layout.aspectRatioTarget).toBeUndefined();
    expect(result.doc.nodesById["group-b"]).toMatchObject({
      w: result.doc.nodesById["group-a"]!.w,
      h: result.doc.nodesById["group-a"]!.h,
    });
    expect(result.doc.nodesById["group-c"]).toMatchObject({
      w: result.doc.nodesById["group-a"]!.w,
      h: result.doc.nodesById["group-a"]!.h,
    });
    expect(findParentContainmentViolations(result.doc)).toEqual([]);
  });

  it("duplicates selected parent subtrees as manual layout edits", () => {
    const doc = parentSiblingDocument("balanced");
    const before = parentSubtreeOffsets(doc, ["group-a", "group-b"]);

    const result = runTransaction(doc, duplicateNodes(["group-a", "group-b"]));

    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.layout.isUserArranged).toBe(true);
    expect(result.doc.layout.aspectRatioFrame).toBeUndefined();
    expect(result.doc.layout.aspectRatioTarget).toBeUndefined();
    for (const originalId of ["group-a", "group-b"]) {
      const original = doc.nodesById[originalId]!;
      const copy = Object.values(result.doc.nodesById).find(
        (node) => node.label === `${original.label} copy`,
      );
      expect(copy).toBeDefined();
      expect(copy).toMatchObject({
        parentId: "root",
        x: original.x + 24,
        y: original.y + 24,
        w: original.w,
        h: original.h,
      });
      const childCopy = Object.values(result.doc.nodesById).find(
        (node) =>
          node.parentId === copy!.id &&
          node.label === `${doc.nodesById[`${originalId}-child`]!.label} copy`,
      );
      expect(childCopy).toBeDefined();
      expect(childCopy!.x - copy!.x).toBe(before[originalId]!.childDx);
      expect(childCopy!.y - copy!.y).toBe(before[originalId]!.childDy);
    }
  });

  it("updates selected capability colors as one transaction", () => {
    const doc = useFreeformLayout(createSampleDocument());
    const nodeIds = ["credit-risk", "fraud-risk", "operational-risk"];

    const result = runTransaction(doc, updateNodeColors(nodeIds, "lavender"));

    expect(result.diagnostics).toHaveLength(0);
    for (const nodeId of nodeIds) {
      expect(result.doc.nodesById[nodeId]!.color).toBe("coral");
      expect(result.doc.nodesById[nodeId]!.colorOverride).toBe("lavender");
    }
  });

  it("updates selected sizes as one bulk transaction command", () => {
    const doc = useFreeformLayout(createSampleDocument());
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
    const doc = useFreeformLayout(createSampleDocument());
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
    const doc = useFreeformLayout(createSampleDocument());
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
    const doc = useFreeformLayout(createSampleDocument());
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

  it("clamps manual-positioning parent resize to child bounds", () => {
    const manual = runTransaction(
      useFreeformLayout(createSampleDocument()),
      setManualPositioning("risk", true),
    ).doc;

    const result = runTransaction(manual, resizeNode("risk", 100, 60));
    const risk = manual.nodesById.risk!;
    const children = childrenOf(manual, "risk").map(
      (id) => manual.nodesById[id]!,
    );
    const childRight = Math.max(...children.map((child) => child.x + child.w));
    const childBottom = Math.max(...children.map((child) => child.y + child.h));

    expect(result.diagnostics).toHaveLength(0);
    expect(result.doc.nodesById.risk).toMatchObject({
      w: childRight - risk.x + manual.settings.containerPaddingRight,
      h: childBottom - risk.y + manual.settings.containerPaddingBottom,
      isManualPositioningEnabled: true,
    });
  });

  it("shrinks oversized parents when fitting to children", () => {
    const doc = useFreeformLayout(createSampleDocument());
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

  it("resizes a parent to leaf dimensions when its last child is deleted", () => {
    const oneChild = runTransaction(
      createSampleDocument(),
      deleteNodes(["fraud-risk", "operational-risk"]),
    ).doc;
    const before = oneChild.nodesById.risk!;

    const result = runTransaction(oneChild, deleteNodes(["credit-risk"]));

    expect(result.diagnostics).toHaveLength(0);
    expect(childrenOf(result.doc, "risk")).toEqual([]);
    expect(resolveVisualDocument(result.doc).nodesById.risk).toMatchObject({
      w: oneChild.settings.fixedLeafWidth,
      h: oneChild.settings.fixedLeafHeight,
    });
    expect(result.doc.nodesById.risk).toMatchObject({
      type: "leaf",
      x: before.x,
      y: before.y,
      w: oneChild.settings.fixedLeafWidth,
      h: oneChild.settings.fixedLeafHeight,
    });
  });

  it("resizes an emptied root container to leaf dimensions when its child is reparented out", () => {
    const doc = createEmptyDocument();
    doc.nodesById.parent = createNode({
      id: "parent",
      label: "Parent",
      type: "root",
      color: "sky",
      x: 24,
      y: 24,
      w: 288,
      h: 130,
    });
    doc.nodesById.child = createNode({
      id: "child",
      parentId: "parent",
      label: "Child",
      x: 36,
      y: 76,
      w: 264,
      h: 58,
    });
    doc.childrenByParentId[ROOT_PARENT_ID] = ["parent"];
    doc.childrenByParentId.parent = ["child"];
    doc.childrenByParentId.child = [];
    doc.visual = createVisualWorkspaceFromDocument(doc);

    const result = runTransaction(doc, reparentNode("child", null));
    const resolved = resolveVisualDocument(result.doc);

    expect(result.diagnostics).toHaveLength(0);
    expect(childrenOf(result.doc, "parent")).toEqual([]);
    expect(result.doc.nodesById.parent).toMatchObject({
      type: "root",
      x: 24,
      y: 24,
      w: doc.settings.fixedLeafWidth,
      h: doc.settings.fixedLeafHeight,
    });
    expect(resolved.nodesById.parent).toMatchObject({
      type: "leaf",
      w: doc.settings.fixedLeafWidth,
      h: doc.settings.fixedLeafHeight,
    });
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
    useFreeformLayout(laidOut);
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
    const doc = createSampleDocument();
    const txn = addChild("risk");
    const result = runTransaction(doc, txn);

    expect(txn.meta?.relayout).toBeDefined();
    expect(typeof txn.meta?.relayout?.scope).toBe("function");
    expect(
      typeof txn.meta?.relayout?.scope === "function"
        ? txn.meta.relayout.scope(doc, result.doc)
        : txn.meta?.relayout?.scope,
    ).toEqual(["risk"]);
  });

  it("adds a child under a Manual parent without moving existing siblings", () => {
    const manual = createSampleDocument();
    manual.nodesById.risk = {
      ...manual.nodesById.risk!,
      isManualPositioningEnabled: true,
    };
    manual.visual = createVisualWorkspaceFromDocument(manual);
    const before = geometryFor(manual, [
      "credit-risk",
      "fraud-risk",
      "operational-risk",
    ]);
    const txn = addChild("risk");

    const result = runTransaction(manual, txn);
    const childIds = childrenOf(result.doc, "risk");
    const newChildId = childIds.find(
      (id) => !["credit-risk", "fraud-risk", "operational-risk"].includes(id),
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(newChildId).toBeDefined();
    expect(
      geometryFor(result.doc, [
        "credit-risk",
        "fraud-risk",
        "operational-risk",
      ]),
    ).toEqual(before);
    expect(result.doc.nodesById[newChildId!]).toMatchObject({
      parentId: "risk",
      isOnCanvas: true,
    });
    expect(
      typeof txn.meta?.relayout?.scope === "function"
        ? txn.meta.relayout.scope(manual, result.doc)
        : txn.meta?.relayout?.scope,
    ).toEqual([]);
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

function parentSiblingDocument(mode: LayoutMode = "free") {
  const doc = createEmptyDocument();
  doc.settings.layoutMode = mode;
  doc.layout = {
    ...doc.layout,
    mode,
    isUserArranged: false,
    preservePositions: false,
    aspectRatioFrame:
      mode === "balanced" ? { x: 0, y: 0, w: 960, h: 540 } : undefined,
    aspectRatioTarget: mode === "balanced" ? { w: 16, h: 9 } : undefined,
  };
  doc.nodesById.root = createNode({
    id: "root",
    label: "Root",
    type: "root",
    x: 16,
    y: 16,
    w: 880,
    h: 360,
  });
  doc.childrenByParentId[ROOT_PARENT_ID] = ["root"];
  doc.childrenByParentId.root = [];

  for (const [index, id] of ["group-a", "group-b", "group-c"].entries()) {
    const x = 48 + index * 260;
    const y = 72 + index * 24;
    doc.nodesById[id] = createNode({
      id,
      parentId: "root",
      label: `Group ${index + 1}`,
      type: "parent",
      x,
      y,
      w: 220 + index * 24,
      h: 140 + index * 16,
    });
    doc.nodesById[`${id}-child`] = createNode({
      id: `${id}-child`,
      parentId: id,
      label: `Child ${index + 1}`,
      x: x + 24,
      y: y + 64,
      w: 128,
      h: 40,
    });
    doc.childrenByParentId.root!.push(id);
    doc.childrenByParentId[id] = [`${id}-child`];
    doc.childrenByParentId[`${id}-child`] = [];
  }

  doc.visual = createVisualWorkspaceFromDocument(doc);
  return doc;
}

function useFreeformLayout<TDoc extends CapabilityDocument>(doc: TDoc): TDoc {
  doc.settings.layoutMode = "free";
  doc.layout = {
    ...doc.layout,
    mode: "free",
  };
  const activeView = doc.visual.viewsById[doc.visual.activeViewId];
  if (activeView) {
    activeView.layout = {
      ...activeView.layout,
      mode: "free",
    };
  }
  return doc;
}

function parentSubtreeOffsets(
  doc: ReturnType<typeof parentSiblingDocument>,
  ids: string[],
) {
  return Object.fromEntries(
    ids.map((parentId) => {
      const parent = doc.nodesById[parentId]!;
      const child = doc.nodesById[`${parentId}-child`]!;
      return [
        parentId,
        {
          w: parent.w,
          h: parent.h,
          childDx: child.x - parent.x,
          childDy: child.y - parent.y,
        },
      ];
    }),
  );
}

function geometryFor(doc: ReturnType<typeof createSampleDocument>, ids: string[]) {
  return Object.fromEntries(
    ids.map((id) => {
      const node = doc.nodesById[id]!;
      return [id, { x: node.x, y: node.y, w: node.w, h: node.h }];
    }),
  );
}

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
