import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../../app/version";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { HELP_SEEN_STORAGE_KEY } from "../help/helpStorage";
import { installEditorTestHooks, renderEditor } from "../../test/editorHarness";

describe("editor shell", () => {
  installEditorTestHooks();

  it("renders the fixed workspace regions", () => {
    renderEditor();
    expect(screen.getByText("Capability Canvas")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open active view" }),
    ).toBeInTheDocument();
    expect(screen.getByText(`v${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.getByText("Outline")).toBeInTheDocument();
    expect(screen.getAllByText("Inspector").length).toBeGreaterThan(0);
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add root" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add child" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Model actions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Toggle heatmap" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open help" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("opens help the first time this browser runs the editor", async () => {
    window.localStorage.removeItem(HELP_SEEN_STORAGE_KEY);

    renderEditor();

    const dialog = await screen.findByRole("dialog", { name: "Help" });
    expect(within(dialog).getByText("Getting started")).toBeInTheDocument();
    expect(window.localStorage.getItem(HELP_SEEN_STORAGE_KEY)).toBe("true");
  });

  it("does not auto-open help after the first-run flag is set", () => {
    renderEditor();

    expect(
      screen.queryByRole("dialog", { name: "Help" }),
    ).not.toBeInTheDocument();
  });

  it("keeps import commands in a keyboard-accessible menu", async () => {
    renderEditor();
    const trigger = screen.getByRole("button", { name: "Import" });

    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const menu = screen.getByRole("menu", { name: "Import" });
    expect(
      within(menu).getByRole("menuitem", { name: "Import JSON file" }),
    ).toBeEnabled();
    expect(
      within(menu).getByRole("menuitem", { name: "Import pasted JSON" }),
    ).toBeEnabled();
    expect(
      within(menu).getByRole("menuitem", { name: "Import CSV" }),
    ).toBeEnabled();

    await waitFor(() =>
      expect(
        within(menu).getByRole("menuitem", { name: "Import JSON file" }),
      ).toHaveFocus(),
    );
    fireEvent.keyDown(document.activeElement ?? window, { key: "ArrowDown" });
    expect(
      within(menu).getByRole("menuitem", { name: "Import pasted JSON" }),
    ).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });

    expect(
      screen.queryByRole("menu", { name: "Import" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("menu", { name: "Import" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "Import" })).not.toBeInTheDocument();
  });

  it("keeps Add child disabled without selection after removing model actions", async () => {
    useUiStore.setState({ selectedNodeIds: [] });
    renderEditor();

    expect(screen.getByRole("button", { name: "Add child" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Model actions" }),
    ).not.toBeInTheDocument();
  });

  it("opens the command palette by keyboard and explains disabled commands", async () => {
    useUiStore.setState({ selectedNodeIds: [] });
    renderEditor();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const palette = screen.getByRole("dialog", { name: "Command palette" });
    await waitFor(() =>
      expect(within(palette).getByLabelText("Search commands")).toHaveFocus(),
    );

    await userEvent.type(
      within(palette).getByLabelText("Search commands"),
      "Add child",
    );
    expect(
      within(palette).getByRole("option", { name: /Add child/ }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(palette).getByText(/Select a capability first/),
    ).toBeInTheDocument();
  });

  it("does not open the command palette while typing in inputs", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Import pasted JSON" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Import pasted JSON",
    });
    const textarea = within(dialog).getByRole("textbox");
    textarea.focus();

    fireEvent.keyDown(textarea, { key: "k", ctrlKey: true, bubbles: true });

    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).not.toBeInTheDocument();
  });

  it("traps command palette focus and restores focus to the trigger", async () => {
    renderEditor();
    const trigger = screen.getByRole("button", {
      name: "Open command palette",
    });

    await userEvent.click(trigger);
    const palette = screen.getByRole("dialog", { name: "Command palette" });
    const input = within(palette).getByLabelText("Search commands");
    const close = within(palette).getByRole("button", {
      name: "Close command palette",
    });
    await waitFor(() => expect(input).toHaveFocus());

    await userEvent.tab({ shift: true });
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(input).toHaveFocus();
    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Command palette" }),
      ).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it("runs add child through the command palette", async () => {
    renderEditor();
    const historyBefore = useDocumentStore.getState().past.length;

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const palette = screen.getByRole("dialog", { name: "Command palette" });
    await userEvent.type(
      within(palette).getByLabelText("Search commands"),
      "Add child",
    );
    await userEvent.keyboard("{Enter}");

    expect(useDocumentStore.getState().past).toHaveLength(historyBefore + 1);
    expect(useDocumentStore.getState().past.at(-1)?.label).toBe(
      "Add child capability",
    );
    expect(
      within(screen.getByTestId("canvas")).getByText("New capability"),
    ).toBeInTheDocument();
  });

  it("exposes icon-only controls with accessible names", () => {
    renderEditor();

    expect(
      screen.getByRole("button", { name: "Open command palette" }),
    ).toHaveAccessibleName("Open command palette");
    expect(
      screen.getByRole("button", { name: "Open help" }),
    ).toHaveAccessibleName("Open help");
    expect(
      screen.getByRole("button", { name: "Toggle outline" }),
    ).toHaveAccessibleName("Toggle outline");
    expect(
      screen.getByRole("button", { name: "Diagnostics" }),
    ).toHaveAccessibleName("Diagnostics");
  });

  it("opens help from the rail", async () => {
    renderEditor();

    const trigger = screen.getByRole("button", { name: "Open help" });
    await userEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Help" });
    expect(dialog).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByText("Getting started")).toBeInTheDocument();
  });

  it("opens and closes help by keyboard", async () => {
    renderEditor();

    fireEvent.keyDown(window, { key: "?" });
    const dialog = screen.getByRole("dialog", { name: "Help" });
    expect(within(dialog).getByText("Pan and zoom")).toBeInTheDocument();
    expect(within(dialog).getByText("Commands")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Shift+F10 / ContextMenu"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Open the selected capability context menu"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/direct parent switches to Manual/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Freeform preserves current positions/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Preserve locks the selected subtree/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Data formats" }),
    ).toBeInTheDocument();
    for (const format of [
      "Capability hierarchy JSON",
      "Nested hierarchy JSON",
      "Prompt merge JSON",
      "Heatmap CSV",
      "Full native document JSON",
    ]) {
      expect(
        within(dialog).getByRole("heading", { name: format }),
      ).toBeInTheDocument();
    }
    expect(
      within(dialog).getByRole("button", { name: "Copy hierarchy format" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/paste it into an agent/i),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Help" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("wires status bar actions to workspace state", async () => {
    renderEditor();

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

  it("uses one selected outline for small selected containers", () => {
    const doc = useDocumentStore.getState().doc;
    const activeView = doc.visual.viewsById[doc.visual.activeViewId]!;
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
    const { container } = renderEditor();

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
    renderEditor();
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

  it("shows save status from the document store", () => {
    renderEditor();
    expect(screen.getByText("No local changes")).toBeInTheDocument();

    act(() => {
      useDocumentStore
        .getState()
        .setActiveViewViewport({ x: 8, y: 16, zoom: 1.1 });
    });
    expect(screen.getByText("Unsaved local changes")).toBeInTheDocument();

    const revision = useDocumentStore.getState().revision;
    act(() => {
      useDocumentStore.getState().markSaveStarted(revision);
    });
    expect(screen.getByText("Saving locally...")).toBeInTheDocument();

    act(() => {
      useDocumentStore.getState().markSaveSucceeded(revision);
    });
    expect(screen.getByText("Saved locally just now")).toBeInTheDocument();
  });
});
