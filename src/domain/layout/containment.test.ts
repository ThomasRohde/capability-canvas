import { describe, expect, it } from "vitest";
import { runTransaction, addChild, moveNodes } from "../commands/operations";
import { createEmptyDocument, createNode } from "../document/defaults";
import { createSampleDocument } from "../fixtures/sample";
import { ensureParentContainment } from "./containment";
import {
  childrenOf,
  ROOT_PARENT_ID,
  type CapabilityDocument,
  type NodeId,
} from "../document/types";

describe("parent containment", () => {
  it("keeps the sample fixture visually contained", () => {
    const doc = createSampleDocument();
    expect(findContainmentViolations(doc)).toEqual([]);
    expect(findSiblingOverlaps(doc)).toEqual([]);
  });

  it("grows ancestors after commands that place children outside parent bounds", () => {
    const added = runTransaction(
      createSampleDocument(),
      addChild("digital", "Fourth digital capability"),
    ).doc;
    const childId = childrenOf(added, "digital").at(-1)!;
    const moved = runTransaction(added, moveNodes([childId], 520, 0)).doc;
    expect(findContainmentViolations(moved)).toEqual([]);
  });

  it("repairs existing documents without moving children", () => {
    const doc = createSampleDocument();
    const before = doc.nodesById["digital-sales"]!;
    const broken = {
      ...doc,
      nodesById: {
        ...doc.nodesById,
        digital: { ...doc.nodesById.digital!, w: 100, h: 80 },
      },
    };
    const repaired = ensureParentContainment(broken).doc;
    expect(repaired.nodesById["digital-sales"]).toMatchObject({
      x: before.x,
      y: before.y,
      w: before.w,
      h: before.h,
    });
    expect(findContainmentViolations(repaired)).toEqual([]);
  });

  it("uses document padding settings when growing parents", () => {
    const doc = createEmptyDocument();
    doc.settings.containerPaddingTop = 48;
    doc.settings.containerPaddingRight = 28;
    doc.settings.containerPaddingBottom = 36;
    doc.settings.containerPaddingLeft = 20;
    doc.nodesById.root = createNode({
      id: "root",
      label: "Root",
      type: "root",
      x: 50,
      y: 50,
      w: 10,
      h: 10,
    });
    doc.nodesById.child = createNode({
      id: "child",
      label: "Child",
      parentId: "root",
      x: 120,
      y: 140,
      w: 80,
      h: 40,
    });
    doc.childrenByParentId[ROOT_PARENT_ID] = ["root"];
    doc.childrenByParentId.root = ["child"];
    doc.childrenByParentId.child = [];

    const repaired = ensureParentContainment(doc).doc;
    expect(repaired.nodesById.root).toMatchObject({
      x: 50,
      y: 50,
      w: 178,
      h: 166,
    });
  });

  it("does not override manually positioned parent dimensions", () => {
    const doc = createEmptyDocument();
    doc.nodesById.root = createNode({
      id: "root",
      label: "Root",
      type: "root",
      x: 50,
      y: 50,
      w: 100,
      h: 80,
      isManualPositioningEnabled: true,
    });
    doc.nodesById.child = createNode({
      id: "child",
      label: "Child",
      parentId: "root",
      x: 140,
      y: 110,
      w: 120,
      h: 64,
    });
    doc.childrenByParentId[ROOT_PARENT_ID] = ["root"];
    doc.childrenByParentId.root = ["child"];
    doc.childrenByParentId.child = [];

    const repaired = ensureParentContainment(doc);

    expect(repaired.changedNodeIds).toEqual([]);
    expect(repaired.doc.nodesById.root).toMatchObject({ w: 100, h: 80 });
  });

  it("ignores hidden canvas children when repairing containment", () => {
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
      label: "Child",
      parentId: "root",
      isOnCanvas: false,
      x: 400,
      y: 400,
      w: 80,
      h: 40,
    });
    doc.childrenByParentId[ROOT_PARENT_ID] = ["root"];
    doc.childrenByParentId.root = ["child"];
    doc.childrenByParentId.child = [];

    const repaired = ensureParentContainment(doc);

    expect(repaired.changedNodeIds).toEqual([]);
    expect(repaired.doc.nodesById.root).toMatchObject({ w: 100, h: 100 });
  });
});

function findContainmentViolations(doc: CapabilityDocument): string[] {
  const out: string[] = [];
  for (const parent of Object.values(doc.nodesById)) {
    for (const childId of childrenOf(doc, parent.id)) {
      const child = doc.nodesById[childId];
      if (!child) continue;
      if (!contains(parent.id, doc, childId))
        out.push(`${parent.id}->${childId}`);
    }
  }
  return out;
}

function contains(
  parentId: NodeId,
  doc: CapabilityDocument,
  childId: NodeId,
): boolean {
  const parent = doc.nodesById[parentId]!;
  const child = doc.nodesById[childId]!;
  return (
    child.x >= parent.x &&
    child.y >= parent.y &&
    child.x + child.w <= parent.x + parent.w &&
    child.y + child.h <= parent.y + parent.h
  );
}

function findSiblingOverlaps(doc: CapabilityDocument): string[] {
  const out: string[] = [];
  for (const parentId of Object.keys(doc.childrenByParentId)) {
    const childIds = childrenOf(
      doc,
      parentId === ROOT_PARENT_ID ? null : parentId,
    );
    for (let a = 0; a < childIds.length; a += 1) {
      for (let b = a + 1; b < childIds.length; b += 1) {
        const first = doc.nodesById[childIds[a]!];
        const second = doc.nodesById[childIds[b]!];
        if (first && second && overlaps(first, second))
          out.push(`${first.id}<->${second.id}`);
      }
    }
  }
  return out;
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}
