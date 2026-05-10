import { create } from "zustand";
import { transaction } from "../../domain/commands/operations";
import type {
  HistoryEntry,
  Transaction,
} from "../../domain/commands/types";
import type {
  CapabilityDocument,
  VisualViewId,
  VisualViewport,
} from "../../domain/document/types";
import { createSampleDocument } from "../../domain/fixtures/sample";
import { ensureParentContainment } from "../../domain/layout/containment";
import {
  applyResolvedVisualDocument,
  materializeActiveViewMetadata,
  resolveVisualDocument,
  updateActiveViewViewport,
} from "../../domain/visual/workspace";
import {
  warning,
  type Diagnostic,
} from "../../domain/validation/diagnostics";
import {
  appendHistoryEntry,
  clearRedo,
  cloneHistoryAfter,
  cloneHistoryBefore,
  createHistoryEntry,
  moveLastHistoryEntryToFuture,
  moveNextFutureEntryToPast,
} from "./documentHistory";
import {
  ensureLayoutBounds,
  layoutAndRepair,
  runRelayout,
} from "./documentRelayout";
import {
  markDirty,
  saveFailedTransition,
  saveStartedTransition,
  saveSucceededTransition,
  type SaveStatus,
} from "./documentSaveLifecycle";
import {
  settingsLabel,
  settingsTransaction,
} from "./documentSettings";
import {
  applyBaselineResult,
  runStoreTransaction,
} from "./documentTransactions";

export type { SaveStatus } from "./documentSaveLifecycle";

interface DocumentState {
  doc: CapabilityDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastDiagnostics: Diagnostic[];
  dirty: boolean;
  saveStatus: SaveStatus;
  lastSavedAt?: number;
  lastSaveError?: string;
  dirtySince?: number;
  lastRestoredAt?: number;
  revision: number;
  isAutoLayoutRunning: boolean;
  execute: (txn: Transaction) => Diagnostic[];
  setActiveVisualView: (
    viewId: VisualViewId,
    options?: { previousViewport?: VisualViewport },
  ) => Diagnostic[];
  setActiveViewViewport: (viewport: VisualViewport) => void;
  undo: () => void;
  redo: () => void;
  setDocument: (
    doc: CapabilityDocument,
    label?: string,
    diagnostics?: Diagnostic[],
  ) => void;
  hydrateDocument: (
    doc: CapabilityDocument,
    diagnostics?: Diagnostic[],
  ) => void;
  markSaveStarted: (revision: number) => void;
  markSaveSucceeded: (revision: number) => void;
  markSaveFailed: (revision: number, error: unknown) => void;
  setDiagnostics: (diagnostics: Diagnostic[]) => void;
  reset: () => void;
  autoLayout: (force?: boolean) => Promise<Diagnostic[]>;
  updateSettings: (
    patch: Partial<CapabilityDocument["settings"]>,
    options?: { autoLayout?: boolean },
  ) => Promise<Diagnostic[]>;
  repairContainment: () => void;
  clearDiagnostics: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  doc: createSampleDocument(),
  past: [],
  future: [],
  lastDiagnostics: [],
  dirty: false,
  saveStatus: "idle",
  lastSavedAt: undefined,
  lastSaveError: undefined,
  dirtySince: undefined,
  lastRestoredAt: undefined,
  revision: 0,
  isAutoLayoutRunning: false,
  execute: (txn) => {
    const before = get().doc;
    const rawResult = runStoreTransaction(before, txn);
    const result = applyBaselineResult(rawResult, txn);
    const committed = result.doc !== before;
    const state = get();
    set({
      doc: result.doc,
      lastDiagnostics: result.diagnostics,
      ...(committed ? markDirty(state) : {}),
      past: committed
        ? appendHistoryEntry(
            state.past,
            createHistoryEntry({
              label: txn.label,
              before,
              after: result.doc,
              relayout: txn.meta?.relayout,
            }),
          )
        : state.past,
      future: committed ? clearRedo() : state.future,
    });
    if (committed && txn.meta?.relayout) {
      void runRelayout({
        before,
        after: result.doc,
        scope: txn.meta.relayout.scope,
        force: txn.meta.relayout.force ?? false,
        viewId: txn.meta.relayout.viewId,
        label: txn.label,
        get,
        set,
        baseline: txn.meta?.baseline,
      });
    }
    return result.diagnostics;
  },
  setActiveVisualView: (viewId, options = {}) => {
    const before = get().doc;
    if (!before.visual.viewsById[viewId]) {
      const diagnostics = [
        warning("missing-view", "Select a valid visual view."),
      ];
      set({ lastDiagnostics: diagnostics });
      return diagnostics;
    }
    let viewsById = before.visual.viewsById;
    if (options.previousViewport) {
      const previousView = viewsById[before.visual.activeViewId];
      if (previousView) {
        viewsById = {
          ...viewsById,
          [before.visual.activeViewId]: {
            ...previousView,
            viewport: { ...options.previousViewport },
            updatedAt: Date.now(),
          },
        };
      }
    }
    const next = materializeActiveViewMetadata({
      ...before,
      visual: {
        ...before.visual,
        viewsById,
        activeViewId: viewId,
      },
      timestamp: Date.now(),
    });
    const state = get();
    set({
      doc: next,
      ...markDirty(state),
      lastDiagnostics: [],
    });
    return [];
  },
  setActiveViewViewport: (viewport) => {
    const before = get().doc;
    const next = updateActiveViewViewport(before, viewport);
    if (next === before) return;
    set({ doc: next, ...markDirty(get()) });
  },
  undo: () => {
    const state = get();
    const { entry, past, future } = moveLastHistoryEntryToFuture(state);
    if (!entry) return;
    set({
      doc: cloneHistoryBefore(entry),
      past,
      future,
      ...markDirty(state),
      lastDiagnostics: [],
    });
  },
  redo: () => {
    const state = get();
    const { entry, past, future } = moveNextFutureEntryToPast(state);
    if (!entry) return;
    const after = cloneHistoryAfter(entry);
    set({
      doc: after,
      past,
      future,
      ...markDirty(state),
      lastDiagnostics: [],
    });
    if (entry.relayout) {
      void runRelayout({
        before: entry.before,
        after,
        scope: entry.relayout.scope,
        force: entry.relayout.force,
        viewId: entry.relayout.viewId,
        label: entry.label,
        get,
        set,
      });
    }
  },
  setDocument: (doc, label = "Import document", diagnostics = []) => {
    const before = get().doc;
    const repaired = ensureLayoutBounds(
      materializeActiveViewMetadata(ensureParentContainment(doc).doc),
    );
    const state = get();
    set({
      doc: repaired,
      past: appendHistoryEntry(
        state.past,
        createHistoryEntry({ label, before, after: repaired }),
      ),
      future: clearRedo(),
      ...markDirty(state),
      lastDiagnostics: diagnostics,
    });
  },
  hydrateDocument: (doc, diagnostics = []) => {
    const hydrated = ensureLayoutBounds(
      materializeActiveViewMetadata(ensureParentContainment(doc).doc),
    );
    set({
      doc: hydrated,
      past: [],
      future: [],
      dirty: false,
      saveStatus: "idle",
      lastSaveError: undefined,
      dirtySince: undefined,
      lastRestoredAt: Date.now(),
      revision: get().revision + 1,
      lastDiagnostics: diagnostics,
      isAutoLayoutRunning: false,
    });
  },
  markSaveStarted: (revision) => {
    const transition = saveStartedTransition(get(), revision);
    if (transition) set(transition);
  },
  markSaveSucceeded: (revision) => {
    const transition = saveSucceededTransition(get(), revision);
    if (transition) set(transition);
  },
  markSaveFailed: (revision, error) => {
    const transition = saveFailedTransition(get(), revision, error);
    if (transition) set(transition);
  },
  setDiagnostics: (diagnostics) => set({ lastDiagnostics: diagnostics }),
  reset: () =>
    set({
      doc: createSampleDocument(),
      past: [],
      future: [],
      dirty: false,
      saveStatus: "idle",
      lastSavedAt: undefined,
      lastSaveError: undefined,
      dirtySince: undefined,
      lastRestoredAt: undefined,
      revision: get().revision + 1,
      lastDiagnostics: [],
      isAutoLayoutRunning: false,
    }),
  autoLayout: async (force = false) => {
    if (get().isAutoLayoutRunning) return get().lastDiagnostics;
    const before = get().doc;
    set({ isAutoLayoutRunning: true });
    try {
      const result = await layoutAndRepair(before, force);
      if (get().doc !== before) {
        const diagnostics = [
          ...result.diagnostics,
          warning(
            "layout-stale",
            "Auto layout was skipped because the document changed before layout completed.",
          ),
        ];
        set({ lastDiagnostics: diagnostics, isAutoLayoutRunning: false });
        return diagnostics;
      }
      const state = get();
      const changed = result.doc !== before;
      set({
        doc: result.doc,
        past: changed
          ? appendHistoryEntry(
              state.past,
              createHistoryEntry({
                label: "Auto layout",
                before,
                after: result.doc,
              }),
            )
          : state.past,
        future: changed ? clearRedo() : state.future,
        ...(changed ? markDirty(state) : {}),
        lastDiagnostics: result.diagnostics,
        isAutoLayoutRunning: false,
      });
      return result.diagnostics;
    } catch (error) {
      const diagnostics = [
        warning(
          "layout-failed",
          `Auto layout failed. ${error instanceof Error ? error.message : String(error)}`,
        ),
      ];
      set({ lastDiagnostics: diagnostics, isAutoLayoutRunning: false });
      return diagnostics;
    }
  },
  updateSettings: async (patch, options = {}) => {
    const before = get().doc;
    const settingsResult = runStoreTransaction(
      before,
      settingsTransaction(patch),
    );
    if (settingsResult.doc === before || !options.autoLayout) {
      const state = get();
      const changed = settingsResult.doc !== before;
      set({
        doc: settingsResult.doc,
        lastDiagnostics: settingsResult.diagnostics,
        ...(changed ? markDirty(state) : {}),
        past: changed
          ? appendHistoryEntry(
              state.past,
              createHistoryEntry({
                label: settingsLabel(patch),
                before,
                after: settingsResult.doc,
              }),
            )
          : state.past,
        future: changed ? clearRedo() : state.future,
      });
      return settingsResult.diagnostics;
    }

    const withSettings = settingsResult.doc;
    set({
      doc: withSettings,
      ...markDirty(get()),
      lastDiagnostics: settingsResult.diagnostics,
      isAutoLayoutRunning: true,
    });

    try {
      const layoutResult = await layoutAndRepair(withSettings, true);
      if (get().doc !== withSettings) {
        const diagnostics = [
          ...settingsResult.diagnostics,
          ...layoutResult.diagnostics,
          warning(
            "layout-stale",
            "Auto layout was skipped because the document changed before layout completed.",
          ),
        ];
        set({ lastDiagnostics: diagnostics, isAutoLayoutRunning: false });
        return diagnostics;
      }
      const diagnostics = [
        ...settingsResult.diagnostics,
        ...layoutResult.diagnostics,
      ];
      const state = get();
      set({
        doc: layoutResult.doc,
        past: appendHistoryEntry(
          state.past,
          createHistoryEntry({
            label: settingsLabel(patch),
            before,
            after: layoutResult.doc,
          }),
        ),
        future: clearRedo(),
        ...markDirty(state),
        lastDiagnostics: diagnostics,
        isAutoLayoutRunning: false,
      });
      return diagnostics;
    } catch (error) {
      const diagnostics = [
        ...settingsResult.diagnostics,
        warning(
          "layout-failed",
          `Auto layout failed. ${error instanceof Error ? error.message : String(error)}`,
        ),
      ];
      const state = get();
      set({
        past: appendHistoryEntry(
          state.past,
          createHistoryEntry({
            label: settingsLabel(patch),
            before,
            after: withSettings,
          }),
        ),
        future: clearRedo(),
        lastDiagnostics: diagnostics,
        isAutoLayoutRunning: false,
      });
      return diagnostics;
    }
  },
  repairContainment: () => {
    const before = get().doc;
    const resolved = resolveVisualDocument(before);
    const repaired = ensureParentContainment(resolved);
    if (repaired.changedNodeIds.length === 0) return;
    const after = applyResolvedVisualDocument(before, repaired.doc);
    const state = get();
    set({
      doc: after,
      past: appendHistoryEntry(
        state.past,
        createHistoryEntry({
          label: "Repair containment",
          before,
          after,
        }),
      ),
      future: clearRedo(),
      ...markDirty(state),
      lastDiagnostics: [
        ...state.lastDiagnostics,
        warning(
          "parent-containment-repaired",
          "Expanded parent capabilities to contain their children visually.",
        ),
      ],
    });
  },
  clearDiagnostics: () => set({ lastDiagnostics: [] }),
}));

export function executeMany(
  label: string,
  transactions: Transaction[],
  source: Exclude<
    NonNullable<Transaction["meta"]>["source"],
    undefined
  > = "edit",
) {
  return useDocumentStore.getState().execute(
    transaction(
      label,
      transactions.flatMap((txn) => txn.commands),
      { source },
    ),
  );
}
