import type { Transaction } from "../../domain/commands/types";
import type { Diagnostic } from "../../domain/validation/diagnostics";

export type ExecuteTransaction = (txn: Transaction) => Diagnostic[];

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
}
