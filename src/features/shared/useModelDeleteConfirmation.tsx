import { useMemo, useState } from "react";
import { deleteNodes } from "../../domain/commands/operations";
import {
  subtreeNodeIds,
  type CapabilityDocument,
  type NodeId,
} from "../../domain/document/types";
import {
  SOURCE_LOCKED_SEMANTIC_EDIT_BLOCKED,
  SOURCE_LOCKED_SEMANTIC_EDIT_MESSAGE,
  isSourceModelEditable,
} from "../../domain/layout/canvasLayoutPolicy";
import { error } from "../../domain/validation/diagnostics";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useUiStore } from "../../app/stores/uiStore";
import { ConfirmDialog } from "./ConfirmDialog";

interface ModelDeleteSummary {
  selectedLabels: string[];
  nodeIdsToDelete: NodeId[];
  descendantCount: number;
  hasMetadata: boolean;
}

export function useModelDeleteConfirmation(doc: CapabilityDocument) {
  const execute = useDocumentStore((state) => state.execute);
  const setDiagnostics = useDocumentStore((state) => state.setDiagnostics);
  const setSelection = useUiStore((state) => state.setSelection);
  const showSelectionNotice = useUiStore((state) => state.showSelectionNotice);
  const [pendingNodeIds, setPendingNodeIds] = useState<NodeId[] | null>(null);
  const summary = useMemo(
    () => (pendingNodeIds ? summarizeModelDelete(doc, pendingNodeIds) : null),
    [doc, pendingNodeIds],
  );

  const requestDeleteFromModel = (nodeIds: NodeId[]) => {
    if (!isSourceModelEditable(doc)) {
      const message = doc.access?.reason || SOURCE_LOCKED_SEMANTIC_EDIT_MESSAGE;
      showSelectionNotice(message);
      setDiagnostics([
        error(SOURCE_LOCKED_SEMANTIC_EDIT_BLOCKED, message),
      ]);
      return;
    }
    const uniqueNodeIds = [...new Set(nodeIds)].filter((id) => doc.nodesById[id]);
    if (uniqueNodeIds.length === 0) return;
    setPendingNodeIds(uniqueNodeIds);
  };

  const deleteFromModelDialog =
    pendingNodeIds && summary ? (
      <ConfirmDialog
        title="Delete from model"
        body={deleteConfirmationBody(summary)}
        confirmLabel="Delete from model"
        tone="danger"
        onCancel={() => setPendingNodeIds(null)}
        onConfirm={() => {
          const diagnostics = execute(deleteNodes(pendingNodeIds));
          if (!diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
            const deleted = new Set(summary.nodeIdsToDelete);
            const selected = useUiStore.getState().selectedNodeIds;
            setSelection(selected.filter((nodeId) => !deleted.has(nodeId)));
          }
          setPendingNodeIds(null);
        }}
      />
    ) : null;

  return { requestDeleteFromModel, deleteFromModelDialog };
}

export function summarizeModelDelete(
  doc: CapabilityDocument,
  nodeIds: NodeId[],
): ModelDeleteSummary {
  const selectedLabels: string[] = [];
  const nodeIdsToDelete = new Set<NodeId>();
  let hasMetadata = false;

  for (const nodeId of [...new Set(nodeIds)]) {
    const node = doc.nodesById[nodeId];
    if (!node) continue;
    selectedLabels.push(node.label);
    for (const subtreeId of subtreeNodeIds(doc, nodeId)) {
      const subtreeNode = doc.nodesById[subtreeId];
      if (!subtreeNode) continue;
      nodeIdsToDelete.add(subtreeId);
      if (
        subtreeNode.description?.trim() ||
        Object.keys(subtreeNode.metadata).length > 0
      ) {
        hasMetadata = true;
      }
    }
  }

  return {
    selectedLabels,
    nodeIdsToDelete: [...nodeIdsToDelete],
    descendantCount: Math.max(0, nodeIdsToDelete.size - selectedLabels.length),
    hasMetadata,
  };
}

function deleteConfirmationBody(summary: ModelDeleteSummary): string {
  const selected =
    summary.selectedLabels.length === 1
      ? `"${summary.selectedLabels[0]}"`
      : `${summary.selectedLabels.length} selected capabilities`;
  const totalText =
    summary.nodeIdsToDelete.length === 1
      ? "1 capability"
      : `${summary.nodeIdsToDelete.length} capabilities`;
  const descendantText =
    summary.descendantCount === 0
      ? "No descendants will be removed."
      : summary.descendantCount === 1
        ? "This includes 1 descendant."
        : `This includes ${summary.descendantCount} descendants.`;
  const metadataText = summary.hasMetadata
    ? " Descriptions or metadata on deleted capabilities will also be removed."
    : "";

  return `Delete ${selected} from the source model? This removes ${totalText} from the hierarchy and from source-model exports. ${descendantText}${metadataText} This can be undone.`;
}
