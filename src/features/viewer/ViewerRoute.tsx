import { Download, ExternalLink } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { serializeDocument } from "../../domain/document/serialize";
import type { VisualViewId, VisualViewport } from "../../domain/document/types";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { Canvas } from "../canvas/Canvas";
import { fitViewportToBounds } from "../canvas/viewport";
import { CommandPalette } from "../commands/CommandPalette";
import { ShortcutHelp } from "../commands/ShortcutHelp";
import {
  createViewerCommandRegistry,
  type ViewerCommandContext,
} from "../commands/viewerCommands";
import { adapterFor, saveExportResult } from "../import-export";
import { Inspector } from "../inspector/Inspector";
import { Outline } from "../outline/Outline";
import { StatusBar } from "../editor/StatusBar";
import { ViewSwitcher } from "../views/ViewSwitcher";
import { resolveViewerDocument } from "./resolveViewerDocument";

const DEFAULT_VIEWPORT: VisualViewport = { x: 0, y: 0, zoom: 1 };

export function ViewerRoute() {
  const doc = useDocumentStore((state) => state.doc);
  const [viewerActiveViewId, setViewerActiveViewId] =
    useState<VisualViewId>(doc.visual.activeViewId);
  const [viewerViewportByViewId, setViewerViewportByViewId] = useState<
    Record<VisualViewId, VisualViewport>
  >({});
  const [viewerHeatmapEnabledByViewId, setViewerHeatmapEnabledByViewId] =
    useState<Record<VisualViewId, boolean>>({});
  const setViewport = useUiStore((state) => state.setViewport);
  const setSelection = useUiStore((state) => state.setSelection);
  const canvasSize = useUiStore((state) => state.canvasSize);
  const outlineOpen = useUiStore((state) => state.outlineOpen);
  const outlineWidth = useUiStore((state) => state.outlineWidth);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const toggleOutline = useUiStore((state) => state.toggleOutline);
  const toggleInspector = useUiStore((state) => state.toggleInspector);
  const commandRegistry = useMemo(() => createViewerCommandRegistry(), []);
  const displayDoc = useMemo(
    () =>
      resolveViewerDocument(doc, {
        activeViewId: viewerActiveViewId,
        heatmapEnabledByViewId: viewerHeatmapEnabledByViewId,
      }),
    [doc, viewerActiveViewId, viewerHeatmapEnabledByViewId],
  );
  const viewDoc = useMemo(() => resolveVisualDocument(displayDoc), [displayDoc]);
  const workspaceStyle = {
    "--cc-outline-width": `${outlineWidth}px`,
  } as CSSProperties;

  useEffect(() => {
    if (doc.visual.viewsById[viewerActiveViewId]) return;
    setViewerActiveViewId(doc.visual.activeViewId);
  }, [doc.visual.activeViewId, doc.visual.viewsById, viewerActiveViewId]);

  const commitViewerViewport = useCallback(
    (viewport: VisualViewport) => {
      setViewport(viewport);
      setViewerViewportByViewId((previous) => ({
        ...previous,
        [viewerActiveViewId]: viewport,
      }));
    },
    [setViewport, viewerActiveViewId],
  );

  const switchViewerView = useCallback(
    (viewId: VisualViewId) => {
      if (!doc.visual.viewsById[viewId]) return;
      const currentViewport = useUiStore.getState().viewport;
      const nextViewportByViewId = {
        ...viewerViewportByViewId,
        [viewerActiveViewId]: currentViewport,
      };
      setViewerViewportByViewId(nextViewportByViewId);
      setViewerActiveViewId(viewId);
      setViewport(
        nextViewportByViewId[viewId] ??
          doc.visual.viewsById[viewId]?.viewport ??
          DEFAULT_VIEWPORT,
      );

      const nextDoc = resolveViewerDocument(doc, {
        activeViewId: viewId,
        heatmapEnabledByViewId: viewerHeatmapEnabledByViewId,
      });
      const resolved = resolveVisualDocument(nextDoc);
      const selected = useUiStore.getState().selectedNodeIds;
      const nextSelection = selected.filter(
        (nodeId) => resolved.nodesById[nodeId]?.isOnCanvas,
      );
      if (nextSelection.length !== selected.length) setSelection(nextSelection);
    },
    [
      doc,
      setSelection,
      setViewport,
      viewerActiveViewId,
      viewerHeatmapEnabledByViewId,
      viewerViewportByViewId,
    ],
  );

  const fitViewerViewport = useCallback(() => {
    const nextViewport = fitViewportToBounds(viewDoc.layout.boundingBox, canvasSize);
    if (nextViewport) commitViewerViewport(nextViewport);
  }, [canvasSize, commitViewerViewport, viewDoc.layout.boundingBox]);

  const toggleViewerHeatmap = useCallback(() => {
    setViewerHeatmapEnabledByViewId((previous) => ({
      ...previous,
      [viewerActiveViewId]: !viewDoc.heatmap.enabled,
    }));
  }, [viewDoc.heatmap.enabled, viewerActiveViewId]);

  const exportVisual = useCallback(() => {
    void Promise.resolve(adapterFor("svg").exportDocument(displayDoc)).then(
      saveExportResult,
    );
  }, [displayDoc]);

  const importIntoEditor = useCallback(() => {
    const importDoc = resolveViewerDocument(doc, {
      activeViewId: viewerActiveViewId,
    });
    localStorage.setItem(
      "capability-canvas.import",
      JSON.stringify(serializeDocument(importDoc)),
    );
    window.location.href = import.meta.env.BASE_URL;
  }, [doc, viewerActiveViewId]);

  const commandContext: ViewerCommandContext = {
    hasFitBounds:
      viewDoc.layout.boundingBox.w > 0 && viewDoc.layout.boundingBox.h > 0,
    actions: {
      fitView: fitViewerViewport,
      toggleHeatmap: toggleViewerHeatmap,
      exportVisual,
      importIntoEditor,
      toggleOutline,
      toggleInspector,
    },
  };

  return (
    <div className="cc-app cc-viewer">
      <header className="cc-toolbar">
        <div className="cc-brand">
          <img
            className="cc-brand-mark"
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            alt=""
          />
          <span className="cc-brand-name">Capability Canvas Viewer</span>
        </div>
        <span className="cc-readonly-chip">Read-only</span>
        <span className="cc-doc-picker cc-doc-label">{doc.title}</span>
        <ViewSwitcher
          readonly
          activeViewId={viewerActiveViewId}
          onReadonlyViewChange={switchViewerView}
        />
        <div className="cc-toolbar-group" aria-label="Command tools">
          <CommandPalette commands={commandRegistry} context={commandContext} />
          <ShortcutHelp commands={commandRegistry} context={commandContext} />
        </div>
        <span className="cc-spacer" />
        <button
          className="cc-btn"
          type="button"
          onClick={fitViewerViewport}
        >
          Fit
        </button>
        <button
          className="cc-btn"
          type="button"
          onClick={toggleViewerHeatmap}
        >
          Heatmap{" "}
          <span className={`cc-toggle ${viewDoc.heatmap.enabled ? "on" : ""}`} />
        </button>
        <button
          className="cc-btn"
          type="button"
          onClick={exportVisual}
        >
          <Download /> Export visual
        </button>
        <button
          className="cc-btn cc-btn-primary"
          type="button"
          onClick={importIntoEditor}
        >
          Import into editor <ExternalLink size={14} />
        </button>
      </header>
      <div
        className={`cc-workspace cc-viewer-workspace ${outlineOpen ? "" : "outline-closed"} ${inspectorOpen ? "" : "inspector-closed"}`}
        style={workspaceStyle}
      >
        {outlineOpen && (
          <Outline
            readonly
            displayDoc={displayDoc}
            onViewportChange={commitViewerViewport}
          />
        )}
        <Canvas
          readonly
          displayDoc={displayDoc}
          onViewportChange={commitViewerViewport}
        />
        {inspectorOpen && <Inspector readonly displayDoc={displayDoc} />}
      </div>
      <StatusBar readonly />
    </div>
  );
}
