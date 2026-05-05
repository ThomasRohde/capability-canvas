import {
  CheckCircle2,
  Info,
  Layers,
  MessageSquare,
  PanelRight,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { APP_VERSION } from "../../app/version";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { IconButton } from "../shared/IconButton";

export function StatusBar({ readonly = false }: { readonly?: boolean }) {
  const doc = useDocumentStore((state) => state.doc);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const diagnostics = useDocumentStore((state) => state.lastDiagnostics);
  const clearDiagnostics = useDocumentStore((state) => state.clearDiagnostics);
  const outlineOpen = useUiStore((state) => state.outlineOpen);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const toggleOutline = useUiStore((state) => state.toggleOutline);
  const toggleInspector = useUiStore((state) => state.toggleInspector);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const diagnosticCount = diagnostics.length;
  const outlineLabel = readonly
    ? outlineOpen
      ? "Hide outline"
      : "Show outline"
    : outlineOpen
      ? "Hide layers"
      : "Show layers";
  const inspectorLabel = readonly
    ? inspectorOpen
      ? "Hide details"
      : "Show details"
    : inspectorOpen
      ? "Hide inspector"
      : "Show inspector";

  return (
    <footer className="cc-status">
      <span className="cc-dot" />
      <span className="cc-version">v{APP_VERSION}</span>
      <span className="cc-divider" style={{ height: 14 }} />
      <span>{readonly ? "Loaded from URL" : "Local autosaved"}</span>
      <span className="cc-divider" style={{ height: 14 }} />
      <span>{readonly ? "Read-only" : "All changes saved locally"}</span>
      {diagnostics.length > 0 && (
        <>
          <span className="cc-divider" style={{ height: 14 }} />
          <span>{diagnostics.length} diagnostics</span>
        </>
      )}
      <span className="cc-spacer" />
      <span>
        {readonly
          ? `${Object.keys(doc.nodesById).length} capabilities`
          : `${selected.length} selected`}
      </span>
      <span className="cc-status-actions">
        <IconButton
          icon={Layers}
          label={outlineLabel}
          active={outlineOpen}
          onClick={toggleOutline}
        />
        {!readonly && (
          <button
            type="button"
            className={`cc-icon-btn cc-status-message-btn ${diagnosticsOpen ? "active" : ""}`}
            aria-label="Diagnostics"
            aria-pressed={diagnosticsOpen}
            title="Diagnostics"
            onClick={() => setDiagnosticsOpen((open) => !open)}
          >
            <MessageSquare aria-hidden="true" />
            {diagnosticCount > 0 && (
              <span className="cc-status-badge">{diagnosticCount}</span>
            )}
          </button>
        )}
        <IconButton
          icon={PanelRight}
          label={inspectorLabel}
          active={inspectorOpen}
          onClick={toggleInspector}
        />
      </span>
      {diagnosticsOpen && !readonly && (
        <div
          className="cc-status-popover"
          role="dialog"
          aria-label="Diagnostics"
        >
          <div className="cc-status-popover-head">
            <div className="cc-panel-title">Diagnostics</div>
            <div className="cc-status-popover-actions">
              {diagnosticCount > 0 && (
                <button
                  className="cc-status-link-btn"
                  type="button"
                  onClick={clearDiagnostics}
                >
                  Clear
                </button>
              )}
              <IconButton
                icon={X}
                label="Close diagnostics"
                onClick={() => setDiagnosticsOpen(false)}
              />
            </div>
          </div>
          {diagnosticCount === 0 ? (
            <div className="cc-status-empty">
              <CheckCircle2 size={16} />
              <span>No diagnostics</span>
            </div>
          ) : (
            <ul className="cc-diagnostic-list">
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
          )}
        </div>
      )}
    </footer>
  );
}
