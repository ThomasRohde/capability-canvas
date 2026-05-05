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
  MAX_PORTABLE_VIEWER_URL_LENGTH,
} from "../viewer/viewerLinks";

const FORMATS: Array<{ format: ExportFormat; tab: string; desc: string }> = [
  {
    format: "json",
    tab: "JSON",
    desc: "Full fidelity model with manual layout and styling.",
  },
  {
    format: "svg",
    tab: "SVG",
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
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerLinkError, setViewerLinkError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [validationRunAt, setValidationRunAt] = useState<number | null>(null);
  const validation = useMemo(() => validateDocument(doc), [doc]);
  const serializedDocument = useMemo(
    () => JSON.stringify(serializeDocument(doc)),
    [doc],
  );
  const viewerUrlTooLong = viewerUrl.length > MAX_PORTABLE_VIEWER_URL_LENGTH;
  const viewerLinkReady = viewerUrl !== "" && viewerLinkError === null;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setViewerUrl("");
    setViewerLinkError(null);
    setCopyNotice(null);
    void buildPortableViewerUrl(serializedDocument)
      .then((url) => {
        if (!cancelled) setViewerUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setViewerLinkError("Viewer link could not be prepared.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, serializedDocument]);

  useEffect(() => {
    if (!copyNotice) return;
    const timeout = window.setTimeout(() => setCopyNotice(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [copyNotice]);

  const copyViewerUrl = () => {
    if (!viewerLinkReady) return;
    void navigator.clipboard
      .writeText(viewerUrl)
      .then(() => setCopyNotice("Viewer link copied to clipboard"))
      .catch(() => setCopyNotice("Could not copy viewer link"));
  };

  const openViewerUrl = () => {
    if (!viewerLinkReady) return;
    window.open(viewerUrl, "_blank", "noopener,noreferrer");
  };

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
            <input
              className="cc-input"
              value={
                viewerLinkError ??
                (viewerLinkReady
                  ? viewerUrl
                  : "Preparing portable viewer link...")
              }
              readOnly
              aria-busy={!viewerLinkReady && viewerLinkError === null}
            />
            <IconButton
              icon={Copy}
              label="Copy viewer link"
              tooltip={
                viewerUrlTooLong
                  ? "This portable link is large. Export JSON if the recipient cannot open it."
                  : undefined
              }
              onClick={copyViewerUrl}
              disabled={!viewerLinkReady}
            />
          </div>
          {copyNotice && (
            <div className="cc-copy-notice" role="status" aria-live="polite">
              <CheckCircle2 size={14} />
              <span>{copyNotice}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          <button
            className="cc-btn"
            type="button"
            disabled={!viewerLinkReady}
            onClick={openViewerUrl}
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
