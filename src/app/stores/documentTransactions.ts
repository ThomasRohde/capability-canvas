import { runTransaction } from "../../domain/commands/operations";
import type { Transaction } from "../../domain/commands/types";
import type { CapabilityDocument } from "../../domain/document/types";
import {
  applyResolvedVisualDocument,
  resolveVisualDocument,
} from "../../domain/visual/workspace";
import { attachViewBaseline } from "../../domain/visual/viewChanges";
import {
  SOURCE_LOCKED_SEMANTIC_EDIT_BLOCKED,
  SOURCE_LOCKED_SEMANTIC_EDIT_MESSAGE,
  isSourceModelEditable,
} from "../../domain/layout/canvasLayoutPolicy";
import { error } from "../../domain/validation/diagnostics";
import type { Diagnostic } from "../../domain/validation/diagnostics";

export interface StoreTransactionResult {
  doc: CapabilityDocument;
  diagnostics: Diagnostic[];
}

export function runStoreTransaction(
  doc: CapabilityDocument,
  txn: Transaction,
): StoreTransactionResult {
  if (!isSourceModelEditable(doc) && hasBlockedSourceModelCommand(txn)) {
    return {
      doc,
      diagnostics: [
        error(
          SOURCE_LOCKED_SEMANTIC_EDIT_BLOCKED,
          doc.access?.reason || SOURCE_LOCKED_SEMANTIC_EDIT_MESSAGE,
        ),
      ],
    };
  }
  if (!hasVisualEditCommand(txn)) return runTransaction(doc, txn);
  if (!isVisualEditTransaction(txn)) return runMixedStoreTransaction(doc, txn);
  return runVisualStoreTransaction(doc, txn);
}

function runVisualStoreTransaction(
  doc: CapabilityDocument,
  txn: Transaction,
): StoreTransactionResult {
  const resolved = resolveVisualDocument(doc);
  const result = runTransaction(resolved, txn);
  if (result.doc === resolved) return { doc, diagnostics: result.diagnostics };
  return {
    doc: applyResolvedVisualDocument(doc, result.doc),
    diagnostics: result.diagnostics,
  };
}

function runMixedStoreTransaction(
  doc: CapabilityDocument,
  txn: Transaction,
): StoreTransactionResult {
  let next = doc;
  const diagnostics: StoreTransactionResult["diagnostics"] = [];
  let start = 0;

  while (start < txn.commands.length) {
    const scope = txn.commands[start]!.scope;
    let end = start + 1;
    while (end < txn.commands.length && txn.commands[end]!.scope === scope)
      end += 1;

    const segment: Transaction = {
      ...txn,
      commands: txn.commands.slice(start, end),
    };
    const result =
      scope === "visual"
        ? runVisualStoreTransaction(next, segment)
        : runTransaction(next, segment);
    diagnostics.push(...result.diagnostics);
    if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return { doc, diagnostics };
    }
    next = result.doc;
    start = end;
  }

  return { doc: next, diagnostics };
}

function hasVisualEditCommand(txn: Transaction): boolean {
  return txn.commands.some((command) => command.scope === "visual");
}

const SOURCE_LOCK_ALLOWED_SOURCE_COMMANDS = new Set([
  "create-visual-view",
  "duplicate-visual-view",
  "rename-visual-view",
  "delete-visual-view",
  "reorder-visual-views",
  "update-visual-view",
  "update-visual-node-state",
  "reset-visual-view",
  "reset-visual-view-layout",
  "reset-visual-view-visibility",
  "reset-visual-view-from-template",
  "set-default-visual-view",
  "update-active-view-heatmap-settings",
  "update-active-view-layout-settings",
  "update-active-view-export-settings",
]);

function hasBlockedSourceModelCommand(txn: Transaction): boolean {
  return txn.commands.some(
    (command) =>
      command.scope === "source" &&
      !SOURCE_LOCK_ALLOWED_SOURCE_COMMANDS.has(command.type),
  );
}

export function applyBaselineResult(
  result: StoreTransactionResult,
  txn: Transaction,
): StoreTransactionResult {
  if (!txn.meta?.baseline) return result;
  return {
    ...result,
    doc: attachViewBaseline(
      result.doc,
      txn.meta.baseline.viewId,
      txn.meta.baseline.mode,
    ),
  };
}

export function isVisualEditTransaction(txn: Transaction): boolean {
  return (
    txn.commands.length > 0 &&
    txn.commands.every((command) => command.scope === "visual")
  );
}
