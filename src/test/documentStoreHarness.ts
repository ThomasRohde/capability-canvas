import {
  addChild,
  deleteNodes,
  reparentNode,
  resizeNode,
} from "../domain/commands/operations";
import type { Transaction } from "../domain/commands/types";
import { createEmptyDocument, createNode } from "../domain/document/defaults";
import {
  ROOT_PARENT_ID,
  type CapabilityDocument,
} from "../domain/document/types";
import { useDocumentStore } from "../app/stores/documentStore";

export const SCOPED_RELAYOUT_CASES: Array<[string, () => Transaction]> = [
  ["add", () => addChild("a-group")],
  ["delete", () => deleteNodes(["a-leaf-2"])],
  ["resize", () => resizeNode("a-group", 520, 220)],
  ["reparent", () => reparentNode("a-leaf-2", "root-a")],
];

export function resetDocumentStoreForTests(
  doc: CapabilityDocument = wideRootSiblingDocument(),
) {
  useDocumentStore.setState({
    doc,
    past: [],
    future: [],
    dirty: false,
    saveStatus: "idle",
    lastSavedAt: undefined,
    lastSaveError: undefined,
    dirtySince: undefined,
    lastRestoredAt: undefined,
    revision: 0,
    lastDiagnostics: [],
    isAutoLayoutRunning: false,
  });
}

export function wideRootSiblingDocument(): CapabilityDocument {
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

export function containmentRepairDocument(): CapabilityDocument {
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

export function twoRootRelayoutDocument(): CapabilityDocument {
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

export async function waitForStoreRelayout() {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
