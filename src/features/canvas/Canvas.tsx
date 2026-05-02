import {
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartHorizontal,
  Copy,
  Maximize,
  Minus,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addChild,
  alignNodes,
  deleteNodes,
  distributeNodes,
  duplicateNodes,
  fitParentToChildren,
  moveNodes,
  resizeNode,
  sameSize,
} from "../../domain/commands/operations";
import type { Bounds, NodeId } from "../../domain/document/types";
import { gridSizeFor, snapToGrid } from "../../domain/layout/grid";
import { useDocumentStore } from "../../app/stores/documentStore";
import { useTransientStore } from "../../app/stores/transientStore";
import { useUiStore } from "../../app/stores/uiStore";
import { resolveNodeFill } from "../heatmap/resolveNodeFill";
import { IconButton } from "../shared/IconButton";
import {
  createNodeViewModels,
  descendantIds,
  viewportToDocumentBounds,
} from "./selectors";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

export function Canvas({ readonly = false }: { readonly?: boolean }) {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setSelection = useUiStore((state) => state.setSelection);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const setInspectorOpen = useUiStore((state) => state.setInspectorOpen);
  const setInspectorTab = useUiStore((state) => state.setInspectorTab);
  const setActiveDrawer = useUiStore((state) => state.setActiveDrawer);
  const drag = useTransientStore((state) => state.drag);
  const resize = useTransientStore((state) => state.resize);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [contextMenu, setContextMenu] = useState<{
    nodeId: NodeId;
    x: number;
    y: number;
  } | null>(null);
  const docViewport = useMemo(
    () => viewportToDocumentBounds(viewport, size),
    [viewport, size],
  );
  const viewModels = useMemo(
    () => createNodeViewModels(doc, docViewport),
    [doc, docViewport],
  );
  const contextNode = contextMenu ? doc.nodesById[contextMenu.nodeId] : null;

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
      if (!doc.nodesById[nodeId]) continue;
      expanded.add(nodeId);
      for (const descendantId of descendantIds(doc, nodeId))
        expanded.add(descendantId);
    }
    return [...expanded];
  };

  const snapDragDelta = (
    nodeIds: NodeId[],
    screenDx: number,
    screenDy: number,
  ) => {
    if (!doc.settings.gridEnabled || nodeIds.length === 0)
      return { dx: screenDx, dy: screenDy };
    const anchor = doc.nodesById[nodeIds[0]!];
    if (!anchor) return { dx: screenDx, dy: screenDy };
    const gridSize = gridSizeFor(doc);
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
    if (!doc.settings.gridEnabled || !doc.settings.resizeSnapToGrid)
      return { dx: screenDx, dy: screenDy };
    const node = doc.nodesById[nodeId];
    if (!node) return { dx: screenDx, dy: screenDy };
    const gridSize = gridSizeFor(doc);
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (readonly) return;
      if (event.key === "Delete" && selected.length > 0)
        execute(deleteNodes(selected));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z")
        useDocumentStore.getState().undo();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y")
        useDocumentStore.getState().redo();
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
        const step = event.shiftKey ? 10 : 1;
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
  });

  const fitView = () => {
    const bounds = doc.layout.boundingBox;
    if (bounds.w === 0 || bounds.h === 0) return;
    const zoom = Math.max(
      MIN_ZOOM,
      Math.min(
        1.5,
        Math.min((size.w - 80) / bounds.w, (size.h - 80) / bounds.h),
      ),
    );
    setViewport({ zoom, x: 40 - bounds.x * zoom, y: 40 - bounds.y * zoom });
  };

  const zoomBy = (delta: number) => {
    const nextZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, viewport.zoom + delta),
    );
    if (nextZoom === viewport.zoom) return;
    const centerDocX = (size.w / 2 - viewport.x) / viewport.zoom;
    const centerDocY = (size.h / 2 - viewport.y) / viewport.zoom;
    setViewport({
      zoom: nextZoom,
      x: size.w / 2 - centerDocX * nextZoom,
      y: size.h / 2 - centerDocY * nextZoom,
    });
  };

  const centerOnDocumentPoint = (x: number, y: number) => {
    setViewport({
      ...viewport,
      x: size.w / 2 - x * viewport.zoom,
      y: size.h / 2 - y * viewport.zoom,
    });
  };

  return (
    <main
      ref={canvasRef}
      className={`cc-canvas ${doc.settings.gridEnabled ? "" : "no-grid"}`}
      data-testid="canvas"
      style={
        {
          "--cc-grid-size": `${Math.max(4, doc.settings.gridSize * viewport.zoom)}px`,
          "--cc-grid-dot-color": doc.settings.gridEnabled
            ? "rgba(15, 23, 42, 0.09)"
            : "transparent",
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        } as React.CSSProperties
      }
      onWheel={(event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.08 : 0.08;
        zoomBy(delta);
      }}
      onPointerDown={(event) => {
        setContextMenu(null);
        if (event.target !== event.currentTarget || readonly) return;
        const startX = event.clientX;
        const startY = event.clientY;
        const startViewport = viewport;
        const onMove = (move: PointerEvent) =>
          setViewport({
            ...startViewport,
            x: startViewport.x + move.clientX - startX,
            y: startViewport.y + move.clientY - startY,
          });
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
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
        {viewModels
          .filter((vm) => vm.visible || selected.includes(vm.node.id))
          .map((vm) => {
            const selectedState = selected.includes(vm.node.id);
            const fill = resolveNodeFill(vm.node, doc.heatmap);
            const isContainer = vm.node.type !== "leaf" && !vm.node.isTextLabel;
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
                className={`cc-node ${isContainer ? "container" : ""} ${selectedState ? "selected" : ""} ${drag?.nodeIds.includes(vm.node.id) ? "dragging" : ""}`}
                style={
                  {
                    left: vm.node.x + dragDelta.x,
                    top: vm.node.y + dragDelta.y,
                    width: Math.max(40, vm.node.w + resizeDelta.w),
                    height: Math.max(32, vm.node.h + resizeDelta.h),
                    zIndex: vm.zIndex,
                    "--node-bg": fill.background,
                    "--node-border": fill.border,
                  } as React.CSSProperties
                }
                onPointerDown={(event) => {
                  setContextMenu(null);
                  event.stopPropagation();
                  if (event.button > 0) return;
                  if (event.ctrlKey || event.metaKey || event.shiftKey)
                    useUiStore.getState().toggleSelection(vm.node.id);
                  else if (!selected.includes(vm.node.id))
                    setSelection([vm.node.id]);
                  if (readonly || vm.node.isLockedAsIs) return;
                  const selectionRoots = selected.includes(vm.node.id)
                    ? selected
                    : [vm.node.id];
                  const activeSelection =
                    nodeIdsWithDescendants(selectionRoots);
                  useTransientStore.getState().startDrag({
                    nodeIds: activeSelection,
                    startX: event.clientX,
                    startY: event.clientY,
                    dx: 0,
                    dy: 0,
                  });
                  const onMove = (move: PointerEvent) => {
                    const current = useTransientStore.getState().drag;
                    if (current) {
                      const snapped = snapDragDelta(
                        current.nodeIds,
                        move.clientX - current.startX,
                        move.clientY - current.startY,
                      );
                      useTransientStore
                        .getState()
                        .updateDrag(snapped.dx, snapped.dy);
                    }
                  };
                  const onUp = () => {
                    const current = useTransientStore.getState().endDrag();
                    if (
                      current &&
                      (Math.abs(current.dx) > 1 || Math.abs(current.dy) > 1)
                    ) {
                      execute(
                        moveNodes(
                          current.nodeIds,
                          current.dx / viewport.zoom,
                          current.dy / viewport.zoom,
                        ),
                      );
                    }
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp);
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
                    <span>{vm.node.label}</span>
                  </div>
                ) : (
                  <span>{vm.node.label}</span>
                )}
                {doc.heatmap.enabled && vm.node.heatmapValue !== undefined && (
                  <span
                    className={`cc-node-score ${isContainer ? "container-score" : "leaf-score"}`}
                  >
                    {vm.node.heatmapValue.toFixed(2)}
                  </span>
                )}
                {!readonly && selectedState && (
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
                      };
                      window.addEventListener("pointermove", onMove);
                      window.addEventListener("pointerup", onUp);
                    }}
                  />
                )}
              </div>
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
          {(doc.childrenByParentId[contextMenu.nodeId]?.length ?? 0) > 0 && (
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
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              execute(deleteNodes([contextMenu.nodeId]));
              setContextMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
      {selected.length > 1 && !readonly && <BulkToolbar selected={selected} />}
      {doc.heatmap.enabled && doc.heatmap.showLegend && <HeatmapLegend />}
      <Minimap
        bounds={doc.layout.boundingBox}
        viewport={docViewport}
        nodes={viewModels.map((vm) => vm.bounds)}
        onFit={fitView}
        onZoomIn={() => zoomBy(0.1)}
        onZoomOut={() => zoomBy(-0.1)}
        onCenter={centerOnDocumentPoint}
      />
    </main>
  );
}

function BulkToolbar({ selected }: { selected: NodeId[] }) {
  const execute = useDocumentStore((state) => state.execute);
  return (
    <div className="cc-bulk-toolbar">
      <span className="count">{selected.length} selected</span>
      <IconButton
        icon={AlignStartHorizontal}
        label="Align left"
        onClick={() => execute(alignNodes(selected, "left"))}
      />
      <IconButton
        icon={AlignCenterHorizontal}
        label="Align center"
        onClick={() => execute(alignNodes(selected, "center"))}
      />
      <IconButton
        icon={AlignEndHorizontal}
        label="Align right"
        onClick={() => execute(alignNodes(selected, "right"))}
      />
      <IconButton
        icon={Rows3}
        label="Distribute horizontal"
        onClick={() => execute(distributeNodes(selected, "horizontal"))}
      />
      <IconButton
        icon={Copy}
        label="Same size"
        onClick={() => execute(sameSize(selected, selected[0]!))}
      />
      <IconButton
        icon={Maximize}
        label="Fit parent"
        onClick={() => execute(fitParentToChildren(selected[0]!))}
      />
      <IconButton
        icon={Trash2}
        label="Delete"
        onClick={() => execute(deleteNodes(selected))}
      />
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div className="cc-heat-legend">
      <div className="cc-section-title">Heatmap</div>
      <div className="cc-heat-bar" />
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
  nodes: Bounds[];
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
              background:
                index % 3 === 0
                  ? "#bbf7d0"
                  : index % 3 === 1
                    ? "#fed7aa"
                    : "#bae6fd",
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
