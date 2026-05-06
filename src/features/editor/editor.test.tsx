import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "../../app/version";
import { useDocumentStore } from "../../app/stores/documentStore";
import { DEFAULT_OUTLINE_WIDTH, useUiStore } from "../../app/stores/uiStore";
import {
  lockSubtree,
  reparentNode,
  runTransaction,
} from "../../domain/commands/operations";
import { stringifyDocument } from "../../domain/document/serialize";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { resolveNodeFill } from "../heatmap/resolveNodeFill";
import { EditorRoute } from "./EditorRoute";
import { ViewerRoute } from "../viewer/ViewerRoute";
import "../../styles.css";

describe("editor shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    window.history.pushState({}, "", "/");
    useDocumentStore.getState().reset();
    useUiStore.setState({
      selectedNodeIds: ["digital-onboarding"],
      outlineOpen: true,
      outlineWidth: DEFAULT_OUTLINE_WIDTH,
      inspectorOpen: true,
      activeDrawer: null,
      exportFormat: "json",
      inspectorTab: "inspector",
      searchQuery: "",
      viewport: { x: 0, y: 0, zoom: 1 },
      canvasSize: { w: 1200, h: 800 },
    });
  });

  it("renders the fixed workspace regions", () => {
    render(<EditorRoute />);
    expect(screen.getByText("Capability Canvas")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open active view" }),
    ).toBeInTheDocument();
    expect(screen.getByText(`v${APP_VERSION}`)).toBeInTheDocument();
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

  it("creates and switches visual views from the views drawer", async () => {
    render(<EditorRoute />);
    await userEvent.click(
      screen.getByRole("button", { name: "Open views" }),
    );
    expect(
      screen.getByRole("complementary", { name: "Views" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(useDocumentStore.getState().doc.visual.viewOrder).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Open active view" }),
    ).toHaveTextContent("Full model default");
    await userEvent.click(
      screen.getByRole("button", { name: "Use Default view" }),
    );

    expect(useDocumentStore.getState().doc.visual.activeViewId).toBe(
      "view-default",
    );
  });

  it("renders depth-limited view endpoints as leaf cards", async () => {
    render(<EditorRoute />);
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));
    await userEvent.selectOptions(
      screen.getByLabelText("View template"),
      "level-1-map@1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    const canvas = screen.getByTestId("canvas");
    const customerNode = within(canvas)
      .getByText("Customer")
      .closest(".cc-node") as HTMLElement;
    const rootNode = within(canvas)
      .getByText("Retail Banking")
      .closest(".cc-node") as HTMLElement;

    expect(customerNode).not.toHaveClass("cc-node-container");
    expect(customerNode.querySelector(".cc-node-title")).not.toBeInTheDocument();
    expect(rootNode).toHaveClass("cc-node-container");
    expect(within(canvas).queryByText("Channels")).not.toBeInTheDocument();
  });

  it("shows template and saved view descriptions in the views drawer", async () => {
    render(<EditorRoute />);
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));

    expect(
      screen.getAllByText(
        "Current working canvas with no level filter or export framing.",
      ).length,
    ).toBeGreaterThan(0);

    await userEvent.selectOptions(
      screen.getByLabelText("View template"),
      "executive-overview@1",
    );
    expect(
      screen.getByText(
        "Top three levels with deeper branches collapsed and 16:9 export framing.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(
      screen.getAllByText(
        "Top three levels with deeper branches collapsed and 16:9 export framing.",
      ).length,
    ).toBeGreaterThan(1);
  });

  it("creates domain deep-dive views from the selected capability", async () => {
    useUiStore.getState().setSelection(["operations"]);
    render(<EditorRoute />);
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));
    await userEvent.selectOptions(
      screen.getByLabelText("View template"),
      "domain-deep-dive@1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    const doc = useDocumentStore.getState().doc;
    const activeView = doc.visual.viewsById[doc.visual.activeViewId]!;
    const resolved = resolveVisualDocument(doc);
    expect(activeView.templateContext?.rootId).toBe("operations");
    expect(resolved.nodesById.operations?.isOnCanvas).toBe(true);
    expect(resolved.nodesById["process-management"]?.isOnCanvas).toBe(true);
    expect(resolved.nodesById.customer?.isOnCanvas).toBe(false);
    expect(resolved.nodesById.risk?.isOnCanvas).toBe(false);
    expect(screen.getAllByText(/Target: Operations\./).length).toBeGreaterThan(
      0,
    );
  });

  it("resets each view to its own template instead of the create picker template", async () => {
    render(<EditorRoute />);
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));
    await userEvent.selectOptions(
      screen.getByLabelText("View template"),
      "executive-overview@1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await userEvent.click(
      screen.getByRole("button", {
        name: "Reset Default view to Full model default template",
      }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Reset from template",
    });
    expect(
      within(dialog).getByText(/Full model default template/),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset" }));

    const doc = useDocumentStore.getState().doc;
    const defaultView = resolveVisualDocument(doc, "view-default");
    const executiveView = resolveVisualDocument(doc, doc.visual.activeViewId);
    expect(defaultView.nodesById["account-management"]?.isOnCanvas).toBe(true);
    expect(executiveView.nodesById["account-management"]?.isOnCanvas).toBe(
      false,
    );
  });

  it("prevents browser page zoom when Ctrl-wheel zooms the canvas", () => {
    render(<EditorRoute />);
    const canvas = screen.getByTestId("canvas");
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        toJSON: () => {},
      }),
    });
    const before = useUiStore.getState().viewport;
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 160,
      ctrlKey: true,
      deltaY: -100,
    });

    fireEvent(canvas, event);

    expect(event.defaultPrevented).toBe(true);
    expect(useUiStore.getState().viewport.zoom).toBeGreaterThan(before.zoom);
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
    expect(screen.getByLabelText("Leaf width")).toHaveValue(175);
    expect(screen.getByLabelText("Leaf height")).toHaveValue(50);
    expect(screen.getByLabelText("Title area")).toHaveValue(28);
    expect(screen.getByLabelText("Label top offset")).toHaveValue(4);
  });

  it("wraps canvas labels instead of ellipsizing them", () => {
    const doc = useDocumentStore.getState().doc;
    useDocumentStore.setState({
      doc: {
        ...doc,
        nodesById: {
          ...doc.nodesById,
          digital: {
            ...doc.nodesById.digital!,
            label: "Digital Container Label With Multiple Words",
          },
          "digital-servicing": {
            ...doc.nodesById["digital-servicing"]!,
            label: "Digital Servicing This is a long leaf label",
          },
        },
      },
    });
    render(<EditorRoute />);
    const canvas = screen.getByTestId("canvas");
    const leafLabel = within(canvas).getByText(
      "Digital Servicing This is a long leaf label",
    );
    const containerLabel = within(canvas).getByText(
      "Digital Container Label With Multiple Words",
    );
    const leafNode = leafLabel.closest(".cc-node")!;
    const containerNode = containerLabel.closest(".cc-node")!;
    expect(leafNode).not.toHaveClass("cc-node-container");
    expect(containerNode).toHaveClass("cc-node-container");
    expect(getComputedStyle(leafNode).paddingTop).toBe("0px");
    expect(getComputedStyle(leafNode).paddingRight).toBe("6px");
    expect(getComputedStyle(leafNode).lineHeight).toBe("1.2");
    expect(getComputedStyle(leafNode).overflow).toBe("hidden");
    expect(getComputedStyle(containerNode).paddingTop).toBe("0px");

    for (const label of [leafLabel, containerLabel]) {
      const style = getComputedStyle(label);
      expect(label).toHaveClass("cc-node-label");
      expect(style.display).toBe("block");
      expect(style.width).toBe("100%");
      expect(style.whiteSpace).toBe("normal");
      expect(style.overflowWrap).toBe("anywhere");
      expect(style.textOverflow).not.toBe("ellipsis");
      expect(style.overflow).toBe("visible");
    }
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

  it("resizes the outline from the panel edge", () => {
    const { container } = render(<EditorRoute />);
    const workspace = container.querySelector(
      ".cc-editor-workspace",
    ) as HTMLElement;
    const handle = screen.getByRole("separator", { name: "Resize outline" });

    expect(workspace.style.getPropertyValue("--cc-outline-width")).toBe(
      `${DEFAULT_OUTLINE_WIDTH}px`,
    );

    fireEvent(
      handle,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: DEFAULT_OUTLINE_WIDTH,
      }),
    );
    fireEvent(
      window,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: DEFAULT_OUTLINE_WIDTH + 120,
      }),
    );
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));

    expect(useUiStore.getState().outlineWidth).toBe(
      DEFAULT_OUTLINE_WIDTH + 120,
    );
    expect(workspace.style.getPropertyValue("--cc-outline-width")).toBe(
      `${DEFAULT_OUTLINE_WIDTH + 120}px`,
    );
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

    await userEvent.click(screen.getByRole("button", { name: "Hide outline" }));
    expect(screen.queryByText("Outline")).not.toBeInTheDocument();
    expect(useUiStore.getState().outlineOpen).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Show outline" }));
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

    expect(operationalRisk).toHaveClass("cc-node-container");
    expect(operationalRisk.querySelector(".cc-node-title")).toBeInTheDocument();
    expect(operationalRisk).not.toHaveClass("selected");
    expect(
      container.querySelector(".cc-container-frame.selected"),
    ).toBeInTheDocument();
  });

  it("renders container frames above node cards so containment remains visible", () => {
    const { container } = render(<EditorRoute />);
    const containerNode = container.querySelector(
      ".cc-node.cc-node-container",
    ) as HTMLElement;
    const frame = container.querySelector(".cc-container-frame") as HTMLElement;

    expect(frame).toBeInTheDocument();
    expect(containerNode).toHaveClass("cc-node-container");
    expect(containerNode).not.toHaveClass("container");
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
    useUiStore.setState({ selectedNodeIds: ["data-management"] });
    render(<EditorRoute />);
    const canvas = screen.getByTestId("canvas");
    const dataManagement = within(canvas)
      .getByText("Data Management")
      .closest(".cc-node") as HTMLElement;
    const handle = dataManagement.querySelector(".cc-resize") as HTMLElement;
    const before = useDocumentStore.getState().doc;
    const nodeBefore = before.nodesById["data-management"]!;
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

    expect(dataManagement.style.width).toBe(`${expectedW}px`);
    expect(dataManagement.style.height).toBe(`${expectedH}px`);

    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
    const after = resolveVisualDocument(useDocumentStore.getState().doc);
    expect(after.nodesById["data-management"]!.w).toBe(expectedW);
    expect(after.nodesById["data-management"]!.h).toBe(expectedH);
  });

  it("uses one selected outline for small selected containers", () => {
    const doc = useDocumentStore.getState().doc;
    const activeView =
      doc.visual.viewsById[doc.visual.activeViewId]!;
    useDocumentStore.setState({
      doc: {
        ...doc,
        nodesById: {
          ...doc.nodesById,
          customer: {
            ...doc.nodesById.customer!,
            h: 32,
          },
        },
        visual: {
          ...doc.visual,
          viewsById: {
            ...doc.visual.viewsById,
            [doc.visual.activeViewId]: {
              ...activeView,
              nodeStatesById: {
                ...activeView.nodeStatesById,
                customer: {
                  ...activeView.nodeStatesById.customer,
                  h: 32,
                },
              },
            },
          },
        },
      },
    });
    useUiStore.setState({ selectedNodeIds: ["customer"] });
    const { container } = render(<EditorRoute />);

    const node = within(screen.getByTestId("canvas"))
      .getByText("Customer")
      .closest(".cc-node") as HTMLElement;
    const frame = container.querySelector(
      ".cc-container-frame.selected",
    ) as HTMLElement;

    expect(node).toHaveClass("cc-node-container");
    expect(node).not.toHaveClass("selected");
    expect(node.style.height).toBe("32px");
    expect(frame.style.height).toBe("32px");
  });

  it("switches views, settings and export drawers from the rail", async () => {
    render(<EditorRoute />);
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));
    expect(
      screen.getByRole("complementary", { name: "Views" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Open settings" }),
    );
    expect(
      screen.queryByRole("complementary", { name: "Views" }),
    ).not.toBeInTheDocument();
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

  it("reports forced auto layout diagnostics in the status bar", async () => {
    render(<EditorRoute />);

    await userEvent.click(screen.getByRole("button", { name: "Auto layout" }));
    await waitFor(() =>
      expect(useDocumentStore.getState().isAutoLayoutRunning).toBe(false),
    );

    await userEvent.click(screen.getByRole("button", { name: "Diagnostics" }));
    const dialog = screen.getByRole("dialog", { name: "Diagnostics" });
    expect(within(dialog).getByText("layout-applied")).toBeInTheDocument();
    expect(within(dialog).getByText(/with force/)).toBeInTheDocument();
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
      "Change selected color",
      "Duplicate",
      "Delete",
    ]) {
      expect(
        within(bulkToolbar).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("updates selected colors from the floating toolbar", async () => {
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "fraud-risk", "operational-risk"],
    });
    const { container } = render(<EditorRoute />);
    const bulkToolbar = container.querySelector(
      ".cc-bulk-toolbar",
    ) as HTMLElement;

    await userEvent.click(
      within(bulkToolbar).getByRole("button", {
        name: "Change selected color",
      }),
    );
    await userEvent.click(
      within(bulkToolbar).getByRole("button", {
        name: "Set selected color lavender",
      }),
    );

    const doc = useDocumentStore.getState().doc;
    for (const nodeId of ["credit-risk", "fraud-risk", "operational-risk"]) {
      expect(doc.nodesById[nodeId]!.color).toBe("lavender");
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
    expect(
      within(screen.getByTestId("canvas")).queryByText("New capability"),
    ).not.toBeInTheDocument();
  });

  it("adds root capabilities to the outline without drawing them on the canvas", async () => {
    render(<EditorRoute />);

    await userEvent.click(
      screen.getAllByRole("button", { name: "Add root capability" })[0]!,
    );

    expect(screen.getByText("New capability")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("canvas")).queryByText("New capability"),
    ).not.toBeInTheDocument();
  });

  it("adds an outline subtree to the canvas from the row actions menu", async () => {
    render(<EditorRoute />);
    await userEvent.click(
      screen.getAllByRole("button", { name: "Add root capability" })[0]!,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for New capability" }),
    );

    await userEvent.click(
      screen.getByRole("menuitem", { name: "Add subtree to canvas" }),
    );

    await waitFor(() =>
      expect(
        within(screen.getByTestId("canvas")).getByText("New capability"),
      ).toBeInTheDocument(),
    );
  });

  it("removes a visible outline subtree from the canvas without deleting it", async () => {
    render(<EditorRoute />);
    const canvas = screen.getByTestId("canvas");
    expect(within(canvas).getByText("Customer")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Customer" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Remove subtree from canvas" }),
    );

    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(within(canvas).queryByText("Customer")).not.toBeInTheDocument();
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
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );

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

  it("collapses and restores viewer side panels", async () => {
    const { container } = render(<ViewerRoute />);
    const workspace = container.querySelector(
      ".cc-viewer-workspace",
    ) as HTMLElement;

    await userEvent.click(
      screen.getByRole("button", { name: "Collapse outline" }),
    );
    expect(workspace).toHaveClass("outline-closed");
    expect(screen.queryByText("Outline")).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Show outline" }),
    );
    expect(workspace).not.toHaveClass("outline-closed");
    expect(screen.getByText("Outline")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Collapse inspector" }),
    );
    expect(workspace).toHaveClass("inspector-closed");
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Show details" }),
    );
    expect(workspace).not.toHaveClass("inspector-closed");
    expect(screen.getByText("Details")).toBeInTheDocument();
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
