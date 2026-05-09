import {
  ChevronDown,
  Copy,
  Download,
  EyeOff,
  FileJson,
  LayoutTemplate,
  Minus,
  MoreHorizontal,
  Plus,
  Redo2,
  Trash2,
  Upload,
  Undo2,
  WandSparkles,
  X,
  ZoomIn,
  type LucideProps,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  addChild,
  addRoot,
  duplicateNodes,
  mergePromptCapabilities,
  removeNodesFromCanvas,
  updateActiveViewHeatmapSettings,
} from "../../domain/commands/operations";
import { parseDocument, parseDocumentJson } from "../../domain/document/parse";
import { isNodeOnCanvas } from "../../domain/document/types";
import { buildBcmPrompt } from "../../domain/promptMerge/bcmPrompt";
import {
  isPromptMergePayloadShape,
  parsePromptMergePayload,
} from "../../domain/promptMerge/payload";
import { error, warning } from "../../domain/validation/diagnostics";
import { resolveVisualDocument } from "../../domain/visual/workspace";
import { openDocumentFile, saveDocumentFile } from "../../app/fileSystem";
import { applyImportedDocument } from "../../app/importDocument";
import { createImportReview, type ImportReview } from "../../app/importReview";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { CommandPalette } from "../commands/CommandPalette";
import {
  createEditorCommandRegistry,
  type EditorCommandContext,
} from "../commands/editorCommands";
import { ShortcutHelp } from "../commands/ShortcutHelp";
import { ImportReviewDialog } from "../import/ImportReviewDialog";
import { useFocusTrap, useMenuKeyboardNavigation } from "../shared/a11y";
import { IconButton } from "../shared/IconButton";
import { useModelDeleteConfirmation } from "../shared/useModelDeleteConfirmation";
import { ViewSwitcher } from "../views/ViewSwitcher";
import { fitViewportToBounds } from "../canvas/viewport";

export function Toolbar() {
  const doc = useDocumentStore((state) => state.doc);
  const viewDoc = resolveVisualDocument(doc);
  const execute = useDocumentStore((state) => state.execute);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const past = useDocumentStore((state) => state.past);
  const future = useDocumentStore((state) => state.future);
  const autoLayout = useDocumentStore((state) => state.autoLayout);
  const setDiagnostics = useDocumentStore((state) => state.setDiagnostics);
  const setActiveViewViewport = useDocumentStore(
    (state) => state.setActiveViewViewport,
  );
  const dirty = useDocumentStore((state) => state.dirty);
  const isAutoLayoutRunning = useDocumentStore(
    (state) => state.isAutoLayoutRunning,
  );
  const selected = useUiStore((state) => state.selectedNodeIds);
  const viewport = useUiStore((state) => state.viewport);
  const canvasSize = useUiStore((state) => state.canvasSize);
  const setViewport = useUiStore((state) => state.setViewport);
  const toggleOutline = useUiStore((state) => state.toggleOutline);
  const toggleInspector = useUiStore((state) => state.toggleInspector);
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const requestLabelEdit = useUiStore((state) => state.requestLabelEdit);
  const commandRegistry = useMemo(() => createEditorCommandRegistry(), []);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteDraft, setPasteDraft] = useState("");
  const [importReview, setImportReview] = useState<ImportReview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [promptCopyNoticeVisible, setPromptCopyNoticeVisible] =
    useState(false);
  const pasteDialogRef = useRef<HTMLElement>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptCopyNoticeTimeout = useRef<number | null>(null);
  const selectedNode = selected[0] ? doc.nodesById[selected[0]] : null;
  const promptNode =
    selected.length === 1 && selected[0] ? doc.nodesById[selected[0]] : null;
  const canCopyPrompt =
    !!promptNode && !promptNode.isTextLabel && promptNode.type !== "text";
  const selectedCanvasNodeIds = selected.filter((nodeId) =>
    isNodeOnCanvas(viewDoc.nodesById[nodeId]),
  );
  const { requestDeleteFromModel, deleteFromModelDialog } =
    useModelDeleteConfirmation(doc);

  useEffect(() => {
    return () => {
      if (promptCopyNoticeTimeout.current !== null) {
        window.clearTimeout(promptCopyNoticeTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    const pending = localStorage.getItem("capability-canvas.import");
    if (!pending) return;
    localStorage.removeItem("capability-canvas.import");
    setImportReview(
      createImportReview({
        sourceLabel: "Import from viewer",
        parsed: parseDocumentJson(pending),
      }),
    );
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

  const importDocument = () => {
    setImportBusy(true);
    void openDocumentFile()
      .then((result) => {
        if (!result) return;
        setImportReview(
          createImportReview({
            sourceLabel: "Import file",
            parsed: result.parsed,
            file: result.file,
          }),
        );
      })
      .catch((importError: unknown) => {
        setDiagnostics([
          warning(
            "import-read-failed",
            `Import file could not be read. ${
              importError instanceof Error
                ? importError.message
                : String(importError)
            }`,
          ),
        ]);
      })
      .finally(() => setImportBusy(false));
  };

  const importPastedJson = () => {
    if (pasteDraft.trim().length === 0) return;
    let input: unknown;
    try {
      input = JSON.parse(pasteDraft) as unknown;
    } catch {
      setImportReview(
        createImportReview({
          sourceLabel: "Import pasted JSON",
          parsed: {
            doc: null,
            diagnostics: [
              error("json-invalid", "The pasted content is not valid JSON."),
            ],
          },
        }),
      );
      setPasteOpen(false);
      setPasteDraft("");
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
    setImportReview(
      createImportReview({
        sourceLabel: "Import pasted JSON",
        parsed,
      }),
    );
    setPasteOpen(false);
    setPasteDraft("");
  };

  const applyReviewedImport = async (review: ImportReview) => {
    await applyImportedDocument(review.parsed, review.sourceLabel);
    setImportReview(null);
  };

  const downloadCurrentBackup = () =>
    saveDocumentFile(useDocumentStore.getState().doc);

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

  const addRootCapability = () => execute(addRoot());

  const addSelectedChild = () => {
    if (selectedNode) execute(addChild(selectedNode.id));
  };

  const duplicateSelection = () => execute(duplicateNodes(selected));

  const removeSelectionFromActiveView = () =>
    execute(removeNodesFromCanvas(selectedCanvasNodeIds));

  const deleteSelectionFromModel = () => requestDeleteFromModel(selected);

  const fitViewport = () => {
    const nextViewport = fitViewportToBounds(viewDoc.layout.boundingBox, canvasSize);
    if (!nextViewport) return;
    setViewport(nextViewport);
    setActiveViewViewport(nextViewport);
  };

  const zoomOut = () =>
    setViewport({
      ...viewport,
      zoom: Math.max(0.25, viewport.zoom - 0.1),
    });

  const zoomIn = () =>
    setViewport({ ...viewport, zoom: Math.min(2.5, viewport.zoom + 0.1) });

  const runAutoLayout = () => {
    void autoLayout(true);
  };

  const toggleHeatmap = () =>
    execute(
      updateActiveViewHeatmapSettings({
        enabled: !viewDoc.heatmap.enabled,
      }),
    );

  const openSettings = () => setActiveDrawer("settings");
  const openExport = () => setActiveDrawer("export");
  const openViews = () => setActiveDrawer("views");
  const openPastedJsonImport = () => setPasteOpen(true);
  const closePastedJsonImport = () => setPasteOpen(false);
  const renameSelected = () => {
    if (selected.length !== 1 || !selected[0]) return;
    requestLabelEdit(selected[0]);
  };
  const commandContext: EditorCommandContext = {
    selectedNodeIds: selected,
    selectedCanvasNodeIds,
    selectedNode,
    hasFitBounds:
      viewDoc.layout.boundingBox.w > 0 && viewDoc.layout.boundingBox.h > 0,
    importBusy,
    isAutoLayoutRunning,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    actions: {
      addRoot: addRootCapability,
      addChild: addSelectedChild,
      renameSelected,
      fitView: fitViewport,
      autoLayout: runAutoLayout,
      toggleOutline,
      toggleInspector,
      openViews,
      openSettings,
      openExport,
      importFile: importDocument,
      importPastedJson: openPastedJsonImport,
      toggleHeatmap,
      removeFromActiveView: removeSelectionFromActiveView,
      deleteFromModel: deleteSelectionFromModel,
      undo,
      redo,
    },
  };

  useFocusTrap({
    active: pasteOpen,
    containerRef: pasteDialogRef,
    initialFocusRef: pasteTextareaRef,
    onEscape: closePastedJsonImport,
  });

  return (
    <>
      <header className="cc-toolbar cc-editor-toolbar">
        <div className="cc-brand">
          <img
            className="cc-brand-mark"
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            alt=""
          />
          <span className="cc-brand-name">Capability Canvas</span>
        </div>
        <ViewSwitcher />
        <div className="cc-toolbar-group" aria-label="Command tools">
          <CommandPalette commands={commandRegistry} context={commandContext} />
          <ShortcutHelp commands={commandRegistry} context={commandContext} />
        </div>
        <span className="cc-divider" />
        <div className="cc-toolbar-group" aria-label="Model commands">
          <button
            className="cc-btn"
            type="button"
            aria-label="Add root"
            onClick={addRootCapability}
          >
            <Plus />
            <span className="cc-btn-label">Add root</span>
          </button>
          <button
            className="cc-btn cc-btn-primary"
            type="button"
            aria-label="Add child"
            disabled={!selectedNode || selectedNode.isTextLabel}
            onClick={addSelectedChild}
          >
            <Plus />
            <span className="cc-btn-label">Add child</span>
          </button>
          <ToolbarMenu label="Model actions" icon={MoreHorizontal}>
            {({ closeMenu }) => (
              <>
                <ToolbarMenuItem
                  icon={Copy}
                  label="Duplicate"
                  disabled={selected.length === 0}
                  closeMenu={closeMenu}
                  onSelect={duplicateSelection}
                />
                <ToolbarMenuItem
                  icon={EyeOff}
                  label="Remove from active view"
                  disabled={selectedCanvasNodeIds.length === 0}
                  closeMenu={closeMenu}
                  onSelect={removeSelectionFromActiveView}
                />
                <ToolbarMenuItem
                  icon={Trash2}
                  label="Delete from model"
                  disabled={selected.length === 0}
                  tone="danger"
                  closeMenu={closeMenu}
                  onSelect={deleteSelectionFromModel}
                />
                <div className="cc-menu-separator" role="separator" />
                <ToolbarMenuItem
                  icon={WandSparkles}
                  label="Copy BCM prompt"
                  disabled={!canCopyPrompt}
                  closeMenu={closeMenu}
                  onSelect={copyPrompt}
                />
              </>
            )}
          </ToolbarMenu>
        </div>
        <span className="cc-divider" />
        <div className="cc-toolbar-group" aria-label="History commands">
          <IconButton icon={Undo2} label="Undo" onClick={undo} />
          <IconButton icon={Redo2} label="Redo" onClick={redo} />
        </div>
        <span className="cc-divider" />
        <div className="cc-toolbar-group" aria-label="Layout commands">
          <button
            className="cc-btn"
            type="button"
            aria-label="Fit"
            onClick={fitViewport}
          >
            <ZoomIn />
            <span className="cc-btn-label">Fit</span>
          </button>
          <IconButton icon={Minus} label="Zoom out" onClick={zoomOut} />
          <span className="cc-zoom-value" aria-label="Zoom level">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <IconButton icon={Plus} label="Zoom in" onClick={zoomIn} />
          <button
            className="cc-btn cc-btn-primary"
            type="button"
            aria-label="Auto layout"
            disabled={isAutoLayoutRunning}
            onClick={runAutoLayout}
          >
            <LayoutTemplate />
            <span className="cc-btn-label">Auto layout</span>
          </button>
        </div>
        <span className="cc-spacer" />
        <div className="cc-toolbar-group" aria-label="File commands">
          <ToolbarMenu label="Import" icon={Upload} align="right">
            {({ closeMenu }) => (
              <>
                <ToolbarMenuItem
                  icon={Upload}
                  label="Import JSON file"
                  disabled={importBusy}
                  closeMenu={closeMenu}
                  onSelect={importDocument}
                />
                <ToolbarMenuItem
                  icon={FileJson}
                  label="Import pasted JSON"
                  disabled={importBusy}
                  closeMenu={closeMenu}
                  onSelect={openPastedJsonImport}
                />
              </>
            )}
          </ToolbarMenu>
          <button
            className="cc-btn"
            type="button"
            aria-label="Export"
            onClick={openExport}
          >
            <Download />
            <span className="cc-btn-label">Export</span>
          </button>
        </div>
      </header>
      {pasteOpen && (
        <div
          className="cc-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPasteOpen(false);
          }}
        >
          <section
            ref={pasteDialogRef}
            className="cc-modal"
            role="dialog"
            aria-label="Import pasted JSON"
          >
            <div className="cc-modal-head">
              <div className="cc-panel-title">Import pasted JSON</div>
              <IconButton
                icon={X}
                label="Close pasted JSON import"
                onClick={() => setPasteOpen(false)}
              />
            </div>
            <textarea
              ref={pasteTextareaRef}
              className="cc-textarea cc-paste-json"
              aria-label="Pasted JSON"
              value={pasteDraft}
              onChange={(event) => setPasteDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closePastedJsonImport();
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
                disabled={importBusy}
                onClick={importPastedJson}
              >
                <Upload /> {importBusy ? "Importing..." : "Import"}
              </button>
            </div>
          </section>
        </div>
      )}
      {importReview && (
        <ImportReviewDialog
          review={importReview}
          dirty={dirty}
          onCancel={() => setImportReview(null)}
          onApply={() => applyReviewedImport(importReview)}
          onDownloadBackup={downloadCurrentBackup}
        />
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
      {deleteFromModelDialog}
    </>
  );
}

interface ToolbarMenuProps {
  label: string;
  icon: ComponentType<LucideProps>;
  children: (controls: { closeMenu: () => void }) => ReactNode;
  compact?: boolean;
  align?: "left" | "right";
}

function ToolbarMenu({
  label,
  icon: Icon,
  children,
  compact = false,
  align = "left",
}: ToolbarMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setOpen(false);
  };

  const openMenu = () => {
    setOpen(true);
  };
  const { handleMenuKeyDown } = useMenuKeyboardNavigation({
    open,
    menuRef,
    triggerRef,
    onClose: closeMenu,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      ) {
        return;
      }
      closeMenu();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  };

  return (
    <div ref={rootRef} className="cc-toolbar-menu">
      <button
        ref={triggerRef}
        className={`cc-btn cc-toolbar-menu-trigger ${compact ? "compact" : ""} ${open ? "active" : ""}`}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={label}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <Icon />
        {!compact && <span className="cc-btn-label">{label}</span>}
        <ChevronDown className="cc-toolbar-menu-chevron" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className={`cc-toolbar-menu-popover ${align === "right" ? "align-right" : ""}`}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
        >
          {children({ closeMenu })}
        </div>
      )}
    </div>
  );
}

interface ToolbarMenuItemProps {
  label: string;
  icon: ComponentType<LucideProps>;
  closeMenu: () => void;
  onSelect: () => void;
  disabled?: boolean;
  checked?: boolean;
  role?: "menuitem" | "menuitemcheckbox";
  tone?: "danger";
}

function ToolbarMenuItem({
  label,
  icon: Icon,
  closeMenu,
  onSelect,
  disabled = false,
  checked,
  role = "menuitem",
  tone,
}: ToolbarMenuItemProps) {
  const handleSelect = () => {
    if (disabled) return;
    onSelect();
    closeMenu();
  };

  return (
    <button
      className={`cc-toolbar-menu-item ${tone === "danger" ? "danger" : ""}`}
      type="button"
      role={role}
      aria-checked={role === "menuitemcheckbox" ? checked : undefined}
      disabled={disabled}
      onClick={handleSelect}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
      {role === "menuitemcheckbox" && (
        <span className={`cc-toggle ${checked ? "on" : ""}`} aria-hidden="true" />
      )}
    </button>
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
