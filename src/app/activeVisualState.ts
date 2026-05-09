import { useMemo } from "react";
import {
  isNodeOnCanvas,
  type CapabilityDocument,
  type NodeId,
  type VisualView,
  type VisualViewId,
} from "../domain/document/types";
import {
  activeVisualView,
  resolveVisualDocument,
} from "../domain/visual/workspace";
import type { Diagnostic } from "../domain/validation/diagnostics";
import { useDocumentStore } from "./stores/documentStore";
import { useUiStore } from "./stores/uiStore";

const HIDDEN_SELECTION_NOTICE =
  "Selection adjusted because selected capabilities are hidden in this view.";

export interface ActiveVisualState {
  sourceDocument: CapabilityDocument;
  visualDocument: CapabilityDocument;
  activeView: VisualView;
  activeViewId: VisualViewId;
}

export function resolveActiveVisualState(
  sourceDocument: CapabilityDocument,
  viewId: VisualViewId = sourceDocument.visual.activeViewId,
): ActiveVisualState {
  const activeView =
    sourceDocument.visual.viewsById[viewId] ??
    activeVisualView(sourceDocument);
  return {
    sourceDocument,
    visualDocument: resolveVisualDocument(sourceDocument, activeView.id),
    activeView,
    activeViewId: activeView.id,
  };
}

export function useActiveVisualState({
  doc,
  viewId,
}: {
  doc?: CapabilityDocument;
  viewId?: VisualViewId;
} = {}): ActiveVisualState {
  const storeDoc = useDocumentStore((state) => state.doc);
  const sourceDocument = doc ?? storeDoc;
  return useMemo(
    () => resolveActiveVisualState(sourceDocument, viewId),
    [sourceDocument, viewId],
  );
}

export function filterSelectionToVisibleNodes(
  visualDocument: CapabilityDocument,
  selectedNodeIds: NodeId[],
): NodeId[] {
  return selectedNodeIds.filter((nodeId) => {
    const node = visualDocument.nodesById[nodeId];
    return !!node && isNodeOnCanvas(node);
  });
}

export function syncUiForVisualView(
  doc: CapabilityDocument,
  viewId: VisualViewId = doc.visual.activeViewId,
): void {
  const view = doc.visual.viewsById[viewId];
  if (!view) return;
  const ui = useUiStore.getState();
  if (view.viewport) ui.setViewport(view.viewport);

  const nextSelection = filterSelectionToVisibleNodes(
    resolveVisualDocument(doc, viewId),
    ui.selectedNodeIds,
  );
  if (nextSelection.length !== ui.selectedNodeIds.length) {
    ui.setSelection(nextSelection);
    ui.showSelectionNotice(HIDDEN_SELECTION_NOTICE);
  }
}

export function switchActiveVisualView(viewId: VisualViewId): Diagnostic[] {
  const previousViewport = useUiStore.getState().viewport;
  const diagnostics = useDocumentStore
    .getState()
    .setActiveVisualView(viewId, { previousViewport });
  const nextDoc = useDocumentStore.getState().doc;
  if (nextDoc.visual.viewsById[viewId]) {
    syncUiForVisualView(nextDoc, viewId);
  }
  return diagnostics;
}
