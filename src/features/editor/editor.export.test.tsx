import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { ExportDrawer } from "../export/ExportDrawer";
import type {
  ExportAdapter,
  ExportFormat,
  ExportResult,
} from "../import-export/types";
import { installEditorTestHooks, renderEditor } from "../../test/editorHarness";

describe("editor export workflows", () => {
  installEditorTestHooks();

  it("runs export validation and renders the selected format as display content", async () => {
    const { container } = renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(container.querySelector(".cc-format-card")?.tagName).toBe("DIV");
    expect(
      screen.getByText("Exports the full source model."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Validation passed")).toBeInTheDocument();
  });

  it("blocks visual export when validation has errors", async () => {
    const exportDocument = vi.fn(() => exportResult("svg"));
    const saveExport = vi.fn();
    const adapter = exportAdapter({
      format: "svg",
      label: "SVG",
      requiresValidDocument: true,
      exportDocument,
    });
    setInvalidExportDocument("svg");

    render(
      <ExportDrawer
        adapters={[adapter]}
        adapterForExport={() => adapter}
        saveExport={saveExport}
      />,
    );

    expect(
      await screen.findByText(/SVG export is blocked until validation errors/),
    ).toBeInTheDocument();
    const exportButton = screen.getByRole("button", { name: "Export file" });
    expect(exportButton).toBeDisabled();
    await userEvent.click(exportButton);
    expect(exportDocument).not.toHaveBeenCalled();
    expect(saveExport).not.toHaveBeenCalled();
  });

  it("requires confirmation before JSON export with validation errors", async () => {
    const exportDocument = vi.fn(() => exportResult("json"));
    const saveExport = vi.fn();
    const adapter = exportAdapter({
      format: "json",
      label: "JSON",
      scope: "full-model",
      requiresValidDocument: false,
      hiddenNodes: "included",
      heatmap: "source-settings",
      legend: "source-settings",
      exportDocument,
    });
    setInvalidExportDocument("json");

    render(
      <ExportDrawer
        adapters={[adapter]}
        adapterForExport={() => adapter}
        saveExport={saveExport}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Export file" }));
    const dialog = screen.getByRole("alertdialog", { name: "Export anyway" });
    expect(exportDocument).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Export anyway" }),
    );

    await waitFor(() => expect(exportDocument).toHaveBeenCalledTimes(1));
    expect(saveExport).toHaveBeenCalledTimes(1);
  });

  it("surfaces adapter export failures as diagnostics", async () => {
    const exportDocument = vi.fn(() => {
      throw new Error("Adapter exploded");
    });
    const adapter = exportAdapter({ exportDocument });
    useUiStore.setState({ activeDrawer: "export", exportFormat: "svg" });

    render(
      <ExportDrawer adapters={[adapter]} adapterForExport={() => adapter} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Export file" }));

    await waitFor(() =>
      expect(
        screen.getAllByText(/Export failed\. Adapter exploded/).length,
      ).toBeGreaterThan(0),
    );
    expect(
      useDocumentStore
        .getState()
        .lastDiagnostics.some(
          (diagnostic) => diagnostic.code === "export-failed",
        ),
    ).toBe(true);
  });

  it("keeps export busy state until save completes", async () => {
    let resolveExport: (result: ExportResult) => void = () => {};
    const exportDocument = vi.fn(
      () =>
        new Promise<ExportResult>((resolve) => {
          resolveExport = resolve;
        }),
    );
    const saveExport = vi.fn(() => Promise.resolve());
    const adapter = exportAdapter({ exportDocument });
    useUiStore.setState({ activeDrawer: "export", exportFormat: "svg" });

    render(
      <ExportDrawer
        adapters={[adapter]}
        adapterForExport={() => adapter}
        saveExport={saveExport}
      />,
    );

    const exportButton = screen.getByRole("button", { name: "Export file" });
    await userEvent.click(exportButton);
    expect(screen.getByRole("button", { name: "Exporting..." })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Exporting..." }));
    expect(exportDocument).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveExport(exportResult("svg"));
    });

    await waitFor(() => expect(saveExport).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent(
      "SVG export saved as export.svg.",
    );
  });
});

function exportAdapter(overrides: Partial<ExportAdapter> = {}): ExportAdapter {
  const format = overrides.format ?? "svg";
  return {
    format,
    label: format === "svg" ? "SVG" : format.toUpperCase(),
    description: "Test export adapter",
    scope: "active-view",
    requiresValidDocument: true,
    hiddenNodes: "excluded",
    heatmap: "active-view-display",
    legend: "not-rendered",
    exportDocument: () => exportResult(format),
    ...overrides,
  };
}

function exportResult(format: ExportFormat): ExportResult {
  return {
    format,
    filename: `export.${format}`,
    mimeType: "text/plain",
    data: "export",
    diagnostics: [],
  };
}

function setInvalidExportDocument(format: ExportFormat) {
  const doc = useDocumentStore.getState().doc;
  const node = doc.nodesById["digital-onboarding"]!;
  useDocumentStore.setState({
    doc: {
      ...doc,
      nodesById: {
        ...doc.nodesById,
        [node.id]: { ...node, w: 0 },
      },
    },
  });
  useUiStore.setState({ activeDrawer: "export", exportFormat: format });
}
