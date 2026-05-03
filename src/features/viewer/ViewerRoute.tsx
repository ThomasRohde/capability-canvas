import { Download, ExternalLink } from "lucide-react";
import { useEffect } from "react";
import { parseDocument, parseDocumentJson } from "../../domain/document/parse";
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
  const setDocument = useDocumentStore((state) => state.setDocument);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("doc");
    const source = params.get("src");
    if (encoded) {
      try {
        const json = decodeURIComponent(escape(atob(encoded)));
        const parsed = parseDocumentJson(json);
        if (parsed.doc) setDocument(parsed.doc, "Load viewer document");
      } catch {
        const parsed = parseDocument(JSON.parse(encoded) as unknown);
        if (parsed.doc) setDocument(parsed.doc, "Load viewer document");
      }
    } else if (source) {
      void fetch(source)
        .then((response) => response.json() as Promise<unknown>)
        .then((data) => {
          const parsed = parseDocument(data);
          if (parsed.doc) setDocument(parsed.doc, "Load viewer source");
        });
    }
  }, [setDocument]);

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
        <span className="cc-doc-picker cc-doc-label">
          {doc.title}
        </span>
        <span className="cc-spacer" />
        <button
          className="cc-btn"
          type="button"
          onClick={() => {
            const bounds = doc.layout.boundingBox;
            if (bounds.w > 0)
              setViewport({
                zoom: 1,
                x: 40 - bounds.x * viewport.zoom,
                y: 40 - bounds.y * viewport.zoom,
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
      <div className="cc-workspace">
        <Outline />
        <Canvas readonly />
        <Inspector readonly />
      </div>
      <StatusBar readonly />
    </div>
  );
}
