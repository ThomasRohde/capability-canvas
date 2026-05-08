import { beforeEach, describe, expect, it } from "vitest";
import { applyImportedDocument } from "../importDocument";
import {
  addChild,
  createVisualView,
  deleteVisualView,
  duplicateVisualView,
  deleteNodes,
  moveNodes,
  reparentNode,
  resetVisualViewLayout,
  resetVisualViewFromTemplate,
  resetVisualViewVisibility,
  resizeNode,
  setDefaultVisualView,
  updateNodeSizes,
  updateActiveViewExportSettings,
  updateActiveViewHeatmapSettings,
  updateVisualView,
  updateVisualNodeState,
} from "../../domain/commands/operations";
import type { Transaction } from "../../domain/commands/types";
import {
  createEmptyDocument,
  createNode,
} from "../../domain/document/defaults";
import { createSampleDocument } from "../../domain/fixtures/sample";
import { parseDocument } from "../../domain/document/parse";
import {
  childrenOf,
  ROOT_PARENT_ID,
  type CapabilityDocument,
} from "../../domain/document/types";
import { findParentContainmentViolations } from "../../domain/layout/containment";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import {
  viewChangeSummary,
  viewHashes,
} from "../../domain/visual/viewChanges";
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
      saveStatus: "idle",
      lastSavedAt: undefined,
      lastSaveError: undefined,
      dirtySince: undefined,
      lastRestoredAt: undefined,
      revision: 0,
      lastDiagnostics: [],
      isAutoLayoutRunning: false,
    });
  });

  it("hydrates restored documents without dirty state or undo history", () => {
    const restored = createSampleDocument();
    restored.title = "Saved local draft";

    useDocumentStore.getState().hydrateDocument(restored);

    expect(useDocumentStore.getState().doc.title).toBe("Saved local draft");
    expect(useDocumentStore.getState().past).toHaveLength(0);
    expect(useDocumentStore.getState().future).toHaveLength(0);
    expect(useDocumentStore.getState().dirty).toBe(false);
    expect(useDocumentStore.getState().saveStatus).toBe("idle");
    expect(useDocumentStore.getState().lastRestoredAt).toBeDefined();

    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().doc.title).toBe("Saved local draft");
  });

  it("tracks save lifecycle and ignores stale save completions", () => {
    useDocumentStore
      .getState()
      .setActiveViewViewport({ x: 12, y: 24, zoom: 1.1 });
    const firstRevision = useDocumentStore.getState().revision;

    useDocumentStore.getState().markSaveStarted(firstRevision);
    expect(useDocumentStore.getState().saveStatus).toBe("saving");

    useDocumentStore
      .getState()
      .setActiveViewViewport({ x: 16, y: 24, zoom: 1.1 });
    expect(useDocumentStore.getState().revision).toBeGreaterThan(firstRevision);

    useDocumentStore.getState().markSaveSucceeded(firstRevision);
    expect(useDocumentStore.getState().dirty).toBe(true);
    expect(useDocumentStore.getState().saveStatus).toBe("dirty");

    const currentRevision = useDocumentStore.getState().revision;
    useDocumentStore.getState().markSaveStarted(currentRevision);
    useDocumentStore.getState().markSaveSucceeded(currentRevision);
    expect(useDocumentStore.getState().dirty).toBe(false);
    expect(useDocumentStore.getState().saveStatus).toBe("saved");
    expect(useDocumentStore.getState().lastSavedAt).toBeDefined();
  });

  it("surfaces current save failures as error status and diagnostics", () => {
    useDocumentStore
      .getState()
      .setActiveViewViewport({ x: 12, y: 24, zoom: 1.1 });
    const revision = useDocumentStore.getState().revision;

    useDocumentStore.getState().markSaveStarted(revision);
    useDocumentStore
      .getState()
      .markSaveFailed(revision, new Error("Quota exceeded"));

    expect(useDocumentStore.getState().dirty).toBe(true);
    expect(useDocumentStore.getState().saveStatus).toBe("error");
    expect(useDocumentStore.getState().lastSaveError).toBe("Quota exceeded");
    expect(
      useDocumentStore
        .getState()
        .lastDiagnostics.some(
          (diagnostic) => diagnostic.code === "save-failed",
        ),
    ).toBe(true);
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
      geometrySnapshot(resolveVisualDocument(useDocumentStore.getState().doc), ids),
    ).not.toEqual(before);

    useDocumentStore.getState().undo();
    expect(
      geometrySnapshot(resolveVisualDocument(useDocumentStore.getState().doc), ids),
    ).toEqual(before);
  });

  it("undoes a bulk size edit in one step", () => {
    useDocumentStore.setState({
      doc: createSampleDocument(),
      past: [],
      future: [],
      dirty: false,
      lastDiagnostics: [],
      isAutoLayoutRunning: false,
    });
    const nodeIds = ["credit-risk", "fraud-risk", "operational-risk"];
    const before = geometrySnapshot(useDocumentStore.getState().doc, nodeIds);

    useDocumentStore.getState().execute(updateNodeSizes(nodeIds, { w: 156 }));

    expect(useDocumentStore.getState().past).toHaveLength(1);
    for (const nodeId of nodeIds) {
      expect(useDocumentStore.getState().doc.nodesById[nodeId]!.w).toBe(156);
    }

    useDocumentStore.getState().undo();
    expect(geometrySnapshot(useDocumentStore.getState().doc, nodeIds)).toEqual(
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
      findParentContainmentViolations(
        resolveVisualDocument(useDocumentStore.getState().doc),
      ),
    ).toEqual([]);

    useDocumentStore.getState().undo();
    expect(
      findParentContainmentViolations(
        resolveVisualDocument(useDocumentStore.getState().doc),
      ),
    ).toEqual(["root->child"]);
  });

  it("switches active views without adding undo history", () => {
    useDocumentStore.getState().execute(createVisualView({ name: "Second view" }));
    const stateAfterCreate = useDocumentStore.getState();
    const firstViewId = stateAfterCreate.doc.visual.defaultViewId;
    const secondViewId = stateAfterCreate.doc.visual.activeViewId;
    const historyLength = stateAfterCreate.past.length;

    useDocumentStore.getState().setActiveVisualView(firstViewId);

    expect(useDocumentStore.getState().doc.visual.activeViewId).toBe(firstViewId);
    expect(useDocumentStore.getState().past).toHaveLength(historyLength);

    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().doc.visual.viewsById[secondViewId]).toBeUndefined();
  });

  it("stores heatmap display settings on the active view only", () => {
    const firstViewId = useDocumentStore.getState().doc.visual.activeViewId;
    useDocumentStore.getState().execute(createVisualView({ name: "Second view" }));
    const secondViewId = useDocumentStore.getState().doc.visual.activeViewId;

    useDocumentStore
      .getState()
      .execute(updateActiveViewHeatmapSettings({ enabled: true }));

    const { viewsById } = useDocumentStore.getState().doc.visual;
    expect(viewsById[secondViewId]?.heatmap.enabled).toBe(true);
    expect(viewsById[firstViewId]?.heatmap.enabled).toBe(false);
  });

  it("stores export defaults on the active view only", () => {
    const firstViewId = useDocumentStore.getState().doc.visual.activeViewId;
    useDocumentStore.getState().execute(createVisualView({ name: "Second view" }));
    const secondViewId = useDocumentStore.getState().doc.visual.activeViewId;

    useDocumentStore
      .getState()
      .execute(updateActiveViewExportSettings({ pagePreset: "16:9" }));

    const { viewsById } = useDocumentStore.getState().doc.visual;
    expect(viewsById[secondViewId]?.export.pagePreset).toBe("16:9");
    expect(viewsById[firstViewId]?.export.pagePreset).toBeUndefined();
  });

  it("duplicates visual state without changing the source hierarchy", () => {
    useDocumentStore.getState().reset();
    const sourceId = useDocumentStore.getState().doc.visual.activeViewId;
    const sourceNodes = useDocumentStore.getState().doc.nodesById;
    const sourceChildren = useDocumentStore.getState().doc.childrenByParentId;
    const sourceView = useDocumentStore.getState().doc.visual.viewsById[sourceId]!;

    useDocumentStore.getState().execute(
      updateVisualView(sourceId, {
        viewport: { x: 24, y: -16, zoom: 1.25 },
        heatmap: { ...sourceView.heatmap, enabled: true, showLegend: true },
        export: { pagePreset: "16:9", showTitle: true },
        nodeStatesById: {
          ...sourceView.nodeStatesById,
          operations: {
            ...(sourceView.nodeStatesById.operations ?? {}),
            isCollapsed: true,
          },
          risk: {
            ...(sourceView.nodeStatesById.risk ?? {}),
            x: 888,
            isOnCanvas: false,
          },
        },
      }),
    );

    useDocumentStore.getState().execute(duplicateVisualView(sourceId));
    const firstCopyId = useDocumentStore.getState().doc.visual.activeViewId;
    useDocumentStore.getState().execute(duplicateVisualView(sourceId));
    const secondCopyId = useDocumentStore.getState().doc.visual.activeViewId;
    const doc = useDocumentStore.getState().doc;
    const updatedSource = doc.visual.viewsById[sourceId]!;
    const firstCopy = doc.visual.viewsById[firstCopyId]!;
    const secondCopy = doc.visual.viewsById[secondCopyId]!;

    expect(doc.nodesById).toEqual(sourceNodes);
    expect(doc.childrenByParentId).toEqual(sourceChildren);
    expect(firstCopy.nodeStatesById).toEqual(updatedSource.nodeStatesById);
    expect(firstCopy.viewport).toEqual(updatedSource.viewport);
    expect(firstCopy.heatmap).toEqual(updatedSource.heatmap);
    expect(firstCopy.export).toEqual(updatedSource.export);
    expect(firstCopy.layout).toEqual(updatedSource.layout);
    expect(firstCopy.name).toBe(`${updatedSource.name} copy`);
    expect(secondCopy.name).toBe(`${updatedSource.name} copy 2`);
    expect(firstCopy.baseline).toBeDefined();
    expect(secondCopy.baseline).toBeDefined();
  });

  it("keeps visual workspace valid when deleting non-active, active, and default views", () => {
    useDocumentStore.getState().reset();
    const defaultId = useDocumentStore.getState().doc.visual.activeViewId;
    useDocumentStore.getState().execute(createVisualView({ name: "Second" }));
    const secondId = useDocumentStore.getState().doc.visual.activeViewId;
    useDocumentStore.getState().execute(createVisualView({ name: "Third" }));
    const thirdId = useDocumentStore.getState().doc.visual.activeViewId;

    useDocumentStore.getState().execute(deleteVisualView(secondId));
    let visual = useDocumentStore.getState().doc.visual;
    expect(visual.viewsById[secondId]).toBeUndefined();
    expect(visual.activeViewId).toBe(thirdId);
    expect(visual.defaultViewId).toBe(defaultId);
    expect(visual.viewOrder).not.toContain(secondId);

    useDocumentStore.getState().execute(deleteVisualView(thirdId));
    visual = useDocumentStore.getState().doc.visual;
    expect(visual.viewsById[visual.activeViewId]).toBeDefined();
    expect(visual.viewsById[visual.defaultViewId]).toBeDefined();
    expect(visual.activeViewId).toBe(defaultId);

    useDocumentStore.getState().execute(createVisualView({ name: "Fourth" }));
    const fourthId = useDocumentStore.getState().doc.visual.activeViewId;
    useDocumentStore.getState().execute(setDefaultVisualView(fourthId));
    useDocumentStore.getState().execute(deleteVisualView(fourthId));
    visual = useDocumentStore.getState().doc.visual;
    expect(visual.viewsById[fourthId]).toBeUndefined();
    expect(visual.viewsById[visual.activeViewId]).toBeDefined();
    expect(visual.viewsById[visual.defaultViewId]).toBeDefined();
    expect(visual.viewOrder).toHaveLength(1);
  });

  it("prevents deleting the last visual view", () => {
    useDocumentStore.getState().reset();
    const onlyViewId = useDocumentStore.getState().doc.visual.activeViewId;
    const diagnostics = useDocumentStore
      .getState()
      .execute(deleteVisualView(onlyViewId));

    expect(diagnostics.some((diagnostic) => diagnostic.code === "delete-last-view"))
      .toBe(true);
    expect(useDocumentStore.getState().doc.visual.viewOrder).toEqual([
      onlyViewId,
    ]);
  });

  it("resets visibility and collapse while preserving layout and view settings", () => {
    useDocumentStore.getState().reset();
    const viewId = useDocumentStore.getState().doc.visual.activeViewId;
    const view = useDocumentStore.getState().doc.visual.viewsById[viewId]!;
    useDocumentStore.getState().execute(
      updateVisualView(viewId, {
        viewport: { x: 12, y: 18, zoom: 1.4 },
        heatmap: { ...view.heatmap, enabled: true, showLegend: true },
        export: { pagePreset: "16:9", showFooter: true },
        nodeStatesById: {
          ...view.nodeStatesById,
          operations: {
            ...(view.nodeStatesById.operations ?? {}),
            isCollapsed: true,
          },
          risk: {
            ...(view.nodeStatesById.risk ?? {}),
            x: 777,
            y: 333,
            isOnCanvas: false,
          },
        },
      }),
    );
    const before = useDocumentStore.getState().doc;

    useDocumentStore.getState().execute(resetVisualViewVisibility(viewId));

    const after = useDocumentStore.getState().doc;
    const afterView = after.visual.viewsById[viewId]!;
    expect(after.nodesById).toEqual(before.nodesById);
    expect(after.childrenByParentId).toEqual(before.childrenByParentId);
    expect(afterView.nodeStatesById.operations?.isCollapsed).toBeUndefined();
    expect(afterView.nodeStatesById.risk?.isOnCanvas).toBe(true);
    expect(afterView.nodeStatesById.risk?.x).toBe(777);
    expect(afterView.nodeStatesById.risk?.y).toBe(333);
    expect(afterView.viewport).toEqual({ x: 12, y: 18, zoom: 1.4 });
    expect(afterView.heatmap).toMatchObject({ enabled: true, showLegend: true });
    expect(afterView.export).toMatchObject({
      pagePreset: "16:9",
      showFooter: true,
    });
  });

  it("keeps movement isolated to the active visual view", () => {
    const firstViewId = useDocumentStore.getState().doc.visual.activeViewId;
    const beforeFirstState =
      useDocumentStore.getState().doc.visual.viewsById[firstViewId]!
        .nodeStatesById.servicing?.x;
    useDocumentStore.getState().execute(createVisualView({ name: "Second view" }));
    const secondViewId = useDocumentStore.getState().doc.visual.activeViewId;

    useDocumentStore.getState().execute(moveNodes(["servicing"], 80, 0));

    const afterDoc = useDocumentStore.getState().doc;
    const movedSecond =
      afterDoc.visual.viewsById[secondViewId]!.nodeStatesById.servicing?.x;
    const unchangedFirst =
      afterDoc.visual.viewsById[firstViewId]!.nodeStatesById.servicing?.x;
    expect(movedSecond).toBeGreaterThan(beforeFirstState ?? Number.NEGATIVE_INFINITY);
    expect(unchangedFirst).toBe(beforeFirstState);
  });

  it("preserves user-arranged positions per active visual view", async () => {
    const viewId = useDocumentStore.getState().doc.visual.activeViewId;

    useDocumentStore.getState().execute(moveNodes(["risk"], 40, 0));
    const moved = resolveVisualDocument(useDocumentStore.getState().doc);
    const movedX = moved.nodesById.risk!.x;

    expect(
      useDocumentStore.getState().doc.visual.viewsById[viewId]!.layout
        .isUserArranged,
    ).toBe(true);

    await useDocumentStore.getState().autoLayout(false);

    const after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(after.nodesById.risk!.x).toBe(movedX);
    expect(
      useDocumentStore
        .getState()
        .lastDiagnostics.some(
          (diagnostic) => diagnostic.code === "positions-preserved",
        ),
    ).toBe(true);
  });

  it("clears active-view isUserArranged after forced auto layout", async () => {
    const viewId = useDocumentStore.getState().doc.visual.activeViewId;

    useDocumentStore.getState().execute(moveNodes(["risk"], 40, 0));
    await useDocumentStore.getState().autoLayout(true);

    const state = useDocumentStore.getState();
    expect(state.doc.visual.viewsById[viewId]!.layout.isUserArranged).toBe(
      false,
    );
    expect(resolveVisualDocument(state.doc).layout.isUserArranged).toBe(false);
  });

  it("re-lays out template resets on the targeted view only", async () => {
    useDocumentStore.setState({
      doc: createSampleDocument(),
      past: [],
      future: [],
      dirty: false,
      lastDiagnostics: [],
      isAutoLayoutRunning: false,
    });
    const defaultViewId = useDocumentStore.getState().doc.visual.activeViewId;
    const defaultRootBefore = resolveVisualDocument(
      useDocumentStore.getState().doc,
      defaultViewId,
    ).nodesById["retail-banking"]!.x;
    useDocumentStore
      .getState()
      .execute(
        updateVisualNodeState(defaultViewId, "retail-banking", {
          x: defaultRootBefore + 80,
        }),
      );
    const defaultRootMoved = resolveVisualDocument(
      useDocumentStore.getState().doc,
      defaultViewId,
    ).nodesById["retail-banking"]!.x;

    useDocumentStore
      .getState()
      .execute(createVisualView({ templateId: "executive-overview@1" }));
    await waitForStoreRelayout();
    const executiveViewId = useDocumentStore.getState().doc.visual.activeViewId;

    useDocumentStore.getState().execute(moveNodes(["risk"], 80, 0));
    const activeRiskX = resolveVisualDocument(
      useDocumentStore.getState().doc,
    ).nodesById.risk!.x;

    useDocumentStore
      .getState()
      .execute(
        resetVisualViewFromTemplate(defaultViewId, "full-model-default@1"),
      );
    await waitForStoreRelayout();

    const after = useDocumentStore.getState().doc;
    expect(after.visual.activeViewId).toBe(executiveViewId);
    expect(resolveVisualDocument(after).nodesById.risk!.x).toBe(activeRiskX);
    expect(
      resolveVisualDocument(after, defaultViewId).nodesById["retail-banking"]!.x,
    ).not.toBe(defaultRootMoved);
    expect(
      findParentContainmentViolations(resolveVisualDocument(after, defaultViewId)),
    ).toEqual([]);
  });

  it("auto-lays out depth-limited template endpoints as leaves", async () => {
    useDocumentStore
      .getState()
      .execute(createVisualView({ templateId: "level-1-map@1" }));
    await waitForStoreRelayout();

    const doc = useDocumentStore.getState().doc;
    const resolved = resolveVisualDocument(doc);
    expect(resolved.nodesById.root?.type).toBe("root");
    expect(resolved.nodesById.servicing?.type).toBe("leaf");
    expect(resolved.nodesById["account-management"]?.isOnCanvas).toBe(false);
    expect(resolved.nodesById.servicing!.w).toBeLessThanOrEqual(
      doc.settings.fixedLeafWidth + doc.settings.gridSize,
    );
    expect(resolved.nodesById.servicing!.h).toBeLessThanOrEqual(
      doc.settings.fixedLeafHeight + doc.settings.gridSize,
    );
  });

  it("auto-lays out collapsed and expanded containers in the active view", async () => {
    const viewId = useDocumentStore.getState().doc.visual.activeViewId;
    await useDocumentStore.getState().autoLayout(true);
    const expandedBefore = resolveVisualDocument(
      useDocumentStore.getState().doc,
    ).nodesById.operations!;

    useDocumentStore
      .getState()
      .execute(updateVisualNodeState(viewId, "operations", { isCollapsed: true }));
    await waitForStoreRelayout();

    let doc = useDocumentStore.getState().doc;
    let resolved = resolveVisualDocument(doc);
    expect(resolved.childrenByParentId.operations).toEqual([]);
    expect(resolved.nodesById.operations!.type).toBe("leaf");
    expect(resolved.nodesById.operations!.w).toBeLessThan(expandedBefore.w);
    expect(resolved.nodesById.operations!.h).toBeLessThanOrEqual(
      expandedBefore.h,
    );
    expect(resolved.nodesById.operations!.w).toBeLessThanOrEqual(
      doc.settings.fixedLeafWidth + doc.settings.gridSize,
    );
    expect(resolved.nodesById.operations!.h).toBeLessThanOrEqual(
      doc.settings.fixedLeafHeight + doc.settings.gridSize,
    );
    expect(resolved.nodesById["process-management"]?.isOnCanvas).toBe(false);
    expect(
      doc.visual.viewsById[viewId]!.nodeStatesById["process-management"]
        ?.isOnCanvas,
    ).not.toBe(false);

    useDocumentStore
      .getState()
      .execute(updateVisualNodeState(viewId, "operations", { isCollapsed: false }));
    await waitForStoreRelayout();

    doc = useDocumentStore.getState().doc;
    resolved = resolveVisualDocument(doc);
    expect(resolved.childrenByParentId.operations).toEqual([
      "process-management",
      "data-management",
      "technology-operations",
      "vendor-management",
    ]);
    expect(resolved.nodesById["process-management"]?.isOnCanvas).toBe(true);
    expectChildrenInsideParent(resolved, "operations", [
      "process-management",
      "data-management",
      "technology-operations",
      "vendor-management",
    ]);
    expect(findParentContainmentViolations(resolved)).toEqual([]);
  });

  it("resets a full view to its template baseline in one undoable step", async () => {
    useDocumentStore
      .getState()
      .execute(createVisualView({ templateId: "level-1-map@1" }));
    await waitForStoreRelayout();
    const viewId = useDocumentStore.getState().doc.visual.activeViewId;

    useDocumentStore
      .getState()
      .execute(updateVisualView(viewId, { export: { pagePreset: "16:9" } }));
    expect(viewChangeSummary(useDocumentStore.getState().doc, viewId))
      .toMatchObject({ fullChanged: true, layoutChanged: false });
    const historyBeforeReset = useDocumentStore.getState().past.length;

    useDocumentStore
      .getState()
      .execute(resetVisualViewFromTemplate(viewId, "level-1-map@1"));
    await waitForStoreRelayout();

    let doc = useDocumentStore.getState().doc;
    expect(viewChangeSummary(doc, viewId)).toMatchObject({
      fullChanged: false,
      layoutChanged: false,
    });
    expect(doc.visual.viewsById[viewId]?.export.pagePreset).toBeUndefined();
    expect(useDocumentStore.getState().past).toHaveLength(
      historyBeforeReset + 1,
    );

    useDocumentStore.getState().undo();
    doc = useDocumentStore.getState().doc;
    expect(doc.visual.viewsById[viewId]?.export.pagePreset).toBe("16:9");
    expect(useDocumentStore.getState().past).toHaveLength(historyBeforeReset);
  });

  it("resets layout only while preserving non-layout view state", async () => {
    const viewId = useDocumentStore.getState().doc.visual.activeViewId;
    useDocumentStore
      .getState()
      .execute(updateVisualNodeState(viewId, "operations", { isCollapsed: true }));
    await waitForStoreRelayout();
    useDocumentStore
      .getState()
      .execute(updateActiveViewHeatmapSettings({ enabled: true, showLegend: true }));
    useDocumentStore
      .getState()
      .execute(updateVisualView(viewId, { export: { pagePreset: "16:9" } }));
    useDocumentStore
      .getState()
      .execute(
        updateVisualNodeState(viewId, "risk", { x: 999, isOnCanvas: false }),
      );
    const movedX =
      useDocumentStore.getState().doc.visual.viewsById[viewId]!
        .nodeStatesById.risk?.x;
    const historyBeforeReset = useDocumentStore.getState().past.length;

    useDocumentStore.getState().execute(resetVisualViewLayout(viewId));
    await waitForStoreRelayout();

    let doc = useDocumentStore.getState().doc;
    let view = doc.visual.viewsById[viewId]!;
    expect(view.nodeStatesById.risk?.x).not.toBe(movedX);
    expect(view.nodeStatesById.operations?.isCollapsed).toBe(true);
    expect(view.nodeStatesById.risk?.isOnCanvas).toBe(false);
    expect(view.heatmap).toMatchObject({ enabled: true, showLegend: true });
    expect(view.export).toMatchObject({ pagePreset: "16:9" });
    expect(viewChangeSummary(doc, viewId)).toMatchObject({
      fullChanged: true,
      layoutChanged: false,
    });
    expect(useDocumentStore.getState().past).toHaveLength(
      historyBeforeReset + 1,
    );

    useDocumentStore.getState().undo();
    doc = useDocumentStore.getState().doc;
    view = doc.visual.viewsById[viewId]!;
    expect(view.nodeStatesById.risk?.x).toBe(movedX);
    expect(view.nodeStatesById.operations?.isCollapsed).toBe(true);
    expect(useDocumentStore.getState().past).toHaveLength(historyBeforeReset);
  });

  it("stores current baseline hashes after template create and reset relayout", async () => {
    useDocumentStore
      .getState()
      .execute(createVisualView({ templateId: "executive-overview@1" }));
    await waitForStoreRelayout();

    const viewId = useDocumentStore.getState().doc.visual.activeViewId;
    let view = useDocumentStore.getState().doc.visual.viewsById[viewId]!;
    expect(view.baseline).toEqual(viewHashes(view));

    useDocumentStore
      .getState()
      .execute(updateVisualNodeState(viewId, "risk", { isOnCanvas: true }));
    useDocumentStore
      .getState()
      .execute(resetVisualViewFromTemplate(viewId, "executive-overview@1"));
    await waitForStoreRelayout();

    view = useDocumentStore.getState().doc.visual.viewsById[viewId]!;
    expect(view.baseline).toEqual(viewHashes(view));
    expect(viewChangeSummary(useDocumentStore.getState().doc, viewId))
      .toMatchObject({ fullChanged: false, layoutChanged: false });
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

function expectChildrenInsideParent(
  doc: CapabilityDocument,
  parentId: string,
  childIds: string[],
) {
  const parent = doc.nodesById[parentId]!;
  for (const childId of childIds) {
    const child = doc.nodesById[childId]!;
    expect(child.x).toBeGreaterThanOrEqual(parent.x);
    expect(child.y).toBeGreaterThanOrEqual(parent.y);
    expect(child.x + child.w).toBeLessThanOrEqual(parent.x + parent.w);
    expect(child.y + child.h).toBeLessThanOrEqual(parent.y + parent.h);
  }
}

async function waitForStoreRelayout() {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
