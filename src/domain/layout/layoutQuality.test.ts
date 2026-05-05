import { describe, expect, it } from "vitest";
import { createEmptyDocument, createNode } from "../document/defaults";
import {
  childrenOf,
  ROOT_PARENT_ID,
  type CapabilityDocument,
} from "../document/types";
import {
  createSampleDocument,
  createThousandNodeDocument,
} from "../fixtures/sample";
import { ensureParentContainment } from "./containment";
import { applyLayoutPatches, layoutDocument } from "./engine";
import { evaluateAdaptiveLayoutQuality } from "./layoutQuality";

describe("adaptive layout quality", () => {
  it("scores the sample document with centered, compact sibling rows", async () => {
    const after = await applyAdaptiveLayout(createSampleDocument());
    const quality = evaluateAdaptiveLayoutQuality(after);

    expect(quality.hardViolations).toEqual([]);
    expect(quality.score).toBeGreaterThanOrEqual(90);
    expect(quality.metricsByParentId.risk!.readingOrderInversions).toBe(0);
    expect(
      quality.metricsByParentId.risk!.packingEfficiency,
    ).toBeGreaterThanOrEqual(0.55);
    expect(
      quality.metricsByParentId.risk!.rowWidthCoefficientOfVariation,
    ).toBeLessThanOrEqual(0.35);
    expect(quality.metricsByParentId.risk!.maxRowCenterError).toBeLessThanOrEqual(
      1,
    );
    expect(
      quality.metricsByParentId.operations!.packingEfficiency,
    ).toBeGreaterThanOrEqual(0.55);
    expect(
      quality.metricsByParentId["retail-banking"]!.contentPaddingDifference,
    ).toBeLessThanOrEqual(2);
  });

  it("scores a nested browser-style mixed-size document", async () => {
    const after = await applyAdaptiveLayout(nestedBrowserCase());
    const quality = evaluateAdaptiveLayoutQuality(after);

    expect(quality.hardViolations).toEqual([]);
    expect(quality.score).toBeGreaterThanOrEqual(90);
    expect(
      quality.metricsByParentId.digital!.packingEfficiency,
    ).toBeGreaterThanOrEqual(0.45);
    expect(
      quality.metricsByParentId["retail-banking"]!.readingOrderInversions,
    ).toBe(0);
    expect(
      quality.metricsByParentId.customer!.maxRowCenterError,
    ).toBeLessThanOrEqual(1);
  });

  it("scores a wide sibling and mixed parent case", async () => {
    const after = await applyAdaptiveLayout(wideRootSiblingDocument());
    const quality = evaluateAdaptiveLayoutQuality(after);

    expect(quality.hardViolations).toEqual([]);
    expect(quality.score).toBeGreaterThanOrEqual(90);
    expect(
      quality.metricsByParentId.root!.rowWidthCoefficientOfVariation,
    ).toBeLessThanOrEqual(0.35);
    expect(
      quality.metricsByParentId.operations!.packingEfficiency,
    ).toBeGreaterThanOrEqual(0.55);
    expect(quality.metricsByParentId.root!.readingOrderInversions).toBe(0);
  });

  it("scores an explicit uneven mixed-size hierarchy", async () => {
    const after = await applyAdaptiveLayout(mixedSizeAdaptiveDocument());
    const quality = evaluateAdaptiveLayoutQuality(after);

    expect(quality.hardViolations).toEqual([]);
    expect(quality.score).toBeGreaterThanOrEqual(90);
    expect(quality.metricsByParentId.three!.childCount).toBe(3);
    expect(quality.metricsByParentId.four!.childCount).toBe(4);
    expect(quality.metricsByParentId.seven!.childCount).toBe(7);
    expect(quality.metricsByParentId.deep!.rowCount).toBeGreaterThanOrEqual(1);
    expect(
      quality.metricsByParentId.seven!.packingEfficiency,
    ).toBeGreaterThanOrEqual(0.55);
    expect(
      quality.metricsByParentId.root!.rowWidthCoefficientOfVariation,
    ).toBeLessThanOrEqual(0.35);
    expect(quality.metricsByParentId.root!.readingOrderInversions).toBe(0);
  });

  it("scores the generated thousand-node document within the large-fixture quality gate", async () => {
    const after = await applyAdaptiveLayout(createThousandNodeDocument());
    const quality = evaluateAdaptiveLayoutQuality(after);

    expect(quality.hardViolations).toEqual([]);
    expect(quality.score).toBeGreaterThanOrEqual(85);
    expect(quality.metricsByParentId["root-0-parent-0"]).toMatchObject({
      childCount: 10,
      readingOrderInversions: 0,
    });
    expect(
      quality.metricsByParentId["root-0-parent-0"]!.packingEfficiency,
    ).toBeGreaterThanOrEqual(0.55);
  });
});

async function applyAdaptiveLayout(doc: CapabilityDocument) {
  const result = await layoutDocument({ doc, force: true, mode: "adaptive" });
  return ensureParentContainment(applyLayoutPatches(doc, result.patches)).doc;
}

function nestedBrowserCase() {
  const doc = createSampleDocument();
  doc.layout.preservePositions = false;
  doc.layout.isUserArranged = false;
  doc.settings.fixedLeafHeight = 49;
  doc.settings.containerPaddingTop = 12;
  doc.settings.containerPaddingRight = 32;
  doc.settings.containerPaddingBottom = 24;
  doc.settings.containerPaddingLeft = 32;
  doc.settings.childGapX = 32;
  doc.settings.childGapY = 16;

  doc.nodesById["digital-onboarding"] = {
    ...doc.nodesById["digital-onboarding"]!,
    label: "Browser Tested Capability",
    type: "parent",
    w: 360,
    h: 140,
  };
  doc.nodesById["new-capability"] = createNode({
    id: "new-capability",
    parentId: "digital-onboarding",
    label: "New capability",
    x: 208,
    y: 348,
    w: 168,
    h: 56,
    heatmapValue: 0,
  });
  doc.childrenByParentId["digital-onboarding"] = ["new-capability"];
  doc.childrenByParentId["new-capability"] = [];
  return doc;
}

function wideRootSiblingDocument() {
  const doc = createEmptyDocument();
  doc.layout.preservePositions = false;
  doc.layout.isUserArranged = false;
  doc.settings.fixedLeafWidth = 168;
  doc.settings.fixedLeafHeight = 37;
  doc.settings.defaultParentWidth = 360;
  doc.settings.defaultParentHeight = 140;
  doc.settings.containerPaddingTop = 12;
  doc.settings.containerPaddingRight = 4;
  doc.settings.containerPaddingBottom = 8;
  doc.settings.containerPaddingLeft = 12;
  doc.settings.containerTitleHeight = 28;
  doc.settings.childGapX = 32;
  doc.settings.childGapY = 16;

  doc.nodesById.root = createNode({
    id: "root",
    label: "Retail Banking",
    type: "root",
  });
  doc.nodesById.servicing = createNode({
    id: "servicing",
    parentId: "root",
    label: "Servicing",
    type: "parent",
  });
  doc.nodesById.risk = createNode({
    id: "risk",
    parentId: "root",
    label: "Risk",
    type: "parent",
  });
  doc.nodesById.operations = createNode({
    id: "operations",
    parentId: "root",
    label: "Operations",
    type: "parent",
  });

  for (const id of [
    "account-management",
    "customer-support",
    "communications",
  ]) {
    doc.nodesById[id] = createNode({
      id,
      parentId: "servicing",
      label: id,
      type: "leaf",
    });
  }
  for (const id of ["credit-risk", "fraud-risk", "operational-risk"]) {
    doc.nodesById[id] = createNode({
      id,
      parentId: "risk",
      label: id,
      type: "leaf",
    });
  }
  for (const id of [
    "process-management",
    "data-management",
    "technology-operations",
    "vendor-management",
  ]) {
    doc.nodesById[id] = createNode({
      id,
      parentId: "operations",
      label: id,
      type: "leaf",
    });
  }

  doc.childrenByParentId[ROOT_PARENT_ID] = ["root"];
  doc.childrenByParentId.root = ["servicing", "risk", "operations"];
  doc.childrenByParentId.servicing = [
    "account-management",
    "customer-support",
    "communications",
  ];
  doc.childrenByParentId.risk = [
    "credit-risk",
    "fraud-risk",
    "operational-risk",
  ];
  doc.childrenByParentId.operations = [
    "process-management",
    "data-management",
    "technology-operations",
    "vendor-management",
  ];
  for (const id of Object.keys(doc.nodesById)) doc.childrenByParentId[id] ??= [];
  return doc;
}

function mixedSizeAdaptiveDocument() {
  const doc = createEmptyDocument("Mixed adaptive quality fixture");
  doc.layout.preservePositions = false;
  doc.layout.isUserArranged = false;
  doc.settings.fixedLeafWidth = 164;
  doc.settings.fixedLeafHeight = 46;
  doc.settings.defaultParentWidth = 280;
  doc.settings.defaultParentHeight = 132;
  doc.settings.childGapX = 20;
  doc.settings.childGapY = 14;
  doc.settings.containerPaddingLeft = 14;
  doc.settings.containerPaddingRight = 14;
  doc.settings.containerPaddingTop = 10;
  doc.settings.containerPaddingBottom = 10;
  doc.settings.containerTitleHeight = 30;

  addNode(doc, "root", null, "Root", "root", 420, 220);
  addNode(doc, "three", "root", "Three", "parent", 260, 144);
  addNode(doc, "four", "root", "Four", "parent", 320, 172);
  addNode(doc, "seven", "root", "Seven", "parent", 480, 220);
  addNode(doc, "deep", "seven", "Deep", "parent", 300, 160);

  for (const [index, width, height] of [
    [1, 118, 44],
    [2, 156, 52],
    [3, 132, 48],
  ] as const) {
    addNode(doc, `three-${index}`, "three", `Three ${index}`, "text", width, height);
  }

  for (const [index, width, height] of [
    [1, 124, 44],
    [2, 190, 50],
    [3, 146, 58],
    [4, 170, 46],
  ] as const) {
    addNode(doc, `four-${index}`, "four", `Four ${index}`, "text", width, height);
  }

  for (const [index, width, height] of [
    [1, 154, 46],
    [2, 210, 58],
    [3, 128, 44],
    [4, 188, 62],
    [5, 142, 48],
    [6, 176, 54],
  ] as const) {
    addNode(doc, `seven-${index}`, "seven", `Seven ${index}`, "text", width, height);
  }

  for (const [index, width, height] of [
    [1, 132, 42],
    [2, 172, 48],
    [3, 148, 46],
    [4, 160, 44],
    [5, 136, 50],
  ] as const) {
    addNode(doc, `deep-${index}`, "deep", `Deep ${index}`, "text", width, height);
  }

  doc.childrenByParentId[ROOT_PARENT_ID] = ["root"];
  doc.childrenByParentId.root = ["three", "four", "seven"];
  doc.childrenByParentId.three = ["three-1", "three-2", "three-3"];
  doc.childrenByParentId.four = ["four-1", "four-2", "four-3", "four-4"];
  doc.childrenByParentId.seven = [
    "seven-1",
    "seven-2",
    "seven-3",
    "seven-4",
    "seven-5",
    "seven-6",
    "deep",
  ];
  doc.childrenByParentId.deep = [
    "deep-1",
    "deep-2",
    "deep-3",
    "deep-4",
    "deep-5",
  ];
  for (const nodeId of Object.keys(doc.nodesById))
    doc.childrenByParentId[nodeId] ??= [];
  return doc;
}

function addNode(
  doc: CapabilityDocument,
  id: string,
  parentId: string | null,
  label: string,
  type: "root" | "parent" | "leaf" | "text",
  w: number,
  h: number,
) {
  doc.nodesById[id] = createNode({ id, parentId, label, type, w, h });
  if (parentId) {
    doc.childrenByParentId[parentId] ??= [];
    if (!childrenOf(doc, parentId).includes(id))
      doc.childrenByParentId[parentId]!.push(id);
  }
  doc.childrenByParentId[id] ??= [];
}
