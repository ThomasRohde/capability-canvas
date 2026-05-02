import { create } from "zustand";
import {
  runTransaction,
  transaction,
  updateDocumentSettings,
} from "../../domain/commands/operations";
import type {
  HistoryEntry,
  RelayoutScope,
  Transaction,
} from "../../domain/commands/types";
import { cloneDocument } from "../../domain/document/normalize";
import type { CapabilityDocument, NodeId } from "../../domain/document/types";
import { createSampleDocument } from "../../domain/fixtures/sample";
import { ensureParentContainment } from "../../domain/layout/containment";
import { applyLayoutPatches, layoutDocument } from "../../domain/layout/engine";
import { warning, type Diagnostic } from "../../domain/validation/diagnostics";

interface DocumentState {
  doc: CapabilityDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastDiagnostics: Diagnostic[];
  dirty: boolean;
  isAutoLayoutRunning: boolean;
  execute: (txn: Transaction) => Diagnostic[];
  undo: () => void;
  redo: () => void;
  setDocument: (doc: CapabilityDocument, label?: string) => void;
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
    const result = runTransaction(before, txn);
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
        label: txn.label,
        get,
        set,
      });
    }
    return result.diagnostics;
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
    set({
      doc: cloneDocument(entry.after),
      past: [...get().past, entry],
      future: get().future.slice(1),
      dirty: true,
      lastDiagnostics: [],
    });
  },
  setDocument: (doc, label = "Import document") => {
    const before = get().doc;
    const repaired = ensureParentContainment(doc).doc;
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
      lastDiagnostics: [],
    });
  },
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
    const settingsResult = runTransaction(
      before,
      updateDocumentSettings(patch),
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
    const repaired = ensureParentContainment(before);
    if (repaired.changedNodeIds.length === 0) return;
    set({
      doc: {
        ...repaired.doc,
        timestamp: Date.now(),
      },
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

async function runRelayout(args: {
  before: CapabilityDocument;
  after: CapabilityDocument;
  scope: RelayoutScope;
  force: boolean;
  label: string;
  get: () => DocumentState;
  set: (partial: Partial<DocumentState>) => void;
}): Promise<void> {
  const { before, after, scope, force, get, set } = args;
  if (get().doc !== after) return;
  const ids = resolveScope(scope, before, after);
  if (ids?.length === 0) return;

  try {
    const result = await layoutDocument({
      doc: after,
      affectedNodeIds: ids ?? undefined,
      mode: after.settings.layoutMode,
      force,
    });
    if (get().doc !== after) return;
    if (result.patches.length === 0) {
      const merged = mergeDiagnostics(
        get().lastDiagnostics,
        result.diagnostics,
      );
      if (merged !== get().lastDiagnostics) set({ lastDiagnostics: merged });
      return;
    }

    const laidOut = applyLayoutPatches(after, result.patches);
    if (laidOut === after) return;
    const repaired = ensureParentContainment(laidOut).doc;
    if (get().doc !== after) return;

    const past = get().past;
    const last = past[past.length - 1];
    const replacement: HistoryEntry = last
      ? {
          label: last.label,
          before: last.before,
          after: cloneDocument(repaired),
        }
      : {
          label: args.label,
          before: cloneDocument(before),
          after: cloneDocument(repaired),
        };

    set({
      doc: repaired,
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
): Promise<{ doc: CapabilityDocument; diagnostics: Diagnostic[] }> {
  const result = await layoutDocument({
    doc,
    force,
    mode: doc.settings.layoutMode,
  });
  const laidOut = applyLayoutPatches(doc, result.patches);
  const repaired = ensureParentContainment(laidOut);
  return {
    doc: repaired.doc,
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

export function executeMany(
  label: string,
  transactions: Transaction[],
  source: Exclude<
    NonNullable<Transaction["meta"]>["source"],
    undefined
  > = "edit",
) {
  useDocumentStore.getState().execute(
    transaction(
      label,
      transactions.flatMap((txn) => txn.commands),
      { source },
    ),
  );
}
