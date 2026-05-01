import { create } from 'zustand';
import type { Bounds, NodeId } from '../../domain/document/types';

interface DragState {
  nodeIds: NodeId[];
  startX: number;
  startY: number;
  dx: number;
  dy: number;
}

interface ResizeState {
  nodeId: NodeId;
  startW: number;
  startH: number;
  dx: number;
  dy: number;
}

interface TransientState {
  drag: DragState | null;
  resize: ResizeState | null;
  selectionRect: Bounds | null;
  reparentTargetId: NodeId | null;
  isIdle: boolean;
  startDrag: (drag: DragState) => void;
  updateDrag: (dx: number, dy: number) => void;
  endDrag: () => DragState | null;
  startResize: (resize: ResizeState) => void;
  updateResize: (dx: number, dy: number) => void;
  endResize: () => ResizeState | null;
  setSelectionRect: (rect: Bounds | null) => void;
  setReparentTargetId: (id: NodeId | null) => void;
  cancel: () => void;
}

export const useTransientStore = create<TransientState>((set, get) => ({
  drag: null,
  resize: null,
  selectionRect: null,
  reparentTargetId: null,
  isIdle: true,
  startDrag: (drag) => set({ drag, isIdle: false }),
  updateDrag: (dx, dy) => {
    const drag = get().drag;
    if (drag) set({ drag: { ...drag, dx, dy } });
  },
  endDrag: () => {
    const drag = get().drag;
    set({ drag: null, isIdle: !get().resize && !get().selectionRect });
    return drag;
  },
  startResize: (resize) => set({ resize, isIdle: false }),
  updateResize: (dx, dy) => {
    const resize = get().resize;
    if (resize) set({ resize: { ...resize, dx, dy } });
  },
  endResize: () => {
    const resize = get().resize;
    set({ resize: null, isIdle: !get().drag && !get().selectionRect });
    return resize;
  },
  setSelectionRect: (selectionRect) => set({ selectionRect, isIdle: !selectionRect && !get().drag && !get().resize }),
  setReparentTargetId: (id) => set({ reparentTargetId: id }),
  cancel: () => set({ drag: null, resize: null, selectionRect: null, reparentTargetId: null, isIdle: true })
}));

