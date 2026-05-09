import {
  transaction,
  updateActiveViewLayoutSettings,
  updateDocumentSettings,
} from "../../domain/commands/operations";
import type { Transaction } from "../../domain/commands/types";
import type { CapabilityDocument } from "../../domain/document/types";

export function settingsTransaction(
  patch: Partial<CapabilityDocument["settings"]>,
): Transaction {
  const { layoutMode, ...documentPatch } = patch;
  const transactions: Transaction[] = [];
  if (Object.keys(documentPatch).length > 0)
    transactions.push(updateDocumentSettings(documentPatch));
  if (layoutMode)
    transactions.push(updateActiveViewLayoutSettings({ mode: layoutMode }));
  return transaction(
    settingsLabel(patch),
    transactions.flatMap((item) => item.commands),
    { source: "edit" },
  );
}

export function settingsLabel(
  patch: Partial<CapabilityDocument["settings"]>,
): string {
  if (patch.layoutMode) return `Set layout mode to ${patch.layoutMode}`;
  return "Update layout settings";
}
