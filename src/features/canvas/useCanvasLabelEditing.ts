import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { updateNode } from "../../domain/commands/operations";
import {
  isNodeOnCanvas,
  type CapabilityDocument,
  type NodeId,
} from "../../domain/document/types";
import { normalizeNodeLabel } from "../../domain/document/labels";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useTransientStore } from "../../app/stores/transientStore";
import { useUiStore } from "../../app/stores/uiStore";

export function useCanvasLabelEditing({
  doc,
  viewDoc,
  readonly,
  nodeRefs,
  closeContextMenu,
}: {
  doc: CapabilityDocument;
  viewDoc: CapabilityDocument;
  readonly: boolean;
  nodeRefs: RefObject<Map<NodeId, HTMLDivElement>>;
  closeContextMenu: () => void;
}) {
  const execute = useDocumentStore((state) => state.execute);
  const setSelection = useUiStore((state) => state.setSelection);
  const labelEditRequest = useUiStore((state) => state.labelEditRequest);
  const clearLabelEditRequest = useUiStore(
    (state) => state.clearLabelEditRequest,
  );
  const [editingNodeId, setEditingNodeId] = useState<NodeId | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const skipNextLabelCommitRef = useRef(false);

  const focusCanvasNode = useCallback(
    (nodeId: NodeId) => {
      window.requestAnimationFrame(() => {
        nodeRefs.current?.get(nodeId)?.focus();
      });
    },
    [nodeRefs],
  );

  const closeLabelEditor = useCallback(
    (returnFocusNodeId?: NodeId) => {
      setEditingNodeId(null);
      if (returnFocusNodeId) focusCanvasNode(returnFocusNodeId);
    },
    [focusCanvasNode],
  );

  const startLabelEdit = useCallback(
    (nodeId: NodeId) => {
      if (readonly) return;
      const sourceNode = doc.nodesById[nodeId];
      const viewNode = viewDoc.nodesById[nodeId];
      if (!sourceNode || !viewNode || !isNodeOnCanvas(viewNode)) return;
      useTransientStore.getState().cancel();
      closeContextMenu();
      setSelection([nodeId]);
      setEditingNodeId(nodeId);
      skipNextLabelCommitRef.current = false;
    },
    [
      closeContextMenu,
      doc.nodesById,
      readonly,
      setSelection,
      viewDoc.nodesById,
    ],
  );

  useEffect(() => {
    if (!labelEditRequest) return;
    clearLabelEditRequest();
    startLabelEdit(labelEditRequest.nodeId);
  }, [clearLabelEditRequest, labelEditRequest, startLabelEdit]);

  const commitLabelEdit = useCallback(
    (draft: string) => {
      if (skipNextLabelCommitRef.current) {
        skipNextLabelCommitRef.current = false;
        if (editingNodeId) closeLabelEditor(editingNodeId);
        else closeLabelEditor();
        return;
      }
      if (!editingNodeId) return;
      const node = doc.nodesById[editingNodeId];
      if (!node) {
        closeLabelEditor();
        return;
      }
      const normalizedDraft = normalizeNodeLabel(draft);
      if (normalizedDraft !== normalizeNodeLabel(node.label)) {
        execute(updateNode(editingNodeId, { label: normalizedDraft }));
      }
      closeLabelEditor(editingNodeId);
    },
    [closeLabelEditor, doc.nodesById, editingNodeId, execute],
  );

  const cancelLabelEdit = useCallback(() => {
    skipNextLabelCommitRef.current = true;
    if (editingNodeId) closeLabelEditor(editingNodeId);
    else closeLabelEditor();
  }, [closeLabelEditor, editingNodeId]);

  useEffect(() => {
    if (!editingNodeId) return;
    labelInputRef.current?.focus();
    labelInputRef.current?.select();
  }, [editingNodeId]);

  useEffect(() => {
    if (!editingNodeId) return;
    const viewNode = viewDoc.nodesById[editingNodeId];
    if (!doc.nodesById[editingNodeId] || !viewNode || !isNodeOnCanvas(viewNode))
      closeLabelEditor();
  }, [closeLabelEditor, doc.nodesById, editingNodeId, viewDoc.nodesById]);

  return {
    editingNodeId,
    labelInputRef,
    startLabelEdit,
    commitLabelEdit,
    cancelLabelEdit,
  };
}
