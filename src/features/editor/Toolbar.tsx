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
  WandSparkles,
  X,
  ZoomIn,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  addChild,
  addRoot,
  deleteNodes,
  duplicateNodes,
  mergePromptCapabilities,
  removeNodesFromCanvas,
  updateActiveViewHeatmapSettings,
} from "../../domain/commands/operations";
import { parseDocument } from "../../domain/document/parse";
import { isNodeOnCanvas } from "../../domain/document/types";
import { buildBcmPrompt } from "../../domain/promptMerge/bcmPrompt";
import {
  isPromptMergePayloadShape,
  parsePromptMergePayload,
} from "../../domain/promptMerge/payload";
import { error, warning } from "../../domain/validation/diagnostics";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { applyImportedDocument } from "../../app/importDocument";
import { useUiStore } from "../../app/stores/uiStore";
import { useDocumentStore } from "../../app/stores/documentStore";
import { openDocumentFile } from "../../app/fileSystem";
import { IconButton } from "../shared/IconButton";
import { ViewSwitcher } from "../views/ViewSwitcher";

export function Toolbar() {
  const doc = useDocumentStore((state) => state.doc);
  const viewDoc = resolveVisualDocument(doc);
  const execute = useDocumentStore((state) => state.execute);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const autoLayout = useDocumentStore((state) => state.autoLayout);
  const setDiagnostics = useDocumentStore((state) => state.setDiagnostics);
  const setActiveViewViewport = useDocumentStore(
    (state) => state.setActiveViewViewport,
  );
  const isAutoLayoutRunning = useDocumentStore(
    (state) => state.isAutoLayoutRunning,
  );
  const selected = useUiStore((state) => state.selectedNodeIds);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteDraft, setPasteDraft] = useState("");
  const [promptCopyNoticeVisible, setPromptCopyNoticeVisible] =
    useState(false);
  const promptCopyNoticeTimeout = useRef<number | null>(null);
  const selectedNode = selected[0] ? doc.nodesById[selected[0]] : null;
  const promptNode =
    selected.length === 1 && selected[0] ? doc.nodesById[selected[0]] : null;
  const canCopyPrompt =
    !!promptNode && !promptNode.isTextLabel && promptNode.type !== "text";
  const selectedCanvasNodeIds = selected.filter((nodeId) =>
    isNodeOnCanvas(viewDoc.nodesById[nodeId]),
  );
  const importDocument = () => {
    void openDocumentFile().then((parsed) =>
      applyImportedDocument(parsed, "Import file"),
    );
  };

  useEffect(() => {
    return () => {
      if (promptCopyNoticeTimeout.current !== null) {
        window.clearTimeout(promptCopyNoticeTimeout.current);
      }
    };
  }, []);

  const showPromptCopyNotice = () => {
    setPromptCopyNoticeVisible(true);
    if (promptCopyNoticeTimeout.current !== null) {
      window.clearTimeout(promptCopyNoticeTimeout.current);
    }
    promptCopyNoticeTimeout.current = window.setTimeout(() => {
      setPromptCopyNoticeVisible(false);
      promptCopyNoticeTimeout.current = null;
    }, 2400);
  };

  const importPastedJson = () => {
    if (pasteDraft.trim().length === 0) return;
    let input: unknown;
    try {
      input = JSON.parse(pasteDraft) as unknown;
    } catch {
      setDiagnostics([
        error("json-invalid", "The pasted content is not valid JSON."),
      ]);
      return;
    }

    if (isPromptMergePayloadShape(input)) {
      const parsed = parsePromptMergePayload(input);
      if (!parsed.payload) {
        setDiagnostics(parsed.diagnostics);
        return;
      }
      const diagnostics = execute(mergePromptCapabilities(parsed.payload));
      if (!diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        setPasteOpen(false);
        setPasteDraft("");
      }
      return;
    }

    const parsed = parseDocument(input);
    applyImportedDocument(parsed, "Import pasted JSON");
    if (parsed.doc) {
      setPasteOpen(false);
      setPasteDraft("");
    }
  };

  const copyPrompt = () => {
    if (!canCopyPrompt || !promptNode) return;
    try {
      const prompt = buildBcmPrompt(doc, promptNode.id);
      void copyTextToClipboard(prompt)
        .then(showPromptCopyNotice)
        .catch((copyError: unknown) => {
          setDiagnostics([
            warning(
              "prompt-copy-failed",
              `Prompt could not be copied. ${
                copyError instanceof Error
                  ? copyError.message
                  : String(copyError)
              }`,
            ),
          ]);
        });
    } catch (promptError) {
      setDiagnostics([
        warning(
          "prompt-build-failed",
          promptError instanceof Error
            ? promptError.message
            : "Prompt could not be built.",
        ),
      ]);
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
      <ViewSwitcher />
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
        label={
          selectedCanvasNodeIds.length > 0 ? "Remove from canvas" : "Delete"
        }
        disabled={selected.length === 0}
        onClick={() => {
          if (selectedCanvasNodeIds.length > 0) {
            execute(removeNodesFromCanvas(selectedCanvasNodeIds));
            return;
          }
          execute(deleteNodes(selected));
        }}
      />
      <span className="cc-divider" />
      <IconButton icon={Undo2} label="Undo" onClick={undo} />
      <IconButton icon={Redo2} label="Redo" onClick={redo} />
      <span className="cc-divider" />
      <button
        className="cc-btn"
        type="button"
        onClick={() => {
          const bounds = viewDoc.layout.boundingBox;
          if (bounds.w > 0) {
            const nextViewport = {
              zoom: 1,
              x: 280 - bounds.x,
              y: 60 - bounds.y,
            };
            setViewport(nextViewport);
            setActiveViewViewport(nextViewport);
          }
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
          execute(
            updateActiveViewHeatmapSettings({
              enabled: !viewDoc.heatmap.enabled,
            }),
          )
        }
      >
        <Grid3X3 /> Heatmap
        <span className={`cc-toggle ${viewDoc.heatmap.enabled ? "on" : ""}`} />
      </button>
      <span className="cc-spacer" />
      <IconButton
        icon={WandSparkles}
        label="Prompt"
        disabled={!canCopyPrompt}
        tooltip="Copy BCM prompt"
        onClick={copyPrompt}
      />
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
    {promptCopyNoticeVisible && (
      <div
        className="cc-toast"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        Prompt copied
      </div>
    )}
    </>
  );
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some embedded browsers expose the async clipboard API but reject it.
      // Keep the user gesture alive by immediately trying the DOM fallback.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard fallback was rejected.");
    }
  } finally {
    textarea.remove();
  }
}
