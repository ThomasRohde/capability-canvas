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
import {
  applyLayoutPatches,
  computeDocumentBounds,
  layoutDocument,
} from "../../domain/layout/engine";
import { warning, type Diagnostic } from "../../domain/validation/diagnostics";

interface DocumentState {
  doc: CapabilityDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastDiagnostics: Diagnostic[];
  dirty: boolean;
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
  isAutoLayoutRunning: false,
  execute: (txn) => {
    const before = get().doc;
    const result = runStoreTransaction(before, txn);
    const committed = result.doc !== before;
    set({
      doc: result.doc,
      lastDiagnostics: result.diagnostics,
      dirty: committed || get().dirty,
      past: committed
        ? [
            ...get().past,
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
        : get().past,
      future: committed ? [] : get().future,
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
    set({
      doc: next,
      dirty: true,
      lastDiagnostics: [],
    });
    return [];
  },
  setActiveViewViewport: (viewport) => {
    const before = get().doc;
    const next = updateActiveViewViewport(before, viewport);
    if (next === before) return;
    set({ doc: next, dirty: true });
  },
  undo: () => {
    const past = get().past;
    const entry = past[past.length - 1];
    if (!entry) return;
    set({
      doc: cloneDocument(entry.before),
      past: past.slice(0, -1),
      future: [entry, ...get().future],
      dirty: true,
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
      dirty: true,
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
    set({
      doc: repaired,
      past: [
        ...get().past,
        {
          label,
          before: cloneDocument(before),
          after: cloneDocument(repaired),
        },
      ],
      future: [],
      dirty: true,
      lastDiagnostics: diagnostics,
    });
  },
  setDiagnostics: (diagnostics) => set({ lastDiagnostics: diagnostics }),
  reset: () =>
    set({
      doc: createSampleDocument(),
      past: [],
      future: [],
      dirty: false,
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
        dirty: result.doc === before ? get().dirty : true,
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
        dirty: settingsResult.doc !== before || get().dirty,
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
      dirty: true,
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
        dirty: true,
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
      dirty: true,
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

const VISUAL_COMMAND_TYPES = new Set([
  "add-subtree-to-canvas",
  "remove-subtree-from-canvas",
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
}): Promise<void> {
  const { before, after, scope, force, viewId, get, set } = args;
  if (get().doc !== after) return;
  const resolvedBefore = resolveVisualDocument(before, viewId);
  const resolvedAfter = resolveVisualDocument(after, viewId);
  const ids = resolveScope(scope, resolvedBefore, resolvedAfter);
  if (ids?.length === 0) return;

  try {
    const result = await layoutAndRepair(after, force, ids ?? undefined, viewId);
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

    set({
      doc: result.doc,
      past: last ? [...past.slice(0, -1), replacement] : [...past, replacement],
      future: [],
      dirty: true,
      lastDiagnostics: mergeDiagnostics(
        get().lastDiagnostics,
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
  const nextDoc =
    repaired.doc === resolved
      ? doc
      : applyResolvedVisualDocument(doc, repaired.doc, viewId);
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
  if (
    doc.layout.boundingBox.x === boundingBox.x &&
    doc.layout.boundingBox.y === boundingBox.y &&
    doc.layout.boundingBox.w === boundingBox.w &&
    doc.layout.boundingBox.h === boundingBox.h
  )
    return doc;
  return {
    ...doc,
    layout: {
      ...doc.layout,
      boundingBox,
    },
  };
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
