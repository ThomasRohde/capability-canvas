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
import { DEFAULT_OUTLINE_WIDTH, useUiStore } from "../../app/stores/uiStore";
import {
  removeNodesFromCanvas,
  updateVisualNodeState,
} from "../../domain/commands/operations";
import {
  installEditorTestHooks,
  renderEditor,
  renderViewer,
} from "../../test/editorHarness";

describe("editor outline workflows", () => {
  installEditorTestHooks();

  it("collapses and restores the outline from the rail", async () => {
    renderEditor();
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
    const { container } = renderEditor();
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

  it("filters the outline to the selected path", async () => {
    const { container } = renderEditor();
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

  it("searches outline metadata with path context and keyboard navigation", async () => {
    useUiStore.setState({ selectedNodeIds: [] });
    const { container } = renderEditor();
    const outline = container.querySelector(".cc-outline") as HTMLElement;
    const input = screen.getByPlaceholderText("Search outline");
    const viewportBefore = useUiStore.getState().viewport;

    await userEvent.type(input, "Digital Banking");

    expect(
      within(outline).getByText(
        "Retail Banking > Customer > Channels > Digital",
      ),
    ).toBeInTheDocument();
    expect(within(outline).getByText(/owner:/)).toBeInTheDocument();
    expect(outline.querySelector(".cc-search-highlight")).toHaveTextContent(
      "Digital Banking",
    );

    fireEvent.keyDown(input, { key: "Enter" });
    expect(useUiStore.getState().selectedNodeIds).toEqual([
      "digital-onboarding",
    ]);
    expect(useUiStore.getState().viewport).not.toEqual(viewportBefore);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
  });

  it("adds hidden outline search results back to the active view", async () => {
    act(() => {
      useDocumentStore
        .getState()
        .execute(removeNodesFromCanvas(["digital-onboarding"]));
    });
    const { container } = renderEditor();
    const outline = container.querySelector(".cc-outline") as HTMLElement;
    const input = screen.getByPlaceholderText("Search outline");

    await userEvent.type(input, "Digital Onboarding");

    expect(
      within(outline).getByTitle("Hidden in active view"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(outline).getByRole("button", {
        name: "Add Digital Onboarding to active view",
      }),
    );

    await waitFor(() =>
      expect(
        within(screen.getByTestId("canvas")).getByText("Digital Onboarding"),
      ).toBeInTheDocument(),
    );
  });

  it("expands collapsed ancestors from outline search results", async () => {
    const viewId = useDocumentStore.getState().doc.visual.activeViewId;
    act(() => {
      useDocumentStore
        .getState()
        .execute(
          updateVisualNodeState(viewId, "digital", { isCollapsed: true }),
        );
    });
    const { container } = renderEditor();
    const outline = container.querySelector(".cc-outline") as HTMLElement;

    expect(
      within(screen.getByTestId("canvas")).queryByText("Digital Onboarding"),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText("Search outline"),
      "Digital Onboarding",
    );
    await userEvent.click(
      within(outline).getByRole("button", {
        name: "Expand Digital in active view to show Digital Onboarding",
      }),
    );

    await waitFor(() =>
      expect(
        within(screen.getByTestId("canvas")).getByText("Digital Onboarding"),
      ).toBeInTheDocument(),
    );
  });

  it("keeps restore actions out of readonly outline search", async () => {
    act(() => {
      useDocumentStore
        .getState()
        .execute(removeNodesFromCanvas(["digital-onboarding"]));
    });
    const { container } = renderViewer();
    const outline = container.querySelector(".cc-outline") as HTMLElement;

    await userEvent.type(
      screen.getByPlaceholderText("Search outline"),
      "Digital Onboarding",
    );

    expect(
      within(outline).getByTitle("Hidden in active view"),
    ).toBeInTheDocument();
    expect(
      within(outline).queryByRole("button", {
        name: "Add Digital Onboarding to active view",
      }),
    ).not.toBeInTheDocument();
  });

  it("opens outline row actions from the three-dot menu", async () => {
    const { container } = renderEditor();
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
      within(menu).getByRole("menuitem", { name: "Delete from model" }),
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
    renderEditor();

    await userEvent.click(
      screen.getAllByRole("button", { name: "Add root capability" })[0]!,
    );

    expect(screen.getByText("New capability")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("canvas")).queryByText("New capability"),
    ).not.toBeInTheDocument();
  });

  it("adds an outline subtree to the canvas from the row actions menu", async () => {
    renderEditor();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Add root capability" })[0]!,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for New capability" }),
    );

    await userEvent.click(
      screen.getByRole("menuitem", { name: "Add subtree to active view" }),
    );

    await waitFor(() =>
      expect(
        within(screen.getByTestId("canvas")).getByText("New capability"),
      ).toBeInTheDocument(),
    );
  });

  it("removes a visible outline subtree from the active view without deleting it", async () => {
    renderEditor();
    const canvas = screen.getByTestId("canvas");
    expect(within(canvas).getByText("Customer")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Customer" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Remove subtree from active view" }),
    );

    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(within(canvas).queryByText("Customer")).not.toBeInTheDocument();
  });
});
