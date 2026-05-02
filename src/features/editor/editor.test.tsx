import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { EditorRoute } from "./EditorRoute";

describe("editor shell", () => {
  beforeEach(() => {
    useDocumentStore.getState().reset();
    useUiStore.setState({
      selectedNodeIds: ["digital-onboarding"],
      outlineOpen: true,
      inspectorOpen: true,
      activeDrawer: null,
      exportFormat: "json",
      inspectorTab: "inspector",
      searchQuery: "",
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  });

  it("renders the fixed workspace regions", () => {
    render(<EditorRoute />);
    expect(screen.getByText("Capability Canvas")).toBeInTheDocument();
    expect(screen.getByText("Outline")).toBeInTheDocument();
    expect(screen.getAllByText("Inspector").length).toBeGreaterThan(0);
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
  });

  it("shows heatmap scores only in heatmap mode", async () => {
    render(<EditorRoute />);
    const canvas = screen.getByTestId("canvas");
    expect(within(canvas).queryByText("0.72")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Heatmap" }));
    expect(within(canvas).getByText("0.72")).toHaveClass("leaf-score");
    expect(
      canvas.querySelector(".cc-node-score.container-score"),
    ).toBeInTheDocument();
  });

  it("supports minimap zoom controls and click-to-center navigation", async () => {
    const { container } = render(<EditorRoute />);
    const minimap = container.querySelector(".cc-minimap") as HTMLElement;
    const minimapCanvas = within(minimap).getByRole("button", {
      name: "Move viewport",
    });
    Object.defineProperty(minimapCanvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 132,
        bottom: 90,
        width: 132,
        height: 90,
        toJSON: () => {},
      }),
    });

    const initialViewport = useUiStore.getState().viewport;
    await userEvent.click(
      within(minimap).getByRole("button", { name: "Zoom in" }),
    );
    expect(useUiStore.getState().viewport.zoom).toBeGreaterThan(
      initialViewport.zoom,
    );

    const beforeCentering = useUiStore.getState().viewport;
    fireEvent.pointerDown(minimapCanvas, {
      clientX: 90,
      clientY: 45,
      pointerId: 1,
    });
    const centeredViewport = useUiStore.getState().viewport;
    expect(centeredViewport).not.toEqual(beforeCentering);
    expect(Number.isFinite(centeredViewport.x)).toBe(true);
    expect(Number.isFinite(centeredViewport.y)).toBe(true);
  });

  it("opens settings and keeps parent canvas labels free of swatches", async () => {
    const { container } = render(<EditorRoute />);
    expect(
      container.querySelector(".cc-canvas .cc-node-title .cc-tree-swatch"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("complementary", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Layout mode")).toBeInTheDocument();
    expect(screen.getByLabelText("Show grid")).toBeChecked();
    expect(screen.getByLabelText("Grid size")).toHaveValue(16);
    expect(screen.getByLabelText("Snap resizing to grid")).toBeChecked();
  });

  it("toggles the canvas grid and updates grid size", async () => {
    render(<EditorRoute />);
    const canvas = screen.getByTestId("canvas");
    expect(canvas).not.toHaveClass("no-grid");
    expect(canvas.style.getPropertyValue("--cc-grid-size")).toBe("16px");

    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    await userEvent.click(screen.getByLabelText("Show grid"));
    expect(screen.getByLabelText("Show grid")).not.toBeChecked();
    expect(canvas).toHaveClass("no-grid");
    expect(canvas.style.getPropertyValue("--cc-grid-dot-color")).toBe(
      "transparent",
    );

    fireEvent.change(screen.getByLabelText("Grid size"), {
      target: { value: "32" },
    });
    expect(useDocumentStore.getState().doc.settings.gridSize).toBe(32);
    expect(canvas.style.getPropertyValue("--cc-grid-size")).toBe("32px");

    await userEvent.click(screen.getByLabelText("Snap resizing to grid"));
    expect(useDocumentStore.getState().doc.settings.resizeSnapToGrid).toBe(
      false,
    );
  });

  it("collapses and restores the outline from the rail", async () => {
    render(<EditorRoute />);
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse outline" }),
    );
    expect(screen.queryByText("Outline")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Toggle outline" }),
    );
    expect(screen.getByText("Outline")).toBeInTheDocument();
  });

  it("collapses and restores the inspector even with no selection", async () => {
    useUiStore.setState({ selectedNodeIds: [] });
    render(<EditorRoute />);
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

  it("opens the app inspector instead of the browser menu on node right-click", async () => {
    useUiStore.setState({ inspectorOpen: false });
    const { container } = render(<EditorRoute />);
    expect(screen.queryByText("Inspector")).not.toBeInTheDocument();

    const canvas = screen.getByTestId("canvas");
    const dataManagement = within(canvas).getByText("Data Management");
    const node = dataManagement.closest(".cc-node") as HTMLElement;
    fireEvent.contextMenu(node, { clientX: 120, clientY: 140 });

    expect(useUiStore.getState().selectedNodeIds).toEqual(["data-management"]);
    expect(useUiStore.getState().inspectorOpen).toBe(false);
    const menu = screen.getByRole("menu", { name: "Capability context menu" });
    expect(
      within(menu).getByRole("menuitem", { name: "Inspect" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Inspect" }),
    );

    expect(useUiStore.getState().inspectorOpen).toBe(true);
    expect(screen.getAllByText("Inspector").length).toBeGreaterThan(0);
    expect(container.querySelector(".cc-inspector")).toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toHaveValue("Data Management");
  });

  it("snaps drag movement to the grid and previews dragged descendants", () => {
    render(<EditorRoute />);
    const canvas = screen.getByTestId("canvas");
    const operations = within(canvas)
      .getByText("Operations")
      .closest(".cc-node") as HTMLElement;
    const processManagement = within(canvas)
      .getByText("Process Management")
      .closest(".cc-node") as HTMLElement;
    const before = useDocumentStore.getState().doc;
    const parentBefore = before.nodesById.operations!;
    const childBefore = before.nodesById["process-management"]!;
    const expectedDx =
      Math.round((parentBefore.x + 21) / before.settings.gridSize) *
        before.settings.gridSize -
      parentBefore.x;
    const expectedDy =
      Math.round((parentBefore.y + 21) / before.settings.gridSize) *
        before.settings.gridSize -
      parentBefore.y;

    fireEvent(
      operations,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        clientX: 0,
        clientY: 0,
      }),
    );
    fireEvent(
      window,
      new MouseEvent("pointermove", {
        bubbles: true,
        buttons: 1,
        clientX: 21,
        clientY: 21,
      }),
    );

    expect(operations.style.left).toBe(`${parentBefore.x + expectedDx}px`);
    expect(operations.style.top).toBe(`${parentBefore.y + expectedDy}px`);
    expect(processManagement.style.left).toBe(
      `${childBefore.x + expectedDx}px`,
    );
    expect(processManagement.style.top).toBe(`${childBefore.y + expectedDy}px`);

    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
    const after = useDocumentStore.getState().doc;
    expect(after.nodesById.operations!.x - parentBefore.x).toBe(expectedDx);
    expect(after.nodesById.operations!.y - parentBefore.y).toBe(expectedDy);
    expect(after.nodesById["process-management"]!.x - childBefore.x).toBe(
      expectedDx,
    );
    expect(after.nodesById["process-management"]!.y - childBefore.y).toBe(
      expectedDy,
    );
    expect(after.nodesById.operations!.x % before.settings.gridSize).toBe(0);
  });

  it("snaps resize handles to the grid when enabled", () => {
    useUiStore.setState({ selectedNodeIds: ["operations"] });
    render(<EditorRoute />);
    const canvas = screen.getByTestId("canvas");
    const operations = within(canvas)
      .getByText("Operations")
      .closest(".cc-node") as HTMLElement;
    const handle = operations.querySelector(".cc-resize") as HTMLElement;
    const before = useDocumentStore.getState().doc;
    const nodeBefore = before.nodesById.operations!;
    const expectedW =
      Math.round(
        (nodeBefore.x + nodeBefore.w + 21) / before.settings.gridSize,
      ) *
        before.settings.gridSize -
      nodeBefore.x;
    const expectedH =
      Math.round(
        (nodeBefore.y + nodeBefore.h + 21) / before.settings.gridSize,
      ) *
        before.settings.gridSize -
      nodeBefore.y;

    fireEvent(
      handle,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        clientX: 0,
        clientY: 0,
      }),
    );
    fireEvent(
      window,
      new MouseEvent("pointermove", {
        bubbles: true,
        buttons: 1,
        clientX: 21,
        clientY: 21,
      }),
    );

    expect(operations.style.width).toBe(`${expectedW}px`);
    expect(operations.style.height).toBe(`${expectedH}px`);

    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
    const after = useDocumentStore.getState().doc;
    expect(after.nodesById.operations!.w).toBe(expectedW);
    expect(after.nodesById.operations!.h).toBe(expectedH);
  });

  it("switches settings and export drawers from the rail", async () => {
    render(<EditorRoute />);
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    expect(
      screen.getByRole("complementary", { name: "Settings" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open export" }));
    expect(
      screen.queryByRole("complementary", { name: "Settings" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Export" }),
    ).toBeInTheDocument();
  });

  it("renders canvas padding controls and applies layout changes", async () => {
    render(<EditorRoute />);
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    const topPadding = screen.getByLabelText("Top");
    const titleArea = screen.getByLabelText("Title area");
    await userEvent.clear(topPadding);
    await userEvent.type(topPadding, "48");
    await userEvent.clear(titleArea);
    await userEvent.type(titleArea, "8");

    expect(useDocumentStore.getState().doc.settings.containerPaddingTop).toBe(
      48,
    );
    expect(useDocumentStore.getState().doc.settings.containerTitleHeight).toBe(
      8,
    );
    expect(screen.getByLabelText("Horizontal")).toBeInTheDocument();
    await waitFor(() =>
      expect(useDocumentStore.getState().isAutoLayoutRunning).toBe(false),
    );
    await waitFor(() =>
      expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
        "Update layout settings",
      ),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Apply auto layout" }),
    );
    await waitFor(() =>
      expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
        "Auto layout",
      ),
    );
  });

  it("disables toolbar and settings layout actions while auto layout is running", async () => {
    useDocumentStore.setState({ isAutoLayoutRunning: true });
    render(<EditorRoute />);

    expect(screen.getByRole("button", { name: "Auto layout" })).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    expect(
      screen.getByRole("button", { name: "Apply auto layout" }),
    ).toBeDisabled();
  });

  it("does not delete the selected node when Delete is pressed inside an inspector field", () => {
    render(<EditorRoute />);
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
    render(<EditorRoute />);
    const description = screen.getByLabelText("Description");
    description.focus();
    const beforeX =
      useDocumentStore.getState().doc.nodesById["digital-onboarding"]!.x;

    fireEvent.keyDown(description, { key: "ArrowRight" });

    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"]!.x,
    ).toBe(beforeX);
  });

  it("disables align controls when fewer than two siblings are selected", () => {
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "process-management"],
    });
    render(<EditorRoute />);
    const align = screen.getByRole("button", { name: /^Align left/ });
    expect(align).toBeDisabled();
  });

  it("disables distribute controls when only two siblings are selected", () => {
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "fraud-risk"],
    });
    render(<EditorRoute />);
    const distribute = screen.getByRole("button", {
      name: /^Distribute horizontal/,
    });
    expect(distribute).toBeDisabled();
  });

  it("opens outline row actions from the three-dot menu", async () => {
    const { container } = render(<EditorRoute />);
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Customer" }),
    );

    const menu = screen.getByRole("menu", { name: "Capability actions" });
    expect(
      within(menu).getByRole("menuitem", { name: "Add child" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Duplicate" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Fit parent" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();

    const outlineTree = container.querySelector(
      ".cc-outline-tree",
    ) as HTMLElement;
    const before = within(outlineTree).queryAllByText("New capability").length;
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Add child" }),
    );
    expect(within(outlineTree).queryAllByText("New capability")).toHaveLength(
      before + 1,
    );
  });
});
