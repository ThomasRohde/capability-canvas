import { beforeEach, describe, expect, it } from "vitest";
import { updateNodeSizes } from "../../domain/commands/operations";
import { createSampleDocument } from "../../domain/fixtures/sample";
import { findParentContainmentViolations } from "../../domain/layout/containment";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { geometrySnapshot } from "../../test/documentAssertions";
import {
  containmentRepairDocument,
  resetDocumentStoreForTests,
} from "../../test/documentStoreHarness";
import { useDocumentStore } from "./documentStore";

describe("document store save and history", () => {
  beforeEach(() => {
    resetDocumentStoreForTests();
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
});
