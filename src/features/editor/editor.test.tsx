import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import {
  lockSubtree,
  reparentNode,
  runTransaction,
} from "../../domain/commands/operations";
import { stringifyDocument } from "../../domain/document/serialize";
import { resolveNodeFill } from "../heatmap/resolveNodeFill";
import { EditorRoute } from "./EditorRoute";
import { ViewerRoute } from "../viewer/ViewerRoute";

describe("editor shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("imports a JSON document from the Import button", async () => {
    const importedDoc = {
      ...useDocumentStore.getState().doc,
      title: "Imported capability model",
    };
    const showSaveFilePicker = vi.fn();
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);

    render(<EditorRoute />);
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.accept).toBe(".json,application/json");
    const file = {
      text: async () => stringifyDocument(importedDoc),
    } as File;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(useDocumentStore.getState().doc.title).toBe(
        "Imported capability model",
      ),
    );
    expect(showSaveFilePicker).not.toHaveBeenCalled();
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

  it("clears selection when the empty canvas background is clicked", () => {
    const { container } = render(<EditorRoute />);
    expect(useUiStore.getState().selectedNodeIds).toEqual([
      "digital-onboarding",
    ]);

    const stage = container.querySelector(".cc-canvas-stage") as HTMLElement;
    fireEvent(
      stage,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        buttons: 1,
        clientX: 20,
        clientY: 20,
      }),
    );
    fireEvent(
      window,
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      }),
    );

    expect(useUiStore.getState().selectedNodeIds).toEqual([]);
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

  it("uses the same capability fills in the minimap", () => {
    const { container } = render(<EditorRoute />);
    const minimapBlobs = [
      ...container.querySelectorAll(".cc-minimap-blob"),
    ] as HTMLElement[];
    const doc = useDocumentStore.getState().doc;
    const expectedFills = Object.values(doc.nodesById)
      .map((node) => {
        const fill = resolveNodeFill(node, doc.heatmap);
        return `${normalizeCssColor(fill.background)}|${normalizeCssColor(fill.border)}`;
      })
      .sort();
    const actualFills = minimapBlobs
      .map((blob) => {
        const style = blob.getAttribute("style") ?? "";
        const background = style.match(/background: ([^;]+);/)?.[1];
        const border = style.match(/border: 1px solid ([^;]+);/)?.[1];
        return `${background}|${border}`;
      })
      .sort();

    expect(minimapBlobs.length).toBeGreaterThan(0);
    expect(actualFills).toEqual(expectedFills);
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

  it("opens document title editing from the title chip", async () => {
    render(<EditorRoute />);
    await userEvent.click(
      screen.getByRole("button", { name: "Edit document title" }),
    );

    expect(
      screen.getByRole("complementary", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue(
      "Retail Bank Capability Model",
    );
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

  it("filters the outline to the selected path", async () => {
    const { container } = render(<EditorRoute />);
    const outline = container.querySelector(".cc-outline") as HTMLElement;
    expect(within(outline).getByText("Risk")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Show selected outline path" }),
    );

    expect(within(outline).getByText("Digital Onboarding")).toBeInTheDocument();
    expect(within(outline).getByText("Digital")).toBeInTheDocument();
    expect(within(outline).queryByText("Risk")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Show all outline capabilities" }),
    );
    expect(within(outline).getByText("Risk")).toBeInTheDocument();
  });

  it("wires status bar actions to workspace state", async () => {
    render(<EditorRoute />);

    expect(
      screen.queryByRole("button", { name: "Account" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Notifications" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hide layers" }));
    expect(screen.queryByText("Outline")).not.toBeInTheDocument();
    expect(useUiStore.getState().outlineOpen).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Show layers" }));
    expect(screen.getByText("Outline")).toBeInTheDocument();
    expect(useUiStore.getState().outlineOpen).toBe(true);

    await userEvent.click(
      screen.getByRole("button", { name: "Hide inspector" }),
    );
    expect(screen.queryByText("Inspector")).not.toBeInTheDocument();
    expect(useUiStore.getState().inspectorOpen).toBe(false);

    await userEvent.click(
      screen.getByRole("button", { name: "Show inspector" }),
    );
    expect(screen.getAllByText("Inspector").length).toBeGreaterThan(0);
    expect(useUiStore.getState().inspectorOpen).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Diagnostics" }));
    expect(
      screen.getByRole("dialog", { name: "Diagnostics" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No diagnostics")).toBeInTheDocument();
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

  it("renders a leaf as a container after another capability is reparented into it", () => {
    const reparentedDoc = runTransaction(
      useDocumentStore.getState().doc,
      reparentNode("fraud-risk", "operational-risk"),
    ).doc;
    useDocumentStore.setState({ doc: reparentedDoc });
    useUiStore.setState({ selectedNodeIds: ["operational-risk"] });
    const { container } = render(<EditorRoute />);

    const operationalRisk = within(screen.getByTestId("canvas"))
      .getByText("Operational Risk")
      .closest(".cc-node") as HTMLElement;

    expect(operationalRisk).toHaveClass("container");
    expect(operationalRisk.querySelector(".cc-node-title")).toBeInTheDocument();
    expect(container.querySelector(".cc-node.selected.container")).toBe(
      operationalRisk,
    );
  });

  it("renders container frames above node cards so containment remains visible", () => {
    const { container } = render(<EditorRoute />);
    const containerNode = container.querySelector(
      ".cc-node.container",
    ) as HTMLElement;
    const frame = container.querySelector(".cc-container-frame") as HTMLElement;

    expect(frame).toBeInTheDocument();
    expect(Number(frame.style.zIndex)).toBeGreaterThan(
      Number(containerNode.style.zIndex),
    );
    expect(frame).toHaveStyle({ pointerEvents: "none" });
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

  it("allows locked capabilities to be dragged inside their parent", () => {
    const lockedDoc = runTransaction(
      useDocumentStore.getState().doc,
      lockSubtree("risk", true),
    ).doc;
    useDocumentStore.setState({ doc: lockedDoc });
    useUiStore.setState({ selectedNodeIds: ["risk"] });
    render(<EditorRoute />);
    const canvas = screen.getByTestId("canvas");
    const risk = within(canvas)
      .getByText("Risk")
      .closest(".cc-node") as HTMLElement;
    const creditRisk = within(canvas)
      .getByText("Credit Risk")
      .closest(".cc-node") as HTMLElement;
    const before = useDocumentStore.getState().doc;
    const parentBefore = before.nodesById.risk!;
    const childBefore = before.nodesById["credit-risk"]!;
    const expectedDx =
      Math.round((parentBefore.x + 21) / before.settings.gridSize) *
        before.settings.gridSize -
      parentBefore.x;
    const expectedDy =
      Math.round((parentBefore.y + 21) / before.settings.gridSize) *
        before.settings.gridSize -
      parentBefore.y;

    fireEvent(
      risk,
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

    expect(risk.style.left).toBe(`${parentBefore.x + expectedDx}px`);
    expect(risk.style.top).toBe(`${parentBefore.y + expectedDy}px`);
    expect(creditRisk.style.left).toBe(`${childBefore.x + expectedDx}px`);
    expect(creditRisk.style.top).toBe(`${childBefore.y + expectedDy}px`);

    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
    const after = useDocumentStore.getState().doc;
    expect(after.nodesById.risk!.isLockedAsIs).toBe(true);
    expect(after.nodesById.risk!.x - parentBefore.x).toBe(expectedDx);
    expect(after.nodesById.risk!.y - parentBefore.y).toBe(expectedDy);
    expect(after.nodesById["credit-risk"]!.isLockedAsIs).toBe(true);
    expect(after.nodesById["credit-risk"]!.x - childBefore.x).toBe(expectedDx);
    expect(after.nodesById["credit-risk"]!.y - childBefore.y).toBe(expectedDy);
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

  it("runs export validation and renders the selected format as display content", async () => {
    const { container } = render(<EditorRoute />);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(container.querySelector(".cc-format-card")?.tagName).toBe("DIV");
    await userEvent.click(
      screen.getByRole("button", { name: "Run validation" }),
    );

    expect(screen.getByText("Validation passed")).toBeInTheDocument();
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
    expect(screen.getByText("New parent defaults")).toBeInTheDocument();
    expect(screen.getByLabelText("Width")).toHaveValue(360);
    expect(screen.getByLabelText("Height")).toHaveValue(140);
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

  it("preserves heatmap CSV diagnostics after applying valid rows", async () => {
    render(<EditorRoute />);
    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    const input = document.querySelector("#heatmap-csv") as HTMLInputElement;
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

  it("selects all non-text capabilities with Ctrl+A on the canvas", () => {
    useUiStore.setState({ selectedNodeIds: [] });
    render(<EditorRoute />);
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });

    const doc = useDocumentStore.getState().doc;
    const expected = Object.values(doc.nodesById)
      .filter((node) => !node.isTextLabel && node.type !== "text")
      .map((node) => node.id);
    expect(useUiStore.getState().selectedNodeIds.sort()).toEqual(
      expected.sort(),
    );
  });

  it("disables align controls when fewer than two siblings are selected", () => {
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "process-management"],
    });
    render(<EditorRoute />);
    const align = screen.getByRole("button", { name: /^Align left/ });
    expect(align).toBeDisabled();
  });

  it("shows PowerPoint-style bulk alignment and sizing actions", () => {
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "fraud-risk", "operational-risk"],
    });
    const { container } = render(<EditorRoute />);
    const bulkToolbar = container.querySelector(
      ".cc-bulk-toolbar",
    ) as HTMLElement;

    for (const label of [
      "Align left",
      "Align center",
      "Align right",
      "Align top",
      "Align middle",
      "Align bottom",
      "Distribute horizontal",
      "Distribute vertical",
      "Match width to first selected",
      "Match height to first selected",
      "Match size to first selected",
      "Duplicate",
      "Delete",
    ]) {
      expect(
        within(bulkToolbar).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
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

  it("imports pasted JSON from a textarea dialog", async () => {
    render(<EditorRoute />);
    await userEvent.click(
      screen.getByRole("button", { name: "Import pasted JSON" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Import pasted JSON",
    });
    const importedDoc = {
      ...useDocumentStore.getState().doc,
      title: "Pasted capability model",
    };

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: stringifyDocument(importedDoc) },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    expect(useDocumentStore.getState().doc.title).toBe(
      "Pasted capability model",
    );
  });

  it("hides outline mutation controls in the viewer route", () => {
    render(<ViewerRoute />);

    expect(
      screen.queryByRole("button", { name: "Add root capability" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Actions for Customer" }),
    ).not.toBeInTheDocument();
  });
});

function normalizeCssColor(color: string): string {
  if (!color.startsWith("#")) return color;
  const value = color.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgb(${red}, ${green}, ${blue})`;
}
