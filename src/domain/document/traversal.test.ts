import { describe, expect, it } from "vitest";
import { moveNodes, runTransaction } from "../commands/operations";
import { createEmptyDocument, createNode } from "./defaults";
import {
  buildSafeChildrenByParentId,
  collectAncestorIds,
  collectDescendantIds,
  computeHierarchyDepths,
  isHierarchyAncestorOf,
  ROOT_PARENT_ID,
  subtreeNodeIds,
  type CapabilityDocument,
} from "./types";
import { sortedNodes } from "./normalize";
import { createSampleDocument } from "../fixtures/sample";
import { descendantsOf, validateDocument } from "../validation/validate";
import { createViewFromTemplate } from "../visual/templates";
import { layoutDocument } from "../layout/engine";

describe("guarded hierarchy traversal", () => {
  it("bounds descendant and subtree traversal when children form a cycle", () => {
    const doc = createCyclicDocument();

    expect(subtreeNodeIds(doc, "a")).toEqual(["a", "b", "c"]);
    expect(descendantsOf(doc, "a")).toEqual(["b", "c"]);

    const traversal = collectDescendantIds(doc, "a", { includeRoot: true });
    expect(traversal.ids).toEqual(["a", "b", "c"]);
    expect(traversal.issues).toContainEqual({
      code: "cycle",
      nodeId: "a",
      parentId: "c",
    });
  });

  it("reports cycles through validation without throwing", () => {
    const doc = createCyclicDocument();

    const validation = validateDocument(doc);

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics.some((diag) => diag.code === "cycle")).toBe(
      true,
    );
  });

  it("returns bounded depths and safe child maps for cyclic documents", () => {
    const doc = createCyclicDocument();

    expect(
      [...computeHierarchyDepths(doc, ["a"]).depths.entries()],
    ).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
    expect(buildSafeChildrenByParentId(doc).childrenByParentId).toMatchObject({
      [ROOT_PARENT_ID]: ["a"],
      a: ["b"],
      b: ["c"],
      c: [],
    });
    expect(sortedNodes(doc).map((node) => node.id)).toEqual(["a", "b", "c"]);
  });

  it("guards ancestor traversal against parent cycles and missing parents", () => {
    const cyclic = createParentCycleDocument();
    const missingParent = createMissingParentDocument();

    expect(collectAncestorIds(cyclic, "a").ids).toEqual(["b"]);
    expect(collectAncestorIds(cyclic, "a").issues).toContainEqual({
      code: "cycle",
      nodeId: "a",
      parentId: "b",
    });
    expect(isHierarchyAncestorOf(cyclic, "b", "a")).toBe(true);
    expect(isHierarchyAncestorOf(cyclic, "a", "b")).toBe(true);

    expect(collectAncestorIds(missingParent, "child").issues).toContainEqual({
      code: "missing-parent",
      nodeId: "child",
      parentId: "missing",
    });
    expect(validateDocument(missingParent).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing-parent", nodeId: "child" }),
      ]),
    );
  });

  it("keeps valid sample traversal order stable", () => {
    const doc = createSampleDocument();

    expect(subtreeNodeIds(doc, "customer")).toEqual([
      "customer",
      "channels",
      "digital",
      "digital-onboarding",
      "digital-servicing",
      "digital-sales",
      "branch",
      "branch-experience",
      "branch-operations",
      "servicing",
      "account-management",
      "customer-support",
      "communications",
    ]);
    expect(descendantsOf(doc, "risk")).toEqual([
      "credit-risk",
      "fraud-risk",
      "operational-risk",
    ]);
  });

  it("keeps template visibility bounded on cyclic documents", () => {
    const doc = createCyclicDocument();

    const view = createViewFromTemplate(doc, {
      id: "cyclic-view",
      templateId: "domain-deep-dive@1",
      context: { rootId: "a" },
    });

    expect(
      Object.entries(view.nodeStatesById)
        .filter(([, state]) => state.isOnCanvas)
        .map(([nodeId]) => nodeId)
        .sort(),
    ).toEqual(["a", "b", "c"]);
  });

  it("rejects command results with invalid hierarchy before containment repair", () => {
    const doc = createCyclicDocument();

    const result = runTransaction(doc, moveNodes(["b"], 8, 0));

    expect(result.doc).toBe(doc);
    expect(result.diagnostics.some((diag) => diag.code === "cycle")).toBe(true);
  });

  it("returns layout diagnostics instead of recursing through cycles", async () => {
    const doc = createCyclicDocument();

    const result = await layoutDocument({ doc, mode: "uniform", force: true });

    expect(
      result.diagnostics.some((diag) => diag.code === "layout-cycle-skipped"),
    ).toBe(true);
  });
});

function createCyclicDocument(): CapabilityDocument {
  const doc = createEmptyDocument("Cyclic graph");
  doc.nodesById.a = createNode({
    id: "a",
    label: "A",
    type: "root",
    parentId: null,
  });
  doc.nodesById.b = createNode({
    id: "b",
    label: "B",
    type: "parent",
    parentId: "a",
  });
  doc.nodesById.c = createNode({
    id: "c",
    label: "C",
    type: "leaf",
    parentId: "b",
  });
  doc.childrenByParentId[ROOT_PARENT_ID] = ["a"];
  doc.childrenByParentId.a = ["b"];
  doc.childrenByParentId.b = ["c"];
  doc.childrenByParentId.c = ["a"];
  return doc;
}

function createParentCycleDocument(): CapabilityDocument {
  const doc = createEmptyDocument("Parent cycle");
  doc.nodesById.a = createNode({
    id: "a",
    label: "A",
    type: "parent",
    parentId: "b",
  });
  doc.nodesById.b = createNode({
    id: "b",
    label: "B",
    type: "parent",
    parentId: "a",
  });
  doc.childrenByParentId[ROOT_PARENT_ID] = [];
  doc.childrenByParentId.a = ["b"];
  doc.childrenByParentId.b = ["a"];
  return doc;
}

function createMissingParentDocument(): CapabilityDocument {
  const doc = createEmptyDocument("Missing parent");
  doc.nodesById.child = createNode({
    id: "child",
    label: "Child",
    parentId: "missing",
  });
  doc.childrenByParentId[ROOT_PARENT_ID] = ["child"];
  doc.childrenByParentId.child = [];
  return doc;
}
