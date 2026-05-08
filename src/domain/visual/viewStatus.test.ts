import { describe, expect, it } from "vitest";
import {
  createVisualView,
  runTransaction,
  updateVisualNodeState,
} from "../commands/operations";
import { createSampleDocument } from "../fixtures/sample";
import { getNodeActiveViewContext } from "./viewStatus";

describe("active view node context", () => {
  it("reports visible nodes in the active view", () => {
    const doc = createSampleDocument();

    expect(getNodeActiveViewContext(doc, "digital-onboarding")).toMatchObject({
      nodeId: "digital-onboarding",
      visibility: "visible",
      isCollapsed: false,
    });
  });

  it("reports hidden nodes that belong to the active view baseline", () => {
    const doc = createSampleDocument();
    const viewId = doc.visual.activeViewId;
    const result = runTransaction(
      doc,
      updateVisualNodeState(viewId, "digital-onboarding", {
        isOnCanvas: false,
      }),
    );

    expect(
      getNodeActiveViewContext(result.doc, "digital-onboarding"),
    ).toMatchObject({
      visibility: "hidden",
      isCollapsed: false,
    });
  });

  it("reports nodes outside the active view template baseline", () => {
    const result = runTransaction(
      createSampleDocument(),
      createVisualView({ templateId: "level-2-map@1" }),
    );

    expect(
      getNodeActiveViewContext(result.doc, "digital-onboarding"),
    ).toMatchObject({
      visibility: "outside-active-view",
      isCollapsed: false,
    });
  });

  it("reports collapsed nodes and descendants hidden by collapsed ancestors", () => {
    const doc = createSampleDocument();
    const viewId = doc.visual.activeViewId;
    const result = runTransaction(
      doc,
      updateVisualNodeState(viewId, "digital", { isCollapsed: true }),
    );

    expect(getNodeActiveViewContext(result.doc, "digital")).toMatchObject({
      visibility: "visible",
      isCollapsed: true,
    });
    expect(
      getNodeActiveViewContext(result.doc, "digital-onboarding"),
    ).toMatchObject({
      visibility: "hidden",
      isCollapsed: false,
      collapsedAncestorId: "digital",
    });
  });
});
