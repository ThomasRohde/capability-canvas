import type {
  CapabilityDocument,
  VisualNodeState,
  VisualView,
  VisualViewId,
} from "../document/types";
import {
  BUILT_IN_VIEW_TEMPLATES,
  createViewFromTemplate,
  type VisualTemplateId,
} from "./templates";
import { cloneVisualWorkspace } from "./workspace";

export type ViewBaselineMode = "full" | "layout";

export interface ViewChangeSummary {
  fullChanged: boolean;
  layoutChanged: boolean;
  baseline: VisualView["baseline"];
  current: NonNullable<VisualView["baseline"]>;
}

export function viewChangeSummary(
  doc: CapabilityDocument,
  viewId: VisualViewId,
): ViewChangeSummary | null {
  const view = doc.visual.viewsById[viewId];
  if (!view) return null;
  const current = viewHashes(view);
  const baseline = view.baseline ?? derivedBaselineHashes(doc, view);
  return {
    fullChanged: current.fullHash !== baseline.fullHash,
    layoutChanged: current.layoutHash !== baseline.layoutHash,
    baseline,
    current,
  };
}

export function viewHasUserChanges(
  doc: CapabilityDocument,
  viewId: VisualViewId,
): boolean {
  return viewChangeSummary(doc, viewId)?.fullChanged ?? false;
}

export function viewHasLayoutChanges(
  doc: CapabilityDocument,
  viewId: VisualViewId,
): boolean {
  return viewChangeSummary(doc, viewId)?.layoutChanged ?? false;
}

export function attachViewBaseline(
  doc: CapabilityDocument,
  viewId: VisualViewId,
  mode: ViewBaselineMode,
): CapabilityDocument {
  const view = doc.visual.viewsById[viewId];
  if (!view) return doc;

  const current = viewHashes(view);
  const existing = view.baseline ?? derivedBaselineHashes(doc, view);
  const baseline =
    mode === "full"
      ? current
      : { fullHash: existing.fullHash, layoutHash: current.layoutHash };
  if (
    view.baseline?.fullHash === baseline.fullHash &&
    view.baseline.layoutHash === baseline.layoutHash
  ) {
    return doc;
  }

  const visual = cloneVisualWorkspace(doc.visual);
  visual.viewsById[viewId] = {
    ...visual.viewsById[viewId]!,
    baseline,
  };
  return { ...doc, visual };
}

export function viewHashes(
  view: VisualView,
): NonNullable<VisualView["baseline"]> {
  const layout = layoutComparable(view);
  return {
    layoutHash: stableStringify(layout),
    fullHash: stableStringify({
      ...layout,
      nodeStatesById: normalizeRecord(view.nodeStatesById),
      heatmap: normalizeRecord(view.heatmap),
      export: normalizeRecord(view.export),
    }),
  };
}

function derivedBaselineHashes(
  doc: CapabilityDocument,
  view: VisualView,
): NonNullable<VisualView["baseline"]> {
  return viewHashes(createBaselineView(doc, view));
}

function createBaselineView(
  doc: CapabilityDocument,
  view: VisualView,
): VisualView {
  const templateId = builtInTemplateId(view.templateId);
  return createViewFromTemplate(doc, {
    id: view.id,
    templateId,
    name: view.name,
    context: view.templateContext,
  });
}

function layoutComparable(view: VisualView) {
  return {
    layout: normalizeRecord({
      mode: view.layout.mode,
      isUserArranged: view.layout.isUserArranged,
      preservePositions: view.layout.preservePositions,
    }),
    nodeStatesById: normalizeRecord(
      Object.fromEntries(
        Object.entries(view.nodeStatesById).map(([nodeId, state]) => [
          nodeId,
          layoutNodeState(state),
        ]),
      ),
    ),
  };
}

function layoutNodeState(state: VisualNodeState): Partial<VisualNodeState> {
  return compact({
    x: state.x,
    y: state.y,
    w: state.w,
    h: state.h,
    lockedForView: state.lockedForView,
    isManualPositioningEnabled: state.isManualPositioningEnabled,
  });
}

function builtInTemplateId(value: unknown): VisualTemplateId {
  if (
    typeof value === "string" &&
    BUILT_IN_VIEW_TEMPLATES.some((template) => template.id === value)
  ) {
    return value as VisualTemplateId;
  }
  return "full-model-default@1";
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function normalizeRecord<T>(record: Record<string, T>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, normalizeValue(value)]),
  );
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!value || typeof value !== "object") return value;
  return normalizeRecord(compact(value as Record<string, unknown>));
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
