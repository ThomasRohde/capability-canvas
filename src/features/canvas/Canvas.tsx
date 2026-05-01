import {
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartHorizontal,
  Copy,
  Maximize,
  Minus,
  Plus,
  Rows3,
  Trash2
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  alignNodes,
  deleteNodes,
  distributeNodes,
  duplicateNodes,
  fitParentToChildren,
  moveNodes,
  resizeNode,
  sameSize
} from '../../domain/commands/operations';
import type { Bounds, NodeId } from '../../domain/document/types';
import { useDocumentStore } from '../../app/stores/documentStore';
import { useTransientStore } from '../../app/stores/transientStore';
import { useUiStore } from '../../app/stores/uiStore';
import { resolveNodeFill } from '../heatmap/resolveNodeFill';
import { IconButton } from '../shared/IconButton';
import { createNodeViewModels, viewportToDocumentBounds } from './selectors';

export function Canvas({ readonly = false }: { readonly?: boolean }) {
  const doc = useDocumentStore((state) => state.doc);
  const execute = useDocumentStore((state) => state.execute);
  const selected = useUiStore((state) => state.selectedNodeIds);
  const setSelection = useUiStore((state) => state.setSelection);
  const viewport = useUiStore((state) => state.viewport);
  const setViewport = useUiStore((state) => state.setViewport);
  const drag = useTransientStore((state) => state.drag);
  const resize = useTransientStore((state) => state.resize);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const docViewport = useMemo(() => viewportToDocumentBounds(viewport, size), [viewport, size]);
  const viewModels = useMemo(() => createNodeViewModels(doc, docViewport), [doc, docViewport]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (readonly) return;
      if (event.key === 'Delete' && selected.length > 0) execute(deleteNodes(selected));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') useDocumentStore.getState().undo();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') useDocumentStore.getState().redo();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selected.length > 0) {
        event.preventDefault();
        execute(duplicateNodes(selected));
      }
      if (event.key === 'Escape') useTransientStore.getState().cancel();
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && selected.length > 0) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        execute(moveNodes(selected, dx, dy));
      }
      if (event.key.toLowerCase() === 'f') fitView();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const fitView = () => {
    const bounds = doc.layout.boundingBox;
    if (bounds.w === 0 || bounds.h === 0) return;
    const zoom = Math.max(0.25, Math.min(1.5, Math.min((size.w - 80) / bounds.w, (size.h - 80) / bounds.h)));
    setViewport({ zoom, x: 40 - bounds.x * zoom, y: 40 - bounds.y * zoom });
  };

  return (
    <main
      ref={canvasRef}
      className={`cc-canvas ${doc.settings.gridEnabled ? '' : 'no-grid'}`}
      data-testid="canvas"
      onWheel={(event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.08 : 0.08;
        setViewport({ ...viewport, zoom: Math.max(0.25, Math.min(2.5, viewport.zoom + delta)) });
      }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget || readonly) return;
        const startX = event.clientX;
        const startY = event.clientY;
        const startViewport = viewport;
        const onMove = (move: PointerEvent) => setViewport({ ...startViewport, x: startViewport.x + move.clientX - startX, y: startViewport.y + move.clientY - startY });
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      }}
    >
      <div
        className="cc-canvas-stage"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
      >
        {viewModels
          .filter((vm) => vm.visible || selected.includes(vm.node.id))
          .map((vm) => {
            const selectedState = selected.includes(vm.node.id);
            const fill = resolveNodeFill(vm.node, doc.heatmap);
            const isContainer = vm.node.type !== 'leaf' && !vm.node.isTextLabel;
            const dragDelta = drag?.nodeIds.includes(vm.node.id) ? { x: drag.dx / viewport.zoom, y: drag.dy / viewport.zoom } : { x: 0, y: 0 };
            const resizeDelta = resize?.nodeId === vm.node.id ? { w: resize.dx / viewport.zoom, h: resize.dy / viewport.zoom } : { w: 0, h: 0 };
            return (
              <div
                key={vm.node.id}
                className={`cc-node ${isContainer ? 'container' : ''} ${selectedState ? 'selected' : ''} ${drag?.nodeIds.includes(vm.node.id) ? 'dragging' : ''}`}
                style={
                  {
                    left: vm.node.x + dragDelta.x,
                    top: vm.node.y + dragDelta.y,
                    width: Math.max(40, vm.node.w + resizeDelta.w),
                    height: Math.max(32, vm.node.h + resizeDelta.h),
                    zIndex: vm.zIndex,
                    '--node-bg': fill.background,
                    '--node-border': fill.border
                  } as React.CSSProperties
                }
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (event.button !== 0) return;
                  if (event.ctrlKey || event.metaKey || event.shiftKey) useUiStore.getState().toggleSelection(vm.node.id);
                  else if (!selected.includes(vm.node.id)) setSelection([vm.node.id]);
                  if (readonly || vm.node.isLockedAsIs) return;
                  const activeSelection = selected.includes(vm.node.id) ? selected : [vm.node.id];
                  useTransientStore.getState().startDrag({ nodeIds: activeSelection, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 });
                  const onMove = (move: PointerEvent) => {
                    const current = useTransientStore.getState().drag;
                    if (current) useTransientStore.getState().updateDrag(move.clientX - current.startX, move.clientY - current.startY);
                  };
                  const onUp = () => {
                    const current = useTransientStore.getState().endDrag();
                    if (current && (Math.abs(current.dx) > 1 || Math.abs(current.dy) > 1)) {
                      execute(moveNodes(current.nodeIds, current.dx / viewport.zoom, current.dy / viewport.zoom));
                    }
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
              >
                {isContainer ? (
                  <div className="cc-node-title">
                    <span>{vm.node.label}</span>
                  </div>
                ) : (
                  <span>{vm.node.label}</span>
                )}
                {doc.heatmap.enabled && vm.node.heatmapValue !== undefined && <span className="cc-node-score">{vm.node.heatmapValue.toFixed(2)}</span>}
                {!readonly && selectedState && (
                  <span
                    className="cc-resize"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      useTransientStore
                        .getState()
                        .startResize({ nodeId: vm.node.id, startW: vm.node.w, startH: vm.node.h, dx: 0, dy: 0 });
                      const onMove = (move: PointerEvent) => {
                        const current = useTransientStore.getState().resize;
                        if (current) useTransientStore.getState().updateResize(move.clientX - event.clientX, move.clientY - event.clientY);
                      };
                      const onUp = () => {
                        const current = useTransientStore.getState().endResize();
                        if (current) {
                          execute(resizeNode(current.nodeId, current.startW + current.dx / viewport.zoom, current.startH + current.dy / viewport.zoom));
                        }
                        window.removeEventListener('pointermove', onMove);
                        window.removeEventListener('pointerup', onUp);
                      };
                      window.addEventListener('pointermove', onMove);
                      window.addEventListener('pointerup', onUp);
                    }}
                  />
                )}
              </div>
            );
          })}
      </div>
      {selected.length > 1 && !readonly && <BulkToolbar selected={selected} />}
      {doc.heatmap.enabled && doc.heatmap.showLegend && <HeatmapLegend />}
      <Minimap bounds={doc.layout.boundingBox} viewport={docViewport} nodes={viewModels.map((vm) => vm.bounds)} onFit={fitView} />
    </main>
  );
}

function BulkToolbar({ selected }: { selected: NodeId[] }) {
  const execute = useDocumentStore((state) => state.execute);
  return (
    <div className="cc-bulk-toolbar">
      <span className="count">{selected.length} selected</span>
      <IconButton icon={AlignStartHorizontal} label="Align left" onClick={() => execute(alignNodes(selected, 'left'))} />
      <IconButton icon={AlignCenterHorizontal} label="Align center" onClick={() => execute(alignNodes(selected, 'center'))} />
      <IconButton icon={AlignEndHorizontal} label="Align right" onClick={() => execute(alignNodes(selected, 'right'))} />
      <IconButton icon={Rows3} label="Distribute horizontal" onClick={() => execute(distributeNodes(selected, 'horizontal'))} />
      <IconButton icon={Copy} label="Same size" onClick={() => execute(sameSize(selected, selected[0]!))} />
      <IconButton icon={Maximize} label="Fit parent" onClick={() => execute(fitParentToChildren(selected[0]!))} />
      <IconButton icon={Trash2} label="Delete" onClick={() => execute(deleteNodes(selected))} />
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div className="cc-heat-legend">
      <div className="cc-section-title">Heatmap</div>
      <div className="cc-heat-bar" />
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--cc-slate-500)', fontSize: 11 }}>
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

function Minimap({ bounds, viewport, nodes, onFit }: { bounds: Bounds; viewport: Bounds; nodes: Bounds[]; onFit: () => void }) {
  const scale = bounds.w > 0 && bounds.h > 0 ? Math.min(132 / bounds.w, 82 / bounds.h) : 1;
  return (
    <div className="cc-minimap">
      <div className="cc-minimap-canvas">
        {nodes.slice(0, 300).map((node, index) => (
          <span
            key={index}
            className="cc-minimap-blob"
            style={{
              left: (node.x - bounds.x) * scale,
              top: (node.y - bounds.y) * scale,
              width: Math.max(2, node.w * scale),
              height: Math.max(2, node.h * scale),
              background: index % 3 === 0 ? '#bbf7d0' : index % 3 === 1 ? '#fed7aa' : '#bae6fd'
            }}
          />
        ))}
        <span
          className="cc-minimap-vp"
          style={{
            left: Math.max(0, (viewport.x - bounds.x) * scale),
            top: Math.max(0, (viewport.y - bounds.y) * scale),
            width: Math.max(8, viewport.w * scale),
            height: Math.max(8, viewport.h * scale)
          }}
        />
      </div>
      <div className="cc-minimap-controls">
        <button type="button" aria-label="Fit view" onClick={onFit}>
          <Maximize size={14} />
        </button>
        <button type="button" aria-label="Zoom in">
          <Plus size={14} />
        </button>
        <button type="button" aria-label="Zoom out">
          <Minus size={14} />
        </button>
      </div>
    </div>
  );
}
