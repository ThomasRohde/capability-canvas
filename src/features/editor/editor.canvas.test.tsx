import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import {
  addTextLabel,
  lockSubtree,
  reparentNode,
  runTransaction,
} from "../../domain/commands/operations";
import { stringifyDocument } from "../../domain/document/serialize";
import { warning } from "../../domain/validation/diagnostics";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { resolveNodeFill } from "../heatmap/resolveNodeFill";
import { normalizeCssColor } from "../../test/documentAssertions";
import { installEditorTestHooks, renderEditor } from "../../test/editorHarness";

describe("editor canvas workflows", () => {
  installEditorTestHooks();

  it("shows heatmap scores only in heatmap mode", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    expect(within(canvas).queryByText("0.72")).not.toBeInTheDocument();

    const heatmapToggle = screen.getByRole("button", {
      name: "Toggle heatmap",
    });
    expect(heatmapToggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(heatmapToggle);
    const leafScore = within(canvas).getByText("0.72");
    expect(leafScore).toHaveClass("leaf-score");
    expect(getComputedStyle(leafScore).position).toBe("absolute");
    expect(getComputedStyle(leafScore).top).toBe("4px");
    expect(getComputedStyle(leafScore).right).toBe("4px");
    expect(
      canvas.querySelector(".cc-node-score.container-score"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Toggle heatmap" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("positions the heatmap legend from the active view", () => {
    const doc = useDocumentStore.getState().doc;
    const activeViewId = doc.visual.activeViewId;
    const activeView = doc.visual.viewsById[activeViewId]!;
    useDocumentStore.setState({
      doc: {
        ...doc,
        visual: {
          ...doc.visual,
          viewsById: {
            ...doc.visual.viewsById,
            [activeViewId]: {
              ...activeView,
              heatmap: {
                ...activeView.heatmap,
                enabled: true,
                showLegend: true,
                legendPosition: "top-right",
              },
            },
          },
        },
      },
    });

    renderEditor();
    const legend = screen
      .getByTestId("canvas")
      .querySelector(".cc-heat-legend") as HTMLElement;

    expect(legend.style.top).toBe("16px");
    expect(legend.style.right).toBe("16px");
    expect(legend.style.bottom).toBe("auto");
    expect(legend.style.left).toBe("auto");
  });

  it("starts selected label rename through the command palette", async () => {
    renderEditor();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const palette = screen.getByRole("dialog", { name: "Command palette" });
    await userEvent.type(
      within(palette).getByLabelText("Search commands"),
      "Rename selected",
    );
    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByRole("textbox", {
        name: "Edit label for Digital Onboarding",
      }),
    ).toHaveFocus();
  });

  it("makes the selected canvas node keyboard reachable and restores focus after rename", async () => {
    const doc = useDocumentStore.getState().doc;
    const activeViewId = doc.visual.activeViewId;
    const activeView = doc.visual.viewsById[activeViewId]!;
    useDocumentStore.setState({
      doc: {
        ...doc,
        visual: {
          ...doc.visual,
          viewsById: {
            ...doc.visual.viewsById,
            [activeViewId]: {
              ...activeView,
              heatmap: {
                ...activeView.heatmap,
                enabled: true,
              },
            },
          },
        },
      },
    });

    renderEditor();
    const node = within(screen.getByTestId("canvas")).getByRole("button", {
      name: /Digital Onboarding, leaf capability, selected, Score 0\.72/,
    });

    node.focus();
    await userEvent.keyboard("{Enter}");
    const input = await screen.findByRole("textbox", {
      name: "Edit label for Digital Onboarding",
    });
    expect(input).toHaveFocus();
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(node).toHaveFocus());
    expect(
      within(screen.getByTestId("canvas")).getByLabelText("Heatmap score 0.72"),
    ).toBeInTheDocument();
  });

  it("opens the selected canvas node context menu from the keyboard", async () => {
    renderEditor();
    const node = within(screen.getByTestId("canvas")).getByRole("button", {
      name: /Digital Onboarding, leaf capability, selected/,
    });

    node.focus();
    fireEvent.keyDown(node, { key: "F10", shiftKey: true });
    const menu = screen.getByRole("menu", { name: "Capability context menu" });
    expect(
      within(menu).getByRole("menuitem", { name: "Copy BCM prompt" }),
    ).toBeInTheDocument();
    const items = within(menu).getAllByRole("menuitem");
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(document.activeElement ?? window, { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByRole("menu", { name: "Capability context menu" }),
      ).not.toBeInTheDocument(),
    );
    expect(node).toHaveFocus();
  });

  it("keeps outline, bulk, and view action menus keyboard navigable", async () => {
    renderEditor();

    const outlineTrigger = screen.getByRole("button", {
      name: "Actions for Digital Onboarding",
    });
    outlineTrigger.focus();
    await userEvent.keyboard("{Enter}");
    let menu = screen.getByRole("menu", { name: "Capability actions" });
    let items = within(menu).getAllByRole("menuitem");
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(document.activeElement ?? window, { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });
    await waitFor(() => expect(outlineTrigger).toHaveFocus());

    act(() => {
      useUiStore.setState({
        selectedNodeIds: ["credit-risk", "fraud-risk", "operational-risk"],
      });
    });
    const moreBulkActions = await screen.findByRole("button", {
      name: "More bulk actions",
    });
    moreBulkActions.focus();
    await userEvent.keyboard("{Enter}");
    menu = screen.getByRole("menu", { name: "Bulk actions" });
    items = within(menu).getAllByRole("menuitem");
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(document.activeElement ?? window, { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });
    await waitFor(() => expect(moreBulkActions).toHaveFocus());

    await userEvent.click(
      screen.getByRole("button", { name: "Open active view" }),
    );
    const viewTrigger = screen.getAllByRole("button", {
      name: /View actions for/,
    })[0]!;
    viewTrigger.focus();
    await userEvent.keyboard("{Enter}");
    menu = screen.getByRole("menu", { name: /Actions for/ });
    items = within(menu)
      .getAllByRole("menuitem")
      .filter((item) => !(item as HTMLButtonElement).disabled);
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(document.activeElement ?? window, { key: "End" });
    expect(items.at(-1)).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });
    await waitFor(() => expect(viewTrigger).toHaveFocus());
  });

  it("clears selection when the empty canvas background is clicked", () => {
    const { container } = renderEditor();
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
    const { container } = renderEditor();
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

  it("prevents browser page zoom when Ctrl-wheel zooms the canvas", () => {
    renderEditor();
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
    const { container } = renderEditor();
    const minimapBlobs = [
      ...container.querySelectorAll(".cc-minimap-blob"),
    ] as HTMLElement[];
    const doc = resolveVisualDocument(useDocumentStore.getState().doc);
    const expectedFills = Object.values(doc.nodesById)
      .map((node) => {
        const fill = resolveNodeFill(
          node,
          doc.heatmap,
          doc.settings.colorPalette,
        );
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
    renderEditor();
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

  it("renames a canvas label inline and syncs canvas, outline, inspector, and JSON", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    const outline = document.querySelector(".cc-outline") as HTMLElement;

    await userEvent.dblClick(within(canvas).getByText("Digital Onboarding"));
    const input = screen.getByRole("textbox", {
      name: "Edit label for Digital Onboarding",
    });
    expect(input).toHaveFocus();

    await userEvent.clear(input);
    await userEvent.type(input, "Online Origination");
    await userEvent.keyboard("{Enter}");

    expect(within(canvas).getByText("Online Origination")).toBeInTheDocument();
    expect(within(outline).getByText("Online Origination")).toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toHaveValue("Online Origination");
    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"]?.label,
    ).toBe("Online Origination");
    expect(stringifyDocument(useDocumentStore.getState().doc)).toContain(
      "Online Origination",
    );
  });

  it("cancels inline label edits with Escape without changing history", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    const before = stringifyDocument(useDocumentStore.getState().doc);
    const historyBefore = useDocumentStore.getState().past.length;

    await userEvent.dblClick(within(canvas).getByText("Digital Onboarding"));
    const input = screen.getByRole("textbox", {
      name: "Edit label for Digital Onboarding",
    });
    await userEvent.clear(input);
    await userEvent.type(input, "Canceled label");
    await userEvent.keyboard("{Escape}");

    expect(
      screen.queryByRole("textbox", {
        name: "Edit label for Digital Onboarding",
      }),
    ).not.toBeInTheDocument();
    expect(within(canvas).getByText("Digital Onboarding")).toBeInTheDocument();
    expect(stringifyDocument(useDocumentStore.getState().doc)).toBe(before);
    expect(useDocumentStore.getState().past).toHaveLength(historyBefore);
  });

  it("does not commit inline label edits when normalization leaves the label unchanged", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    const historyBefore = useDocumentStore.getState().past.length;

    await userEvent.dblClick(within(canvas).getByText("Digital Onboarding"));
    const input = screen.getByRole("textbox", {
      name: "Edit label for Digital Onboarding",
    });
    await userEvent.clear(input);
    await userEvent.type(input, "  Digital   Onboarding  ");
    await userEvent.keyboard("{Enter}");

    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"]?.label,
    ).toBe("Digital Onboarding");
    expect(useDocumentStore.getState().past).toHaveLength(historyBefore);
  });

  it("opens inline label editing with Enter for one selected visible node", async () => {
    renderEditor();

    await userEvent.keyboard("{Enter}");

    expect(
      screen.getByRole("textbox", {
        name: "Edit label for Digital Onboarding",
      }),
    ).toHaveFocus();
  });

  it("undo restores the previous label after one inline rename", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");

    await userEvent.dblClick(within(canvas).getByText("Digital Onboarding"));
    const input = screen.getByRole("textbox", {
      name: "Edit label for Digital Onboarding",
    });
    await userEvent.clear(input);
    await userEvent.type(input, "Undoable Label");
    await userEvent.keyboard("{Enter}");

    expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
      "Update capability",
    );
    act(() => {
      useDocumentStore.getState().undo();
    });

    expect(within(canvas).getByText("Digital Onboarding")).toBeInTheDocument();
    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"]?.label,
    ).toBe("Digital Onboarding");
  });

  it("does not run canvas shortcuts while inline label input is active", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    const beforeX =
      useDocumentStore.getState().doc.nodesById["digital-onboarding"]!.x;

    await userEvent.dblClick(within(canvas).getByText("Digital Onboarding"));
    const input = screen.getByRole("textbox", {
      name: "Edit label for Digital Onboarding",
    });

    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.keyDown(input, { key: "Delete" });

    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"],
    ).toBeDefined();
    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"]!.x,
    ).toBe(beforeX);
    expect(
      resolveVisualDocument(useDocumentStore.getState().doc).nodesById[
        "digital-onboarding"
      ]?.isOnCanvas,
    ).toBe(true);
  });

  it("normalizes blank inline labels to Untitled capability", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");

    await userEvent.dblClick(within(canvas).getByText("Digital Onboarding"));
    const input = screen.getByRole("textbox", {
      name: "Edit label for Digital Onboarding",
    });
    await userEvent.clear(input);
    await userEvent.keyboard("{Enter}");

    expect(within(canvas).getByText("Untitled capability")).toBeInTheDocument();
    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"]?.label,
    ).toBe("Untitled capability");
  });

  it("supports inline label editing for root, parent, leaf, and text-label nodes", async () => {
    act(() => {
      useDocumentStore
        .getState()
        .execute(addTextLabel("retail-banking", "Canvas note"));
    });
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    const textNode = Object.values(
      useDocumentStore.getState().doc.nodesById,
    ).find((node) => node.isTextLabel);
    expect(textNode).toBeDefined();

    const cases = [
      ["retail-banking", "Retail Banking", "Edited root"],
      ["customer", "Customer", "Edited parent"],
      ["digital-onboarding", "Digital Onboarding", "Edited leaf"],
      [textNode!.id, "Canvas note", "Edited note"],
    ] as const;

    for (const [nodeId, initialLabel, nextLabel] of cases) {
      await userEvent.dblClick(within(canvas).getByText(initialLabel));
      const input = screen.getByRole("textbox", {
        name: `Edit label for ${initialLabel}`,
      });
      await userEvent.clear(input);
      await userEvent.type(input, nextLabel);
      await userEvent.keyboard("{Enter}");

      expect(useDocumentStore.getState().doc.nodesById[nodeId]?.label).toBe(
        nextLabel,
      );
      expect(within(canvas).getByText(nextLabel)).toBeInTheDocument();
    }
  });

  it("selects diagnostic nodes from the status diagnostics popover", async () => {
    useUiStore.setState({ selectedNodeIds: [], inspectorOpen: false });
    useDocumentStore.setState({
      lastDiagnostics: [
        warning(
          "duplicate-id-repaired",
          "Duplicate id was renamed.",
          "data-management",
        ),
      ],
    });
    renderEditor();

    await userEvent.click(screen.getByRole("button", { name: "Diagnostics" }));
    await userEvent.click(
      screen.getByRole("button", { name: /duplicate-id-repaired/i }),
    );

    expect(useUiStore.getState().selectedNodeIds).toEqual(["data-management"]);
    expect(useUiStore.getState().inspectorOpen).toBe(true);
  });

  it("opens the app inspector instead of the browser menu on node right-click", async () => {
    useUiStore.setState({ inspectorOpen: false });
    const { container } = renderEditor();
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

  it("removes a node from the active view context menu without deleting it from the model", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    const dataManagement = within(canvas).getByText("Data Management");
    const node = dataManagement.closest(".cc-node") as HTMLElement;

    fireEvent.contextMenu(node, { clientX: 120, clientY: 140 });
    const menu = screen.getByRole("menu", { name: "Capability context menu" });
    expect(
      within(menu).getByRole("menuitem", { name: "Delete from model" }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Remove from active view" }),
    );

    const doc = useDocumentStore.getState().doc;
    const resolved = resolveVisualDocument(doc);
    expect(doc.nodesById["data-management"]).toBeDefined();
    expect(resolved.nodesById["data-management"]?.isOnCanvas).toBe(false);
    expect(
      within(canvas).queryByText("Data Management"),
    ).not.toBeInTheDocument();
  });

  it("renders a leaf as a container after another capability is reparented into it", () => {
    const reparentedDoc = runTransaction(
      useDocumentStore.getState().doc,
      reparentNode("fraud-risk", "operational-risk"),
    ).doc;
    useDocumentStore.setState({ doc: reparentedDoc });
    useUiStore.setState({ selectedNodeIds: ["operational-risk"] });
    const { container } = renderEditor();

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
    const { container } = renderEditor();
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
    renderEditor();
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
    renderEditor();
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
    renderEditor();
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

  it("removes the selected canvas node on Delete without deleting it from the model", async () => {
    renderEditor();

    await userEvent.keyboard("{Delete}");

    const doc = useDocumentStore.getState().doc;
    const resolved = resolveVisualDocument(doc);
    expect(doc.nodesById["digital-onboarding"]).toBeDefined();
    expect(resolved.nodesById["digital-onboarding"]?.isOnCanvas).toBe(false);
    expect(
      within(screen.getByTestId("canvas")).queryByText("Digital Onboarding"),
    ).not.toBeInTheDocument();
  });

  it("confirms and deletes the selected source node on Shift+Delete", async () => {
    renderEditor();

    await userEvent.keyboard("{Shift>}{Delete}{/Shift}");

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByText(/Delete "Digital Onboarding" from the source model/),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete from model" }),
    );

    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"],
    ).toBeUndefined();
    expect(
      within(screen.getByTestId("canvas")).queryByText("Digital Onboarding"),
    ).not.toBeInTheDocument();

    act(() => {
      useDocumentStore.getState().undo();
    });
    expect(
      useDocumentStore.getState().doc.nodesById["digital-onboarding"],
    ).toBeDefined();
  });

  it("reduces Ctrl+A to the largest sibling group and explains the reduction", () => {
    useUiStore.setState({ selectedNodeIds: [] });
    renderEditor();
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });

    expect(useUiStore.getState().selectedNodeIds.sort()).toEqual(
      [
        "data-management",
        "process-management",
        "technology-operations",
        "vendor-management",
      ].sort(),
    );
    expect(
      screen.getByText("Bulk operations require sibling capabilities."),
    ).toBeInTheDocument();
  });

  it("expands Ctrl+A from a selected child to its sibling group", () => {
    useUiStore.setState({ selectedNodeIds: ["credit-risk"] });
    renderEditor();
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });

    expect(useUiStore.getState().selectedNodeIds.sort()).toEqual(
      ["credit-risk", "fraud-risk", "operational-risk"].sort(),
    );
    expect(
      screen.queryByText("Bulk operations require sibling capabilities."),
    ).not.toBeInTheDocument();
  });

  it("disables align controls when fewer than two siblings are selected", () => {
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "process-management"],
    });
    renderEditor();
    const align = screen.getByRole("button", { name: /^Align left/ });
    expect(align).toBeDisabled();
  });

  it("shows PowerPoint-style bulk alignment and sizing actions", () => {
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "fraud-risk", "operational-risk"],
    });
    const { container } = renderEditor();
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
      "Remove from active view",
      "More bulk actions",
    ]) {
      expect(
        within(bulkToolbar).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
    expect(
      within(bulkToolbar).getByText("Reference: Credit Risk"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(bulkToolbar).getByRole("button", { name: "More bulk actions" }),
    );
    expect(
      within(bulkToolbar).getByRole("menuitem", { name: "Duplicate" }),
    ).toBeInTheDocument();
    expect(
      within(bulkToolbar).getByRole("menuitem", { name: "Delete from model" }),
    ).toBeInTheDocument();
  });

  it("updates selected colors from the floating toolbar", async () => {
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "fraud-risk", "operational-risk"],
    });
    const { container } = renderEditor();
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
        name: "Set selected color transparent",
      }),
    );

    const doc = useDocumentStore.getState().doc;
    for (const nodeId of ["credit-risk", "fraud-risk", "operational-risk"]) {
      expect(doc.nodesById[nodeId]!.color).toBe("coral");
      expect(doc.nodesById[nodeId]!.colorOverride).toBe("transparent");
    }
  });

  it("disables distribute controls when only two siblings are selected", () => {
    useUiStore.setState({
      selectedNodeIds: ["credit-risk", "fraud-risk"],
    });
    renderEditor();
    const distribute = screen.getByRole("button", {
      name: /^Distribute horizontal/,
    });
    expect(distribute).toBeDisabled();
  });
});
