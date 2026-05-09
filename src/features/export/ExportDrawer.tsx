import {
  CheckCircle2,
  Download,
  Info,
  RefreshCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { validateDocument } from "../../domain/validation/validate";
import {
  error as diagnosticError,
  type Diagnostic,
} from "../../domain/validation/diagnostics";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { adapterFor, EXPORT_ADAPTERS, saveExportResult } from "../import-export";
import type { ExportAdapter, ExportFormat, ExportResult } from "../import-export/types";
import { useFocusReturn } from "../shared/a11y";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { IconButton } from "../shared/IconButton";

type ExportStatus = {
  type: "success" | "warning" | "error";
  message: string;
};

interface ExportDrawerProps {
  adapters?: ExportAdapter[];
  adapterForExport?: (format: ExportFormat) => ExportAdapter;
  saveExport?: (result: ExportResult) => Promise<void> | void;
}

export function ExportDrawer({
  adapters = EXPORT_ADAPTERS,
  adapterForExport = adapterFor,
  saveExport = saveExportResult,
}: ExportDrawerProps = {}) {
  const doc = useDocumentStore((state) => state.doc);
  const open = useUiStore((state) => state.activeDrawer === "export");
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const format = useUiStore((state) => state.exportFormat);
  const setFormat = useUiStore((state) => state.setExportFormat);
  const setDiagnostics = useDocumentStore((state) => state.setDiagnostics);
  const [busy, setBusy] = useState(false);
  const [validationRunAt, setValidationRunAt] = useState<number | null>(null);
  const [exportDiagnostics, setExportDiagnostics] = useState<Diagnostic[]>([]);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [pendingExportFormat, setPendingExportFormat] =
    useState<ExportFormat | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const validation = useMemo(() => validateDocument(doc), [doc]);
  const validationErrors = validation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );

  useEffect(() => {
    if (!open) return;
    setValidationRunAt(Date.now());
    setDiagnostics(validation.diagnostics);
  }, [open, setDiagnostics, validation.diagnostics]);

  useEffect(() => {
    if (!open) return;
    setExportDiagnostics([]);
    setExportStatus(null);
    setPendingExportFormat(null);
  }, [format, open]);

  useFocusReturn({ active: open, initialFocusRef: closeRef });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[aria-modal='true']"))
        setActiveDrawer(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setActiveDrawer]);

  if (!open) return null;
  const selected =
    adapters.find((item) => item.format === format) ?? adapterForExport(format);
  const validationRows = validationChecks(validation.diagnostics);
  const blockedByValidation =
    selected.requiresValidDocument && validationErrors.length > 0;

  return (
    <>
      <aside className="cc-export-drawer" aria-label="Export">
        <div className="cc-export-head">
          <div className="cc-panel-title">Export</div>
          <IconButton
            ref={closeRef}
            icon={X}
            label="Close export drawer"
            onClick={() => setActiveDrawer(null)}
          />
        </div>
        <div className="cc-export-tabs">
          {adapters.map((item) => (
            <button
              key={item.format}
              className={`cc-tab ${format === item.format ? "on" : ""}`}
              type="button"
              onClick={() => setFormat(item.format)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="cc-export-body">
          <div className="cc-field">
            <span className="cc-section-title">Format</span>
            <div className="cc-format-card on">
              <Download size={18} />
              <span>
                <strong>{selected.label}</strong>
                <br />
                <span style={{ color: "var(--cc-slate-600)", fontSize: 11 }}>
                  {selected.description}
                </span>
                <span className="cc-export-contract">
                  <span>{scopeCopy(selected)}</span>
                  <span>{hiddenNodeCopy(selected)}</span>
                  <span>{heatmapCopy(selected)}</span>
                  <span>{legendCopy(selected)}</span>
                </span>
              </span>
            </div>
          </div>
          <div className="cc-field">
            <span className="cc-section-title">Validate</span>
            <button
              className="cc-btn"
              type="button"
              onClick={() => {
                setDiagnostics(validation.diagnostics);
                setValidationRunAt(Date.now());
              }}
            >
              <RefreshCcw /> Run validation
            </button>
            {validationRunAt !== null && (
              <div
                className={`cc-validation-result ${validation.valid ? "valid" : "invalid"}`}
              >
                {validation.valid ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <TriangleAlert size={16} />
                )}
                <span>
                  {validation.valid
                    ? "Validation passed"
                    : `${validation.diagnostics.length} issues found`}
                </span>
              </div>
            )}
            {blockedByValidation && (
              <div className="cc-validation-result invalid" role="alert">
                <TriangleAlert size={16} />
                <span>
                  {selected.label} export is blocked until validation errors are
                  repaired.
                </span>
              </div>
            )}
            {validationRows.map((row) => (
              <div className="cc-validation-row" key={row.name}>
                <span
                  style={{
                    display: "inline-flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  {row.count === 0 ? (
                    <CheckCircle2 size={16} color="#10b981" />
                  ) : (
                    <TriangleAlert size={16} color="#f59e0b" />
                  )}
                  {row.name}
                </span>
                <span>
                  {row.count === 0 ? "No issues" : `${row.count} issues`}
                </span>
              </div>
            ))}
            {validation.diagnostics.length > 0 && (
              <DiagnosticList diagnostics={validation.diagnostics} />
            )}
          </div>
          {(exportStatus || exportDiagnostics.length > 0) && (
            <div className="cc-field">
              <span className="cc-section-title">Export status</span>
              {exportStatus && (
                <div
                  className={`cc-export-status ${exportStatus.type}`}
                  role={exportStatus.type === "success" ? "status" : "alert"}
                >
                  {exportStatus.type === "success" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <TriangleAlert size={16} />
                  )}
                  <span>{exportStatus.message}</span>
                </div>
              )}
              {exportDiagnostics.length > 0 && (
                <DiagnosticList diagnostics={exportDiagnostics} />
              )}
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "auto",
            }}
          >
            <button
              className="cc-btn cc-btn-primary"
              type="button"
              disabled={busy || blockedByValidation}
              onClick={() => attemptExport()}
            >
              <Download /> {busy ? "Exporting..." : "Export file"}
            </button>
          </div>
        </div>
      </aside>
      {pendingExportFormat && (
        <ConfirmDialog
          title="Export anyway"
          body={`${adapterForExport(pendingExportFormat).label} can export the source model, but validation reported ${validationErrors.length} error${validationErrors.length === 1 ? "" : "s"}. The exported file may preserve invalid data. Export anyway?`}
          confirmLabel="Export anyway"
          onCancel={() => setPendingExportFormat(null)}
          onConfirm={() => {
            const nextFormat = pendingExportFormat;
            setPendingExportFormat(null);
            const nextValidation = validateDocument(doc);
            setValidationRunAt(Date.now());
            void performExport(nextFormat, nextValidation);
          }}
        />
      )}
    </>
  );

  function attemptExport() {
    const nextValidation = validateDocument(doc);
    const nextErrors = nextValidation.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    setValidationRunAt(Date.now());
    setDiagnostics(nextValidation.diagnostics);
    setExportDiagnostics([]);
    if (nextErrors.length > 0 && selected.requiresValidDocument) {
      setExportStatus({
        type: "error",
        message: `${selected.label} export is blocked until validation errors are repaired.`,
      });
      return;
    }
    if (nextErrors.length > 0) {
      setExportStatus({
        type: "warning",
        message: `${selected.label} export requires confirmation because validation has errors.`,
      });
      setPendingExportFormat(format);
      return;
    }
    void performExport(format, nextValidation);
  }

  async function performExport(
    exportFormat: ExportFormat,
    currentValidation: ReturnType<typeof validateDocument>,
  ) {
    const adapter = adapterForExport(exportFormat);
    setBusy(true);
    setExportStatus(null);
    try {
      const result = await Promise.resolve(adapter.exportDocument(doc));
      const combinedDiagnostics = [
        ...currentValidation.diagnostics,
        ...result.diagnostics,
      ];
      setExportDiagnostics(result.diagnostics);
      setDiagnostics(combinedDiagnostics);
      await saveExport(result);
      setExportStatus({
        type: "success",
        message: `${adapter.label} export saved as ${result.filename}.`,
      });
    } catch (exportError) {
      const diagnostic = diagnosticError(
        "export-failed",
        `Export failed. ${errorMessage(exportError)} Try a different format or repair validation issues before retrying.`,
      );
      setExportDiagnostics([diagnostic]);
      setDiagnostics([...currentValidation.diagnostics, diagnostic]);
      setExportStatus({ type: "error", message: diagnostic.message });
    } finally {
      setBusy(false);
    }
  }
}

function validationChecks(diagnostics: ReturnType<typeof validateDocument>["diagnostics"]) {
  const countCodes = (codes: string[]) =>
    diagnostics.filter((diagnostic) => codes.includes(diagnostic.code)).length;
  return [
    {
      name: "Hierarchy",
      count: countCodes([
        "cycle",
        "invalid-root-type",
        "root-has-parent",
        "text-label-has-children",
      ]),
    },
    {
      name: "Parent references",
      count: countCodes(["missing-parent", "orphan-node"]),
    },
    {
      name: "Geometry",
      count: countCodes(["invalid-geometry", "invalid-dimensions"]),
    },
    {
      name: "Heatmap values",
      count: countCodes(["invalid-heatmap-value"]),
    },
  ];
}

function scopeCopy(adapter: ExportAdapter): string {
  return adapter.scope === "full-model"
    ? "Exports the full source model."
    : "Exports the active visual view.";
}

function hiddenNodeCopy(adapter: ExportAdapter): string {
  return adapter.hiddenNodes === "included"
    ? "Includes nodes hidden from the active view."
    : "Excludes nodes hidden from the active view.";
}

function heatmapCopy(adapter: ExportAdapter): string {
  if (adapter.heatmap === "source-settings") {
    return "Includes heatmap values and settings as source data.";
  }
  if (adapter.heatmap === "active-view-display") {
    return "Uses active view heatmap colors and scores when enabled.";
  }
  return "Does not include heatmap data.";
}

function legendCopy(adapter: ExportAdapter): string {
  if (adapter.legend === "source-settings") {
    return "Stores legend settings as source data.";
  }
  if (adapter.legend === "active-view-display") {
    return "Renders the active view heatmap legend when enabled.";
  }
  return "Does not render the heatmap legend yet.";
}

function DiagnosticList({ diagnostics }: { diagnostics: Diagnostic[] }) {
  return (
    <ul className="cc-diagnostic-list cc-export-diagnostics">
      {diagnostics.map((diagnostic, index) => (
        <li
          key={`${diagnostic.code}-${diagnostic.nodeId ?? "document"}-${index}`}
        >
          {diagnostic.severity === "info" ? (
            <Info size={15} />
          ) : (
            <TriangleAlert size={15} />
          )}
          <span>
            <strong>{diagnostic.code}</strong>
            <span>{diagnostic.message}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
