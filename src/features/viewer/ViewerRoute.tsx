import { Download, ExternalLink } from "lucide-react";
import type { CSSProperties } from "react";
import { serializeDocument } from "../../domain/document/serialize";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { Canvas } from "../canvas/Canvas";
import { adapterFor, saveExportResult } from "../import-export";
import { Inspector } from "../inspector/Inspector";
import { Outline } from "../outline/Outline";
import { StatusBar } from "../editor/StatusBar";

export function ViewerRoute() {
  const doc = useDocumentStore((state) => state.doc);
  const setViewport = useUiStore((state) => state.setViewport);
  const outlineOpen = useUiStore((state) => state.outlineOpen);
  const outlineWidth = useUiStore((state) => state.outlineWidth);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const workspaceStyle = {
    "--cc-outline-width": `${outlineWidth}px`,
  } as CSSProperties;

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
        <span className="cc-spacer" />
        <button
          className="cc-btn"
          type="button"
          onClick={() => {
            const bounds = doc.layout.boundingBox;
            if (bounds.w > 0)
              setViewport({
                zoom: 1,
                x: 40 - bounds.x,
                y: 40 - bounds.y,
              });
          }}
        >
          Fit
        </button>
        <button
          className="cc-btn"
          type="button"
          onClick={() =>
            useDocumentStore.getState().execute({
              label: "Toggle heatmap",
              commands: [
                {
                  type: "toggle-heatmap",
                  args: {},
                  apply: (current) => ({
                    doc: {
                      ...current,
                      heatmap: {
                        ...current.heatmap,
                        enabled: !current.heatmap.enabled,
                      },
                    },
                    diagnostics: [],
                  }),
                },
              ],
              meta: { source: "edit" },
            })
          }
        >
          Heatmap{" "}
          <span className={`cc-toggle ${doc.heatmap.enabled ? "on" : ""}`} />
        </button>
        <button
          className="cc-btn"
          type="button"
          onClick={() =>
            void Promise.resolve(adapterFor("svg").exportDocument(doc)).then(
              saveExportResult,
            )
          }
        >
          <Download /> Export visual
        </button>
        <button
          className="cc-btn cc-btn-primary"
          type="button"
          onClick={() => {
            localStorage.setItem(
              "capability-canvas.import",
              JSON.stringify(serializeDocument(doc)),
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
        {outlineOpen && <Outline readonly />}
        <Canvas readonly />
        {inspectorOpen && <Inspector readonly />}
      </div>
      <StatusBar readonly />
    </div>
  );
}
