import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useDocumentStore } from "../../app/stores/documentStore";
import { createVisualView } from "../../domain/commands/operations";
import {
  serializeDocument,
  stringifyDocument,
} from "../../domain/document/serialize";
import { installEditorTestHooks, renderViewer } from "../../test/editorHarness";

describe("viewer route workflows", () => {
  installEditorTestHooks();

  it("hides outline mutation controls in the viewer route", () => {
    renderViewer();

    expect(
      screen.queryByRole("button", { name: "Add root capability" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Actions for Customer" }),
    ).not.toBeInTheDocument();
  });

  it("keeps viewer fit and heatmap controls non-mutating", async () => {
    renderViewer();
    const before = stringifyDocument(useDocumentStore.getState().doc);

    await userEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(stringifyDocument(useDocumentStore.getState().doc)).toBe(before);

    await userEvent.click(screen.getByRole("button", { name: "Heatmap" }));
    expect(stringifyDocument(useDocumentStore.getState().doc)).toBe(before);
    expect(within(screen.getByTestId("canvas")).getByText("0.72")).toHaveClass(
      "leaf-score",
    );
  });

  it("keeps viewer command palette read-only", async () => {
    renderViewer();
    const before = stringifyDocument(useDocumentStore.getState().doc);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    let palette = screen.getByRole("dialog", { name: "Command palette" });
    await userEvent.type(
      within(palette).getByLabelText("Search commands"),
      "Delete",
    );
    expect(
      within(palette).getByText("No matching commands"),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    palette = screen.getByRole("dialog", { name: "Command palette" });
    await userEvent.type(
      within(palette).getByLabelText("Search commands"),
      "Heatmap",
    );
    await userEvent.keyboard("{Enter}");
    expect(stringifyDocument(useDocumentStore.getState().doc)).toBe(before);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    palette = screen.getByRole("dialog", { name: "Command palette" });
    await userEvent.type(
      within(palette).getByLabelText("Search commands"),
      "Fit view",
    );
    await userEvent.keyboard("{Enter}");
    expect(stringifyDocument(useDocumentStore.getState().doc)).toBe(before);
  });

  it("switches viewer visual views without mutating the stored document", async () => {
    useDocumentStore
      .getState()
      .execute(createVisualView({ name: "Second view" }));
    const before = JSON.stringify(
      serializeDocument(useDocumentStore.getState().doc),
    );

    renderViewer();
    await userEvent.click(
      screen.getByRole("button", { name: "Switch visual view" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Default view/ }),
    );

    expect(
      JSON.stringify(serializeDocument(useDocumentStore.getState().doc)),
    ).toBe(before);
  });

  it("collapses and restores viewer side panels", async () => {
    const { container } = renderViewer();
    const workspace = container.querySelector(
      ".cc-viewer-workspace",
    ) as HTMLElement;

    await userEvent.click(
      screen.getByRole("button", { name: "Collapse outline" }),
    );
    expect(workspace).toHaveClass("outline-closed");
    expect(screen.queryByText("Outline")).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show outline" }));
    expect(workspace).not.toHaveClass("outline-closed");
    expect(screen.getByText("Outline")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Collapse inspector" }),
    );
    expect(workspace).toHaveClass("inspector-closed");
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(workspace).not.toHaveClass("inspector-closed");
    expect(screen.getByText("Details")).toBeInTheDocument();
  });
});
