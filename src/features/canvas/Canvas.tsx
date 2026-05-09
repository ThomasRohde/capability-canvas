import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addChild,
  duplicateNodes,
  fitParentToChildren,
  moveNodes,
  removeNodesFromCanvas,
  updateVisualNodeState,
} from "../../domain/commands/operations";
import {
  hasCanvasChildren,
  isNodeOnCanvas,
  type CapabilityDocument,
  type NodeId,
} from "../../domain/document/types";
import { layoutDisplayBounds } from "../../domain/layout/displayBounds";
import { gridSizeFor } from "../../domain/layout/grid";
import {
  activeVisualView,
  resolveVisualDocument,
} from "../../domain/visual/workspace";
import { resolveSelectAllSelection } from "../../domain/selection/rules";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useTransientStore } from "../../app/stores/transientStore";
import { type ViewportState, useUiStore } from "../../app/stores/uiStore";
import { resolveNodeFill } from "../heatmap/resolveNodeFill";
import { useMenuKeyboardNavigation } from "../shared/a11y";
import { useModelDeleteConfirmation } from "../shared/useModelDeleteConfirmation";
import { BulkToolbar } from "./BulkToolbar";
import {
  CanvasContextMenu,
  type CanvasContextMenuState,
} from "./CanvasContextMenu";
import { CanvasNode } from "./CanvasNode";
import { isCanvasBackgroundTarget } from "./canvasGeometry";
import { ContainerFrame } from "./ContainerFrame";
import { HeatmapLegend } from "./HeatmapLegend";
import { Minimap } from "./Minimap";
import { createNodeViewModels } from "./selectors";
import { useCanvasLabelEditing } from "./useCanvasLabelEditing";
import { useCanvasMarquee } from "./useCanvasMarquee";
import { useCanvasNodeInteractions } from "./useCanvasNodeInteractions";
import { useCanvasViewport } from "./useCanvasViewport";

interface CanvasProps {
  readonly?: boolean;
  displayDoc?: CapabilityDocument;
  onViewportChange?: (viewport: ViewportState) => void;
}

export function Canvas({
  readonly = false,
  displayDoc,
  onViewportChange,
}: CanvasProps) {
  const storeDoc = useDocumentStore((state) => state.doc);
  const doc = displayDoc ?? storeDoc;
  const execute = useDocumentStore((state) => state.execute);
  const viewDoc = useMemo(() => resolveVisualDocument(doc), [doc]);
  const displayBounds = useMemo(() => layoutDisplayBounds(viewDoc), [viewDoc]);
  const activeView = useMemo(() => activeVisualView(doc), [doc]);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setSelection = useUiStore((state) => state.setSelection);
  const clearSelection = useUiStore((state) => state.clearSelection);
  const setInspectorOpen = useUiStore((state) => state.setInspectorOpen);
  const setInspectorTab = useUiStore((state) => state.setInspectorTab);
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const showSelectionNotice = useUiStore((state) => state.showSelectionNotice);
  const drag = useTransientStore((state) => state.drag);
  const resize = useTransientStore((state) => state.resize);
  const reparentTargetId = useTransientStore((state) => state.reparentTargetId);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<NodeId, HTMLDivElement>());
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuTriggerRef = useRef<HTMLElement | null>(null);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(
    null,
  );
  const { requestDeleteFromModel, deleteFromModelDialog } =
    useModelDeleteConfirmation(doc);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const {
    viewport,
    docViewport,
    fitView,
    zoomBy,
    centerOnDocumentPoint,
    startPan,
  } = useCanvasViewport({
    canvasRef,
    displayBounds,
    readonly,
    onViewportChange,
  });
  const {
    editingNodeId,
    labelInputRef,
    startLabelEdit,
    commitLabelEdit,
    cancelLabelEdit,
  } = useCanvasLabelEditing({
    doc,
    viewDoc,
    readonly,
    nodeRefs,
    closeContextMenu,
  });
  const { selectionRect, marqueePreviewCount, startMarquee } = useCanvasMarquee(
    {
      canvasRef,
      viewDoc,
      viewport,
      showSelectionNotice,
    },
  );
  const { handleNodePointerDown, handleResizePointerDown } =
    useCanvasNodeInteractions({
      canvasRef,
      viewDoc,
      viewport,
      selected,
      readonly,
      closeContextMenu,
    });
  const viewModels = useMemo(
    () => createNodeViewModels(viewDoc, docViewport),
    [docViewport, viewDoc],
  );
  const visibleViewModels = useMemo(
    () =>
      viewModels.filter((vm) => vm.visible || selected.includes(vm.node.id)),
    [selected, viewModels],
  );
  const canvasSelected = useMemo(
    () => selected.filter((id) => isNodeOnCanvas(viewDoc.nodesById[id])),
    [selected, viewDoc.nodesById],
  );
  const contextNode = contextMenu
    ? viewDoc.nodesById[contextMenu.nodeId]
    : null;
  const contextViewState = contextMenu
    ? doc.visual.viewsById[doc.visual.activeViewId]?.nodeStatesById[
        contextMenu.nodeId
      ]
    : undefined;
  const contextHasSourceChildren = contextMenu
    ? (doc.childrenByParentId[contextMenu.nodeId]?.length ?? 0) > 0
    : false;
  const contextHasCanvasChildren = contextMenu
    ? hasCanvasChildren(viewDoc, contextMenu.nodeId)
    : false;

  const handleNodeRef = useCallback(
    (nodeId: NodeId, element: HTMLDivElement | null) => {
      if (element) nodeRefs.current.set(nodeId, element);
      else nodeRefs.current.delete(nodeId);
    },
    [],
  );

  const inspectNode = useCallback(
    (nodeId: NodeId) => {
      setSelection([nodeId]);
      setInspectorOpen(true);
      setInspectorTab("inspector");
      setActiveDrawer(null);
      closeContextMenu();
    },
    [
      closeContextMenu,
      setActiveDrawer,
      setInspectorOpen,
      setInspectorTab,
      setSelection,
    ],
  );

  const openNodeContextMenu = useCallback(
    (
      nodeId: NodeId,
      trigger: HTMLElement,
      clientPoint?: { x: number; y: number },
    ) => {
      if (readonly) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      contextMenuTriggerRef.current = trigger;
      setSelection([nodeId]);
      setActiveDrawer(null);
      setContextMenu({
        nodeId,
        x:
          (clientPoint?.x ??
            triggerRect.left + Math.min(24, triggerRect.width / 2)) -
          (rect?.left ?? 0),
        y:
          (clientPoint?.y ??
            triggerRect.top + Math.min(24, triggerRect.height / 2)) -
          (rect?.top ?? 0),
      });
    },
    [readonly, setActiveDrawer, setSelection],
  );

  const { handleMenuKeyDown: handleContextMenuKeyDown } =
    useMenuKeyboardNavigation({
      open: !!contextMenu,
      menuRef: contextMenuRef,
      triggerRef: contextMenuTriggerRef,
      onClose: closeContextMenu,
    });

  const handleNodeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, nodeId: NodeId) => {
      if (event.key === " " && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setSelection([nodeId]);
        return;
      }
      if (
        event.key === "Enter" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        if (readonly) inspectNode(nodeId);
        else startLabelEdit(nodeId);
        return;
      }
      if (
        event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10")
      ) {
        event.preventDefault();
        openNodeContextMenu(nodeId, event.currentTarget);
      }
    },
    [inspectNode, openNodeContextMenu, readonly, setSelection, startLabelEdit],
  );

  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, nodeId: NodeId) => {
      event.preventDefault();
      event.stopPropagation();
      openNodeContextMenu(nodeId, event.currentTarget, {
        x: event.clientX,
        y: event.clientY,
      });
    },
    [openNodeContextMenu],
  );

  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = () => closeContextMenu();
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closeContextMenu, contextMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (readonly) return;
      if (editingNodeId) return;
      if (isEditableTarget(event.target)) {
        if (event.key === "Escape") (event.target as HTMLElement).blur();
        return;
      }
      if (
        event.key === "Enter" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        selected.length === 1 &&
        canvasSelected.length === 1 &&
        !isInteractiveTarget(event.target)
      ) {
        event.preventDefault();
        startLabelEdit(selected[0]!);
        return;
      }
      if (event.key === "Delete" && event.shiftKey && selected.length > 0) {
        event.preventDefault();
        requestDeleteFromModel(selected);
        return;
      }
      if (event.key === "Delete" && canvasSelected.length > 0) {
        event.preventDefault();
        execute(removeNodesFromCanvas(canvasSelected));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) useDocumentStore.getState().redo();
        else useDocumentStore.getState().undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        useDocumentStore.getState().redo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const ids = Object.values(viewDoc.nodesById)
          .filter(
            (node) =>
              isNodeOnCanvas(node) && !node.isTextLabel && node.type !== "text",
          )
          .map((node) => node.id);
        const resolution = resolveSelectAllSelection(viewDoc, ids, selected);
        useUiStore.getState().setSelection(resolution.nodeIds);
        if (resolution.reason) showSelectionNotice(resolution.reason);
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "d" &&
        selected.length > 0
      ) {
        event.preventDefault();
        execute(duplicateNodes(selected));
      }
      if (event.key === "Escape") useTransientStore.getState().cancel();
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          event.key,
        ) &&
        selected.length > 0
      ) {
        event.preventDefault();
        const baseStep = viewDoc.settings.gridEnabled
          ? gridSizeFor(viewDoc)
          : 1;
        const step = event.shiftKey ? baseStep * 4 : baseStep;
        const dx =
          event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0;
        const dy =
          event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown"
              ? step
              : 0;
        execute(moveNodes(selected, dx, dy));
      }
      if (event.key.toLowerCase() === "f") fitView();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canvasSelected,
    editingNodeId,
    execute,
    fitView,
    readonly,
    requestDeleteFromModel,
    selected,
    showSelectionNotice,
    startLabelEdit,
    viewDoc,
  ]);

  return (
    <main
      ref={canvasRef}
      className={`cc-canvas ${viewDoc.settings.gridEnabled ? "" : "no-grid"} ${
        canvasSelected.length === 0
          ? "selection-empty"
          : canvasSelected.length === 1
            ? "selection-single"
            : "selection-multi"
      }`}
      data-testid="canvas"
      role="region"
      aria-label="Capability canvas"
      tabIndex={0}
      style={
        {
          "--cc-grid-size": `${Math.max(4, viewDoc.settings.gridSize * viewport.zoom)}px`,
          "--cc-grid-dot-color": viewDoc.settings.gridEnabled
            ? "rgba(15, 23, 42, 0.09)"
            : "transparent",
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        } as CSSProperties
      }
      onPointerDown={(event) => {
        closeContextMenu();
        if (!isCanvasBackgroundTarget(event.target, event.currentTarget))
          return;
        const isMiddleMouse = event.button === 1;
        const wantsMarquee =
          !isMiddleMouse && (event.shiftKey || event.ctrlKey || event.metaKey);
        if (!readonly && wantsMarquee) {
          startMarquee(event);
          return;
        }
        startPan(event, clearSelection);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <div
        className="cc-canvas-stage"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        {visibleViewModels.map((vm) => (
          <CanvasNode
            key={vm.node.id}
            viewModel={vm}
            viewDoc={viewDoc}
            selected={selected}
            readonly={readonly}
            viewportZoom={viewport.zoom}
            drag={drag}
            resize={resize}
            reparentTargetId={reparentTargetId}
            isEditing={editingNodeId === vm.node.id}
            labelInputRef={labelInputRef}
            onCommitLabel={commitLabelEdit}
            onCancelLabel={cancelLabelEdit}
            onStartLabelEdit={startLabelEdit}
            onNodeRef={handleNodeRef}
            onNodeKeyDown={handleNodeKeyDown}
            onNodePointerDown={handleNodePointerDown}
            onNodeContextMenu={handleNodeContextMenu}
            onResizePointerDown={handleResizePointerDown}
          />
        ))}
        {visibleViewModels
          .filter((vm) => vm.node.type !== "leaf" && !vm.node.isTextLabel)
          .map((vm) => (
            <ContainerFrame
              key={`${vm.node.id}-frame`}
              viewModel={vm}
              viewDoc={viewDoc}
              selected={selected}
              viewportZoom={viewport.zoom}
              drag={drag}
              resize={resize}
              reparentTargetId={reparentTargetId}
            />
          ))}
      </div>
      {contextMenu && contextNode && !readonly && (
        <CanvasContextMenu
          menu={contextMenu}
          menuRef={contextMenuRef}
          node={contextNode}
          hasCanvasChildren={contextHasCanvasChildren}
          hasSourceChildren={contextHasSourceChildren}
          isCollapsed={!!contextViewState?.isCollapsed}
          onKeyDown={handleContextMenuKeyDown}
          onInspect={inspectNode}
          onAddChild={(nodeId) => {
            execute(addChild(nodeId));
            closeContextMenu();
          }}
          onDuplicate={(nodeId) => {
            execute(duplicateNodes([nodeId]));
            closeContextMenu();
          }}
          onFitParent={(nodeId) => {
            execute(fitParentToChildren(nodeId));
            closeContextMenu();
          }}
          onToggleCollapse={(nodeId) => {
            execute(
              updateVisualNodeState(doc.visual.activeViewId, nodeId, {
                isCollapsed: !contextViewState?.isCollapsed,
              }),
            );
            closeContextMenu();
          }}
          onRemoveFromView={(nodeId) => {
            execute(removeNodesFromCanvas([nodeId]));
            closeContextMenu();
          }}
          onDeleteFromModel={(nodeId) => {
            requestDeleteFromModel([nodeId]);
            closeContextMenu();
          }}
        />
      )}
      {selectionRect && (
        <>
          <div
            className="cc-marquee"
            style={{
              left: selectionRect.x * viewport.zoom + viewport.x,
              top: selectionRect.y * viewport.zoom + viewport.y,
              width: selectionRect.w * viewport.zoom,
              height: selectionRect.h * viewport.zoom,
            }}
          />
          <div
            className="cc-marquee-count"
            role="status"
            aria-live="polite"
            style={{
              left: selectionRect.x * viewport.zoom + viewport.x,
              top:
                (selectionRect.y + selectionRect.h) * viewport.zoom +
                viewport.y +
                6,
            }}
          >
            {marqueePreviewCount} selected
          </div>
        </>
      )}
      {canvasSelected.length > 1 && !readonly && (
        <BulkToolbar selected={canvasSelected} />
      )}
      {viewDoc.heatmap.enabled && viewDoc.heatmap.showLegend && (
        <HeatmapLegend
          palette={viewDoc.heatmap.palette}
          position={activeView.heatmap.legendPosition}
        />
      )}
      <Minimap
        bounds={displayBounds}
        viewport={docViewport}
        nodes={viewModels.map((vm) => ({
          ...vm.bounds,
          fill: resolveNodeFill(vm.node, viewDoc.heatmap),
        }))}
        onFit={fitView}
        onZoomIn={() => zoomBy(0.1)}
        onZoomOut={() => zoomBy(-0.1)}
        onCenter={centerOnDocumentPoint}
      />
      {deleteFromModelDialog}
    </main>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target === document.body) return false;
  return !!target.closest(
    'button, a, input, textarea, select, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="dialog"]',
  );
}
