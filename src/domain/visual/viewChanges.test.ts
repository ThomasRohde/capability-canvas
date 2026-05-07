import { describe, expect, it } from "vitest";
import {
  createVisualView,
  runTransaction,
  updateActiveViewHeatmapSettings,
  updateVisualNodeState,
  updateVisualView,
} from "../commands/operations";
import { createSampleDocument } from "../fixtures/sample";
import { cloneVisualWorkspace } from "./workspace";
import { viewChangeSummary } from "./viewChanges";

describe("visual view change detection", () => {
  it("treats the populated default view as unchanged", () => {
    const doc = createSampleDocument();
    const summary = viewChangeSummary(doc, doc.visual.activeViewId);

    expect(summary?.fullChanged).toBe(false);
    expect(summary?.layoutChanged).toBe(false);
  });

  it("ignores name, timestamp, and viewport changes", () => {
    const doc = createSampleDocument();
    const viewId = doc.visual.activeViewId;
    const visual = cloneVisualWorkspace(doc.visual);
    visual.viewsById[viewId] = {
      ...visual.viewsById[viewId]!,
      name: "Renamed",
      updatedAt: Date.now() + 10_000,
      viewport: { x: 240, y: -80, zoom: 1.4 },
    };
    const summary = viewChangeSummary({ ...doc, visual }, viewId);

    expect(summary?.fullChanged).toBe(false);
    expect(summary?.layoutChanged).toBe(false);
  });

  it("detects visibility, collapse, layout, heatmap, and export changes", () => {
    const doc = createSampleDocument();
    const viewId = doc.visual.activeViewId;
    const visual = cloneVisualWorkspace(doc.visual);
    const view = visual.viewsById[viewId]!;
    const state = view.nodeStatesById["digital-onboarding"]!;
    view.nodeStatesById["digital-onboarding"] = {
      ...state,
      x: (state.x ?? 0) + 40,
      isOnCanvas: false,
      isCollapsed: true,
    };
    view.heatmap = { ...view.heatmap, enabled: !view.heatmap.enabled };
    view.export = { ...view.export, pagePreset: "16:9" };
    const summary = viewChangeSummary({ ...doc, visual }, viewId);

    expect(summary?.fullChanged).toBe(true);
    expect(summary?.layoutChanged).toBe(true);
  });

  it("derives legacy domain deep-dive baselines from template context", () => {
    const created = runTransaction(
      createSampleDocument(),
      createVisualView({
        templateId: "domain-deep-dive@1",
        rootId: "operations",
      }),
    ).doc;
    const viewId = created.visual.activeViewId;
    const visual = cloneVisualWorkspace(created.visual);
    visual.viewsById[viewId] = {
      ...visual.viewsById[viewId]!,
      baseline: undefined,
    };
    const summary = viewChangeSummary({ ...created, visual }, viewId);

    expect(summary?.fullChanged).toBe(false);
    expect(summary?.layoutChanged).toBe(false);
  });

  it("tracks view settings outside layout separately from layout changes", () => {
    const doc = createSampleDocument();
    const viewId = doc.visual.activeViewId;
    const heatmap = runTransaction(
      doc,
      updateActiveViewHeatmapSettings({ showLegend: !doc.heatmap.showLegend }),
    ).doc;
    const exported = runTransaction(
      heatmap,
      updateVisualView(viewId, { export: { pagePreset: "16:9" } }),
    ).doc;
    const labelOverride = runTransaction(
      exported,
      updateVisualNodeState(viewId, "digital-onboarding", {
        labelOverride: "Digital onboarding view label",
        isOnCanvas: false,
      }),
    ).doc;
    const summary = viewChangeSummary(labelOverride, viewId);

    expect(summary?.fullChanged).toBe(true);
    expect(summary?.layoutChanged).toBe(false);
  });
});
