import { create } from "zustand";
import {
  runTransaction,
  transaction,
  updateActiveViewLayoutSettings,
  updateDocumentSettings,
} from "../../domain/commands/operations";
import type {
  HistoryEntry,
  RelayoutScope,
  Transaction,
} from "../../domain/commands/types";
import { cloneDocument } from "../../domain/document/normalize";
import type {
  CapabilityDocument,
  NodeId,
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
import { attachViewBaseline } from "../../domain/visual/viewChanges";
import {
  applyLayoutMetadata,
  applyLayoutPatches,
  computeDocumentBounds,
  layoutDocument,
} from "../../domain/layout/engine";
import {
  error as diagnosticError,
  warning,
  type Diagnostic,
} from "../../domain/validation/diagnostics";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

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
        ? [
            ...state.past,
            {
              label: txn.label,
              before: cloneDocument(before),
              after: cloneDocument(result.doc),
              relayout: txn.meta?.relayout
                ? {
                    scope: txn.meta.relayout.scope,
                    force: txn.meta.relayout.force ?? false,
                    viewId: txn.meta.relayout.viewId,
                  }
                : undefined,
            },
          ]
        : state.past,
      future: committed ? [] : state.future,
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
    const visual = {
      ...before.visual,
      viewOrder: [...before.visual.viewOrder],
      viewsById: Object.fromEntries(
        Object.entries(before.visual.viewsById).map(([id, view]) => [
          id,
          {
            ...view,
            nodeStatesById: { ...view.nodeStatesById },
            viewport: view.viewport ? { ...view.viewport } : undefined,
            layout: {
              ...view.layout,
              boundingBox: view.layout.boundingBox
                ? { ...view.layout.boundingBox }
                : undefined,
              aspectRatioFrame: view.layout.aspectRatioFrame
                ? { ...view.layout.aspectRatioFrame }
                : undefined,
              aspectRatioTarget: view.layout.aspectRatioTarget
                ? { ...view.layout.aspectRatioTarget }
                : undefined,
            },
            heatmap: {
              ...view.heatmap,
              legendBounds: view.heatmap.legendBounds
                ? { ...view.heatmap.legendBounds }
                : undefined,
            },
            export: { ...view.export },
          },
        ]),
      ),
      activeViewId: viewId,
    };
    if (options.previousViewport) {
      const previousView =
        visual.viewsById[before.visual.activeViewId];
      if (previousView) {
        previousView.viewport = { ...options.previousViewport };
        previousView.updatedAt = Date.now();
      }
    }
    const next = materializeActiveViewMetadata({
      ...before,
      visual,
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
    const past = get().past;
    const entry = past[past.length - 1];
    if (!entry) return;
    set({
      doc: cloneDocument(entry.before),
      past: past.slice(0, -1),
      future: [entry, ...get().future],
      ...markDirty(get()),
      lastDiagnostics: [],
    });
  },
  redo: () => {
    const entry = get().future[0];
    if (!entry) return;
    const after = cloneDocument(entry.after);
    set({
      doc: after,
      past: [...get().past, entry],
      future: get().future.slice(1),
      ...markDirty(get()),
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
      past: [
        ...state.past,
        {
          label,
          before: cloneDocument(before),
          after: cloneDocument(repaired),
        },
      ],
      future: [],
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
    const state = get();
    if (!state.dirty || state.revision !== revision) return;
    set({
      saveStatus: "saving",
      lastSaveError: undefined,
    });
  },
  markSaveSucceeded: (revision) => {
    const state = get();
    if (state.revision !== revision) return;
    set({
      dirty: false,
      saveStatus: "saved",
      lastSavedAt: Date.now(),
      lastSaveError: undefined,
      dirtySince: undefined,
    });
  },
  markSaveFailed: (revision, error) => {
    const state = get();
    if (state.revision !== revision) return;
    const message = error instanceof Error ? error.message : String(error);
    set({
      dirty: true,
      saveStatus: "error",
      lastSaveError: message,
      lastDiagnostics: mergeDiagnostics(state.lastDiagnostics, [
        diagnosticError(
          "save-failed",
          `Local save failed. ${message}`,
        ),
      ]),
    });
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
      set({
        doc: result.doc,
        past:
          result.doc === before
            ? get().past
            : [
                ...get().past,
                {
                  label: "Auto layout",
                  before: cloneDocument(before),
                  after: cloneDocument(result.doc),
                },
              ],
        future: result.doc === before ? get().future : [],
        ...(result.doc === before ? {} : markDirty(get())),
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
      set({
        doc: settingsResult.doc,
        lastDiagnostics: settingsResult.diagnostics,
        ...(settingsResult.doc === before ? {} : markDirty(get())),
        past:
          settingsResult.doc === before
            ? get().past
            : [
                ...get().past,
                {
                  label: settingsLabel(patch),
                  before: cloneDocument(before),
                  after: cloneDocument(settingsResult.doc),
                },
              ],
        future: settingsResult.doc === before ? get().future : [],
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
      set({
        doc: layoutResult.doc,
        past: [
          ...get().past,
          {
            label: settingsLabel(patch),
            before: cloneDocument(before),
            after: cloneDocument(layoutResult.doc),
          },
        ],
        future: [],
        ...markDirty(get()),
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
      set({
        past: [
          ...get().past,
          {
            label: settingsLabel(patch),
            before: cloneDocument(before),
            after: cloneDocument(withSettings),
          },
        ],
        future: [],
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
    set({
      doc: after,
      past: [
        ...get().past,
        {
          label: "Repair containment",
          before: cloneDocument(before),
          after: cloneDocument(after),
        },
      ],
      future: [],
      ...markDirty(get()),
      lastDiagnostics: [
        ...get().lastDiagnostics,
        warning(
          "parent-containment-repaired",
          "Expanded parent capabilities to contain their children visually.",
        ),
      ],
    });
  },
  clearDiagnostics: () => set({ lastDiagnostics: [] }),
}));

function markDirty(state: DocumentState): Pick<
  DocumentState,
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

const VISUAL_COMMAND_TYPES = new Set([
  "add-subtree-to-canvas",
  "remove-subtree-from-canvas",
  "remove-nodes-from-canvas",
  "move-nodes",
  "resize-node",
  "align-nodes",
  "distribute-nodes",
  "same-size",
  "fit-parent-to-children",
  "repair-sibling-overlaps",
  "lock-subtree",
  "set-manual-positioning",
]);

function runStoreTransaction(doc: CapabilityDocument, txn: Transaction) {
  if (!isVisualEditTransaction(txn)) return runTransaction(doc, txn);
  const resolved = resolveVisualDocument(doc);
  const result = runTransaction(resolved, txn);
  if (result.doc === resolved) return { doc, diagnostics: result.diagnostics };
  return {
    doc: applyResolvedVisualDocument(doc, result.doc),
    diagnostics: result.diagnostics,
  };
}

function applyBaselineResult(
  result: { doc: CapabilityDocument; diagnostics: Diagnostic[] },
  txn: Transaction,
): { doc: CapabilityDocument; diagnostics: Diagnostic[] } {
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

function isVisualEditTransaction(txn: Transaction): boolean {
  return (
    txn.commands.length > 0 &&
    txn.commands.every((command) => VISUAL_COMMAND_TYPES.has(command.type))
  );
}

function settingsTransaction(
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

async function runRelayout(args: {
  before: CapabilityDocument;
  after: CapabilityDocument;
  scope: RelayoutScope;
  force: boolean;
  viewId?: VisualViewId;
  label: string;
  get: () => DocumentState;
  set: (partial: Partial<DocumentState>) => void;
  baseline?: NonNullable<Transaction["meta"]>["baseline"];
}): Promise<void> {
  const { before, after, scope, force, viewId, get, set } = args;
  if (get().doc !== after) return;
  const resolvedBefore = resolveVisualDocument(before, viewId);
  const resolvedAfter = resolveVisualDocument(after, viewId);
  const ids = resolveScope(scope, resolvedBefore, resolvedAfter);
  if (ids?.length === 0) return;

  try {
    const rawResult = await layoutAndRepair(after, force, ids ?? undefined, viewId);
    const result = args.baseline
      ? {
          ...rawResult,
          doc: attachViewBaseline(
            rawResult.doc,
            args.baseline.viewId,
            args.baseline.mode,
          ),
        }
      : rawResult;
    if (get().doc !== after) return;
    if (result.doc === after) {
      const merged = mergeDiagnostics(
        get().lastDiagnostics,
        result.diagnostics,
      );
      if (merged !== get().lastDiagnostics) set({ lastDiagnostics: merged });
      return;
    }
    if (get().doc !== after) return;

    const past = get().past;
    const last = past[past.length - 1];
    const replacement: HistoryEntry = last
      ? {
          label: last.label,
          before: last.before,
          after: cloneDocument(result.doc),
          relayout: last.relayout,
        }
      : {
          label: args.label,
          before: cloneDocument(before),
          after: cloneDocument(result.doc),
          relayout: { scope, force, viewId },
        };

    const state = get();
    set({
      doc: result.doc,
      past: last ? [...past.slice(0, -1), replacement] : [...past, replacement],
      future: [],
      ...markDirty(state),
      lastDiagnostics: mergeDiagnostics(
        state.lastDiagnostics,
        result.diagnostics,
      ),
    });
  } catch (error) {
    if (get().doc !== after) return;
    set({
      lastDiagnostics: mergeDiagnostics(get().lastDiagnostics, [
        warning(
          "layout-failed",
          `Auto layout after ${args.label.toLowerCase()} failed. ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      ]),
    });
  }
}

function resolveScope(
  scope: RelayoutScope,
  before: CapabilityDocument,
  after: CapabilityDocument,
): NodeId[] | null {
  if (scope === "document") return null;
  if (typeof scope === "function") return scope(before, after);
  return scope;
}

function mergeDiagnostics(
  existing: Diagnostic[],
  additions: Diagnostic[],
): Diagnostic[] {
  if (additions.length === 0) return existing;
  return [...existing, ...additions];
}

async function layoutAndRepair(
  doc: CapabilityDocument,
  force: boolean,
  affectedNodeIds?: NodeId[],
  viewId?: VisualViewId,
): Promise<{ doc: CapabilityDocument; diagnostics: Diagnostic[] }> {
  const resolved = resolveVisualDocument(doc, viewId);
  const result = await layoutDocument({
    doc: resolved,
    affectedNodeIds,
    force,
    mode: resolved.settings.layoutMode,
  });
  const laidOut = applyLayoutPatches(resolved, result.patches);
  const repaired = ensureParentContainment(laidOut);
  const withMetadata = applyLayoutMetadata(repaired.doc, result);
  const nextDoc =
    withMetadata === resolved
      ? doc
      : applyResolvedVisualDocument(doc, withMetadata, viewId);
  return {
    doc: nextDoc,
    diagnostics:
      repaired.changedNodeIds.length > 0
        ? [
            ...result.diagnostics,
            warning(
              "parent-containment-repaired",
              "Expanded parent capabilities to contain their children after auto layout.",
            ),
          ]
        : result.diagnostics,
  };
}

function settingsLabel(patch: Partial<CapabilityDocument["settings"]>) {
  if (patch.layoutMode) return `Set layout mode to ${patch.layoutMode}`;
  return "Update layout settings";
}

function ensureLayoutBounds(doc: CapabilityDocument): CapabilityDocument {
  const boundingBox = computeDocumentBounds(resolveVisualDocument(doc));
  const keepFrame =
    doc.layout.mode === "balanced" &&
    !doc.layout.isUserArranged &&
    sameBounds(doc.layout.boundingBox, boundingBox);
  if (
    doc.layout.boundingBox.x === boundingBox.x &&
    doc.layout.boundingBox.y === boundingBox.y &&
    doc.layout.boundingBox.w === boundingBox.w &&
    doc.layout.boundingBox.h === boundingBox.h &&
    (keepFrame ||
      (!doc.layout.aspectRatioFrame && !doc.layout.aspectRatioTarget))
  )
    return doc;
  return {
    ...doc,
    layout: {
      ...doc.layout,
      boundingBox,
      aspectRatioFrame: keepFrame ? doc.layout.aspectRatioFrame : undefined,
      aspectRatioTarget: keepFrame ? doc.layout.aspectRatioTarget : undefined,
    },
  };
}

function sameBounds(
  left: { x: number; y: number; w: number; h: number } | undefined,
  right: { x: number; y: number; w: number; h: number } | undefined,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.w === right.w &&
    left.h === right.h
  );
}

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
