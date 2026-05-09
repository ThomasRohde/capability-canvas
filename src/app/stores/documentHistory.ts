import type {
  HistoryEntry,
  RelayoutScope,
} from "../../domain/commands/types";
import { cloneDocument } from "../../domain/document/normalize";
import type {
  CapabilityDocument,
  VisualViewId,
} from "../../domain/document/types";

export function createHistoryEntry(args: {
  label: string;
  before: CapabilityDocument;
  after: CapabilityDocument;
  relayout?: {
    scope: RelayoutScope;
    force?: boolean;
    viewId?: VisualViewId;
  };
}): HistoryEntry {
  return {
    label: args.label,
    before: cloneDocument(args.before),
    after: cloneDocument(args.after),
    relayout: args.relayout
      ? {
          scope: args.relayout.scope,
          force: args.relayout.force ?? false,
          viewId: args.relayout.viewId,
        }
      : undefined,
  };
}

export function appendHistoryEntry(
  past: HistoryEntry[],
  entry: HistoryEntry,
): HistoryEntry[] {
  return [...past, entry];
}

export function clearRedo(): HistoryEntry[] {
  return [];
}

export function cloneHistoryBefore(entry: HistoryEntry): CapabilityDocument {
  return cloneDocument(entry.before);
}

export function cloneHistoryAfter(entry: HistoryEntry): CapabilityDocument {
  return cloneDocument(entry.after);
}

export function moveLastHistoryEntryToFuture(args: {
  past: HistoryEntry[];
  future: HistoryEntry[];
}): { entry?: HistoryEntry; past: HistoryEntry[]; future: HistoryEntry[] } {
  const entry = args.past[args.past.length - 1];
  if (!entry) return { past: args.past, future: args.future };
  return {
    entry,
    past: args.past.slice(0, -1),
    future: [entry, ...args.future],
  };
}

export function moveNextFutureEntryToPast(args: {
  past: HistoryEntry[];
  future: HistoryEntry[];
}): { entry?: HistoryEntry; past: HistoryEntry[]; future: HistoryEntry[] } {
  const entry = args.future[0];
  if (!entry) return { past: args.past, future: args.future };
  return {
    entry,
    past: [...args.past, entry],
    future: args.future.slice(1),
  };
}

export function replaceLastHistoryEntryAfterRelayout(args: {
  past: HistoryEntry[];
  fallbackLabel: string;
  fallbackBefore: CapabilityDocument;
  fallbackAfter: CapabilityDocument;
  fallbackRelayout: {
    scope: RelayoutScope;
    force: boolean;
    viewId?: VisualViewId;
  };
}): HistoryEntry[] {
  const last = args.past[args.past.length - 1];
  const replacement: HistoryEntry = last
    ? {
        label: last.label,
        before: last.before,
        after: cloneDocument(args.fallbackAfter),
        relayout: last.relayout,
      }
    : createHistoryEntry({
        label: args.fallbackLabel,
        before: args.fallbackBefore,
        after: args.fallbackAfter,
        relayout: args.fallbackRelayout,
      });

  return last
    ? [...args.past.slice(0, -1), replacement]
    : [...args.past, replacement];
}
