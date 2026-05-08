import { Download, ExternalLink } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { serializeDocument } from "../../domain/document/serialize";
import type { VisualViewId, VisualViewport } from "../../domain/document/types";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { Canvas } from "../canvas/Canvas";
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
  const outlineOpen = useUiStore((state) => state.outlineOpen);
  const outlineWidth = useUiStore((state) => state.outlineWidth);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
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
        <span className="cc-spacer" />
        <button
          className="cc-btn"
          type="button"
          onClick={() => {
            const bounds = viewDoc.layout.boundingBox;
            if (bounds.w > 0) {
              const nextViewport = {
                zoom: 1,
                x: 40 - bounds.x,
                y: 40 - bounds.y,
              };
              commitViewerViewport(nextViewport);
            }
          }}
        >
          Fit
        </button>
        <button
          className="cc-btn"
          type="button"
          onClick={() =>
            setViewerHeatmapEnabledByViewId((previous) => ({
              ...previous,
              [viewerActiveViewId]: !viewDoc.heatmap.enabled,
            }))
          }
        >
          Heatmap{" "}
          <span className={`cc-toggle ${viewDoc.heatmap.enabled ? "on" : ""}`} />
        </button>
        <button
          className="cc-btn"
          type="button"
          onClick={() =>
            void Promise.resolve(
              adapterFor("svg").exportDocument(displayDoc),
            ).then(saveExportResult)
          }
        >
          <Download /> Export visual
        </button>
        <button
          className="cc-btn cc-btn-primary"
          type="button"
          onClick={() => {
            const importDoc = resolveViewerDocument(doc, {
              activeViewId: viewerActiveViewId,
            });
            localStorage.setItem(
              "capability-canvas.import",
              JSON.stringify(serializeDocument(importDoc)),
            );
            window.location.href = import.meta.env.BASE_URL;
          }}
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
