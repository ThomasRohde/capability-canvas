import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { addLabel, lockSubtree } from "../../domain/commands/operations";
import { createNode } from "../../domain/document/defaults";
import { ROOT_PARENT_ID, type CapabilityDocument } from "../../domain/document/types";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { geometrySnapshot } from "../../test/documentAssertions";
import { installEditorTestHooks, renderEditor } from "../../test/editorHarness";

describe("editor inspector workflows", () => {
  installEditorTestHooks();

  it("marks color swatch selected state with aria-pressed", () => {
    renderEditor();

    expect(
      screen.getByRole("button", { name: "Set color slate" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Set color mint" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Set color transparent" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("commits transparent as a node color from the inspector", async () => {
    renderEditor();

    await userEvent.click(
      screen.getByRole("button", { name: "Set color transparent" }),
    );

    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"]
        ?.colorOverride,
    ).toBe("transparent");
    expect(
      screen.getByRole("button", { name: "Set color transparent" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("collapses and restores the inspector even with no selection", async () => {
    useUiStore.setState({ selectedNodeIds: [] });
    renderEditor();
    expect(
      screen.getByText("Select a capability to edit its properties."),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Collapse inspector" }),
    );
    expect(screen.queryByText("Inspector")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Toggle inspector" }),
    );
    expect(screen.getAllByText("Inspector").length).toBeGreaterThan(0);
  });

  it("clarifies preserved layout and disables size fields for locked nodes", () => {
    setStoreLayoutMode("free");
    useDocumentStore.getState().execute(lockSubtree("risk", true));
    useUiStore.setState({ selectedNodeIds: ["risk"], inspectorTab: "layout" });

    renderEditor();

    expect(
      screen.getByRole("button", { name: "Preserve from auto layout" }),
    ).toHaveClass("on");
    expect(
      screen.getByText(/Auto layout may arrange this parent's children/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Manual keeps this parent's children/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Preserve skips this subtree during auto layout/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tidy children rearranges only this container's/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Tidy algorithm")).toBeDisabled();
    expect(screen.getByLabelText("Tidy algorithm")).toHaveAttribute(
      "title",
      "Preserved subtrees are skipped by auto layout.",
    );
    expect(screen.getByRole("button", { name: "Tidy children" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tidy children" })).toHaveAttribute(
      "title",
      "Preserved subtrees are skipped by auto layout.",
    );
    expect(screen.getByLabelText("X")).not.toBeDisabled();
    expect(screen.getByLabelText("Y")).not.toBeDisabled();
    expect(screen.getByLabelText("W")).toBeDisabled();
    expect(screen.getByLabelText("H")).toBeDisabled();
  });

  it("runs scoped auto layout for the selected container children", async () => {
    const doc = useDocumentStore.getState().doc;
    useDocumentStore.setState({
      doc: {
        ...doc,
        nodesById: {
          ...doc.nodesById,
          "credit-risk": {
            ...doc.nodesById["credit-risk"]!,
            x: doc.nodesById.risk!.x + 300,
            y: doc.nodesById.risk!.y + 160,
          },
          "fraud-risk": {
            ...doc.nodesById["fraud-risk"]!,
            x: doc.nodesById.risk!.x + 48,
            y: doc.nodesById.risk!.y + 48,
          },
        },
      },
    });
    setStoreLayoutMode("free");
    useUiStore.setState({ selectedNodeIds: ["risk"], inspectorTab: "layout" });
    renderEditor();
    const before = resolveVisualDocument(useDocumentStore.getState().doc);
    const riskIds = ["risk", "credit-risk", "fraud-risk", "operational-risk"];
    const unaffectedIds = [
      "operations",
      "process-management",
      "data-management",
      "technology-operations",
      "vendor-management",
    ];
    const beforeRisk = geometrySnapshot(before, riskIds);
    const beforeUnaffected = geometrySnapshot(before, unaffectedIds);
    const tidyAlgorithm = screen.getByLabelText("Tidy algorithm");
    expect(tidyAlgorithm).toHaveValue("uniform");

    await userEvent.selectOptions(tidyAlgorithm, "flow");
    expect(tidyAlgorithm).toHaveValue("flow");
    await userEvent.click(screen.getByRole("button", { name: "Tidy children" }));

    await waitFor(() =>
      expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
        "Auto layout selected container",
      ),
    );
    expect(
      useDocumentStore
        .getState()
        .lastDiagnostics.find((diagnostic) => diagnostic.code === "layout-applied")
        ?.message,
    ).toContain("Scoped flow auto layout");
    const after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(after.settings.layoutMode).toBe("free");
    expect(geometrySnapshot(after, riskIds)).not.toEqual(beforeRisk);
    expect(geometrySnapshot(after, unaffectedIds)).toEqual(beforeUnaffected);
    expect(after.nodesById.risk).toMatchObject({
      x: before.nodesById.risk!.x,
      y: before.nodesById.risk!.y,
    });
  });

  it("disables scoped layout for leaf and text-label selections", () => {
    useDocumentStore
      .getState()
      .execute(addLabel("Annotation", { id: "annotation", x: 24, y: 24 }));
    useUiStore.setState({
      selectedNodeIds: ["digital-onboarding"],
      inspectorTab: "layout",
    });
    const { unmount } = renderEditor();
    const leafButton = screen.getByRole("button", { name: "Tidy children" });
    expect(screen.getByLabelText("Tidy algorithm")).toBeDisabled();
    expect(leafButton).toBeDisabled();
    expect(leafButton).toHaveAttribute(
      "title",
      "This container has no visible child capabilities to arrange.",
    );

    unmount();
    useUiStore.setState({
      selectedNodeIds: ["annotation"],
      inspectorTab: "layout",
    });
    renderEditor();
    const labelButton = screen.getByRole("button", { name: "Tidy children" });
    expect(screen.getByLabelText("Tidy algorithm")).toBeDisabled();
    expect(labelButton).toBeDisabled();
    expect(labelButton).toHaveAttribute(
      "title",
      "This container has no visible child capabilities to arrange.",
    );
  });

  it("disables scoped layout for empty containers and while layout is running", () => {
    const doc = useDocumentStore.getState().doc;
    useDocumentStore.setState({
      doc: {
        ...doc,
        nodesById: {
          ...doc.nodesById,
          empty: createNode({
            id: "empty",
            label: "Empty",
            type: "root",
            x: 32,
            y: 32,
            w: 180,
            h: 80,
          }),
        },
        childrenByParentId: {
          ...doc.childrenByParentId,
          [ROOT_PARENT_ID]: [...(doc.childrenByParentId[ROOT_PARENT_ID] ?? []), "empty"],
          empty: [],
        },
      },
    });
    useUiStore.setState({ selectedNodeIds: ["empty"], inspectorTab: "layout" });
    const { unmount } = renderEditor();
    const emptyButton = screen.getByRole("button", { name: "Tidy children" });
    expect(screen.getByLabelText("Tidy algorithm")).toBeDisabled();
    expect(emptyButton).toBeDisabled();
    expect(emptyButton).toHaveAttribute(
      "title",
      "This container has no visible child capabilities to arrange.",
    );

    unmount();
    useUiStore.setState({ selectedNodeIds: ["risk"], inspectorTab: "layout" });
    useDocumentStore.setState({ isAutoLayoutRunning: true });
    renderEditor();
    const runningButton = screen.getByRole("button", {
      name: "Tidy children",
    });
    expect(screen.getByLabelText("Tidy algorithm")).toBeDisabled();
    expect(runningButton).toBeDisabled();
    expect(runningButton).toHaveAttribute(
      "title",
      "Auto layout is already running.",
    );
  });

  it("commits numeric X/Y movement in Freeform without parent mode conversion", () => {
    setStoreLayoutMode("free");
    useUiStore.setState({
      selectedNodeIds: ["digital-onboarding"],
      inspectorTab: "layout",
    });
    renderEditor();
    const before = resolveVisualDocument(useDocumentStore.getState().doc);
    const x = screen.getByLabelText("X");

    fireEvent.change(x, { target: { value: String(before.nodesById["digital-onboarding"]!.x + 16) } });
    fireEvent.blur(x);

    const after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(after.nodesById["digital-onboarding"]!.x).toBe(
      before.nodesById["digital-onboarding"]!.x + 16,
    );
    expect(after.nodesById.digital!.isManualPositioningEnabled).toBe(false);
    expect(useDocumentStore.getState().past).toHaveLength(1);
  });

  it("shows source model and active view status in the inspector", () => {
    const { container } = renderEditor();
    const inspector = container.querySelector(".cc-inspector") as HTMLElement;

    expect(
      within(inspector).getByText("Source model and active view"),
    ).toBeInTheDocument();
    expect(within(inspector).getByText("Model path")).toBeInTheDocument();
    expect(within(inspector).getByText("Visibility")).toBeInTheDocument();
    expect(
      within(inspector).getByText("Visible in active view"),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText("Expanded in active view"),
    ).toBeInTheDocument();
    expect(within(inspector).getByText("Auto layout")).toBeInTheDocument();
  });

  it("marks source-locked inspector source fields read-only", () => {
    const doc = useDocumentStore.getState().doc;
    useDocumentStore.setState({
      doc: {
        ...doc,
        access: {
          sourceLocked: true,
          reason: "Published releases are managed upstream.",
        },
      },
    });
    useUiStore.setState({
      selectedNodeIds: ["digital-onboarding"],
      inspectorTab: "inspector",
    });

    renderEditor();

    expect(
      screen.getByText("Published releases are managed upstream."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toBeDisabled();
    expect(screen.getByLabelText("Description")).toBeDisabled();
    expect(screen.getByLabelText("Heatmap value")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set color slate" })).toBeDisabled();
  });

  it("does not apply an Enter-committed inspector label to the next selected parent", async () => {
    useUiStore.setState({
      selectedNodeIds: ["risk"],
      inspectorTab: "inspector",
    });
    renderEditor();
    const label = screen.getByLabelText("Label");

    await userEvent.clear(label);
    await userEvent.type(label, "Risk renamed{Enter}");
    await userEvent.click(
      within(screen.getByTestId("canvas")).getByText("Operations"),
    );

    const doc = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(doc.nodesById.risk!.label).toBe("Risk renamed");
    expect(doc.nodesById.operations!.label).toBe("Operations");
    expect(screen.getByLabelText("Label")).toHaveValue("Operations");
  });

  it("does not delete the selected node when Delete is pressed inside an inspector field", () => {
    renderEditor();
    const description = screen.getByLabelText("Description");
    description.focus();
    const before =
      useDocumentStore.getState().doc.nodesById["digital-onboarding"];
    expect(before).toBeDefined();

    fireEvent.keyDown(description, { key: "Delete" });

    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"],
    ).toBeDefined();
  });

  it("does not nudge the selected node when arrow keys are pressed inside an inspector field", () => {
    renderEditor();
    const description = screen.getByLabelText("Description");
    description.focus();
    const beforeX =
      useDocumentStore.getState().doc.nodesById["digital-onboarding"]!.x;

    fireEvent.keyDown(description, { key: "ArrowRight" });

    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"]!.x,
    ).toBe(beforeX);
  });

  it("shows bulk inspector property controls and commits edits once", async () => {
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "fraud-risk", "operational-risk"],
      inspectorTab: "inspector",
    });
    renderEditor();

    expect(
      screen.getByText(
        "3 sibling capabilities selected. Bulk edits commit as one undo step.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Set selected color transparent" }),
    );
    const heatmap = screen.getByLabelText("Heatmap value");
    fireEvent.change(heatmap, { target: { value: "0.33" } });
    fireEvent.blur(heatmap);

    const doc = useDocumentStore.getState().doc;
    for (const nodeId of ["credit-risk", "fraud-risk", "operational-risk"]) {
      expect(doc.nodesById[nodeId]!.colorOverride).toBe("transparent");
      expect(doc.nodesById[nodeId]!.heatmapValue).toBe(0.33);
    }
    expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
      "Update selected heatmap values",
    );
  });

  it("shows bulk layout controls for size, manual, and preserve edits", async () => {
    setStoreLayoutMode("free");
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "fraud-risk", "operational-risk"],
      inspectorTab: "layout",
    });
    renderEditor();

    const width = screen.getByLabelText("W");
    fireEvent.change(width, { target: { value: "132" } });
    fireEvent.blur(width);
    await userEvent.click(screen.getByRole("button", { name: "Manual" }));
    await userEvent.click(
      screen.getByRole("button", {
        name: "Preserve selected from auto layout",
      }),
    );

    const doc = resolveVisualDocument(useDocumentStore.getState().doc);
    for (const nodeId of ["credit-risk", "fraud-risk", "operational-risk"]) {
      expect(doc.nodesById[nodeId]!.w).toBe(132);
      expect(doc.nodesById[nodeId]!.isManualPositioningEnabled).toBe(true);
      expect(doc.nodesById[nodeId]!.isLockedAsIs).toBe(true);
    }
  });

  it("does not expose unsafe bulk inspector controls for invalid mixed selections", () => {
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "process-management"],
      inspectorTab: "inspector",
    });
    renderEditor();

    expect(
      screen.getByText("Bulk operations require sibling capabilities."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Heatmap value")).not.toBeInTheDocument();
  });
});

function setStoreLayoutMode(mode: CapabilityDocument["settings"]["layoutMode"]) {
  const doc = useDocumentStore.getState().doc;
  const viewId = doc.visual.activeViewId;
  const view = doc.visual.viewsById[viewId];
  useDocumentStore.setState({
    doc: {
      ...doc,
      settings: { ...doc.settings, layoutMode: mode },
      layout: { ...doc.layout, mode },
      visual: {
        ...doc.visual,
        viewsById: view
          ? {
              ...doc.visual.viewsById,
              [viewId]: {
                ...view,
                layout: { ...view.layout, mode },
              },
            }
          : doc.visual.viewsById,
      },
    },
  });
}
