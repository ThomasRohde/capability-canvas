import {
  ChevronDown,
  Download,
  FileJson,
  LayoutTemplate,
  Minus,
  Plus,
  Redo2,
  Upload,
  Undo2,
  X,
  ZoomIn,
  type LucideProps,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { mergePromptCapabilities } from "../../domain/commands/operations";
import { parseDocument, parseDocumentJson } from "../../domain/document/parse";
import {
  isPromptMergePayloadShape,
  parsePromptMergePayload,
} from "../../domain/promptMerge/payload";
import { error, warning } from "../../domain/validation/diagnostics";
import { openDocumentFile, saveDocumentFile } from "../../app/fileSystem";
import { applyImportedDocument } from "../../app/importDocument";
import { createImportReview, type ImportReview } from "../../app/importReview";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { CommandPalette } from "../commands/CommandPalette";
import { getEditorCommandAvailability } from "../commands/editorCommands";
import { useEditorActions } from "../commands/useEditorActions";
import { HelpDialog } from "../help/HelpDialog";
import { ImportReviewDialog } from "../import/ImportReviewDialog";
import {
  useDismissableLayer,
  useFocusTrap,
  useMenuKeyboardNavigation,
} from "../shared/a11y";
import { IconButton } from "../shared/IconButton";
import { ViewSwitcher } from "../views/ViewSwitcher";

export function Toolbar() {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const setDiagnostics = useDocumentStore((state) => state.setDiagnostics);
  const dirty = useDocumentStore((state) => state.dirty);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteDraft, setPasteDraft] = useState("");
  const [importReview, setImportReview] = useState<ImportReview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const pasteDialogRef = useRef<HTMLElement>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    commands: commandRegistry,
    context: commandContext,
    actions: editorActions,
    deleteFromModelDialog,
  } = useEditorActions({
    doc,
    importBusy,
    onImportFile: importDocument,
    onImportPastedJson: openPastedJsonImport,
  });
  const addChildAvailable = getEditorCommandAvailability(
    commandRegistry,
    "model.add-child",
    commandContext,
  );
  const autoLayoutAvailable = getEditorCommandAvailability(
    commandRegistry,
    "layout.auto-layout",
    commandContext,
  );

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

  function importDocument() {
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
  }

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

  const zoomOut = () =>
    setViewport({
      ...viewport,
      zoom: Math.max(0.25, viewport.zoom - 0.1),
    });

  const zoomIn = () =>
    setViewport({ ...viewport, zoom: Math.min(2.5, viewport.zoom + 0.1) });

  function openPastedJsonImport() {
    setPasteOpen(true);
  }

  const closePastedJsonImport = () => setPasteOpen(false);

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
        </div>
        <span className="cc-divider" />
        <div className="cc-toolbar-group" aria-label="Model commands">
          <button
            className="cc-btn"
            type="button"
            aria-label="Add root"
            onClick={editorActions.addRoot}
          >
            <Plus />
            <span className="cc-btn-label">Add root</span>
          </button>
          <button
            className="cc-btn cc-btn-primary"
            type="button"
            aria-label="Add child"
            disabled={!addChildAvailable?.valid}
            onClick={editorActions.addChild}
          >
            <Plus />
            <span className="cc-btn-label">Add child</span>
          </button>
        </div>
        <span className="cc-divider" />
        <div className="cc-toolbar-group" aria-label="History commands">
          <IconButton icon={Undo2} label="Undo" onClick={editorActions.undo} />
          <IconButton icon={Redo2} label="Redo" onClick={editorActions.redo} />
        </div>
        <span className="cc-divider" />
        <div className="cc-toolbar-group" aria-label="Layout commands">
          <button
            className="cc-btn"
            type="button"
            aria-label="Fit"
            disabled={!commandContext.hasFitBounds}
            onClick={editorActions.fitView}
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
            disabled={!autoLayoutAvailable?.valid}
            onClick={editorActions.autoLayout}
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
                  onSelect={editorActions.importFile}
                />
                <ToolbarMenuItem
                  icon={FileJson}
                  label="Import pasted JSON"
                  disabled={importBusy}
                  closeMenu={closeMenu}
                  onSelect={editorActions.importPastedJson}
                />
              </>
            )}
          </ToolbarMenu>
          <button
            className="cc-btn"
            type="button"
            aria-label="Export"
            onClick={editorActions.openExport}
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
      <HelpDialog commands={commandRegistry} context={commandContext} />
      {importReview && (
        <ImportReviewDialog
          review={importReview}
          dirty={dirty}
          onCancel={() => setImportReview(null)}
          onApply={() => applyReviewedImport(importReview)}
          onDownloadBackup={downloadCurrentBackup}
        />
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
  const { closeAndRestoreFocus, handleMenuKeyDown } = useMenuKeyboardNavigation(
    {
      open,
      menuRef,
      triggerRef,
      onClose: closeMenu,
    },
  );

  useDismissableLayer({
    open,
    refs: [rootRef],
    onDismiss: (reason) => {
      if (reason === "escape") closeAndRestoreFocus();
      else closeMenu();
    },
  });

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
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
        <span
          className={`cc-toggle ${checked ? "on" : ""}`}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
