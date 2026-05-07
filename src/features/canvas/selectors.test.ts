import { describe, expect, it } from "vitest";
import { createEmptyDocument, createNode } from "../../domain/document/defaults";
import { ROOT_PARENT_ID, type CapabilityDocument } from "../../domain/document/types";
import { createSampleDocument } from "../../domain/fixtures/sample";
import { computeDepths, createNodeViewModels, descendantIds } from "./selectors";

describe("canvas selectors", () => {
  it("bounds canvas descendants and depths on cyclic documents", () => {
    const doc = createCyclicDocument();

    expect(descendantIds(doc, "a")).toEqual(["b", "c"]);
    expect([...computeDepths(doc).entries()]).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
    expect(createNodeViewModels(doc).map((viewModel) => viewModel.node.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps valid sample canvas ordering stable", () => {
    const doc = createSampleDocument();

    expect(
      createNodeViewModels(doc)
        .slice(0, 5)
        .map((viewModel) => viewModel.node.id),
    ).toEqual([
      "retail-banking",
      "customer",
      "operations",
      "risk",
      "channels",
    ]);
  });
});

function createCyclicDocument(): CapabilityDocument {
  const doc = createEmptyDocument("Cyclic canvas graph");
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
