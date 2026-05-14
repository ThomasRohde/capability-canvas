import { beforeEach, describe, expect, it } from "vitest";
import {
  addSubtreeToCanvas,
  addChild,
  deleteNodes,
  moveNodes,
  moveNodesWithLayoutIntent,
  removeNodesFromCanvas,
  reparentNodeWithLayoutIntent,
  setManualPositioning,
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
import {
  expectChildrenInsideParent,
  geometrySnapshot,
} from "../../test/documentAssertions";
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

  it("groups direct movement and Manual conversion into one undoable history entry", () => {
    const before = resolveVisualDocument(useDocumentStore.getState().doc);
    const beforeX = before.nodesById["credit-risk"]!.x;

    const diagnostics = useDocumentStore
      .getState()
      .execute(
        moveNodesWithLayoutIntent(["credit-risk"], 16, 0, {
          action: "keyboard-nudge",
        }),
      );

    let after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "manual-positioning-enabled-by-move",
        nodeId: "risk",
      }),
    );
    expect(after.nodesById["credit-risk"]!.x).toBe(beforeX + 16);
    expect(after.nodesById.risk!.isManualPositioningEnabled).toBe(true);
    expect(useDocumentStore.getState().past).toHaveLength(1);

    useDocumentStore.getState().undo();
    after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(after.nodesById["credit-risk"]!.x).toBe(beforeX);
    expect(after.nodesById.risk!.isManualPositioningEnabled).toBe(false);

    useDocumentStore.getState().redo();
    after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(after.nodesById["credit-risk"]!.x).toBe(beforeX + 16);
    expect(after.nodesById.risk!.isManualPositioningEnabled).toBe(true);
  });

  it("expands the parent before direct movement switches it to Manual", () => {
    const before = resolveVisualDocument(useDocumentStore.getState().doc);
    const parentBefore = before.nodesById.risk!;
    const childBefore = before.nodesById["credit-risk"]!;
    const dx =
      parentBefore.x + parentBefore.w - (childBefore.x + childBefore.w) + 96;

    useDocumentStore
      .getState()
      .execute(
        moveNodesWithLayoutIntent(["credit-risk"], dx, 0, {
          action: "keyboard-nudge",
        }),
      );

    const after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(after.nodesById.risk!.isManualPositioningEnabled).toBe(true);
    expect(after.nodesById.risk!.w).toBeGreaterThan(parentBefore.w);
    expect(findParentContainmentViolations(after)).toEqual([]);
  });

  it("only converts the moved root node's direct parent during parent movement", () => {
    useDocumentStore
      .getState()
      .execute(moveNodesWithLayoutIntent(["operations"], 8, 0));

    const after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(after.nodesById.root!.isManualPositioningEnabled).toBe(true);
    expect(after.nodesById.operations!.isManualPositioningEnabled).toBe(false);
  });

  it("preserves drag reparent drop position and destination Manual intent in one history entry", () => {
    const before = resolveVisualDocument(useDocumentStore.getState().doc);
    const beforeX = before.nodesById["fraud-risk"]!.x;
    const beforeY = before.nodesById["fraud-risk"]!.y;

    const diagnostics = useDocumentStore
      .getState()
      .execute(reparentNodeWithLayoutIntent("fraud-risk", "operations", 24, 8));

    let after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "manual-positioning-enabled-by-reparent",
        nodeId: "operations",
      }),
    );
    expect(after.nodesById["fraud-risk"]).toMatchObject({
      parentId: "operations",
      x: beforeX + 24,
      y: beforeY + 8,
    });
    expect(after.nodesById.operations!.isManualPositioningEnabled).toBe(true);
    expect(useDocumentStore.getState().past).toHaveLength(1);

    useDocumentStore.getState().undo();
    after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(after.nodesById["fraud-risk"]).toMatchObject({
      parentId: "risk",
      x: beforeX,
      y: beforeY,
    });
    expect(after.nodesById.operations!.isManualPositioningEnabled).toBe(false);

    useDocumentStore.getState().redo();
    after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(after.nodesById["fraud-risk"]).toMatchObject({
      parentId: "operations",
      x: beforeX + 24,
      y: beforeY + 8,
    });
    expect(after.nodesById.operations!.isManualPositioningEnabled).toBe(true);
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

  it("adds a child under an active-view Manual parent without moving siblings", () => {
    useDocumentStore.getState().execute(setManualPositioning("risk", true));
    const before = resolveVisualDocument(useDocumentStore.getState().doc);
    const siblingIds = ["credit-risk", "fraud-risk", "operational-risk"];
    const beforeSiblings = geometrySnapshot(before, siblingIds);
    const historyBefore = useDocumentStore.getState().past.length;

    useDocumentStore.getState().execute(addChild("risk"));

    const after = resolveVisualDocument(useDocumentStore.getState().doc);
    const childIds = childrenOf(after, "risk");
    const newChildId = childIds.find((id) => !siblingIds.includes(id));
    expect(newChildId).toBeDefined();
    expect(geometrySnapshot(after, siblingIds)).toEqual(beforeSiblings);
    expect(overlaps(after.nodesById[newChildId!]!, after.nodesById["credit-risk"]!)).toBe(
      false,
    );
    expectChildrenInsideParent(after, "risk", [newChildId!]);
    expect(useDocumentStore.getState().past).toHaveLength(historyBefore + 1);

    useDocumentStore.getState().undo();
    expect(
      resolveVisualDocument(useDocumentStore.getState().doc).nodesById[
        newChildId!
      ],
    ).toBeUndefined();
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

  it("lays out a subtree added as an active-view root without moving existing roots", async () => {
    resetDocumentStoreForTests(hiddenTopLevelSubtreeDocument());
    const beforeOther = geometrySnapshot(
      resolveVisualDocument(useDocumentStore.getState().doc),
      ["other"],
    );

    useDocumentStore
      .getState()
      .execute(addSubtreeToCanvas("section", { x: 520, y: 220 }));
    await waitForStoreRelayout();

    const state = useDocumentStore.getState();
    const doc = resolveVisualDocument(state.doc);
    const leafA = doc.nodesById["leaf-a"]!;
    const leafB = doc.nodesById["leaf-b"]!;

    expect(geometrySnapshot(doc, ["other"])).toEqual(beforeOther);
    expectChildrenInsideParent(doc, "section", ["leaf-a", "leaf-b"]);
    expect(overlaps(leafA, leafB)).toBe(false);
    expect(
      state.lastDiagnostics.some(
        (diagnostic) => diagnostic.code === "layout-applied",
      ),
    ).toBe(true);
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

function hiddenTopLevelSubtreeDocument(): CapabilityDocument {
  const doc = createEmptyDocument();
  doc.layout.preservePositions = false;
  doc.layout.isUserArranged = false;
  doc.settings.layoutMode = "adaptive";

  doc.nodesById.model = createNode({
    id: "model",
    label: "Source model",
    type: "root",
    isOnCanvas: false,
  });
  doc.nodesById.other = createNode({
    id: "other",
    label: "Other visible root",
    type: "root",
    color: "sky",
    x: 32,
    y: 32,
    w: 220,
    h: 120,
  });
  doc.nodesById.section = createNode({
    id: "section",
    parentId: "model",
    label: "Hidden section",
    type: "parent",
    x: 120,
    y: 120,
    w: 120,
    h: 60,
    isOnCanvas: false,
  });
  for (const id of ["leaf-a", "leaf-b"] as const) {
    doc.nodesById[id] = createNode({
      id,
      parentId: "section",
      label: id,
      x: 128,
      y: 160,
      w: 168,
      h: 48,
      isOnCanvas: false,
    });
    doc.childrenByParentId[id] = [];
  }

  doc.childrenByParentId[ROOT_PARENT_ID] = ["model", "other"];
  doc.childrenByParentId.model = ["section"];
  doc.childrenByParentId.other = [];
  doc.childrenByParentId.section = ["leaf-a", "leaf-b"];
  doc.visual = createVisualWorkspaceFromDocument(doc);
  return doc;
}

function visibleNodeIds(doc: CapabilityDocument): string[] {
  return Object.values(doc.nodesById)
    .filter((node) => node.isOnCanvas)
    .map((node) => node.id);
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}
