import { beforeEach, describe, expect, it } from "vitest";
import {
  createVisualView,
  deleteVisualView,
  duplicateVisualView,
  moveNodes,
  resetVisualViewLayout,
  resetVisualViewFromTemplate,
  resetVisualViewVisibility,
  setDefaultVisualView,
  updateActiveViewExportSettings,
  updateActiveViewHeatmapSettings,
  updateVisualView,
  updateVisualNodeState,
} from "../../domain/commands/operations";
import { createSampleDocument } from "../../domain/fixtures/sample";
import { findParentContainmentViolations } from "../../domain/layout/containment";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { viewChangeSummary, viewHashes } from "../../domain/visual/viewChanges";
import { expectChildrenInsideParent } from "../../test/documentAssertions";
import {
  resetDocumentStoreForTests,
  waitForStoreRelayout,
} from "../../test/documentStoreHarness";
import { useDocumentStore } from "./documentStore";

describe("document store visual views", () => {
  beforeEach(() => {
    resetDocumentStoreForTests();
  });

  it("switches active views without adding undo history", () => {
    useDocumentStore
      .getState()
      .execute(createVisualView({ name: "Second view" }));
    const stateAfterCreate = useDocumentStore.getState();
    const firstViewId = stateAfterCreate.doc.visual.defaultViewId;
    const secondViewId = stateAfterCreate.doc.visual.activeViewId;
    const historyLength = stateAfterCreate.past.length;

    useDocumentStore.getState().setActiveVisualView(firstViewId);

    expect(useDocumentStore.getState().doc.visual.activeViewId).toBe(
      firstViewId,
    );
    expect(useDocumentStore.getState().past).toHaveLength(historyLength);

    useDocumentStore.getState().undo();
    expect(
      useDocumentStore.getState().doc.visual.viewsById[secondViewId],
    ).toBeUndefined();
  });

  it("stores heatmap display settings on the active view only", () => {
    const firstViewId = useDocumentStore.getState().doc.visual.activeViewId;
    useDocumentStore
      .getState()
      .execute(createVisualView({ name: "Second view" }));
    const secondViewId = useDocumentStore.getState().doc.visual.activeViewId;

    useDocumentStore
      .getState()
      .execute(
        updateActiveViewHeatmapSettings({
          enabled: true,
          showValuePills: false,
        }),
      );

    const { viewsById } = useDocumentStore.getState().doc.visual;
    expect(viewsById[secondViewId]?.heatmap.enabled).toBe(true);
    expect(viewsById[secondViewId]?.heatmap.showValuePills).toBe(false);
    expect(viewsById[firstViewId]?.heatmap.enabled).toBe(false);
    expect(viewsById[firstViewId]?.heatmap.showValuePills).toBe(true);
  });

  it("stores export defaults on the active view only", () => {
    const firstViewId = useDocumentStore.getState().doc.visual.activeViewId;
    useDocumentStore
      .getState()
      .execute(createVisualView({ name: "Second view" }));
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
    const sourceView =
      useDocumentStore.getState().doc.visual.viewsById[sourceId]!;

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

    expect(
      diagnostics.some((diagnostic) => diagnostic.code === "delete-last-view"),
    ).toBe(true);
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
    expect(afterView.heatmap).toMatchObject({
      enabled: true,
      showLegend: true,
    });
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
    useDocumentStore
      .getState()
      .execute(createVisualView({ name: "Second view" }));
    const secondViewId = useDocumentStore.getState().doc.visual.activeViewId;

    useDocumentStore.getState().execute(moveNodes(["servicing"], 80, 0));

    const afterDoc = useDocumentStore.getState().doc;
    const movedSecond =
      afterDoc.visual.viewsById[secondViewId]!.nodeStatesById.servicing?.x;
    const unchangedFirst =
      afterDoc.visual.viewsById[firstViewId]!.nodeStatesById.servicing?.x;
    expect(movedSecond).toBeGreaterThan(
      beforeFirstState ?? Number.NEGATIVE_INFINITY,
    );
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
    useDocumentStore.getState().execute(
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
    const activeRiskX = resolveVisualDocument(useDocumentStore.getState().doc)
      .nodesById.risk!.x;

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
      resolveVisualDocument(after, defaultViewId).nodesById["retail-banking"]!
        .x,
    ).not.toBe(defaultRootMoved);
    expect(
      findParentContainmentViolations(
        resolveVisualDocument(after, defaultViewId),
      ),
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
      .execute(
        updateVisualNodeState(viewId, "operations", { isCollapsed: true }),
      );
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
      .execute(
        updateVisualNodeState(viewId, "operations", { isCollapsed: false }),
      );
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
    expect(
      viewChangeSummary(useDocumentStore.getState().doc, viewId),
    ).toMatchObject({ fullChanged: true, layoutChanged: false });
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
      .execute(
        updateVisualNodeState(viewId, "operations", { isCollapsed: true }),
      );
    await waitForStoreRelayout();
    useDocumentStore
      .getState()
      .execute(
        updateActiveViewHeatmapSettings({ enabled: true, showLegend: true }),
      );
    useDocumentStore
      .getState()
      .execute(updateVisualView(viewId, { export: { pagePreset: "16:9" } }));
    useDocumentStore
      .getState()
      .execute(
        updateVisualNodeState(viewId, "risk", { x: 999, isOnCanvas: false }),
      );
    const movedX =
      useDocumentStore.getState().doc.visual.viewsById[viewId]!.nodeStatesById
        .risk?.x;
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
    expect(
      viewChangeSummary(useDocumentStore.getState().doc, viewId),
    ).toMatchObject({ fullChanged: false, layoutChanged: false });
  });
});
