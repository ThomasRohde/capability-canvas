import { create } from 'zustand';
import { runTransaction, transaction } from '../../domain/commands/operations';
import type { HistoryEntry, Transaction } from '../../domain/commands/types';
import { cloneDocument } from '../../domain/document/normalize';
import type { CapabilityDocument } from '../../domain/document/types';
import { createSampleDocument } from '../../domain/fixtures/sample';
import { applyLayoutPatches, layoutDocument } from '../../domain/layout/engine';
import type { Diagnostic } from '../../domain/validation/diagnostics';

interface DocumentState {
  doc: CapabilityDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastDiagnostics: Diagnostic[];
  dirty: boolean;
  execute: (txn: Transaction) => Diagnostic[];
  undo: () => void;
  redo: () => void;
  setDocument: (doc: CapabilityDocument, label?: string) => void;
  reset: () => void;
  autoLayout: (force?: boolean) => Diagnostic[];
  clearDiagnostics: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  doc: createSampleDocument(),
  past: [],
  future: [],
  lastDiagnostics: [],
  dirty: false,
  execute: (txn) => {
    const before = get().doc;
    const result = runTransaction(before, txn);
    set({
      doc: result.doc,
      lastDiagnostics: result.diagnostics,
      dirty: result.doc !== before || get().dirty,
      past:
        result.doc === before
          ? get().past
          : [...get().past, { label: txn.label, before: cloneDocument(before), after: cloneDocument(result.doc) }],
      future: result.doc === before ? get().future : []
    });
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
      lastDiagnostics: []
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
      lastDiagnostics: []
    });
  },
  setDocument: (doc, label = 'Import document') => {
    const before = get().doc;
    set({
      doc,
      past: [...get().past, { label, before: cloneDocument(before), after: cloneDocument(doc) }],
      future: [],
      dirty: true,
      lastDiagnostics: []
    });
  },
  reset: () => set({ doc: createSampleDocument(), past: [], future: [], dirty: false, lastDiagnostics: [] }),
  autoLayout: (force = false) => {
    const before = get().doc;
    const result = layoutDocument({ doc: before, force, mode: before.settings.layoutMode });
    const after = applyLayoutPatches(before, result.patches);
    set({
      doc: after,
      past:
        after === before
          ? get().past
          : [...get().past, { label: 'Auto layout', before: cloneDocument(before), after: cloneDocument(after) }],
      future: [],
      dirty: true,
      lastDiagnostics: result.diagnostics
    });
    return result.diagnostics;
  },
  clearDiagnostics: () => set({ lastDiagnostics: [] })
}));

export function executeMany(label: string, transactions: Transaction[], source: NonNullable<Transaction['meta']>['source'] = 'edit') {
  useDocumentStore
    .getState()
    .execute(transaction(label, transactions.flatMap((txn) => txn.commands), { source }));
}
