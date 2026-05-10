import { runTransaction } from "../../domain/commands/operations";
import type { Transaction } from "../../domain/commands/types";
import type { CapabilityDocument } from "../../domain/document/types";
import {
  applyResolvedVisualDocument,
  resolveVisualDocument,
} from "../../domain/visual/workspace";
import { attachViewBaseline } from "../../domain/visual/viewChanges";
import type { Diagnostic } from "../../domain/validation/diagnostics";

export interface StoreTransactionResult {
  doc: CapabilityDocument;
  diagnostics: Diagnostic[];
}

export function runStoreTransaction(
  doc: CapabilityDocument,
  txn: Transaction,
): StoreTransactionResult {
  if (!isVisualEditTransaction(txn)) return runTransaction(doc, txn);
  const resolved = resolveVisualDocument(doc);
  const result = runTransaction(resolved, txn);
  if (result.doc === resolved) return { doc, diagnostics: result.diagnostics };
  return {
    doc: applyResolvedVisualDocument(doc, result.doc),
    diagnostics: result.diagnostics,
  };
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
