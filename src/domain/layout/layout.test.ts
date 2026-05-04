import { describe, expect, it } from "vitest";
import { createEmptyDocument, createNode } from "../document/defaults";
import { runTransaction, updateNode } from "../commands/operations";
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
import { applyLayoutPatches, computeDocumentBounds, layoutDocument } from "./engine";

describe("layout engine", () => {
  it("does not patch locked nodes, even when force bypasses document position preservation", async () => {
    const doc = runTransaction(
      createSampleDocument(),
      updateNode("risk", { isLockedAsIs: true }),
    ).doc;
    const result = await layoutDocument({ doc, force: true, mode: "adaptive" });
    expect(result.patches.find((patch) => patch.id === "risk")).toBeUndefined();
  });

  it("preserves manual child positions under manual parents", async () => {
    const doc = runTransaction(
      createSampleDocument(),
      updateNode("risk", { isManualPositioningEnabled: true }),
    ).doc;
    const result = await layoutDocument({ doc, force: true, mode: "adaptive" });
    const after = applyLayoutPatches(doc, result.patches);
    expect(after.nodesById["credit-risk"]!.x - after.nodesById.risk!.x).toBe(
      doc.nodesById["credit-risk"]!.x - doc.nodesById.risk!.x,
    );
    expect(after.nodesById["credit-risk"]!.y - after.nodesById.risk!.y).toBe(
      doc.nodesById["credit-risk"]!.y - doc.nodesById.risk!.y,
    );
  });

  it("lays out a large fixture within the budget", async () => {
    const doc = createThousandNodeDocument();
    const start = performance.now();
    const result = await layoutDocument({ doc, force: true, mode: "adaptive" });
    const elapsed = performance.now() - start;
    expect(result.patches.length).toBeGreaterThan(900);
    expect(elapsed).toBeLessThan(2500);
  });

  it("uses global padding and gap settings when node preferences are absent", async () => {
    const doc = twoChildDocument();
    doc.settings.containerPaddingLeft = 48;
    doc.settings.containerPaddingTop = 40;
    doc.settings.childGapX = 24;

    const result = await layoutDocument({ doc, force: true, mode: "uniform" });
    expect(
      result.patches.find((patch) => patch.id === "child-a"),
    ).toMatchObject({ x: 72, y: 92 });
    expect(
      result.patches.find((patch) => patch.id === "child-b"),
    ).toMatchObject({ x: 264, y: 92 });
  });

  it("ignores hidden canvas nodes in layout patches and document bounds", async () => {
    const doc = twoChildDocument();
    doc.nodesById["child-b"] = {
      ...doc.nodesById["child-b"]!,
      isOnCanvas: false,
      x: 2000,
      y: 2000,
    };

    const result = await layoutDocument({ doc, force: true, mode: "uniform" });
    const after = applyLayoutPatches(doc, result.patches);
    const bounds = computeDocumentBounds(after);

    expect(result.patches.find((patch) => patch.id === "child-b")).toBeUndefined();
    expect(bounds.x + bounds.w).toBeLessThan(1000);
    expect(bounds.y + bounds.h).toBeLessThan(1000);
  });

  it("keeps configured edge padding when grid is enabled", async () => {
    const doc = twoChildDocument();
    doc.settings.containerPaddingTop = 8;
    doc.settings.containerPaddingRight = 8;
    doc.settings.containerPaddingBottom = 0;
    doc.settings.containerPaddingLeft = 8;
    doc.settings.childGapX = 24;

    const result = await layoutDocument({ doc, force: true, mode: "uniform" });
    const after = applyLayoutPatches(doc, result.patches);
    const root = after.nodesById.root!;
    const children = childrenOf(after, "root").map(
      (id) => after.nodesById[id]!,
    );
    const childLeft = Math.min(...children.map((child) => child.x));
    const childRight = Math.max(...children.map((child) => child.x + child.w));
    const childTop = Math.min(...children.map((child) => child.y));
    const childBottom = Math.max(...children.map((child) => child.y + child.h));

    expect(childLeft - root.x).toBe(8);
    expect(root.x + root.w - childRight).toBeGreaterThanOrEqual(8);
    expect(childTop - root.y).toBe(36);
    expect(root.y + root.h - childBottom).toBeGreaterThanOrEqual(0);
  });

  it("keeps repeated auto layout idempotent with sub-grid padding", async () => {
    const doc = fourChildSubGridPaddingDocument();
    const first = await applyAutoLayoutCycle(doc, "adaptive");
    const second = await applyAutoLayoutCycle(first, "adaptive");
    const third = await applyAutoLayoutCycle(second, "adaptive");

    expect(geometryFor(second)).toEqual(geometryFor(first));
    expect(geometryFor(third)).toEqual(geometryFor(first));
    expect(first.nodesById.root).toMatchObject({ x: 24, y: 24, w: 384, h: 180 });

    const root = first.nodesById.root!;
    const children = childrenOf(first, "root").map((id) => first.nodesById[id]!);
    const childLeft = Math.min(...children.map((child) => child.x));
    const childRight = Math.max(...children.map((child) => child.x + child.w));
    const childTop = Math.min(...children.map((child) => child.y));
    const childBottom = Math.max(...children.map((child) => child.y + child.h));

    expect(childLeft - root.x).toBe(8);
    expect(root.x + root.w - childRight).toBe(8);
    expect(childTop - root.y).toBe(44);
    expect(root.y + root.h - childBottom).toBe(8);
  });

  it("uses the title area setting for the controllable top reserve inside containers", async () => {
    const doc = twoChildDocument();
    doc.settings.containerPaddingTop = 40;
    doc.settings.containerTitleHeight = 8;

    const result = await layoutDocument({ doc, force: true, mode: "uniform" });
    expect(
      result.patches.find((patch) => patch.id === "child-a"),
    ).toMatchObject({ x: 56, y: 72 });
    expect(
      result.patches.find((patch) => patch.id === "child-b"),
    ).toMatchObject({ x: 256, y: 72 });
  });

  it("lets node-specific layout preferences override global spacing settings", async () => {
    const doc = twoChildDocument();
    doc.settings.containerPaddingLeft = 48;
    doc.settings.containerPaddingTop = 40;
    doc.settings.childGapX = 24;
    doc.nodesById.root = {
      ...doc.nodesById.root!,
      layoutPreferences: { marginLeft: 12, marginTop: 16, gapX: 8 },
    };

    const result = await layoutDocument({ doc, force: true, mode: "uniform" });
    expect(
      result.patches.find((patch) => patch.id === "child-a"),
    ).toMatchObject({ x: 36, y: 68 });
    expect(
      result.patches.find((patch) => patch.id === "child-b"),
    ).toMatchObject({ x: 212, y: 68 });
  });

  it("uses ELK packing for the nested browser scenario without containment violations or sibling overlaps", async () => {
    const doc = nestedBrowserCase();
    const result = await layoutDocument({ doc, force: true, mode: "uniform" });
    const after = applyLayoutPatches(doc, result.patches);

    expect(findContainmentViolations(after)).toEqual([]);
    expect(findSiblingOverlaps(after)).toEqual([]);
  });

  it.each(["uniform", "flow", "adaptive"] as const)(
    "sizes parents from actual placed child rectangles in %s mode",
    async (mode) => {
      const doc = wideRootSiblingDocument();
      const result = await layoutDocument({ doc, force: true, mode });
      const afterLayout = applyLayoutPatches(doc, result.patches);
      const afterRepair = ensureParentContainment(afterLayout).doc;

      expect(findContainmentViolations(afterLayout)).toEqual([]);
      expect(findSiblingOverlaps(afterLayout)).toEqual([]);
      expect(findContainmentViolations(afterRepair)).toEqual([]);
    },
  );

  it("moves unpinned siblings around a subtree that contains a locked descendant", async () => {
    const doc = nestedBrowserCase();
    doc.nodesById["digital-servicing"] = {
      ...doc.nodesById["digital-servicing"]!,
      isLockedAsIs: true,
      isManualPositioningEnabled: true,
    };
    doc.nodesById.servicing = {
      ...doc.nodesById.servicing!,
      parentId: "retail-banking",
      x: doc.nodesById.customer!.x + 8,
      y: doc.nodesById.customer!.y + doc.nodesById.customer!.h - 20,
      w: 760,
      h: 188,
    };
    doc.childrenByParentId.customer = ["channels"];
    doc.childrenByParentId["retail-banking"] = [
      "customer",
      "servicing",
      "risk",
      "operations",
    ];

    const result = await layoutDocument({ doc, force: true, mode: "uniform" });
    const after = applyLayoutPatches(doc, result.patches);

    expect(
      result.patches.find((patch) => patch.id === "digital-servicing"),
    ).toBeUndefined();
    expect(findContainmentViolations(after)).toEqual([]);
    expect(findSiblingOverlaps(after)).toEqual([]);
  });

  it("does not shrink anchored parents while preserving configured padding", async () => {
    const doc = anchoredParentDocument();
    const result = await layoutDocument({ doc, force: true, mode: "uniform" });
    const after = applyLayoutPatches(doc, result.patches);
    const root = after.nodesById.root!;
    const children = childrenOf(after, "root").map(
      (id) => after.nodesById[id]!,
    );
    const childRight = Math.max(...children.map((child) => child.x + child.w));
    const childBottom = Math.max(...children.map((child) => child.y + child.h));

    expect(root.w).toBe(1746);
    expect(root.h).toBe(269);
    expect(root.x + root.w - childRight).toBeGreaterThanOrEqual(4);
    expect(root.y + root.h - childBottom).toBeGreaterThanOrEqual(8);
  });

  it("does not shrink manual parents while preserving child positions", async () => {
    const doc = anchoredParentDocument();
    doc.nodesById.root = {
      ...doc.nodesById.root!,
      isManualPositioningEnabled: true,
    };
    for (const id of childrenOf(doc, "root")) {
      doc.nodesById[id] = { ...doc.nodesById[id]!, isLockedAsIs: false };
    }

    const result = await layoutDocument({ doc, force: true, mode: "uniform" });
    const after = applyLayoutPatches(doc, result.patches);

    expect(after.nodesById.root).toMatchObject({ w: 1746, h: 269 });
    expect(after.nodesById.servicing).toMatchObject({
      x: 12,
      y: 40,
      w: 576,
      h: 140,
    });
    expect(after.nodesById.operations).toMatchObject({
      x: 1220,
      y: 40,
      w: 380,
      h: 140,
    });
  });

  it.each(["uniform", "flow", "adaptive"] as const)(
    "produces deterministic %s patches",
    async (mode) => {
      const doc = nestedBrowserCase();
      const first = await layoutDocument({ doc, force: true, mode });
      const second = await layoutDocument({ doc, force: true, mode });
      expect(second.patches).toEqual(first.patches);
    },
  );

  it("returns an informational diagnostic without patches in free mode", async () => {
    const result = await layoutDocument({
      doc: createSampleDocument(),
      force: true,
      mode: "free",
    });
    expect(result.patches).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "free-layout-preserved",
        severity: "info",
      }),
    );
  });

  it("keeps node references for nodes whose patched geometry matches", () => {
    const baseDoc = createSampleDocument();
    const doc = {
      ...baseDoc,
      settings: { ...baseDoc.settings, gridEnabled: false },
    };
    const stableNode = doc.nodesById["digital-onboarding"]!;
    const driftNode = doc.nodesById["fraud-risk"]!;
    const patches = [
      {
        id: stableNode.id,
        x: stableNode.x,
        y: stableNode.y,
        w: stableNode.w,
        h: stableNode.h,
      },
      {
        id: driftNode.id,
        x: driftNode.x + 24,
        y: driftNode.y,
        w: driftNode.w,
        h: driftNode.h,
      },
    ];
    const after = applyLayoutPatches(doc, patches);
    expect(after.nodesById[stableNode.id]).toBe(stableNode);
    expect(after.nodesById[driftNode.id]).not.toBe(driftNode);
    expect(after.nodesById[driftNode.id]!.x).toBe(driftNode.x + 24);
  });

  it("returns the same document reference when every patch is a no-op", () => {
    const doc = createSampleDocument();
    const patches = Object.values(doc.nodesById).map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
    }));
    expect(patches.length).toBeGreaterThan(0);
    const noGridDoc = {
      ...doc,
      settings: { ...doc.settings, gridEnabled: false },
    };
    const after = applyLayoutPatches(noGridDoc, patches);
    expect(after).toBe(noGridDoc);
  });
});

function twoChildDocument() {
  const doc = createEmptyDocument();
  doc.nodesById.root = createNode({
    id: "root",
    label: "Root",
    type: "root",
    w: 300,
    h: 140,
  });
  doc.nodesById["child-a"] = createNode({
    id: "child-a",
    parentId: "root",
    label: "Child A",
  });
  doc.nodesById["child-b"] = createNode({
    id: "child-b",
    parentId: "root",
    label: "Child B",
  });
  doc.childrenByParentId[ROOT_PARENT_ID] = ["root"];
  doc.childrenByParentId.root = ["child-a", "child-b"];
  doc.childrenByParentId["child-a"] = [];
  doc.childrenByParentId["child-b"] = [];
  return doc;
}

function fourChildSubGridPaddingDocument() {
  const doc = createEmptyDocument();
  doc.layout.preservePositions = false;
  doc.layout.isUserArranged = false;
  doc.settings.gridEnabled = true;
  doc.settings.gridSize = 16;
  doc.settings.fixedLeafWidth = 168;
  doc.settings.fixedLeafHeight = 56;
  doc.settings.defaultParentWidth = 200;
  doc.settings.defaultParentHeight = 140;
  doc.settings.containerPaddingTop = 8;
  doc.settings.containerPaddingRight = 8;
  doc.settings.containerPaddingBottom = 8;
  doc.settings.containerPaddingLeft = 8;
  doc.settings.containerTitleHeight = 36;
  doc.settings.childGapX = 32;
  doc.settings.childGapY = 16;

  doc.nodesById.root = createNode({
    id: "root",
    label: "Root",
    type: "root",
    x: 24,
    y: 24,
    w: 704,
    h: 436,
  });
  for (let index = 0; index < 4; index += 1) {
    const id = `child-${index + 1}`;
    doc.nodesById[id] = createNode({
      id,
      parentId: "root",
      label: `Child ${index + 1}`,
    });
    doc.childrenByParentId[id] = [];
  }
  doc.childrenByParentId[ROOT_PARENT_ID] = ["root"];
  doc.childrenByParentId.root = ["child-1", "child-2", "child-3", "child-4"];
  return doc;
}

async function applyAutoLayoutCycle(
  doc: CapabilityDocument,
  mode: "uniform" | "flow" | "adaptive",
) {
  const result = await layoutDocument({ doc, force: true, mode });
  return ensureParentContainment(applyLayoutPatches(doc, result.patches)).doc;
}

function geometryFor(doc: CapabilityDocument) {
  type Geometry = Record<string, { x: number; y: number; w: number; h: number }>;
  const entries: Array<[string, Geometry[string]]> = Object.values(
    doc.nodesById,
  ).map((node) => [
    node.id,
    { x: node.x, y: node.y, w: node.w, h: node.h },
  ]);
  entries.sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries) as Geometry;
}

function nestedBrowserCase() {
  const doc = createSampleDocument();
  doc.layout.preservePositions = false;
  doc.layout.isUserArranged = false;
  doc.settings.layoutMode = "uniform";
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

function anchoredParentDocument() {
  const doc = createEmptyDocument();
  doc.settings.containerPaddingTop = 12;
  doc.settings.containerPaddingRight = 4;
  doc.settings.containerPaddingBottom = 8;
  doc.settings.containerPaddingLeft = 12;
  doc.settings.containerTitleHeight = 28;
  doc.settings.childGapX = 12;
  doc.settings.childGapY = 12;

  doc.nodesById.root = createNode({
    id: "root",
    label: "Root",
    type: "root",
    x: 0,
    y: 0,
    w: 1746,
    h: 269,
  });
  doc.nodesById.servicing = createNode({
    id: "servicing",
    parentId: "root",
    label: "Servicing",
    type: "parent",
    x: 12,
    y: 40,
    w: 576,
    h: 140,
    isLockedAsIs: true,
  });
  doc.nodesById.risk = createNode({
    id: "risk",
    parentId: "root",
    label: "Risk",
    type: "parent",
    x: 616,
    y: 40,
    w: 576,
    h: 140,
    isLockedAsIs: true,
  });
  doc.nodesById.operations = createNode({
    id: "operations",
    parentId: "root",
    label: "Operations",
    type: "parent",
    x: 1220,
    y: 40,
    w: 380,
    h: 140,
    isLockedAsIs: true,
  });
  doc.childrenByParentId[ROOT_PARENT_ID] = ["root"];
  doc.childrenByParentId.root = ["servicing", "risk", "operations"];
  doc.childrenByParentId.servicing = [];
  doc.childrenByParentId.risk = [];
  doc.childrenByParentId.operations = [];
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
  for (const id of [
    "account-management",
    "customer-support",
    "communications",
    "credit-risk",
    "fraud-risk",
    "operational-risk",
    "process-management",
    "data-management",
    "technology-operations",
    "vendor-management",
  ]) {
    doc.childrenByParentId[id] = [];
  }
  return doc;
}

function findContainmentViolations(doc: CapabilityDocument) {
  const violations: string[] = [];
  for (const parent of Object.values(doc.nodesById)) {
    for (const childId of childrenOf(doc, parent.id)) {
      const child = doc.nodesById[childId];
      if (!child) continue;
      if (
        child.x < parent.x ||
        child.y < parent.y ||
        child.x + child.w > parent.x + parent.w ||
        child.y + child.h > parent.y + parent.h
      ) {
        violations.push(`${parent.id} contains ${child.id}`);
      }
    }
  }
  return violations;
}

function findSiblingOverlaps(doc: CapabilityDocument) {
  const overlaps: string[] = [];
  for (const parentId of Object.keys(doc.childrenByParentId)) {
    const siblings = doc.childrenByParentId[parentId]!.map(
      (id) => doc.nodesById[id],
    ).filter(Boolean);
    for (let leftIndex = 0; leftIndex < siblings.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < siblings.length;
        rightIndex += 1
      ) {
        const left = siblings[leftIndex]!;
        const right = siblings[rightIndex]!;
        if (rectanglesOverlap(left, right))
          overlaps.push(`${left.id} overlaps ${right.id}`);
      }
    }
  }
  return overlaps;
}

function rectanglesOverlap(
  left: { x: number; y: number; w: number; h: number },
  right: { x: number; y: number; w: number; h: number },
) {
  return (
    left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y
  );
}
