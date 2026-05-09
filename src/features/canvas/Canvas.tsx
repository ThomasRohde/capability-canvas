import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceBetween,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceBetween,
  Copy,
  EyeOff,
  Maximize,
  Minus,
  MoreHorizontal,
  Palette,
  Plus,
  Scaling,
  StretchHorizontal,
  StretchVertical,
  Trash2,
} from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addChild,
  alignNodes,
  distributeNodes,
  duplicateNodes,
  fitParentToChildren,
  moveNodes,
  removeNodesFromCanvas,
  repairSiblingOverlaps,
  reparentNode,
  resizeNode,
  sameSize,
  transaction,
  updateNode,
  updateNodeColors,
  updateVisualNodeState,
} from "../../domain/commands/operations";
import {
  hasCanvasChildren,
  isNodeOnCanvas,
  type Bounds,
  type CapabilityColor,
  type CapabilityDocument,
  type LegendPosition,
  type NodeId,
} from "../../domain/document/types";
import { normalizeNodeLabel } from "../../domain/document/labels";
import { gridSizeFor, snapToGrid } from "../../domain/layout/grid";
import {
  activeVisualView,
  resolveVisualDocument,
} from "../../domain/visual/workspace";
import {
  findDropTarget,
  isAcceptableDropTarget,
} from "../../domain/selection/dropTarget";
import {
  canAlign,
  canDistribute,
  canMultiSelect,
  resolveSelectAllSelection,
  resolveSiblingSelection,
  resolveToggleSelection,
} from "../../domain/selection/rules";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useTransientStore } from "../../app/stores/transientStore";
import { type ViewportState, useUiStore } from "../../app/stores/uiStore";
import {
  CAPABILITY_COLORS,
  CATEGORY_STYLES,
  heatmapGradient,
  resolveNodeFill,
} from "../heatmap/resolveNodeFill";
import { IconButton } from "../shared/IconButton";
import { useModelDeleteConfirmation } from "../shared/useModelDeleteConfirmation";
import {
  createNodeViewModels,
  descendantIds,
  viewportToDocumentBounds,
} from "./selectors";
import { fitViewportToBounds } from "./viewport";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const MIN_NODE_WIDTH = 40;
const MIN_NODE_HEIGHT = 32;

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
  const setActiveViewViewport = useDocumentStore(
    (state) => state.setActiveViewViewport,
  );
  const viewDoc = useMemo(() => resolveVisualDocument(doc), [doc]);
  const activeView = useMemo(() => activeVisualView(doc), [doc]);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setSelection = useUiStore((state) => state.setSelection);
  const clearSelection = useUiStore((state) => state.clearSelection);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const setCanvasSize = useUiStore((state) => state.setCanvasSize);
  const labelEditRequest = useUiStore((state) => state.labelEditRequest);
  const clearLabelEditRequest = useUiStore(
    (state) => state.clearLabelEditRequest,
  );
  const setInspectorOpen = useUiStore((state) => state.setInspectorOpen);
  const setInspectorTab = useUiStore((state) => state.setInspectorTab);
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const showSelectionNotice = useUiStore(
    (state) => state.showSelectionNotice,
  );
  const drag = useTransientStore((state) => state.drag);
  const resize = useTransientStore((state) => state.resize);
  const reparentTargetId = useTransientStore((state) => state.reparentTargetId);
  const selectionRect = useTransientStore((state) => state.selectionRect);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [contextMenu, setContextMenu] = useState<{
    nodeId: NodeId;
    x: number;
    y: number;
  } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<NodeId | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const labelInputRef = useRef<HTMLInputElement>(null);
  const skipNextLabelCommitRef = useRef(false);
  const docViewport = useMemo(
    () => viewportToDocumentBounds(viewport, size),
    [viewport, size],
  );
  const viewModels = useMemo(
    () => createNodeViewModels(viewDoc, docViewport),
    [docViewport, viewDoc],
  );
  const visibleViewModels = useMemo(
    () => viewModels.filter((vm) => vm.visible || selected.includes(vm.node.id)),
    [selected, viewModels],
  );
  const canvasSelected = useMemo(
    () => selected.filter((id) => isNodeOnCanvas(viewDoc.nodesById[id])),
    [selected, viewDoc.nodesById],
  );
  const marqueePreviewCount = useMemo(() => {
    if (!selectionRect) return 0;
    const ids = Object.values(viewDoc.nodesById)
      .filter(
        (node) =>
          isNodeOnCanvas(node) &&
          !node.isTextLabel &&
          node.type !== "text" &&
          intersects(node, selectionRect),
      )
      .map((node) => node.id);
    return resolveSiblingSelection(viewDoc, ids).nodeIds.length;
  }, [selectionRect, viewDoc]);
  const contextNode = contextMenu ? viewDoc.nodesById[contextMenu.nodeId] : null;
  const contextViewState = contextMenu
    ? doc.visual.viewsById[doc.visual.activeViewId]?.nodeStatesById[
        contextMenu.nodeId
      ]
    : undefined;
  const contextHasSourceChildren = contextMenu
    ? (doc.childrenByParentId[contextMenu.nodeId]?.length ?? 0) > 0
    : false;
  const { requestDeleteFromModel, deleteFromModelDialog } =
    useModelDeleteConfirmation(doc);

  const closeLabelEditor = useCallback(() => {
    setEditingNodeId(null);
    setLabelDraft("");
  }, []);

  const startLabelEdit = useCallback(
    (nodeId: NodeId) => {
      if (readonly) return;
      const sourceNode = doc.nodesById[nodeId];
      const viewNode = viewDoc.nodesById[nodeId];
      if (!sourceNode || !viewNode || !isNodeOnCanvas(viewNode)) return;
      useTransientStore.getState().cancel();
      setContextMenu(null);
      setSelection([nodeId]);
      setEditingNodeId(nodeId);
      setLabelDraft(sourceNode.label);
      skipNextLabelCommitRef.current = false;
    },
    [doc.nodesById, readonly, setSelection, viewDoc.nodesById],
  );

  useEffect(() => {
    if (!labelEditRequest) return;
    clearLabelEditRequest();
    startLabelEdit(labelEditRequest.nodeId);
  }, [clearLabelEditRequest, labelEditRequest, startLabelEdit]);

  const commitLabelEdit = useCallback(() => {
    if (skipNextLabelCommitRef.current) {
      skipNextLabelCommitRef.current = false;
      closeLabelEditor();
      return;
    }
    if (!editingNodeId) return;
    const node = doc.nodesById[editingNodeId];
    if (!node) {
      closeLabelEditor();
      return;
    }
    const normalizedDraft = normalizeNodeLabel(labelDraft);
    if (normalizedDraft !== normalizeNodeLabel(node.label)) {
      execute(updateNode(editingNodeId, { label: normalizedDraft }));
    }
    closeLabelEditor();
  }, [closeLabelEditor, doc.nodesById, editingNodeId, execute, labelDraft]);

  const cancelLabelEdit = useCallback(() => {
    skipNextLabelCommitRef.current = true;
    closeLabelEditor();
  }, [closeLabelEditor]);

  const commitViewport = useCallback(
    (nextViewport: ViewportState) => {
      if (onViewportChange) {
        onViewportChange(nextViewport);
        return;
      }
      if (!readonly) setActiveViewViewport(nextViewport);
    },
    [onViewportChange, readonly, setActiveViewViewport],
  );

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const nextSize = {
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        };
        setSize(nextSize);
        setCanvasSize(nextSize);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [setCanvasSize]);

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

  useEffect(() => {
    if (!contextMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    const onPointerDown = () => setContextMenu(null);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [contextMenu]);

  const nodeIdsWithDescendants = (nodeIds: NodeId[]) => {
    const expanded = new Set<NodeId>();
    for (const nodeId of nodeIds) {
      if (!viewDoc.nodesById[nodeId]) continue;
      expanded.add(nodeId);
      for (const descendantId of descendantIds(viewDoc, nodeId))
        expanded.add(descendantId);
    }
    return [...expanded];
  };

  const snapDragDelta = (
    nodeIds: NodeId[],
    screenDx: number,
    screenDy: number,
  ) => {
    if (!viewDoc.settings.gridEnabled || nodeIds.length === 0)
      return { dx: screenDx, dy: screenDy };
    const anchor = viewDoc.nodesById[nodeIds[0]!];
    if (!anchor) return { dx: screenDx, dy: screenDy };
    const gridSize = gridSizeFor(viewDoc);
    const rawDocDx = screenDx / viewport.zoom;
    const rawDocDy = screenDy / viewport.zoom;
    const snappedDocDx = snapToGrid(anchor.x + rawDocDx, gridSize) - anchor.x;
    const snappedDocDy = snapToGrid(anchor.y + rawDocDy, gridSize) - anchor.y;
    return {
      dx: snappedDocDx * viewport.zoom,
      dy: snappedDocDy * viewport.zoom,
    };
  };

  const snapResizeDelta = (
    nodeId: NodeId,
    startW: number,
    startH: number,
    screenDx: number,
    screenDy: number,
  ) => {
    if (!viewDoc.settings.gridEnabled || !viewDoc.settings.resizeSnapToGrid)
      return { dx: screenDx, dy: screenDy };
    const node = viewDoc.nodesById[nodeId];
    if (!node) return { dx: screenDx, dy: screenDy };
    const gridSize = gridSizeFor(viewDoc);
    const rawW = startW + screenDx / viewport.zoom;
    const rawH = startH + screenDy / viewport.zoom;
    const snappedW = Math.max(1, snapToGrid(node.x + rawW, gridSize) - node.x);
    const snappedH = Math.max(1, snapToGrid(node.y + rawH, gridSize) - node.y);
    return {
      dx: (snappedW - startW) * viewport.zoom,
      dy: (snappedH - startH) * viewport.zoom,
    };
  };

  const inspectNode = (nodeId: NodeId) => {
    setSelection([nodeId]);
    setInspectorOpen(true);
    setInspectorTab("inspector");
    setActiveDrawer(null);
    setContextMenu(null);
  };

  const fitView = useCallback(() => {
    const nextViewport = fitViewportToBounds(
      viewDoc.layout.boundingBox,
      { w: size.w, h: size.h },
      {
        minZoom: MIN_ZOOM,
        maxZoom: 1.5,
        padding: 40,
      },
    );
    if (!nextViewport) return;
    setViewport(nextViewport);
    commitViewport(nextViewport);
  }, [commitViewport, setViewport, size.h, size.w, viewDoc.layout.boundingBox]);

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
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        const ids = Object.values(viewDoc.nodesById)
          .filter(
            (node) =>
              isNodeOnCanvas(node) &&
              !node.isTextLabel &&
              node.type !== "text",
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
        const baseStep = viewDoc.settings.gridEnabled ? gridSizeFor(viewDoc) : 1;
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

  const zoomAround = useCallback(
    (delta: number, anchorX: number, anchorY: number) => {
      const nextZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, viewport.zoom + delta),
      );
      if (nextZoom === viewport.zoom) return;
      const docAnchorX = (anchorX - viewport.x) / viewport.zoom;
      const docAnchorY = (anchorY - viewport.y) / viewport.zoom;
      const nextViewport = {
        zoom: nextZoom,
        x: anchorX - docAnchorX * nextZoom,
        y: anchorY - docAnchorY * nextZoom,
      };
      setViewport(nextViewport);
      commitViewport(nextViewport);
    },
    [commitViewport, setViewport, viewport],
  );

  const zoomBy = (delta: number) => {
    zoomAround(delta, size.w / 2, size.h / 2);
  };

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      const rect = element.getBoundingClientRect();
      zoomAround(delta, event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomAround]);

  const centerOnDocumentPoint = (x: number, y: number) => {
    const nextViewport = {
      ...viewport,
      x: size.w / 2 - x * viewport.zoom,
      y: size.h / 2 - y * viewport.zoom,
    };
    setViewport(nextViewport);
    commitViewport(nextViewport);
  };

  const startMarquee = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startDocX = (startClientX - rect.left - viewport.x) / viewport.zoom;
    const startDocY = (startClientY - rect.top - viewport.y) / viewport.zoom;
    const additive = event.shiftKey;
    const baseSelection = additive
      ? new Set(useUiStore.getState().selectedNodeIds)
      : new Set<NodeId>();

    const onMove = (move: PointerEvent) => {
      const docX = (move.clientX - rect.left - viewport.x) / viewport.zoom;
      const docY = (move.clientY - rect.top - viewport.y) / viewport.zoom;
      useTransientStore.getState().setSelectionRect({
        x: Math.min(startDocX, docX),
        y: Math.min(startDocY, docY),
        w: Math.abs(docX - startDocX),
        h: Math.abs(docY - startDocY),
      });
    };

    const onUp = () => {
      const rectBounds = useTransientStore.getState().selectionRect;
      useTransientStore.getState().setSelectionRect(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!rectBounds || rectBounds.w < 4 || rectBounds.h < 4) return;
      const candidate = new Set(baseSelection);
      for (const node of Object.values(viewDoc.nodesById)) {
        if (!isNodeOnCanvas(node)) continue;
        if (node.isTextLabel || node.type === "text") continue;
        if (intersects(node, rectBounds)) candidate.add(node.id);
      }
      const ids = [...candidate];
      if (ids.length === 0) {
        if (!additive) useUiStore.getState().clearSelection();
        return;
      }
      const resolution = resolveSiblingSelection(viewDoc, ids);
      useUiStore.getState().setSelection(resolution.nodeIds);
      if (resolution.reason) showSelectionNotice(resolution.reason);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

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
      style={
        {
          "--cc-grid-size": `${Math.max(4, viewDoc.settings.gridSize * viewport.zoom)}px`,
          "--cc-grid-dot-color": viewDoc.settings.gridEnabled
            ? "rgba(15, 23, 42, 0.09)"
            : "transparent",
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        } as React.CSSProperties
      }
      onPointerDown={(event) => {
        setContextMenu(null);
        if (!isCanvasBackgroundTarget(event.target, event.currentTarget))
          return;
        const isMiddleMouse = event.button === 1;
        const wantsMarquee =
          !isMiddleMouse && (event.shiftKey || event.ctrlKey || event.metaKey);
        if (!readonly && wantsMarquee) {
          startMarquee(event);
          return;
        }
        const startX = event.clientX;
        const startY = event.clientY;
        const startViewport = viewport;
        let didMove = false;
        const onMove = (move: PointerEvent) => {
          if (
            Math.abs(move.clientX - startX) > 2 ||
            Math.abs(move.clientY - startY) > 2
          ) {
            didMove = true;
          }
          setViewport({
            ...startViewport,
            x: startViewport.x + move.clientX - startX,
            y: startViewport.y + move.clientY - startY,
          });
        };
        const onUp = () => {
          if (!didMove && event.button === 0) clearSelection();
          else commitViewport(useUiStore.getState().viewport);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
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
        {visibleViewModels.map((vm) => {
            const selectedState = selected.includes(vm.node.id);
            const fill = resolveNodeFill(vm.node, viewDoc.heatmap);
            const isContainer = vm.node.type !== "leaf" && !vm.node.isTextLabel;
            const selectedNodeClass =
              selectedState && !isContainer ? "selected" : "";
            const selectionModeClass = selectedState
              ? selected.length > 1
                ? "multi-selected"
                : "single-selected"
              : "";
            const isEditing = editingNodeId === vm.node.id;
            const dragDelta = drag?.nodeIds.includes(vm.node.id)
              ? { x: drag.dx / viewport.zoom, y: drag.dy / viewport.zoom }
              : { x: 0, y: 0 };
            const resizeDelta =
              resize?.nodeId === vm.node.id
                ? { w: resize.dx / viewport.zoom, h: resize.dy / viewport.zoom }
                : { w: 0, h: 0 };
            return (
              <div
                key={vm.node.id}
                className={`cc-node ${isContainer ? "cc-node-container" : ""} ${selectedNodeClass} ${selectionModeClass} ${isEditing ? "editing" : ""} ${drag?.nodeIds.includes(vm.node.id) ? "dragging" : ""} ${reparentTargetId === vm.node.id ? "drop-target" : ""}`}
                style={
                  {
                    left: vm.node.x + dragDelta.x,
                    top: vm.node.y + dragDelta.y,
                    width: Math.max(MIN_NODE_WIDTH, vm.node.w + resizeDelta.w),
                    height: Math.max(
                      MIN_NODE_HEIGHT,
                      vm.node.h + resizeDelta.h,
                    ),
                    zIndex: vm.zIndex,
                    "--node-bg": fill.background,
                    "--node-border": fill.border,
                    "--container-label-offset-top": `${Math.max(
                      0,
                      viewDoc.settings.containerLabelOffsetTop,
                    )}px`,
                  } as React.CSSProperties
                }
                onPointerDown={(event) => {
                  setContextMenu(null);
                  event.stopPropagation();
                  if (event.button > 0) return;
                  if (isEditing) return;
                  if (event.ctrlKey || event.metaKey || event.shiftKey)
                    toggleSelectionWithRules(viewDoc, vm.node.id);
                  else if (!selected.includes(vm.node.id))
                    setSelection([vm.node.id]);
                  if (readonly) return;
                  const selectionRoots = selected.includes(vm.node.id)
                    ? selected
                    : [vm.node.id];
                  const dragRootId = vm.node.id;
                  const activeSelection =
                    nodeIdsWithDescendants(selectionRoots);
                  const draggedSet = new Set(activeSelection);
                  const canReparent = selectionRoots.length === 1;
                  const canvasRect = canvasRef.current?.getBoundingClientRect();
                  let pendingReparentTarget: NodeId | null | undefined;
                  useTransientStore.getState().startDrag({
                    nodeIds: activeSelection,
                    startX: event.clientX,
                    startY: event.clientY,
                    dx: 0,
                    dy: 0,
                  });
                  const onMove = (move: PointerEvent) => {
                    const current = useTransientStore.getState().drag;
                    if (!current) return;
                    const snapped = snapDragDelta(
                      current.nodeIds,
                      move.clientX - current.startX,
                      move.clientY - current.startY,
                    );
                    useTransientStore
                      .getState()
                      .updateDrag(snapped.dx, snapped.dy);
                    if (!canReparent || !canvasRect) {
                      useTransientStore.getState().setReparentTargetId(null);
                      return;
                    }
                    const dragRoot = viewDoc.nodesById[dragRootId];
                    if (!dragRoot) return;
                    const docX =
                      (move.clientX - canvasRect.left - viewport.x) /
                      viewport.zoom;
                    const docY =
                      (move.clientY - canvasRect.top - viewport.y) /
                      viewport.zoom;
                    const candidate = findDropTarget({
                      doc: viewDoc,
                      pointDocX: docX,
                      pointDocY: docY,
                      draggedIds: draggedSet,
                    });
                    const currentParent = dragRoot.parentId ?? null;
                    if (candidate.parentId === currentParent) {
                      pendingReparentTarget = undefined;
                      useTransientStore.getState().setReparentTargetId(null);
                      return;
                    }
                    const acceptable = isAcceptableDropTarget(
                      viewDoc,
                      dragRootId,
                      candidate.parentId,
                    );
                    useTransientStore
                      .getState()
                      .setReparentTargetId(
                        acceptable.accepted ? candidate.parentId : null,
                      );
                    pendingReparentTarget = acceptable.accepted
                      ? candidate.parentId
                      : undefined;
                  };
                  const onUp = () => {
                    const current = useTransientStore.getState().endDrag();
                    const reparentTargetId = pendingReparentTarget;
                    useTransientStore.getState().setReparentTargetId(null);
                    if (
                      current &&
                      (Math.abs(current.dx) > 1 ||
                        Math.abs(current.dy) > 1 ||
                        reparentTargetId !== undefined)
                    ) {
                      const dx = current.dx / viewport.zoom;
                      const dy = current.dy / viewport.zoom;
                      const dragRoot = viewDoc.nodesById[dragRootId];
                      const currentParent = dragRoot?.parentId ?? null;
                      const wantsReparent =
                        canReparent &&
                        reparentTargetId !== undefined &&
                        reparentTargetId !== currentParent;
                      if (wantsReparent) {
                        const reparentTxn = reparentNode(
                          dragRootId,
                          reparentTargetId,
                        );
                        const moveTxn = moveNodes(current.nodeIds, dx, dy);
                        execute(
                          transaction(
                            "Reparent capability",
                            [...reparentTxn.commands, ...moveTxn.commands],
                            {
                              source: "drag",
                              relayout: reparentTxn.meta?.relayout,
                            },
                          ),
                        );
                      } else if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
                        execute(moveNodes(current.nodeIds, dx, dy));
                        const parentId = viewDoc.nodesById[dragRootId]?.parentId;
                        if (parentId) {
                          const parentNode = viewDoc.nodesById[parentId];
                          if (
                            parentNode &&
                            !parentNode.isManualPositioningEnabled
                          ) {
                            execute(repairSiblingOverlaps(parentId));
                          }
                        }
                      }
                    }
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                    window.removeEventListener("pointercancel", onUp);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp);
                  window.addEventListener("pointercancel", onUp);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = canvasRef.current?.getBoundingClientRect();
                  setSelection([vm.node.id]);
                  setActiveDrawer(null);
                  setContextMenu({
                    nodeId: vm.node.id,
                    x: event.clientX - (rect?.left ?? 0),
                    y: event.clientY - (rect?.top ?? 0),
                  });
                }}
              >
                {isContainer ? (
                  <div className="cc-node-title">
                    <NodeLabel
                      nodeId={vm.node.id}
                      label={vm.node.label}
                      isEditing={isEditing}
                      labelDraft={labelDraft}
                      inputRef={labelInputRef}
                      onDraftChange={setLabelDraft}
                      onCommit={commitLabelEdit}
                      onCancel={cancelLabelEdit}
                      onStartEdit={startLabelEdit}
                    />
                  </div>
                ) : (
                  <NodeLabel
                    nodeId={vm.node.id}
                    label={vm.node.label}
                    isEditing={isEditing}
                    labelDraft={labelDraft}
                    inputRef={labelInputRef}
                    onDraftChange={setLabelDraft}
                    onCommit={commitLabelEdit}
                    onCancel={cancelLabelEdit}
                    onStartEdit={startLabelEdit}
                  />
                )}
                {viewDoc.heatmap.enabled && vm.node.heatmapValue !== undefined && (
                  <span
                    className={`cc-node-score ${isContainer ? "container-score" : "leaf-score"}`}
                  >
                    {vm.node.heatmapValue.toFixed(2)}
                  </span>
                )}
                {!readonly && selectedState && !isEditing && (
                  <span
                    className="cc-resize"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      useTransientStore.getState().startResize({
                        nodeId: vm.node.id,
                        startW: vm.node.w,
                        startH: vm.node.h,
                        dx: 0,
                        dy: 0,
                      });
                      const onMove = (move: PointerEvent) => {
                        const current = useTransientStore.getState().resize;
                        if (current) {
                          const snapped = snapResizeDelta(
                            current.nodeId,
                            current.startW,
                            current.startH,
                            move.clientX - event.clientX,
                            move.clientY - event.clientY,
                          );
                          useTransientStore
                            .getState()
                            .updateResize(snapped.dx, snapped.dy);
                        }
                      };
                      const onUp = () => {
                        const current = useTransientStore
                          .getState()
                          .endResize();
                        if (current) {
                          execute(
                            resizeNode(
                              current.nodeId,
                              current.startW + current.dx / viewport.zoom,
                              current.startH + current.dy / viewport.zoom,
                            ),
                          );
                        }
                        window.removeEventListener("pointermove", onMove);
                        window.removeEventListener("pointerup", onUp);
                        window.removeEventListener("pointercancel", onUp);
                      };
                      window.addEventListener("pointermove", onMove);
                      window.addEventListener("pointerup", onUp);
                      window.addEventListener("pointercancel", onUp);
                    }}
                  />
                )}
              </div>
            );
          })}
        {visibleViewModels
          .filter((vm) => vm.node.type !== "leaf" && !vm.node.isTextLabel)
          .map((vm) => {
            const selectedState = selected.includes(vm.node.id);
            const selectionModeClass = selectedState
              ? selected.length > 1
                ? "multi-selected"
                : "single-selected"
              : "";
            const fill = resolveNodeFill(vm.node, viewDoc.heatmap);
            const dragDelta = drag?.nodeIds.includes(vm.node.id)
              ? { x: drag.dx / viewport.zoom, y: drag.dy / viewport.zoom }
              : { x: 0, y: 0 };
            const resizeDelta =
              resize?.nodeId === vm.node.id
                ? { w: resize.dx / viewport.zoom, h: resize.dy / viewport.zoom }
                : { w: 0, h: 0 };
            return (
              <div
                key={`${vm.node.id}-frame`}
                className={`cc-container-frame ${selectedState ? "selected" : ""} ${selectionModeClass} ${reparentTargetId === vm.node.id ? "drop-target" : ""}`}
                aria-hidden="true"
                style={
                  {
                    left: vm.node.x + dragDelta.x,
                    top: vm.node.y + dragDelta.y,
                    width: Math.max(MIN_NODE_WIDTH, vm.node.w + resizeDelta.w),
                    height: Math.max(
                      MIN_NODE_HEIGHT,
                      vm.node.h + resizeDelta.h,
                    ),
                    zIndex: vm.zIndex + 1,
                    pointerEvents: "none",
                    "--node-border": fill.border,
                  } as React.CSSProperties
                }
              />
            );
          })}
      </div>
      {contextMenu && contextNode && !readonly && (
        <div
          className="cc-context-menu"
          role="menu"
          aria-label="Capability context menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => inspectNode(contextMenu.nodeId)}
          >
            Inspect
          </button>
          {!contextNode.isTextLabel && contextNode.type !== "text" && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                execute(addChild(contextMenu.nodeId));
                setContextMenu(null);
              }}
            >
              Add child
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              execute(duplicateNodes([contextMenu.nodeId]));
              setContextMenu(null);
            }}
          >
            Duplicate
          </button>
          {hasCanvasChildren(viewDoc, contextMenu.nodeId) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                execute(fitParentToChildren(contextMenu.nodeId));
                setContextMenu(null);
              }}
            >
              Fit parent
            </button>
          )}
          {contextHasSourceChildren && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                execute(
                  updateVisualNodeState(
                    doc.visual.activeViewId,
                    contextMenu.nodeId,
                    { isCollapsed: !contextViewState?.isCollapsed },
                  ),
                );
                setContextMenu(null);
              }}
            >
              {contextViewState?.isCollapsed
                ? "Expand in view"
                : "Collapse in view"}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              execute(removeNodesFromCanvas([contextMenu.nodeId]));
              setContextMenu(null);
            }}
          >
            Remove from active view
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              requestDeleteFromModel([contextMenu.nodeId]);
              setContextMenu(null);
            }}
          >
            Delete from model
          </button>
        </div>
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
        bounds={viewDoc.layout.boundingBox}
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

function isCanvasBackgroundTarget(
  target: EventTarget | null,
  currentTarget: EventTarget,
): boolean {
  if (target === currentTarget) return true;
  return (
    target instanceof HTMLElement &&
    target.classList.contains("cc-canvas-stage")
  );
}

function NodeLabel({
  nodeId,
  label,
  isEditing,
  labelDraft,
  inputRef,
  onDraftChange,
  onCommit,
  onCancel,
  onStartEdit,
}: {
  nodeId: NodeId;
  label: string;
  isEditing: boolean;
  labelDraft: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onStartEdit: (nodeId: NodeId) => void;
}) {
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="cc-node-label-input"
        aria-label={`Edit label for ${label}`}
        value={labelDraft}
        onChange={(event) => onDraftChange(event.target.value)}
        onBlur={onCommit}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
    );
  }

  return (
    <span
      className="cc-node-label"
      onPointerDown={(event) => {
        if (event.detail > 1) event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onStartEdit(nodeId);
      }}
    >
      {label}
    </span>
  );
}

function toggleSelectionWithRules(doc: CapabilityDocument, nodeId: NodeId) {
  const ui = useUiStore.getState();
  const resolution = resolveToggleSelection(doc, ui.selectedNodeIds, nodeId);
  ui.setSelection(resolution.nodeIds);
  if (resolution.reason) ui.showSelectionNotice(resolution.reason);
}

function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
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

function BulkToolbar({ selected }: { selected: NodeId[] }) {
  const doc = useDocumentStore((state) => state.doc);
  const viewDoc = useMemo(() => resolveVisualDocument(doc), [doc]);
  const execute = useDocumentStore((state) => state.execute);
  const { requestDeleteFromModel, deleteFromModelDialog } =
    useModelDeleteConfirmation(doc);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const bulkAllowed = canMultiSelect(viewDoc, selected);
  const alignAllowed = canAlign(viewDoc, selected);
  const distributeAllowed = canDistribute(viewDoc, selected);
  const sameSizeAllowed = bulkAllowed;
  const anchor = selected[0];
  const anchorNode = anchor ? viewDoc.nodesById[anchor] : undefined;

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        moreRef.current?.contains(event.target)
      )
        return;
      setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  return (
    <div className="cc-bulk-toolbar">
      <span className="count">{selected.length} selected</span>
      <span className="reference">
        Reference: {anchorNode?.label ?? "first selected"}
      </span>
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={AlignHorizontalJustifyStart}
        label="Align left"
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "left"))}
      />
      <IconButton
        icon={AlignHorizontalJustifyCenter}
        label="Align center"
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "center"))}
      />
      <IconButton
        icon={AlignHorizontalJustifyEnd}
        label="Align right"
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "right"))}
      />
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={AlignVerticalJustifyStart}
        label="Align top"
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "top"))}
      />
      <IconButton
        icon={AlignVerticalJustifyCenter}
        label="Align middle"
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "middle"))}
      />
      <IconButton
        icon={AlignVerticalJustifyEnd}
        label="Align bottom"
        tooltip={alignAllowed.reason}
        disabled={!alignAllowed.valid}
        onClick={() => execute(alignNodes(selected, "bottom"))}
      />
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={AlignHorizontalSpaceBetween}
        label="Distribute horizontal"
        tooltip={distributeAllowed.reason}
        disabled={!distributeAllowed.valid}
        onClick={() => execute(distributeNodes(selected, "horizontal"))}
      />
      <IconButton
        icon={AlignVerticalSpaceBetween}
        label="Distribute vertical"
        tooltip={distributeAllowed.reason}
        disabled={!distributeAllowed.valid}
        onClick={() => execute(distributeNodes(selected, "vertical"))}
      />
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={StretchHorizontal}
        label="Match width to first selected"
        tooltip={sameSizeAllowed.reason}
        disabled={!sameSizeAllowed.valid || !anchor}
        onClick={() => anchor && execute(sameSize(selected, anchor, "width"))}
      />
      <IconButton
        icon={StretchVertical}
        label="Match height to first selected"
        tooltip={sameSizeAllowed.reason}
        disabled={!sameSizeAllowed.valid || !anchor}
        onClick={() => anchor && execute(sameSize(selected, anchor, "height"))}
      />
      <IconButton
        icon={Scaling}
        label="Match size to first selected"
        tooltip={sameSizeAllowed.reason}
        disabled={!sameSizeAllowed.valid || !anchor}
        onClick={() => anchor && execute(sameSize(selected, anchor))}
      />
      <span className="cc-toolbar-separator" />
      <BulkColorPicker
        selected={selected}
        disabled={!bulkAllowed.valid}
        reason={bulkAllowed.reason}
      />
      <span className="cc-toolbar-separator" />
      <IconButton
        icon={EyeOff}
        label="Remove from active view"
        onClick={() => execute(removeNodesFromCanvas(selected))}
      />
      <div
        ref={moreRef}
        className="cc-bulk-more"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <IconButton
          icon={MoreHorizontal}
          label="More bulk actions"
          active={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        />
        {moreOpen && (
          <div
            className="cc-bulk-more-menu"
            role="menu"
            aria-label="Bulk actions"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                execute(duplicateNodes(selected));
                setMoreOpen(false);
              }}
            >
              <Copy aria-hidden="true" />
              <span>Duplicate</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                requestDeleteFromModel(selected);
                setMoreOpen(false);
              }}
            >
              <Trash2 aria-hidden="true" />
              <span>Delete from model</span>
            </button>
          </div>
        )}
      </div>
      {deleteFromModelDialog}
    </div>
  );
}

function BulkColorPicker({
  selected,
  disabled = false,
  reason,
}: {
  selected: NodeId[];
  disabled?: boolean;
  reason?: string;
}) {
  const doc = useDocumentStore((state) => state.doc);
  const viewDoc = useMemo(() => resolveVisualDocument(doc), [doc]);
  const execute = useDocumentStore((state) => state.execute);
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedNodes = selected
    .map((nodeId) => viewDoc.nodesById[nodeId])
    .filter(Boolean);
  const selectedColors = new Set(selectedNodes.map((node) => node.color));
  const activeColor =
    selectedColors.size === 1 ? selectedNodes[0]?.color : undefined;
  const activeStyle = activeColor ? CATEGORY_STYLES[activeColor] : undefined;
  const previewStyle = activeStyle
    ? {
        background: activeStyle.background,
        borderColor: activeStyle.border,
      }
    : {
        background:
          "conic-gradient(#10b981 0 25%, #0ea5e9 0 50%, #f59e0b 0 75%, #8b5cf6 0)",
        borderColor: "var(--cc-slate-300)",
      };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        pickerRef.current?.contains(event.target)
      )
        return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const applyColor = (color: CapabilityColor) => {
    if (disabled) return;
    execute(updateNodeColors(selected, color));
    setOpen(false);
  };

  return (
    <div
      ref={pickerRef}
      className="cc-bulk-color-picker"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={`cc-icon-btn ${open ? "active" : ""}`}
        aria-label="Change selected color"
        aria-expanded={open}
        title={reason ?? "Change selected color"}
        disabled={disabled}
        onClick={() => !disabled && setOpen((current) => !current)}
      >
        <Palette aria-hidden="true" />
        <span className="cc-bulk-color-preview" style={previewStyle} />
      </button>
      {open && (
        <div className="cc-bulk-color-popover" aria-label="Color picker">
          {CAPABILITY_COLORS.map((color) => {
            const style = CATEGORY_STYLES[color];
            return (
              <button
                key={color}
                type="button"
                aria-label={`Set selected color ${color}`}
                aria-pressed={activeColor === color}
                className={`cc-bulk-color-swatch ${activeColor === color ? "on" : ""}`}
                title={`Set selected color ${color}`}
                style={{
                  color: style.border,
                  background: style.background,
                }}
                onClick={() => applyColor(color)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function HeatmapLegend({
  palette,
  position,
}: {
  palette: Parameters<typeof heatmapGradient>[0];
  position?: LegendPosition;
}) {
  return (
    <div className="cc-heat-legend" style={heatmapLegendStyle(position)}>
      <div className="cc-section-title">Heatmap</div>
      <div
        className="cc-heat-bar"
        style={{ background: heatmapGradient(palette) }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "var(--cc-slate-500)",
          fontSize: 11,
        }}
      >
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

function heatmapLegendStyle(position: LegendPosition | undefined): CSSProperties {
  const effectivePosition = position === "custom" ? "bottom-left" : position;
  switch (effectivePosition) {
    case "top-left":
      return { top: 16, left: 16, bottom: "auto", right: "auto" };
    case "top-right":
      return { top: 16, right: 16, bottom: "auto", left: "auto" };
    case "bottom-right":
      return { right: 16, bottom: 16, top: "auto", left: "auto" };
    case "bottom-left":
    default:
      return { left: 16, bottom: 16, top: "auto", right: "auto" };
  }
}

function Minimap({
  bounds,
  viewport,
  nodes,
  onFit,
  onZoomIn,
  onZoomOut,
  onCenter,
}: {
  bounds: Bounds;
  viewport: Bounds;
  nodes: Array<
    Bounds & {
      fill: {
        background: string;
        border: string;
      };
    }
  >;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: (x: number, y: number) => void;
}) {
  const minimapWidth = 132;
  const minimapHeight = 90;
  const scale =
    bounds.w > 0 && bounds.h > 0
      ? Math.min(minimapWidth / bounds.w, minimapHeight / bounds.h)
      : 1;
  const centerFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (bounds.w <= 0 || bounds.h <= 0 || !Number.isFinite(scale) || scale <= 0)
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clientX = Number.isFinite(event.clientX)
      ? event.clientX
      : rect.left + rect.width / 2;
    const clientY = Number.isFinite(event.clientY)
      ? event.clientY
      : rect.top + rect.height / 2;
    const rawX = bounds.x + (clientX - rect.left) / scale;
    const rawY = bounds.y + (clientY - rect.top) / scale;
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return;
    const x = Math.max(bounds.x, Math.min(bounds.x + bounds.w, rawX));
    const y = Math.max(bounds.y, Math.min(bounds.y + bounds.h, rawY));
    onCenter(x, y);
  };
  const viewportWidth = Math.min(minimapWidth, Math.max(8, viewport.w * scale));
  const viewportHeight = Math.min(
    minimapHeight,
    Math.max(8, viewport.h * scale),
  );
  const viewportLeft = Math.max(
    0,
    Math.min(minimapWidth - viewportWidth, (viewport.x - bounds.x) * scale),
  );
  const viewportTop = Math.max(
    0,
    Math.min(minimapHeight - viewportHeight, (viewport.y - bounds.y) * scale),
  );

  return (
    <div
      className="cc-minimap"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="cc-minimap-canvas"
        role="button"
        tabIndex={0}
        aria-label="Move viewport"
        onPointerDown={(event) => {
          centerFromEvent(event);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) centerFromEvent(event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onFit();
          }
        }}
      >
        {nodes.slice(0, 300).map((node, index) => (
          <span
            key={index}
            className="cc-minimap-blob"
            style={{
              left: (node.x - bounds.x) * scale,
              top: (node.y - bounds.y) * scale,
              width: Math.max(2, node.w * scale),
              height: Math.max(2, node.h * scale),
              background: node.fill.background,
              border: `1px solid ${node.fill.border}`,
            }}
          />
        ))}
        <span
          className="cc-minimap-vp"
          style={{
            left: viewportLeft,
            top: viewportTop,
            width: viewportWidth,
            height: viewportHeight,
          }}
        />
      </div>
      <div className="cc-minimap-controls">
        <button type="button" aria-label="Fit view" onClick={onFit}>
          <Maximize size={14} />
        </button>
        <button type="button" aria-label="Zoom in" onClick={onZoomIn}>
          <Plus size={14} />
        </button>
        <button type="button" aria-label="Zoom out" onClick={onZoomOut}>
          <Minus size={14} />
        </button>
      </div>
    </div>
  );
}
