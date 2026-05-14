import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { lockSubtree } from "../../domain/commands/operations";
import { MANUAL_POSITIONING_NOTICE } from "../../domain/layout/canvasLayoutPolicy";
import { resolveVisualDocument } from "../../domain/visual/workspace";
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
    expect(screen.getByLabelText("X")).not.toBeDisabled();
    expect(screen.getByLabelText("Y")).not.toBeDisabled();
    expect(screen.getByLabelText("W")).toBeDisabled();
    expect(screen.getByLabelText("H")).toBeDisabled();
  });

  it("switches the arranging parent to Manual after numeric X/Y movement", () => {
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
    expect(after.nodesById.digital!.isManualPositioningEnabled).toBe(true);
    expect(useDocumentStore.getState().past).toHaveLength(1);
    expect(screen.getByText(MANUAL_POSITIONING_NOTICE)).toBeInTheDocument();
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

    const doc = useDocumentStore.getState().doc;
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

    const doc = useDocumentStore.getState().doc;
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
