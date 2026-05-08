import { describe, expect, it } from "vitest";
import {
  createVisualView,
  runTransaction,
  updateVisualNodeState,
} from "../commands/operations";
import { isNodeOnCanvas } from "../document/types";
import { createSampleDocument } from "../fixtures/sample";
import { resolveVisualDocument } from "./workspace";
import { summarizeVisualView } from "./viewSummary";

describe("visual view summaries", () => {
  it("reports template, visible count, active/default state and changed status", () => {
    const doc = createSampleDocument();
    const viewId = doc.visual.activeViewId;
    const visibleCount = Object.values(resolveVisualDocument(doc).nodesById)
      .filter(isNodeOnCanvas).length;

    let summary = summarizeVisualView(doc, viewId);

    expect(summary).toMatchObject({
      viewId,
      templateName: "Full model default",
      visibleNodeCount: visibleCount,
      fullChanged: false,
      layoutChanged: false,
      isActive: true,
      isDefault: true,
    });

    const changed = runTransaction(
      doc,
      updateVisualNodeState(viewId, "risk", { isOnCanvas: false }),
    ).doc;
    summary = summarizeVisualView(changed, viewId);

    expect(summary).toMatchObject({
      fullChanged: true,
      layoutChanged: false,
    });
  });

  it("summarizes template-created views", () => {
    const doc = runTransaction(
      createSampleDocument(),
      createVisualView({ templateId: "level-1-map@1" }),
    ).doc;
    const viewId = doc.visual.activeViewId;
    const summary = summarizeVisualView(doc, viewId);

    expect(summary).toMatchObject({
      templateName: "Level 1 map",
      isActive: true,
      isDefault: false,
    });
    expect(summary?.visibleNodeCount).toBeLessThan(
      Object.keys(doc.nodesById).length,
    );
  });
});
