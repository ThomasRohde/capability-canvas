import { beforeEach, describe, expect, it } from "vitest";
import {
  addChild,
  deleteNodes,
  moveNodes,
  removeNodesFromCanvas,
} from "../../domain/commands/operations";
import { createEmptyDocument, createNode } from "../../domain/document/defaults";
import {
  childrenOf,
  ROOT_PARENT_ID,
  type CapabilityDocument,
} from "../../domain/document/types";
import { findParentContainmentViolations } from "../../domain/layout/containment";
import {
  createVisualWorkspaceFromDocument,
  resolveVisualDocument,
} from "../../domain/visual/workspace";
import { geometrySnapshot } from "../../test/documentAssertions";
import {
  resetDocumentStoreForTests,
  SCOPED_RELAYOUT_CASES,
  twoRootRelayoutDocument,
  waitForStoreRelayout,
} from "../../test/documentStoreHarness";
import { useDocumentStore } from "./documentStore";

describe("document store layout orchestration", () => {
  beforeEach(() => {
    resetDocumentStoreForTests();
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
    const doc = resolveVisualDocument(useDocumentStore.getState().doc);

    expect(doc.settings.layoutMode).toBe("uniform");
    expect(doc.layout.mode).toBe("uniform");
    expect(findParentContainmentViolations(doc)).toEqual([]);
    expect(doc.nodesById.operations!.y).toBeGreaterThan(
      doc.nodesById.servicing!.y,
    );
    expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
      "Set layout mode to uniform",
    );
  });

  it("records document layout setting changes with a scoped history label", async () => {
    await useDocumentStore
      .getState()
      .updateSettings({ fixedLeafWidth: 180 }, { autoLayout: true });

    expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
      "Update layout settings",
    );
    expect(useDocumentStore.getState().doc.settings.fixedLeafWidth).toBe(180);
  });

  it("records forced auto layout as an undoable history entry", async () => {
    const ids = Object.keys(useDocumentStore.getState().doc.nodesById);
    const before = geometrySnapshot(
      resolveVisualDocument(useDocumentStore.getState().doc),
      ids,
    );

    await useDocumentStore.getState().autoLayout(true);

    expect(useDocumentStore.getState().past.at(-1)?.label).toBe("Auto layout");
    expect(
      geometrySnapshot(
        resolveVisualDocument(useDocumentStore.getState().doc),
        ids,
      ),
    ).not.toEqual(before);

    useDocumentStore.getState().undo();
    expect(
      geometrySnapshot(
        resolveVisualDocument(useDocumentStore.getState().doc),
        ids,
      ),
    ).toEqual(before);
  });

  it("stores balanced aspect-ratio frame metadata after auto layout", async () => {
    await useDocumentStore
      .getState()
      .updateSettings({ layoutMode: "balanced" }, { autoLayout: true });

    const doc = resolveVisualDocument(useDocumentStore.getState().doc);
    const activeView = doc.visual.viewsById[doc.visual.activeViewId]!;

    expect(doc.layout.aspectRatioFrame).toBeDefined();
    expect(doc.layout.aspectRatioTarget).toEqual({ w: 16, h: 9 });
    expect(activeView.layout.aspectRatioFrame).toBeDefined();
    expect(activeView.layout.aspectRatioTarget).toEqual({ w: 16, h: 9 });
  });

  it("clears balanced frame metadata when manual movement marks layout user-arranged", async () => {
    await useDocumentStore
      .getState()
      .updateSettings({ layoutMode: "balanced" }, { autoLayout: true });
    expect(
      resolveVisualDocument(useDocumentStore.getState().doc).layout
        .aspectRatioFrame,
    ).toBeDefined();

    useDocumentStore.getState().execute(moveNodes(["servicing"], 8, 0));
    const doc = resolveVisualDocument(useDocumentStore.getState().doc);

    expect(doc.layout.isUserArranged).toBe(true);
    expect(doc.layout.aspectRatioFrame).toBeUndefined();
    expect(doc.layout.aspectRatioTarget).toBeUndefined();
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

  it("keeps sibling root containers visible after removing one child from the active view", async () => {
    resetDocumentStoreForTests(threeOneChildRootContainers());

    useDocumentStore.getState().execute(removeNodesFromCanvas(["leaf-a"]));
    await waitForStoreRelayout();

    const doc = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(visibleNodeIds(doc)).toEqual([
      "root-a",
      "root-b",
      "leaf-b",
      "root-c",
      "leaf-c",
    ]);
  });

  it("keeps sibling root containers visible after deleting one child from the model", async () => {
    resetDocumentStoreForTests(threeOneChildRootContainers());

    useDocumentStore.getState().execute(deleteNodes(["leaf-a"]));
    await waitForStoreRelayout();

    const doc = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(visibleNodeIds(doc)).toEqual([
      "root-a",
      "root-b",
      "leaf-b",
      "root-c",
      "leaf-c",
    ]);
  });

  it("keeps visible containers when their source ancestor is hidden in the active view", async () => {
    resetDocumentStoreForTests(
      threeOneChildRootContainers({ hiddenCommonAncestor: true }),
    );

    useDocumentStore.getState().execute(removeNodesFromCanvas(["leaf-a"]));
    await waitForStoreRelayout();

    const doc = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(visibleNodeIds(doc)).toEqual([
      "root-a",
      "root-b",
      "leaf-b",
      "root-c",
      "leaf-c",
    ]);
  });
});

function threeOneChildRootContainers(
  options: { hiddenCommonAncestor?: boolean } = {},
): CapabilityDocument {
  const doc = createEmptyDocument();
  doc.layout.preservePositions = false;
  doc.layout.isUserArranged = false;
  doc.settings.layoutMode = "adaptive";

  for (const [index, color] of ["mint", "coral", "sky"].entries()) {
    const suffix = String.fromCharCode("a".charCodeAt(0) + index);
    const rootId = `root-${suffix}`;
    const leafId = `leaf-${suffix}`;
    const x = 48 + index * 260;
    doc.nodesById[rootId] = createNode({
      id: rootId,
      label: "New capability",
      type: "root",
      color: color as never,
      x,
      y: 48,
      w: 220,
      h: 120,
    });
    doc.nodesById[leafId] = createNode({
      id: leafId,
      parentId: rootId,
      label: "New capability",
      type: "leaf",
      x: x + 16,
      y: 104,
      w: 188,
      h: 44,
    });
    doc.childrenByParentId[rootId] = [leafId];
    doc.childrenByParentId[leafId] = [];
  }
  if (options.hiddenCommonAncestor) {
    doc.nodesById.model = createNode({
      id: "model",
      label: "Model",
      type: "root",
      color: "amber",
      x: 0,
      y: 0,
      w: 860,
      h: 240,
    });
    doc.childrenByParentId[ROOT_PARENT_ID] = ["model"];
    doc.childrenByParentId.model = ["root-a", "root-b", "root-c"];
    for (const rootId of ["root-a", "root-b", "root-c"]) {
      doc.nodesById[rootId] = {
        ...doc.nodesById[rootId]!,
        parentId: "model",
        type: "parent",
      };
    }
  } else {
    doc.childrenByParentId[ROOT_PARENT_ID] = ["root-a", "root-b", "root-c"];
  }
  doc.visual = createVisualWorkspaceFromDocument(doc);
  if (options.hiddenCommonAncestor) {
    const view = doc.visual.viewsById[doc.visual.activeViewId]!;
    view.nodeStatesById.model = {
      ...view.nodeStatesById.model,
      isOnCanvas: false,
    };
  }
  return doc;
}

function visibleNodeIds(doc: CapabilityDocument): string[] {
  return Object.values(doc.nodesById)
    .filter((node) => node.isOnCanvas)
    .map((node) => node.id);
}
