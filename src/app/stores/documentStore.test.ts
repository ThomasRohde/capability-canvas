import { beforeEach, describe, expect, it } from "vitest";
import { applyImportedDocument } from "../importDocument";
import { addChild } from "../../domain/commands/operations";
import {
  createEmptyDocument,
  createNode,
} from "../../domain/document/defaults";
import { parseDocument } from "../../domain/document/parse";
import {
  childrenOf,
  type CapabilityDocument,
} from "../../domain/document/types";
import { findParentContainmentViolations } from "../../domain/layout/containment";
import { useDocumentStore } from "./documentStore";

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

  it("runs auto layout after importing documents that do not preserve positions", async () => {
    const parsed = parseDocument([
      { id: "root", name: "Imported Root", parent: null },
      { id: "domain", name: "Imported Domain", parent: "root" },
      { id: "group", name: "Imported Group", parent: "domain" },
      { id: "leaf-a", name: "Imported Leaf A", parent: "group" },
      { id: "leaf-b", name: "Imported Leaf B", parent: "group" },
    ]);
    expect(parsed.doc?.layout.preservePositions).toBe(false);

    applyImportedDocument(parsed, "Import capability list");
    await waitForStoreLayout();

    const doc = useDocumentStore.getState().doc;
    const root = doc.nodesById[childrenOf(doc, null)[0]!]!;
    expect(useDocumentStore.getState().past.at(-1)?.label).toBe("Auto layout");
    expect(root.x).toBeGreaterThanOrEqual(0);
    expect(root.y).toBeGreaterThanOrEqual(0);
    expect(findParentContainmentViolations(doc)).toEqual([]);
  });
});

async function waitForStoreLayout() {
  for (let index = 0; index < 100; index += 1) {
    const state = useDocumentStore.getState();
    if (!state.isAutoLayoutRunning && state.past.at(-1)?.label === "Auto layout")
      return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for auto layout.");
}

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

  doc.childrenByParentId.__root__ = ["root"];
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
