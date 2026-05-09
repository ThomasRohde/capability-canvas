import {
  error as diagnosticError,
  type Diagnostic,
} from "../../domain/validation/diagnostics";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface SaveLifecycleState {
  dirty: boolean;
  saveStatus: SaveStatus;
  lastSavedAt?: number;
  lastSaveError?: string;
  dirtySince?: number;
  revision: number;
  lastDiagnostics: Diagnostic[];
}

export function markDirty(
  state: Pick<SaveLifecycleState, "dirtySince" | "revision">,
): Pick<
  SaveLifecycleState,
  "dirty" | "saveStatus" | "dirtySince" | "lastSaveError" | "revision"
> {
  return {
    dirty: true,
    saveStatus: "dirty",
    dirtySince: state.dirtySince ?? Date.now(),
    lastSaveError: undefined,
    revision: state.revision + 1,
  };
}

export function saveStartedTransition(
  state: Pick<SaveLifecycleState, "dirty" | "revision">,
  revision: number,
): Pick<SaveLifecycleState, "saveStatus" | "lastSaveError"> | null {
  if (!state.dirty || state.revision !== revision) return null;
  return {
    saveStatus: "saving",
    lastSaveError: undefined,
  };
}

export function saveSucceededTransition(
  state: Pick<SaveLifecycleState, "revision">,
  revision: number,
): Pick<
  SaveLifecycleState,
  "dirty" | "saveStatus" | "lastSavedAt" | "lastSaveError" | "dirtySince"
> | null {
  if (state.revision !== revision) return null;
  return {
    dirty: false,
    saveStatus: "saved",
    lastSavedAt: Date.now(),
    lastSaveError: undefined,
    dirtySince: undefined,
  };
}

export function saveFailedTransition(
  state: Pick<SaveLifecycleState, "revision" | "lastDiagnostics">,
  revision: number,
  error: unknown,
): Pick<
  SaveLifecycleState,
  "dirty" | "saveStatus" | "lastSaveError" | "lastDiagnostics"
> | null {
  if (state.revision !== revision) return null;
  const message = error instanceof Error ? error.message : String(error);
  return {
    dirty: true,
    saveStatus: "error",
    lastSaveError: message,
    lastDiagnostics: mergeDiagnostics(state.lastDiagnostics, [
      diagnosticError("save-failed", `Local save failed. ${message}`),
    ]),
  };
}

export function mergeDiagnostics(
  existing: Diagnostic[],
  additions: Diagnostic[],
): Diagnostic[] {
  if (additions.length === 0) return existing;
  return [...existing, ...additions];
}
