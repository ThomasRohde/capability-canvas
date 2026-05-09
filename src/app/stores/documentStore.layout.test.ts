import { beforeEach, describe, expect, it } from "vitest";
import { addChild, moveNodes } from "../../domain/commands/operations";
import { childrenOf } from "../../domain/document/types";
import { findParentContainmentViolations } from "../../domain/layout/containment";
import { resolveVisualDocument } from "../../domain/visual/workspace";
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
});
