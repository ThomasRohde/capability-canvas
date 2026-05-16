import {
  CheckCircle2,
  Info,
  MessageSquare,
  PanelLeft,
  PanelRight,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { APP_VERSION } from "../../app/version";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import {
  isAutomaticLayoutMode,
  isSourceModelEditable,
} from "../../domain/layout/canvasLayoutPolicy";
import { IconButton } from "../shared/IconButton";

export function StatusBar({ readonly = false }: { readonly?: boolean }) {
  const doc = useDocumentStore((state) => state.doc);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const diagnostics = useDocumentStore((state) => state.lastDiagnostics);
  const saveStatus = useDocumentStore((state) => state.saveStatus);
  const lastSaveError = useDocumentStore((state) => state.lastSaveError);
  const lastRestoredAt = useDocumentStore((state) => state.lastRestoredAt);
  const clearDiagnostics = useDocumentStore((state) => state.clearDiagnostics);
  const outlineOpen = useUiStore((state) => state.outlineOpen);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const toggleOutline = useUiStore((state) => state.toggleOutline);
  const toggleInspector = useUiStore((state) => state.toggleInspector);
  const selectionNotice = useUiStore((state) => state.selectionNotice);
  const clearSelectionNotice = useUiStore(
    (state) => state.clearSelectionNotice,
  );
  const setSelection = useUiStore((state) => state.setSelection);
  const setInspectorOpen = useUiStore((state) => state.setInspectorOpen);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const diagnosticCount = diagnostics.length;
  const outlineLabel = readonly
    ? outlineOpen
      ? "Hide outline"
      : "Show outline"
    : outlineOpen
      ? "Hide outline"
      : "Show outline";
  const inspectorLabel = readonly
    ? inspectorOpen
      ? "Hide details"
      : "Show details"
    : inspectorOpen
      ? "Hide inspector"
      : "Show inspector";
  const saveText = readonly
    ? { primary: "Read-only view", secondary: "Read-only" }
    : statusText(saveStatus, lastSaveError, lastRestoredAt);
  const layoutModeLabel = formatLayoutMode(doc.settings.layoutMode);
  const editableLabel = readonly
    ? "Read-only route"
    : isSourceModelEditable(doc)
      ? "Source editable"
      : "Source locked";

  useEffect(() => {
    if (!selectionNotice) return;
    const timeout = window.setTimeout(clearSelectionNotice, 3200);
    return () => window.clearTimeout(timeout);
  }, [clearSelectionNotice, selectionNotice]);

  const selectDiagnosticNode = (nodeId: string) => {
    if (!doc.nodesById[nodeId]) return;
    setSelection([nodeId]);
    setInspectorOpen(true);
  };

  return (
    <footer className="cc-status">
      <span className="cc-dot" />
      <span className="cc-version">v{APP_VERSION}</span>
      <span className="cc-divider" style={{ height: 14 }} />
      <span>{saveText.primary}</span>
      <span className="cc-divider" style={{ height: 14 }} />
      <span>{saveText.secondary}</span>
      <span className="cc-divider" style={{ height: 14 }} />
      <span
        className="cc-status-chip"
        aria-label={`Layout mode ${layoutModeLabel}`}
      >
        {layoutModeLabel}
      </span>
      <span
        className={`cc-status-chip ${
          readonly || !isSourceModelEditable(doc) ? "locked" : ""
        }`}
        aria-label={`Model editability ${editableLabel}`}
      >
        {editableLabel}
      </span>
      {diagnostics.length > 0 && (
        <>
          <span className="cc-divider" style={{ height: 14 }} />
          <span>{diagnostics.length} diagnostics</span>
        </>
      )}
      {selectionNotice && (
        <>
          <span className="cc-divider" style={{ height: 14 }} />
          <span
            className="cc-selection-notice"
            role="status"
            aria-live="polite"
          >
            {selectionNotice.message}
          </span>
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
          icon={PanelLeft}
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
              {diagnostics.map((diagnostic, index) => {
                const actionable =
                  !!diagnostic.nodeId && !!doc.nodesById[diagnostic.nodeId];
                return (
                  <li
                    key={`${diagnostic.code}-${diagnostic.nodeId ?? "document"}-${index}`}
                    className={actionable ? "actionable" : undefined}
                    role={actionable ? "button" : undefined}
                    tabIndex={actionable ? 0 : undefined}
                    onClick={
                      actionable && diagnostic.nodeId
                        ? () => selectDiagnosticNode(diagnostic.nodeId!)
                        : undefined
                    }
                    onKeyDown={
                      actionable && diagnostic.nodeId
                        ? (event) => {
                            if (event.key !== "Enter" && event.key !== " ") {
                              return;
                            }
                            event.preventDefault();
                            selectDiagnosticNode(diagnostic.nodeId!);
                          }
                        : undefined
                    }
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
                );
              })}
            </ul>
          )}
        </div>
      )}
    </footer>
  );
}

function formatLayoutMode(mode: ReturnType<typeof useDocumentStore.getState>["doc"]["settings"]["layoutMode"]): string {
  if (mode === "free") return "Manual layout: Freeform";
  const label = `${mode.slice(0, 1).toUpperCase()}${mode.slice(1)}`;
  return isAutomaticLayoutMode(mode)
    ? `Automatic layout: ${label}`
    : `Layout: ${label}`;
}

function statusText(
  saveStatus: ReturnType<typeof useDocumentStore.getState>["saveStatus"],
  lastSaveError: string | undefined,
  lastRestoredAt: number | undefined,
) {
  if (saveStatus === "dirty") {
    return {
      primary: "Unsaved local changes",
      secondary: "Waiting to save locally",
    };
  }
  if (saveStatus === "saving") {
    return {
      primary: "Saving locally...",
      secondary: "Local draft pending",
    };
  }
  if (saveStatus === "saved") {
    return {
      primary: "Saved locally just now",
      secondary: "Local draft saved",
    };
  }
  if (saveStatus === "error") {
    return {
      primary: "Save failed",
      secondary: lastSaveError ?? "Local save failed",
    };
  }
  if (lastRestoredAt) {
    return {
      primary: "Restored local draft",
      secondary: "No local changes",
    };
  }
  return {
    primary: "No local changes",
    secondary: "Local draft idle",
  };
}
