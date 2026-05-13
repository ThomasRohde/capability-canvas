import { useCallback, useMemo, type ReactNode } from "react";
import {
  addChild,
  addRoot,
  duplicateNodes,
  moveNodes,
  removeNodesFromCanvas,
  updateActiveViewHeatmapSettings,
} from "../../domain/commands/operations";
import {
  isNodeOnCanvas,
  type Bounds,
  type CapabilityDocument,
  type NodeId,
} from "../../domain/document/types";
import { layoutDisplayBounds } from "../../domain/layout/displayBounds";
import { gridSizeFor } from "../../domain/layout/grid";
import { resolveSelectAllSelection } from "../../domain/selection/rules";
import { useActiveVisualState } from "../../app/activeVisualState";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useTransientStore } from "../../app/stores/transientStore";
import { useUiStore } from "../../app/stores/uiStore";
import { filterSelectionAfterViewRemoval } from "../canvas/selectors";
import { fitViewportToBounds } from "../canvas/viewport";
import { useModelDeleteConfirmation } from "../shared/useModelDeleteConfirmation";
import {
  createEditorCommandRegistry,
  type EditorCommandActions,
  type EditorCommandContext,
} from "./editorCommands";
import { dispatchEditorShortcut } from "./editorShortcuts";
import type { CommandDefinition } from "./types";

interface UseEditorActionsOptions {
  doc?: CapabilityDocument;
  viewDoc?: CapabilityDocument;
  displayBounds?: Bounds;
  importBusy?: boolean;
  onFitView?: () => void;
  onImportFile?: () => void;
  onImportPastedJson?: () => void;
}

interface UseEditorActionsResult {
  commands: CommandDefinition<EditorCommandContext>[];
  context: EditorCommandContext;
  actions: EditorCommandActions;
  selectedNodeIds: NodeId[];
  selectedCanvasNodeIds: NodeId[];
  visibleSelectableNodeIds: NodeId[];
  selectedNode: EditorCommandContext["selectedNode"];
  viewDoc: CapabilityDocument;
  displayBounds: Bounds;
  requestDeleteFromModel: (nodeIds: NodeId[]) => void;
  deleteFromModelDialog: ReactNode;
  dispatchShortcut: (
    event: KeyboardEvent,
    options?: Parameters<typeof dispatchEditorShortcut>[2],
  ) => boolean;
}

export function useEditorActions(
  options: UseEditorActionsOptions = {},
): UseEditorActionsResult {
  const {
    doc: providedDoc,
    viewDoc: providedViewDoc,
    displayBounds: providedDisplayBounds,
    importBusy = false,
    onFitView,
    onImportFile,
    onImportPastedJson,
  } = options;
  const storeDoc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const past = useDocumentStore((state) => state.past);
  const future = useDocumentStore((state) => state.future);
  const autoLayout = useDocumentStore((state) => state.autoLayout);
  const setActiveViewViewport = useDocumentStore(
    (state) => state.setActiveViewViewport,
  );
  const isAutoLayoutRunning = useDocumentStore(
    (state) => state.isAutoLayoutRunning,
  );
  const selectedNodeIds = useUiStore((state) => state.selectedNodeIds);
  const canvasSize = useUiStore((state) => state.canvasSize);
  const setViewport = useUiStore((state) => state.setViewport);
  const setSelection = useUiStore((state) => state.setSelection);
  const toggleOutline = useUiStore((state) => state.toggleOutline);
  const toggleInspector = useUiStore((state) => state.toggleInspector);
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const requestLabelEdit = useUiStore((state) => state.requestLabelEdit);
  const showSelectionNotice = useUiStore((state) => state.showSelectionNotice);
  const doc = providedDoc ?? storeDoc;
  const { visualDocument: activeVisualDocument } = useActiveVisualState({ doc });
  const viewDoc = providedViewDoc ?? activeVisualDocument;
  const displayBounds = useMemo(
    () => providedDisplayBounds ?? layoutDisplayBounds(viewDoc),
    [providedDisplayBounds, viewDoc],
  );
  const commands = useMemo(() => createEditorCommandRegistry(), []);
  const selectedNode = selectedNodeIds[0]
    ? doc.nodesById[selectedNodeIds[0]]
    : null;
  const selectedCanvasNodeIds = useMemo(
    () =>
      selectedNodeIds.filter((nodeId) =>
        isNodeOnCanvas(viewDoc.nodesById[nodeId]),
      ),
    [selectedNodeIds, viewDoc.nodesById],
  );
  const visibleSelectableNodeIds = useMemo(
    () =>
      Object.values(viewDoc.nodesById)
        .filter(
          (node) =>
            isNodeOnCanvas(node) && !node.isTextLabel && node.type !== "text",
        )
        .map((node) => node.id),
    [viewDoc.nodesById],
  );
  const { requestDeleteFromModel, deleteFromModelDialog } =
    useModelDeleteConfirmation(doc);

  const fitView = useCallback(() => {
    if (onFitView) {
      onFitView();
      return;
    }
    const nextViewport = fitViewportToBounds(displayBounds, canvasSize);
    if (!nextViewport) return;
    setViewport(nextViewport);
    setActiveViewViewport(nextViewport);
  }, [
    canvasSize,
    displayBounds,
    onFitView,
    setActiveViewViewport,
    setViewport,
  ]);

  const addSelectedChild = useCallback(() => {
    if (!selectedNode || selectedNode.isTextLabel || selectedNode.type === "text")
      return;
    execute(addChild(selectedNode.id));
  }, [execute, selectedNode]);

  const selectAllVisible = useCallback(() => {
    const resolution = resolveSelectAllSelection(
      viewDoc,
      visibleSelectableNodeIds,
      useUiStore.getState().selectedNodeIds,
    );
    setSelection(resolution.nodeIds);
    if (resolution.reason) showSelectionNotice(resolution.reason);
  }, [setSelection, showSelectionNotice, viewDoc, visibleSelectableNodeIds]);

  const moveSelectedByKeyboard = useCallback(
    (
      direction: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
      largeStep: boolean,
    ) => {
      const currentSelection = useUiStore.getState().selectedNodeIds;
      if (currentSelection.length === 0) return;
      const baseStep = viewDoc.settings.gridEnabled ? gridSizeFor(viewDoc) : 1;
      const step = largeStep ? baseStep * 4 : baseStep;
      const dx =
        direction === "ArrowLeft"
          ? -step
          : direction === "ArrowRight"
            ? step
            : 0;
      const dy =
        direction === "ArrowUp"
          ? -step
          : direction === "ArrowDown"
            ? step
            : 0;
      execute(moveNodes(currentSelection, dx, dy));
    },
    [execute, viewDoc],
  );

  const actions = useMemo<EditorCommandActions>(
    () => ({
      addRoot: () => execute(addRoot()),
      addChild: addSelectedChild,
      renameSelected: () => {
        const [nodeId] = useUiStore.getState().selectedNodeIds;
        if (!nodeId) return;
        requestLabelEdit(nodeId);
      },
      duplicateSelected: () => {
        const currentSelection = useUiStore.getState().selectedNodeIds;
        if (currentSelection.length === 0) return;
        execute(duplicateNodes(currentSelection));
      },
      fitView,
      autoLayout: () => {
        void autoLayout(true);
      },
      toggleOutline,
      toggleInspector,
      openViews: () => setActiveDrawer("views"),
      openSettings: () => setActiveDrawer("settings"),
      openExport: () => setActiveDrawer("export"),
      importFile: onImportFile ?? (() => {}),
      importPastedJson: onImportPastedJson ?? (() => {}),
      toggleHeatmap: () =>
        execute(
          updateActiveViewHeatmapSettings({
            enabled: !viewDoc.heatmap.enabled,
          }),
        ),
      selectAllVisible,
      removeFromActiveView: () => {
        const currentSelection = useUiStore.getState().selectedNodeIds;
        const currentCanvasSelection = currentSelection.filter((nodeId) =>
          isNodeOnCanvas(viewDoc.nodesById[nodeId]),
        );
        if (currentCanvasSelection.length === 0) return;
        const diagnostics = execute(removeNodesFromCanvas(currentCanvasSelection));
        if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
          return;
        setSelection(
          filterSelectionAfterViewRemoval(
            viewDoc,
            currentSelection,
            currentCanvasSelection,
          ),
        );
      },
      deleteFromModel: () =>
        requestDeleteFromModel(useUiStore.getState().selectedNodeIds),
      moveSelectedByKeyboard,
      cancelTransientPreview: () => useTransientStore.getState().cancel(),
      undo,
      redo,
    }),
    [
      addSelectedChild,
      autoLayout,
      execute,
      fitView,
      moveSelectedByKeyboard,
      onImportFile,
      onImportPastedJson,
      redo,
      requestDeleteFromModel,
      requestLabelEdit,
      selectAllVisible,
      setActiveDrawer,
      setSelection,
      toggleInspector,
      toggleOutline,
      undo,
      viewDoc,
    ],
  );

  const context = useMemo<EditorCommandContext>(
    () => ({
      selectedNodeIds,
      selectedCanvasNodeIds,
      visibleSelectableNodeIds,
      selectedNode,
      hasFitBounds: displayBounds.w > 0 && displayBounds.h > 0,
      importBusy,
      isAutoLayoutRunning,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      actions,
    }),
    [
      actions,
      displayBounds.h,
      displayBounds.w,
      future.length,
      importBusy,
      isAutoLayoutRunning,
      past.length,
      selectedCanvasNodeIds,
      selectedNode,
      selectedNodeIds,
      visibleSelectableNodeIds,
    ],
  );

  const dispatchShortcut = useCallback(
    (
      event: KeyboardEvent,
      dispatchOptions?: Parameters<typeof dispatchEditorShortcut>[2],
    ) =>
      dispatchEditorShortcut(event, context, {
        commands,
        ...dispatchOptions,
      }),
    [commands, context],
  );

  return {
    commands,
    context,
    actions,
    selectedNodeIds,
    selectedCanvasNodeIds,
    visibleSelectableNodeIds,
    selectedNode,
    viewDoc,
    displayBounds,
    requestDeleteFromModel,
    deleteFromModelDialog,
    dispatchShortcut,
  };
}
