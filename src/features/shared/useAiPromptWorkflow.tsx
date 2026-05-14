import { Copy, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { mergePromptCapabilities } from "../../domain/commands/operations";
import type {
  CapabilityDocument,
  NodeId,
} from "../../domain/document/types";
import {
  buildBcmPrompt,
  DEFAULT_PROMPT_CHILD_COUNT,
  MAX_PROMPT_CHILD_COUNT,
  MIN_PROMPT_CHILD_COUNT,
  normalizePromptChildCount,
} from "../../domain/promptMerge/bcmPrompt";
import {
  isPromptMergePayloadShape,
  parsePromptMergePayload,
} from "../../domain/promptMerge/payload";
import { error, warning } from "../../domain/validation/diagnostics";
import { useDocumentStore } from "../../app/stores/documentStore";
import { parsePastedJsonText } from "../import/pastedJson";
import { useFocusTrap } from "./a11y";
import {
  copyTextToClipboard,
  readTextFromClipboard,
} from "./clipboard";
import { IconButton } from "./IconButton";

type ImportAttemptResult = "imported" | "not-prompt-merge" | "invalid";

export function useAiPromptWorkflow(doc: CapabilityDocument) {
  const execute = useDocumentStore((state) => state.execute);
  const setDiagnostics = useDocumentStore((state) => state.setDiagnostics);
  const promptDialogRef = useRef<HTMLElement>(null);
  const promptCountInputRef = useRef<HTMLInputElement>(null);
  const aiJsonDialogRef = useRef<HTMLElement>(null);
  const aiJsonTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptCopyNoticeTimeout = useRef<number | null>(null);
  const [promptDialogNodeId, setPromptDialogNodeId] = useState<NodeId | null>(
    null,
  );
  const [promptChildCount, setPromptChildCount] = useState(
    DEFAULT_PROMPT_CHILD_COUNT,
  );
  const [promptAdditionalInstructions, setPromptAdditionalInstructions] =
    useState("");
  const [aiJsonImportNodeId, setAiJsonImportNodeId] = useState<NodeId | null>(
    null,
  );
  const [aiJsonDraft, setAiJsonDraft] = useState("");
  const [promptCopyNoticeVisible, setPromptCopyNoticeVisible] = useState(false);

  useEffect(() => {
    return () => {
      if (promptCopyNoticeTimeout.current !== null) {
        window.clearTimeout(promptCopyNoticeTimeout.current);
      }
    };
  }, []);

  const closePromptDialog = useCallback(() => setPromptDialogNodeId(null), []);
  const closeAiJsonImport = useCallback(() => setAiJsonImportNodeId(null), []);

  const showPromptCopyNotice = useCallback(() => {
    setPromptCopyNoticeVisible(true);
    if (promptCopyNoticeTimeout.current !== null) {
      window.clearTimeout(promptCopyNoticeTimeout.current);
    }
    promptCopyNoticeTimeout.current = window.setTimeout(() => {
      setPromptCopyNoticeVisible(false);
      promptCopyNoticeTimeout.current = null;
    }, 2400);
  }, []);

  const openAiPromptDialog = useCallback((nodeId: NodeId) => {
    setPromptChildCount(DEFAULT_PROMPT_CHILD_COUNT);
    setPromptAdditionalInstructions("");
    setPromptDialogNodeId(nodeId);
  }, []);

  const copyAiPrompt = useCallback(() => {
    if (!promptDialogNodeId) return;
    try {
      const prompt = buildBcmPrompt(doc, promptDialogNodeId, {
        childCount: promptChildCount,
        additionalInstructions: promptAdditionalInstructions,
      });
      void copyTextToClipboard(prompt)
        .then(() => {
          closePromptDialog();
          showPromptCopyNotice();
        })
        .catch((copyError: unknown) => {
          setDiagnostics([
            warning(
              "prompt-copy-failed",
              `Prompt could not be copied. ${
                copyError instanceof Error ? copyError.message : String(copyError)
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
  }, [
    closePromptDialog,
    doc,
    promptAdditionalInstructions,
    promptChildCount,
    promptDialogNodeId,
    setDiagnostics,
    showPromptCopyNotice,
  ]);

  const importAiJsonText = useCallback(
    (
      nodeId: NodeId,
      text: string,
      options: { reportShapeErrors: boolean },
    ): ImportAttemptResult => {
      const pasted = parsePastedJsonText(text);
      if (pasted.diagnostics.length > 0) {
        if (options.reportShapeErrors) setDiagnostics(pasted.diagnostics);
        return "invalid";
      }
      if (!isPromptMergePayloadShape(pasted.input)) {
        if (options.reportShapeErrors) {
          setDiagnostics([
            error(
              "prompt-merge-required",
              "Import AI JSON expects prompt-merge JSON for the selected capability.",
            ),
          ]);
        }
        return "not-prompt-merge";
      }
      const parsed = parsePromptMergePayload(pasted.input);
      if (!parsed.payload) {
        setDiagnostics(parsed.diagnostics);
        return "invalid";
      }
      if (parsed.payload.targetId !== nodeId) {
        setDiagnostics([
          error(
            "prompt-merge-target-mismatch",
            `Pasted AI JSON targetId "${parsed.payload.targetId}" does not match selected capability "${nodeId}".`,
          ),
        ]);
        return "invalid";
      }
      const diagnostics = execute(mergePromptCapabilities(parsed.payload));
      return diagnostics.some((diagnostic) => diagnostic.severity === "error")
        ? "invalid"
        : "imported";
    },
    [execute, setDiagnostics],
  );

  const openAiJsonDialog = useCallback((nodeId: NodeId) => {
    setAiJsonDraft("");
    setAiJsonImportNodeId(nodeId);
  }, []);

  const openAiJsonImport = useCallback(
    (nodeId: NodeId) => {
      void readTextFromClipboard().then((clipboardText) => {
        if (clipboardText && clipboardText.trim().length > 0) {
          const result = importAiJsonText(nodeId, clipboardText, {
            reportShapeErrors: false,
          });
          if (result === "imported") return;
          if (
            result === "invalid" &&
            isPromptMergePayloadShape(parsePastedJsonText(clipboardText).input)
          ) {
            return;
          }
        }
        openAiJsonDialog(nodeId);
      });
    },
    [importAiJsonText, openAiJsonDialog],
  );

  const importAiJsonDraft = useCallback(() => {
    if (!aiJsonImportNodeId || aiJsonDraft.trim().length === 0) return;
    const result = importAiJsonText(aiJsonImportNodeId, aiJsonDraft, {
      reportShapeErrors: true,
    });
    if (result === "imported") {
      closeAiJsonImport();
      setAiJsonDraft("");
    }
  }, [
    aiJsonDraft,
    aiJsonImportNodeId,
    closeAiJsonImport,
    importAiJsonText,
  ]);

  useFocusTrap({
    active: promptDialogNodeId !== null,
    containerRef: promptDialogRef,
    initialFocusRef: promptCountInputRef,
    onEscape: closePromptDialog,
  });

  useFocusTrap({
    active: aiJsonImportNodeId !== null,
    containerRef: aiJsonDialogRef,
    initialFocusRef: aiJsonTextareaRef,
    onEscape: closeAiJsonImport,
  });

  const aiPromptWorkflow = (
    <>
      {promptDialogNodeId && (
        <div
          className="cc-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePromptDialog();
          }}
        >
          <section
            ref={promptDialogRef}
            className="cc-modal cc-ai-prompt-dialog"
            role="dialog"
            aria-label="Copy AI prompt"
          >
            <div className="cc-modal-head">
              <div className="cc-panel-title">Copy AI prompt</div>
              <IconButton
                icon={X}
                label="Close AI prompt"
                onClick={closePromptDialog}
              />
            </div>
            <label className="cc-field">
              <span>Direct capabilities</span>
              <input
                ref={promptCountInputRef}
                className="cc-input"
                type="number"
                min={MIN_PROMPT_CHILD_COUNT}
                max={MAX_PROMPT_CHILD_COUNT}
                step={1}
                value={promptChildCount}
                onChange={(event) =>
                  setPromptChildCount(
                    normalizePromptChildCount(event.currentTarget.valueAsNumber),
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Escape") closePromptDialog();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    copyAiPrompt();
                  }
                }}
              />
            </label>
            <label className="cc-field">
              <span>Additional instructions</span>
              <textarea
                className="cc-textarea cc-ai-prompt-additions"
                aria-label="Additional instructions"
                value={promptAdditionalInstructions}
                onChange={(event) =>
                  setPromptAdditionalInstructions(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Escape") closePromptDialog();
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    copyAiPrompt();
                  }
                }}
              />
            </label>
            <div className="cc-modal-actions">
              <button
                className="cc-btn"
                type="button"
                onClick={closePromptDialog}
              >
                Cancel
              </button>
              <button
                className="cc-btn cc-btn-primary"
                type="button"
                onClick={copyAiPrompt}
              >
                <Copy /> Copy
              </button>
            </div>
          </section>
        </div>
      )}
      {aiJsonImportNodeId && (
        <div
          className="cc-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAiJsonImport();
          }}
        >
          <section
            ref={aiJsonDialogRef}
            className="cc-modal"
            role="dialog"
            aria-label="Import AI JSON"
          >
            <div className="cc-modal-head">
              <div className="cc-panel-title">Import AI JSON</div>
              <IconButton
                icon={X}
                label="Close AI JSON import"
                onClick={closeAiJsonImport}
              />
            </div>
            <textarea
              ref={aiJsonTextareaRef}
              className="cc-textarea cc-paste-json"
              aria-label="AI JSON"
              value={aiJsonDraft}
              onChange={(event) => setAiJsonDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeAiJsonImport();
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  importAiJsonDraft();
                }
              }}
            />
            <div className="cc-modal-actions">
              <button
                className="cc-btn"
                type="button"
                onClick={closeAiJsonImport}
              >
                Cancel
              </button>
              <button
                className="cc-btn cc-btn-primary"
                type="button"
                onClick={importAiJsonDraft}
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

  return {
    openAiPromptDialog,
    openAiJsonImport,
    aiPromptWorkflow,
  };
}
