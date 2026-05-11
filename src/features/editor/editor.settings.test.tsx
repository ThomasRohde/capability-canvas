import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { createVisualView } from "../../domain/commands/operations";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { installEditorTestHooks, renderEditor } from "../../test/editorHarness";

describe("editor settings workflows", () => {
  installEditorTestHooks();

  it("opens settings and keeps parent canvas labels free of swatches", async () => {
    const { container } = renderEditor();
    expect(
      container.querySelector(".cc-canvas .cc-node-title .cc-tree-swatch"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    expect(
      screen.getByRole("complementary", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Layout mode")).toBeInTheDocument();
    expect(screen.getByLabelText("Show grid")).toBeChecked();
    expect(screen.getByLabelText("Grid size")).toHaveValue(8);
    expect(screen.getByLabelText("Snap resizing to grid")).toBeChecked();
    expect(screen.getByLabelText("Leaf width")).toHaveValue(175);
    expect(screen.getByLabelText("Leaf height")).toHaveValue(40);
    expect(
      screen.getByRole("button", { name: "Set default leaf color slate" }),
    ).toHaveClass("on");
    expect(
      screen.getByRole("button", { name: "Set default leaf color mint" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set default leaf color stone" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title area")).toHaveValue(28);
    expect(screen.getByLabelText("Label top offset")).toHaveValue(4);
  });

  it("keeps document title editing in settings", async () => {
    renderEditor();
    expect(
      screen.queryByRole("button", { name: "Edit document title" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );

    expect(
      screen.getByRole("complementary", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue(
      "Retail Bank Capability Model",
    );
  });

  it("toggles the canvas grid and updates grid size", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    expect(canvas).not.toHaveClass("no-grid");
    expect(canvas.style.getPropertyValue("--cc-grid-size")).toBe("8px");

    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    await userEvent.click(screen.getByLabelText("Show grid"));
    expect(screen.getByLabelText("Show grid")).not.toBeChecked();
    expect(canvas).toHaveClass("no-grid");
    expect(canvas.style.getPropertyValue("--cc-grid-dot-color")).toBe(
      "transparent",
    );

    const gridSize = screen.getByLabelText("Grid size");
    fireEvent.change(gridSize, {
      target: { value: "32" },
    });
    fireEvent.blur(gridSize);
    expect(useDocumentStore.getState().doc.settings.gridSize).toBe(32);
    expect(canvas.style.getPropertyValue("--cc-grid-size")).toBe("32px");

    await userEvent.click(screen.getByLabelText("Snap resizing to grid"));
    expect(useDocumentStore.getState().doc.settings.resizeSnapToGrid).toBe(
      false,
    );
  });

  it("applies the default leaf color setting to real and template leaf nodes", async () => {
    renderEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Set default leaf color slate" }),
    );

    expect(useDocumentStore.getState().doc.settings.leafColor).toBe("slate");
    expect(
      resolveVisualDocument(useDocumentStore.getState().doc).nodesById[
        "account-management"
      ]?.color,
    ).toBe("slate");

    await userEvent.click(screen.getByRole("button", { name: "Open views" }));
    await userEvent.selectOptions(
      screen.getByLabelText("View template"),
      "level-1-map@1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create and switch" }),
    );

    expect(
      resolveVisualDocument(useDocumentStore.getState().doc).nodesById.customer
        ?.color,
    ).toBe("slate");
  });

  it("groups settings by scope without repeating ownership badges", async () => {
    renderEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    const drawer = screen.getByRole("complementary", { name: "Settings" });

    for (const title of [
      "Document",
      "Model defaults",
      "Layout",
      "Active view",
      "Heatmap data",
      "Export defaults",
      "Local UI preferences",
    ]) {
      expect(
        within(drawer).getByText(title, {
          selector: ".cc-section-heading span",
        }),
      ).toBeInTheDocument();
    }

    expect(drawer.querySelector(".cc-scope-badge")).not.toBeInTheDocument();
  });

  it("updates document, active-view and export-scoped settings from the drawer", async () => {
    const firstViewId = useDocumentStore.getState().doc.visual.activeViewId;
    useDocumentStore
      .getState()
      .execute(createVisualView({ name: "Scoped settings view" }));
    const secondViewId = useDocumentStore.getState().doc.visual.activeViewId;

    renderEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    const drawer = screen.getByRole("complementary", { name: "Settings" });

    await userEvent.click(
      within(drawer).getByRole("checkbox", {
        name: /Enable heatmap colors/,
      }),
    );
    await userEvent.selectOptions(
      within(drawer).getByLabelText("Palette"),
      "mint-amber-coral",
    );
    await userEvent.selectOptions(
      within(drawer).getByLabelText("Page preset"),
      "16:9",
    );
    await userEvent.click(
      within(drawer).getByRole("checkbox", { name: /Show footer/ }),
    );

    const doc = useDocumentStore.getState().doc;
    expect(doc.heatmap.palette).toBe("mint-amber-coral");
    expect(doc.visual.viewsById[secondViewId]?.heatmap.enabled).toBe(true);
    expect(doc.visual.viewsById[firstViewId]?.heatmap.enabled).toBe(false);
    expect(doc.visual.viewsById[secondViewId]?.export).toMatchObject({
      pagePreset: "16:9",
      showFooter: true,
    });
    expect(
      doc.visual.viewsById[firstViewId]?.export.pagePreset,
    ).toBeUndefined();
  });

  it("persists local UI settings without dirtying the document", async () => {
    renderEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    const drawer = screen.getByRole("complementary", { name: "Settings" });
    expect(useDocumentStore.getState().dirty).toBe(false);

    await userEvent.click(
      within(drawer).getByRole("checkbox", { name: /Show outline/ }),
    );
    await userEvent.selectOptions(
      within(drawer).getByLabelText("Last export format"),
      "svg",
    );

    expect(useUiStore.getState().outlineOpen).toBe(false);
    expect(useUiStore.getState().exportFormat).toBe("svg");
    expect(window.localStorage.getItem("capability-canvas.outlineOpen")).toBe(
      "false",
    );
    expect(window.localStorage.getItem("capability-canvas.exportFormat")).toBe(
      "svg",
    );
    expect(useDocumentStore.getState().dirty).toBe(false);
    expect(useDocumentStore.getState().past).toHaveLength(0);
  });

  it("commits numeric settings on blur without history spam while typing", async () => {
    renderEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    const gridSize = screen.getByLabelText("Grid size");
    const historyBefore = useDocumentStore.getState().past.length;

    await userEvent.clear(gridSize);
    await userEvent.type(gridSize, "48");

    expect(useDocumentStore.getState().past).toHaveLength(historyBefore);
    expect(useDocumentStore.getState().doc.settings.gridSize).not.toBe(48);

    fireEvent.blur(gridSize);

    expect(useDocumentStore.getState().past).toHaveLength(historyBefore + 1);
    expect(useDocumentStore.getState().doc.settings.gridSize).toBe(48);
  });

  it("renders canvas padding controls and applies layout changes", async () => {
    renderEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    const topPadding = screen.getByLabelText("Top");
    const titleArea = screen.getByLabelText("Title area");
    const labelOffset = screen.getByLabelText("Label top offset");
    await userEvent.clear(labelOffset);
    await userEvent.type(labelOffset, "16");
    fireEvent.blur(labelOffset);
    await userEvent.clear(topPadding);
    await userEvent.type(topPadding, "48");
    fireEvent.blur(topPadding);
    await userEvent.clear(titleArea);
    await userEvent.type(titleArea, "8");
    fireEvent.blur(titleArea);

    expect(useDocumentStore.getState().doc.settings.containerPaddingTop).toBe(
      48,
    );
    expect(useDocumentStore.getState().doc.settings.containerTitleHeight).toBe(
      8,
    );
    expect(
      useDocumentStore.getState().doc.settings.containerLabelOffsetTop,
    ).toBe(16);
    expect(screen.getByText("New parent defaults")).toBeInTheDocument();
    expect(screen.getByLabelText("Width")).toHaveValue(175);
    expect(screen.getByLabelText("Height")).toHaveValue(40);
    expect(screen.getByLabelText("Horizontal")).toBeInTheDocument();
    await waitFor(() =>
      expect(useDocumentStore.getState().isAutoLayoutRunning).toBe(false),
    );
    await waitFor(() =>
      expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
        "Update layout settings",
      ),
    );
    const historyLength = useDocumentStore.getState().past.length;

    await userEvent.click(
      screen.getByRole("button", { name: "Apply auto layout" }),
    );
    await waitFor(() =>
      expect(useDocumentStore.getState().isAutoLayoutRunning).toBe(false),
    );
    expect(useDocumentStore.getState().past.length).toBe(historyLength);
    expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
      "Update layout settings",
    );
  });

  it("preserves heatmap CSV diagnostics after applying valid rows", async () => {
    renderEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    const drawer = screen.getByRole("complementary", { name: "Settings" });
    expect(
      within(drawer).getByRole("button", { name: "Import CSV" }),
    ).toBeInTheDocument();
    const input = document.querySelector("#heatmap-csv") as HTMLInputElement;
    expect(input).toHaveAttribute("aria-hidden", "true");
    expect(input).toHaveAttribute("tabindex", "-1");
    expect(getComputedStyle(input).display).toBe("none");
    const file = {
      text: async () => "id,value\ndigital-onboarding,0.91\nmissing-node,0.5",
    } as File;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(
        useDocumentStore.getState().doc.nodesById["digital-onboarding"]
          ?.heatmapValue,
      ).toBe(0.91),
    );
    expect(
      useDocumentStore
        .getState()
        .lastDiagnostics.some(
          (diagnostic) => diagnostic.code === "csv-node-not-found",
        ),
    ).toBe(true);
  });

  it("disables toolbar and settings layout actions while auto layout is running", async () => {
    useDocumentStore.setState({ isAutoLayoutRunning: true });
    renderEditor();

    expect(screen.getByRole("button", { name: "Auto layout" })).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    expect(
      screen.getByRole("button", { name: "Apply auto layout" }),
    ).toBeDisabled();
  });

  it("reports forced auto layout diagnostics in the status bar", async () => {
    renderEditor();

    await userEvent.click(screen.getByRole("button", { name: "Auto layout" }));
    await waitFor(() =>
      expect(useDocumentStore.getState().isAutoLayoutRunning).toBe(false),
    );

    await userEvent.click(screen.getByRole("button", { name: "Diagnostics" }));
    const dialog = screen.getByRole("dialog", { name: "Diagnostics" });
    expect(within(dialog).getByText("layout-applied")).toBeInTheDocument();
    expect(within(dialog).getByText(/with force/)).toBeInTheDocument();
  });
});
