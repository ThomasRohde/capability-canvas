import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  RefreshCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { validateDocument } from "../../domain/validation/validate";
import { serializeDocument } from "../../domain/document/serialize";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { adapterFor, saveExportResult } from "../import-export";
import type { ExportFormat } from "../import-export/types";
import { IconButton } from "../shared/IconButton";
import {
  buildPortableViewerUrl,
  buildStoredViewerUrl,
  MAX_PORTABLE_VIEWER_URL_LENGTH,
  persistViewerDocument,
  storageKeyForViewerDocument,
} from "../viewer/viewerLinks";

const FORMATS: Array<{ format: ExportFormat; tab: string; desc: string }> = [
  {
    format: "json",
    tab: "JSON",
    desc: "Full fidelity model with manual layout and styling.",
  },
  {
    format: "svg",
    tab: "Visual",
    desc: "Vector visual export for documents and diagrams.",
  },
  {
    format: "html",
    tab: "HTML",
    desc: "Standalone browser-readable visual export.",
  },
  {
    format: "pptx",
    tab: "PowerPoint",
    desc: "Native PowerPoint shapes for slide decks.",
  },
  {
    format: "drawio",
    tab: "Draw.io",
    desc: "diagrams.net XML with nested containment cells.",
  },
  {
    format: "archimate",
    tab: "ArchiMate",
    desc: "ArchiMate Open Exchange XML export.",
  },
];

export function ExportDrawer() {
  const doc = useDocumentStore((state) => state.doc);
  const open = useUiStore((state) => state.activeDrawer === "export");
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const format = useUiStore((state) => state.exportFormat);
  const setFormat = useUiStore((state) => state.setExportFormat);
  const setDiagnostics = useDocumentStore((state) => state.setDiagnostics);
  const [busy, setBusy] = useState(false);
  const [validationRunAt, setValidationRunAt] = useState<number | null>(null);
  const validation = useMemo(() => validateDocument(doc), [doc]);
  const serializedDocument = useMemo(
    () => JSON.stringify(serializeDocument(doc)),
    [doc],
  );
  const portableViewerUrl = useMemo(
    () => buildPortableViewerUrl(serializedDocument),
    [serializedDocument],
  );
  const viewerUrlTooLong =
    portableViewerUrl.length > MAX_PORTABLE_VIEWER_URL_LENGTH;
  const viewerStorageKey = useMemo(
    () =>
      viewerUrlTooLong
        ? storageKeyForViewerDocument(serializedDocument)
        : null,
    [serializedDocument, viewerUrlTooLong],
  );
  const viewerUrl = viewerStorageKey
    ? buildStoredViewerUrl(viewerStorageKey)
    : portableViewerUrl;
  const ensureViewerUrl = () => {
    if (viewerStorageKey) {
      persistViewerDocument(viewerStorageKey, serializedDocument);
    }
    return viewerUrl;
  };

  useEffect(() => {
    if (!open || !viewerStorageKey) return;
    persistViewerDocument(viewerStorageKey, serializedDocument);
  }, [open, serializedDocument, viewerStorageKey]);

  if (!open) return null;
  const selected = FORMATS.find((item) => item.format === format)!;
  const validationRows = validationChecks(validation.diagnostics);

  return (
    <aside className="cc-export-drawer" aria-label="Export">
      <div className="cc-export-head">
        <div className="cc-panel-title">Export</div>
        <IconButton
          icon={X}
          label="Close export drawer"
          onClick={() => setActiveDrawer(null)}
        />
      </div>
      <div className="cc-export-tabs">
        {FORMATS.map((item) => (
          <button
            key={item.format}
            className={`cc-tab ${format === item.format ? "on" : ""}`}
            type="button"
            onClick={() => setFormat(item.format)}
          >
            {item.tab}
          </button>
        ))}
      </div>
      <div className="cc-export-body">
        <div className="cc-field">
          <span className="cc-section-title">Format</span>
          <div className="cc-format-card on">
            <Download size={18} />
            <span>
              <strong>{selected.tab}</strong>
              <br />
              <span style={{ color: "var(--cc-slate-600)", fontSize: 11 }}>
                {selected.desc}
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
          {validationRows.map((row) => (
            <div className="cc-validation-row" key={row.name}>
              <span
                style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
              >
                {row.count === 0 ? (
                  <CheckCircle2 size={16} color="#10b981" />
                ) : (
                  <TriangleAlert size={16} color="#f59e0b" />
                )}
                {row.name}
              </span>
              <span>{row.count === 0 ? "No issues" : `${row.count} issues`}</span>
            </div>
          ))}
        </div>
        <div className="cc-field">
          <span className="cc-section-title">Viewer link</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="cc-input" value={viewerUrl} readOnly />
            <IconButton
              icon={Copy}
              label="Copy viewer link"
              tooltip={
                viewerUrlTooLong
                  ? "Large documents use a link stored in this browser. Export JSON for a portable file."
                  : undefined
              }
              onClick={() => void navigator.clipboard.writeText(ensureViewerUrl())}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          <button
            className="cc-btn"
            type="button"
            onClick={() =>
              window.open(ensureViewerUrl(), "_blank", "noopener,noreferrer")
            }
          >
            Open viewer <ExternalLink size={14} />
          </button>
          <button
            className="cc-btn cc-btn-primary"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void Promise.resolve(adapterFor(format).exportDocument(doc))
                .then(saveExportResult)
                .finally(() => setBusy(false));
            }}
          >
            <Download /> Export file
          </button>
        </div>
      </div>
    </aside>
  );
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
