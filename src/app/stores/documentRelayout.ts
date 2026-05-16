import type {
  HistoryEntry,
  RelayoutScope,
  Transaction,
} from "../../domain/commands/types";
import type {
  CapabilityDocument,
  LayoutMode,
  NodeId,
  VisualViewId,
} from "../../domain/document/types";
import { sameBounds } from "../../domain/layout/bounds";
import { ensureParentContainment } from "../../domain/layout/containment";
import {
  applyLayoutMetadata,
  applyLayoutPatches,
  computeDocumentBounds,
  layoutDocument,
} from "../../domain/layout/engine";
import {
  applyResolvedVisualDocument,
  resolveVisualDocument,
} from "../../domain/visual/workspace";
import { attachViewBaseline } from "../../domain/visual/viewChanges";
import { warning, type Diagnostic } from "../../domain/validation/diagnostics";
import {
  clearRedo,
  replaceLastHistoryEntryAfterRelayout,
} from "./documentHistory";
import {
  markDirty,
  mergeDiagnostics,
  type SaveLifecycleState,
} from "./documentSaveLifecycle";

interface RelayoutStoreState extends SaveLifecycleState {
  doc: CapabilityDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export async function runRelayout(args: {
  before: CapabilityDocument;
  after: CapabilityDocument;
  scope: RelayoutScope;
  force: boolean;
  viewId?: VisualViewId;
  label: string;
  get: () => RelayoutStoreState;
  set: (partial: Partial<RelayoutStoreState>) => void;
  baseline?: NonNullable<Transaction["meta"]>["baseline"];
}): Promise<void> {
  const { before, after, scope, force, viewId, get, set } = args;
  if (get().doc !== after) return;
  const resolvedBefore = resolveVisualDocument(before, viewId);
  const resolvedAfter = resolveVisualDocument(after, viewId);
  const ids = resolveScope(scope, resolvedBefore, resolvedAfter);
  if (ids?.length === 0) return;

  try {
    const rawResult = await layoutAndRepair(
      after,
      force,
      ids ?? undefined,
      viewId,
    );
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

    const state = get();
    set({
      doc: result.doc,
      past: replaceLastHistoryEntryAfterRelayout({
        past: state.past,
        fallbackLabel: args.label,
        fallbackBefore: before,
        fallbackAfter: result.doc,
        fallbackRelayout: { scope, force, viewId },
      }),
      future: clearRedo(),
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

export function resolveScope(
  scope: RelayoutScope,
  before: CapabilityDocument,
  after: CapabilityDocument,
): NodeId[] | null {
  if (scope === "document") return null;
  if (typeof scope === "function") return scope(before, after);
  return scope;
}

export async function layoutAndRepair(
  doc: CapabilityDocument,
  force: boolean,
  affectedNodeIds?: NodeId[],
  viewId?: VisualViewId,
  mode?: LayoutMode,
): Promise<{ doc: CapabilityDocument; diagnostics: Diagnostic[] }> {
  const resolved = resolveVisualDocument(doc, viewId);
  const result = await layoutDocument({
    doc: resolved,
    affectedNodeIds,
    force,
    mode: mode ?? resolved.settings.layoutMode,
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

export function ensureLayoutBounds(
  doc: CapabilityDocument,
): CapabilityDocument {
  const boundingBox = computeDocumentBounds(resolveVisualDocument(doc));
  const keepFrame =
    doc.layout.mode === "balanced" &&
    !doc.layout.isUserArranged &&
    sameBounds(doc.layout.boundingBox, boundingBox);
  if (
    sameBounds(doc.layout.boundingBox, boundingBox) &&
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
