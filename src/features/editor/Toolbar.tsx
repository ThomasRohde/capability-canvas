import {
  Download,
  FileJson,
  Grid3X3,
  LayoutTemplate,
  Minus,
  Plus,
  Copy,
  Redo2,
  Settings,
  Trash2,
  Upload,
  Undo2,
  X,
  ZoomIn,
} from "lucide-react";
import { useState } from "react";
import {
  addChild,
  addRoot,
  deleteNodes,
  duplicateNodes,
} from "../../domain/commands/operations";
import { parseDocumentJson } from "../../domain/document/parse";
import { applyImportedDocument } from "../../app/importDocument";
import { useUiStore } from "../../app/stores/uiStore";
import { useDocumentStore } from "../../app/stores/documentStore";
import { openDocumentFile } from "../../app/fileSystem";
import { IconButton } from "../shared/IconButton";

export function Toolbar() {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const autoLayout = useDocumentStore((state) => state.autoLayout);
  const isAutoLayoutRunning = useDocumentStore(
    (state) => state.isAutoLayoutRunning,
  );
  const selected = useUiStore((state) => state.selectedNodeIds);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteDraft, setPasteDraft] = useState("");
  const selectedNode = selected[0] ? doc.nodesById[selected[0]] : null;
  const importDocument = () => {
    void openDocumentFile().then((parsed) =>
      applyImportedDocument(parsed, "Import file"),
    );
  };

  const importPastedJson = () => {
    if (pasteDraft.trim().length === 0) return;
    const parsed = parseDocumentJson(pasteDraft);
    applyImportedDocument(parsed, "Import pasted JSON");
    if (parsed.doc) {
      setPasteOpen(false);
      setPasteDraft("");
    }
  };

  return (
    <>
    <header className="cc-toolbar">
      <div className="cc-brand">
        <img
          className="cc-brand-mark"
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt=""
        />
        <span className="cc-brand-name">Capability Canvas</span>
      </div>
      <button
        className="cc-doc-picker"
        type="button"
        aria-label="Edit document title"
        title="Edit document title"
        onClick={() => setActiveDrawer("settings")}
      >
        {doc.title}
      </button>
      <span className="cc-divider" />
      <button
        className="cc-btn"
        type="button"
        onClick={importDocument}
      >
        <Upload /> Import
      </button>
      <button
        className="cc-btn"
        type="button"
        onClick={() => setActiveDrawer("export")}
      >
        <Download /> Export
      </button>
      <span className="cc-divider" />
      <button
        className="cc-btn"
        type="button"
        onClick={() => execute(addRoot())}
      >
        <Plus /> Add root
      </button>
      <button
        className="cc-btn cc-btn-primary"
        type="button"
        disabled={!selectedNode || selectedNode.isTextLabel}
        onClick={() => selectedNode && execute(addChild(selectedNode.id))}
      >
        <Plus /> Add child
      </button>
      <IconButton
        icon={Copy}
        label="Duplicate"
        disabled={selected.length === 0}
        onClick={() => execute(duplicateNodes(selected))}
      />
      <IconButton
        icon={Trash2}
        label="Delete"
        disabled={selected.length === 0}
        onClick={() => execute(deleteNodes(selected))}
      />
      <span className="cc-divider" />
      <IconButton icon={Undo2} label="Undo" onClick={undo} />
      <IconButton icon={Redo2} label="Redo" onClick={redo} />
      <span className="cc-divider" />
      <button
        className="cc-btn"
        type="button"
        onClick={() => {
          const bounds = doc.layout.boundingBox;
          if (bounds.w > 0)
            setViewport({
              zoom: 1,
              x: 280 - bounds.x,
              y: 60 - bounds.y,
            });
        }}
      >
        <ZoomIn /> Fit
      </button>
      <IconButton
        icon={Minus}
        label="Zoom out"
        onClick={() =>
          setViewport({
            ...viewport,
            zoom: Math.max(0.25, viewport.zoom - 0.1),
          })
        }
      />
      <span style={{ minWidth: 54, textAlign: "center", fontSize: 13 }}>
        {Math.round(viewport.zoom * 100)}%
      </span>
      <IconButton
        icon={Plus}
        label="Zoom in"
        onClick={() =>
          setViewport({ ...viewport, zoom: Math.min(2.5, viewport.zoom + 0.1) })
        }
      />
      <span className="cc-divider" />
      <button
        className="cc-btn cc-btn-primary"
        type="button"
        disabled={isAutoLayoutRunning}
        onClick={() => void autoLayout(true)}
      >
        <LayoutTemplate /> Auto layout
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
        <Grid3X3 /> Heatmap
        <span className={`cc-toggle ${doc.heatmap.enabled ? "on" : ""}`} />
      </button>
      <span className="cc-spacer" />
      <IconButton
        icon={FileJson}
        label="Import pasted JSON"
        onClick={() => setPasteOpen(true)}
      />
      <IconButton
        icon={Settings}
        label="Settings"
        onClick={() => setActiveDrawer("settings")}
      />
    </header>
    {pasteOpen && (
      <div
        className="cc-modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPasteOpen(false);
        }}
      >
        <section className="cc-modal" role="dialog" aria-label="Import pasted JSON">
          <div className="cc-modal-head">
            <div className="cc-panel-title">Import pasted JSON</div>
            <IconButton
              icon={X}
              label="Close pasted JSON import"
              onClick={() => setPasteOpen(false)}
            />
          </div>
          <textarea
            className="cc-textarea cc-paste-json"
            value={pasteDraft}
            autoFocus
            onChange={(event) => setPasteDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setPasteOpen(false);
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                importPastedJson();
              }
            }}
          />
          <div className="cc-modal-actions">
            <button
              className="cc-btn"
              type="button"
              onClick={() => setPasteOpen(false)}
            >
              Cancel
            </button>
            <button
              className="cc-btn cc-btn-primary"
              type="button"
              onClick={importPastedJson}
            >
              <Upload /> Import
            </button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}
