import { beforeEach, describe, expect, it } from "vitest";
import {
  createVisualView,
  updateVisualView,
} from "../domain/commands/operations";
import { createSampleDocument } from "../domain/fixtures/sample";
import {
  filterSelectionToVisibleNodes,
  switchActiveVisualView,
} from "./activeVisualState";
import { useDocumentStore } from "./stores/documentStore";
import { useUiStore } from "./stores/uiStore";

describe("active visual state", () => {
  beforeEach(() => {
    useDocumentStore.getState().reset();
    useUiStore.setState({
      selectedNodeIds: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectionNotice: null,
    });
  });

  it("filters selection to visible existing visual nodes", () => {
    const doc = createSampleDocument();
    const visualDoc = {
      ...doc,
      nodesById: {
        ...doc.nodesById,
        risk: { ...doc.nodesById.risk!, isOnCanvas: false },
      },
    };

    expect(
      filterSelectionToVisibleNodes(visualDoc, [
        "customer",
        "risk",
        "missing-node",
      ]),
    ).toEqual(["customer"]);
  });

  it("switches active views while syncing viewport and hidden selection", () => {
    const defaultViewId = useDocumentStore.getState().doc.visual.activeViewId;
    useDocumentStore.getState().execute(createVisualView({ name: "Second" }));
    const secondViewId = useDocumentStore.getState().doc.visual.activeViewId;
    const secondView =
      useDocumentStore.getState().doc.visual.viewsById[secondViewId]!;
    const previousViewport = { x: 12, y: 24, zoom: 1.25 };
    const nextViewport = { x: -80, y: 42, zoom: 0.8 };

    useDocumentStore.getState().execute(
      updateVisualView(secondViewId, {
        viewport: nextViewport,
        nodeStatesById: {
          ...secondView.nodeStatesById,
          risk: {
            ...(secondView.nodeStatesById.risk ?? {}),
            isOnCanvas: false,
          },
        },
      }),
    );
    useDocumentStore.getState().setActiveVisualView(defaultViewId);
    useUiStore.setState({
      selectedNodeIds: ["customer", "risk"],
      viewport: previousViewport,
      selectionNotice: null,
    });

    switchActiveVisualView(secondViewId);

    const doc = useDocumentStore.getState().doc;
    expect(doc.visual.activeViewId).toBe(secondViewId);
    expect(doc.visual.viewsById[defaultViewId]?.viewport).toEqual(
      previousViewport,
    );
    expect(useUiStore.getState().viewport).toEqual(nextViewport);
    expect(useUiStore.getState().selectedNodeIds).toEqual(["customer"]);
    expect(useUiStore.getState().selectionNotice?.message).toBe(
      "Selection adjusted because selected capabilities are hidden in this view.",
    );
  });
});
