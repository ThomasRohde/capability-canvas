import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { updateVisualNodeState } from "../../domain/commands/operations";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { installEditorTestHooks, renderEditor } from "../../test/editorHarness";

describe("editor visual view workflows", () => {
  installEditorTestHooks();

  it("creates and switches visual views from the views drawer", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));
    expect(
      screen.getByRole("complementary", { name: "Views" }),
    ).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("New view name"));
    await userEvent.type(screen.getByLabelText("New view name"), "Ops map");
    await userEvent.selectOptions(
      screen.getByLabelText("View template"),
      "level-2-map@1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create and switch" }),
    );

    expect(useDocumentStore.getState().doc.visual.viewOrder).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Open active view" }),
    ).toHaveTextContent("Ops map");
    expect(screen.getAllByText("Level 2 map").length).toBeGreaterThan(0);
    await userEvent.click(
      screen.getByRole("button", { name: "Use Default view" }),
    );

    expect(useDocumentStore.getState().doc.visual.activeViewId).toBe(
      "view-default",
    );
  });

  it("commits view renames once on blur and undo restores the prior name", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));
    const input = screen.getByLabelText("Name for Default view");
    const historyBefore = useDocumentStore.getState().past.length;

    await userEvent.clear(input);
    await userEvent.type(input, "Executive view");

    expect(
      useDocumentStore.getState().doc.visual.viewsById["view-default"]?.name,
    ).toBe("Default view");
    expect(useDocumentStore.getState().past).toHaveLength(historyBefore);

    fireEvent.blur(input);

    expect(
      useDocumentStore.getState().doc.visual.viewsById["view-default"]?.name,
    ).toBe("Executive view");
    expect(useDocumentStore.getState().past).toHaveLength(historyBefore + 1);

    act(() => {
      useDocumentStore.getState().undo();
    });
    expect(
      useDocumentStore.getState().doc.visual.viewsById["view-default"]?.name,
    ).toBe("Default view");
  });

  it("cancels view rename drafts with Escape without closing the drawer", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));
    const input = screen.getByLabelText("Name for Default view");
    const historyBefore = useDocumentStore.getState().past.length;

    await userEvent.type(input, " edited");
    await userEvent.keyboard("{Escape}");

    expect(
      screen.getByRole("complementary", { name: "Views" }),
    ).toBeInTheDocument();
    expect(input).toHaveValue("Default view");
    expect(
      useDocumentStore.getState().doc.visual.viewsById["view-default"]?.name,
    ).toBe("Default view");
    expect(useDocumentStore.getState().past).toHaveLength(historyBefore);
    expect(useDocumentStore.getState().dirty).toBe(false);
  });

  it("disables reset actions for unchanged views and confirms changed resets", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));

    await userEvent.click(
      screen.getByRole("button", { name: "View actions for Default view" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Reset layout" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("menuitem", { name: "Reset from template" }),
    ).toBeDisabled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    act(() => {
      useDocumentStore.getState().execute(
        updateVisualNodeState("view-default", "digital-onboarding", {
          x: 900,
        }),
      );
    });

    await userEvent.click(
      screen.getByRole("button", { name: "View actions for Default view" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Reset layout" }),
    );
    let dialog = screen.getByRole("alertdialog", { name: "Reset layout" });
    expect(
      within(dialog).getByText(/positions, sizes, layout mode/),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View actions for Default view" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Reset from template" }),
    );
    dialog = screen.getByRole("alertdialog", { name: "Reset from template" });
    expect(
      within(dialog).getByText(
        /visibility, collapse state, heatmap view settings/,
      ),
    ).toBeInTheDocument();
  });

  it("prevents deleting the last view and explains delete scope", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));

    await userEvent.click(
      screen.getByRole("button", { name: "View actions for Default view" }),
    );
    const disabledDelete = screen.getByRole("menuitem", {
      name: "Delete view",
    });
    expect(disabledDelete).toBeDisabled();
    expect(disabledDelete).toHaveAttribute(
      "title",
      "At least one visual view is required.",
    );
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      screen.getByRole("button", { name: "Create and switch" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "View actions for Default view" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Delete view" }),
    );

    const dialog = screen.getByRole("alertdialog", { name: "Delete view" });
    expect(
      within(dialog).getByText(
        /source model and capabilities are not deleted/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Undo can restore the view/i),
    ).toBeInTheDocument();
  });

  it("renders depth-limited view endpoints as leaf cards", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));
    await userEvent.selectOptions(
      screen.getByLabelText("View template"),
      "level-1-map@1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create and switch" }),
    );

    const canvas = screen.getByTestId("canvas");
    const customerNode = within(canvas)
      .getByText("Customer")
      .closest(".cc-node") as HTMLElement;
    const rootNode = within(canvas)
      .getByText("Retail Banking")
      .closest(".cc-node") as HTMLElement;

    expect(customerNode).not.toHaveClass("cc-node-container");
    expect(
      customerNode.querySelector(".cc-node-title"),
    ).not.toBeInTheDocument();
    expect(rootNode).toHaveClass("cc-node-container");
    expect(within(canvas).queryByText("Channels")).not.toBeInTheDocument();
  });

  it("shows template and saved view descriptions in the views drawer", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));

    expect(
      screen.getAllByText(
        "Current active view with no level filter or export framing.",
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

    await userEvent.click(
      screen.getByRole("button", { name: "Create and switch" }),
    );
    expect(
      screen.getAllByText(
        "Top three levels with deeper branches collapsed and 16:9 export framing.",
      ).length,
    ).toBeGreaterThan(1);
  });

  it("creates domain deep-dive views from the selected capability", async () => {
    useUiStore.getState().setSelection(["operations"]);
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));
    await userEvent.selectOptions(
      screen.getByLabelText("View template"),
      "domain-deep-dive@1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create and switch" }),
    );

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
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Open views" }));
    await userEvent.selectOptions(
      screen.getByLabelText("View template"),
      "executive-overview@1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create and switch" }),
    );
    act(() => {
      useDocumentStore.getState().execute(
        updateVisualNodeState("view-default", "account-management", {
          isOnCanvas: false,
        }),
      );
    });

    await userEvent.click(
      screen.getByRole("button", { name: "View actions for Default view" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Reset from template" }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Reset from template",
    });
    expect(
      within(dialog).getByText(/Full model default template/),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Reset view" }),
    );

    const doc = useDocumentStore.getState().doc;
    const defaultView = resolveVisualDocument(doc, "view-default");
    const executiveView = resolveVisualDocument(doc, doc.visual.activeViewId);
    expect(defaultView.nodesById["account-management"]?.isOnCanvas).toBe(true);
    expect(executiveView.nodesById["account-management"]?.isOnCanvas).toBe(
      false,
    );
  });
});
