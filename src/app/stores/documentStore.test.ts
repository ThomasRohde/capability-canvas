import { beforeEach, describe, expect, it } from "vitest";
import { applyImportedDocument } from "../importDocument";
import {
  addChild,
  deleteNodes,
  reparentNode,
  resizeNode,
} from "../../domain/commands/operations";
import type { Transaction } from "../../domain/commands/types";
import {
  createEmptyDocument,
  createNode,
} from "../../domain/document/defaults";
import { parseDocument } from "../../domain/document/parse";
import {
  childrenOf,
  ROOT_PARENT_ID,
  type CapabilityDocument,
} from "../../domain/document/types";
import { findParentContainmentViolations } from "../../domain/layout/containment";
import { useDocumentStore } from "./documentStore";

const SCOPED_RELAYOUT_CASES: Array<[string, () => Transaction]> = [
  ["add", () => addChild("a-group")],
  ["delete", () => deleteNodes(["a-leaf-2"])],
  ["resize", () => resizeNode("a-group", 520, 220)],
  ["reparent", () => reparentNode("a-leaf-2", "root-a")],
];

describe("document store layout settings", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      doc: wideRootSiblingDocument(),
      past: [],
      future: [],
      dirty: false,
      lastDiagnostics: [],
      isAutoLayoutRunning: false,
    });
  });

  it("re-lays out when layout mode changes through the store path", async () => {
    await useDocumentStore
      .getState()
      .updateSettings({ layoutMode: "adaptive" }, { autoLayout: true });
    expect(
      findParentContainmentViolations(useDocumentStore.getState().doc),
    ).toEqual([]);

    await useDocumentStore
      .getState()
      .updateSettings({ layoutMode: "uniform" }, { autoLayout: true });
    const doc = useDocumentStore.getState().doc;

    expect(doc.settings.layoutMode).toBe("uniform");
    expect(doc.layout.mode).toBe("uniform");
    expect(findParentContainmentViolations(doc)).toEqual([]);
    expect(doc.nodesById.operations!.y).toBeGreaterThan(
      doc.nodesById.servicing!.y,
    );
  });

  it("records forced auto layout as an undoable history entry", async () => {
    const ids = Object.keys(useDocumentStore.getState().doc.nodesById);
    const before = geometrySnapshot(useDocumentStore.getState().doc, ids);

    await useDocumentStore.getState().autoLayout(true);

    expect(useDocumentStore.getState().past.at(-1)?.label).toBe("Auto layout");
    expect(geometrySnapshot(useDocumentStore.getState().doc, ids)).not.toEqual(
      before,
    );

    useDocumentStore.getState().undo();
    expect(geometrySnapshot(useDocumentStore.getState().doc, ids)).toEqual(
      before,
    );
  });

  it("re-runs incremental layout for the parent after addChild so the new child is contained", async () => {
    useDocumentStore.getState().execute(addChild("risk"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const doc = useDocumentStore.getState().doc;
    const parent = doc.nodesById.risk!;
    const childIds = childrenOf(doc, "risk");
    const newChildId = childIds.find(
      (id) => !["credit-risk", "fraud-risk", "operational-risk"].includes(id),
    );
    expect(newChildId).toBeDefined();
    const child = doc.nodesById[newChildId!]!;
    expect(child.x).toBeGreaterThanOrEqual(parent.x);
    expect(child.y).toBeGreaterThanOrEqual(parent.y);
    expect(child.x + child.w).toBeLessThanOrEqual(parent.x + parent.w);
    expect(child.y + child.h).toBeLessThanOrEqual(parent.y + parent.h);
  });

  it.each(SCOPED_RELAYOUT_CASES)(
    "keeps unrelated roots stable after scoped %s relayout",
    async (_label, makeTransaction) => {
      useDocumentStore.setState({
        doc: twoRootRelayoutDocument(),
        past: [],
        future: [],
        dirty: false,
        lastDiagnostics: [],
        isAutoLayoutRunning: false,
      });
      const unaffectedIds = ["root-b", "b-group", "b-leaf-1", "b-leaf-2"];
      const before = geometrySnapshot(
        useDocumentStore.getState().doc,
        unaffectedIds,
      );

      useDocumentStore.getState().execute(makeTransaction());
      await waitForStoreRelayout();

      const state = useDocumentStore.getState();
      expect(geometrySnapshot(state.doc, unaffectedIds)).toEqual(before);
      expect(findParentContainmentViolations(state.doc)).toEqual([]);
      expect(
        state.lastDiagnostics.some((diagnostic) =>
          ["layout-applied", "layout-noop"].includes(diagnostic.code),
        ),
      ).toBe(true);
    },
  );

  it("keeps external capability-list imports outline-only without auto layout", async () => {
    const parsed = parseDocument([
      { id: "root", name: "Imported Root", parent: null },
      { id: "domain", name: "Imported Domain", parent: "root" },
      { id: "group", name: "Imported Group", parent: "domain" },
      { id: "leaf-a", name: "Imported Leaf A", parent: "group" },
      { id: "leaf-b", name: "Imported Leaf B", parent: "group" },
    ]);
    expect(parsed.doc?.layout.preservePositions).toBe(false);

    applyImportedDocument(parsed, "Import capability list");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const doc = useDocumentStore.getState().doc;
    const root = doc.nodesById[childrenOf(doc, null)[0]!]!;
    expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
      "Import capability list",
    );
    expect(root.isOnCanvas).toBe(false);
    expect(Object.values(doc.nodesById).every((node) => !node.isOnCanvas)).toBe(
      true,
    );
    expect(useDocumentStore.getState().isAutoLayoutRunning).toBe(false);
    expect(findParentContainmentViolations(doc)).toEqual([]);
  });

  it("records containment repair in undo history", () => {
    useDocumentStore.setState({
      doc: containmentRepairDocument(),
      past: [],
      future: [],
      dirty: false,
      lastDiagnostics: [],
      isAutoLayoutRunning: false,
    });

    useDocumentStore.getState().repairContainment();

    expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
      "Repair containment",
    );
    expect(
      findParentContainmentViolations(useDocumentStore.getState().doc),
    ).toEqual([]);

    useDocumentStore.getState().undo();
    expect(
      findParentContainmentViolations(useDocumentStore.getState().doc),
    ).toEqual(["root->child"]);
  });
});

function wideRootSiblingDocument(): CapabilityDocument {
  const doc = createEmptyDocument();
  doc.layout.preservePositions = false;
  doc.layout.isUserArranged = false;
  doc.settings.layoutMode = "adaptive";
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

function containmentRepairDocument(): CapabilityDocument {
  const doc = createEmptyDocument();
  doc.nodesById.root = createNode({
    id: "root",
    label: "Root",
    type: "root",
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  });
  doc.nodesById.child = createNode({
    id: "child",
    parentId: "root",
    label: "Child",
    x: 160,
    y: 160,
    w: 80,
    h: 40,
  });
  doc.childrenByParentId[ROOT_PARENT_ID] = ["root"];
  doc.childrenByParentId.root = ["child"];
  doc.childrenByParentId.child = [];
  return doc;
}

function twoRootRelayoutDocument(): CapabilityDocument {
  const doc = createEmptyDocument();
  doc.layout.preservePositions = false;
  doc.layout.isUserArranged = false;
  doc.settings.layoutMode = "adaptive";

  for (const rootId of ["root-a", "root-b"] as const) {
    doc.nodesById[rootId] = createNode({
      id: rootId,
      label: rootId,
      type: "root",
      x: rootId === "root-a" ? 0 : 800,
      y: 0,
      w: 500,
      h: 280,
    });
    doc.childrenByParentId[rootId] = [];
  }

  for (const [id, parentId, x] of [
    ["a-group", "root-a", 24],
    ["b-group", "root-b", 824],
  ] as const) {
    doc.nodesById[id] = createNode({
      id,
      parentId,
      label: id,
      type: "parent",
      x,
      y: 48,
      w: 400,
      h: 180,
    });
    doc.childrenByParentId[parentId]!.push(id);
    doc.childrenByParentId[id] = [];
  }

  for (const [id, parentId, x] of [
    ["a-leaf-1", "a-group", 48],
    ["a-leaf-2", "a-group", 220],
    ["b-leaf-1", "b-group", 848],
    ["b-leaf-2", "b-group", 1020],
  ] as const) {
    doc.nodesById[id] = createNode({
      id,
      parentId,
      label: id,
      type: "leaf",
      x,
      y: 112,
      w: 140,
      h: 48,
    });
    doc.childrenByParentId[parentId]!.push(id);
    doc.childrenByParentId[id] = [];
  }

  doc.childrenByParentId[ROOT_PARENT_ID] = ["root-a", "root-b"];
  return doc;
}

function geometrySnapshot(doc: CapabilityDocument, ids: string[]) {
  return Object.fromEntries(
    ids.map((id) => {
      const node = doc.nodesById[id]!;
      return [id, { x: node.x, y: node.y, w: node.w, h: node.h }];
    }),
  );
}

async function waitForStoreRelayout() {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
