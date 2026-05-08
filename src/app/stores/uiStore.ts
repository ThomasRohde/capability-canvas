import { create } from "zustand";
import type { NodeId } from "../../domain/document/types";
import type { ExportFormat } from "../../features/import-export/types";

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasSizeState {
  w: number;
  h: number;
}

export interface SelectionNotice {
  message: string;
  createdAt: number;
}

export type ActiveDrawer = "settings" | "export" | "views" | null;

export const DEFAULT_OUTLINE_WIDTH = 260;
export const MIN_OUTLINE_WIDTH = 220;
export const MAX_OUTLINE_WIDTH = 520;

const OUTLINE_WIDTH_STORAGE_KEY = "capability-canvas.outlineWidth";

export function clampOutlineWidth(width: number) {
  return Math.min(
    MAX_OUTLINE_WIDTH,
    Math.max(MIN_OUTLINE_WIDTH, Math.round(width)),
  );
}

function readStoredOutlineWidth() {
  if (typeof localStorage === "undefined") return DEFAULT_OUTLINE_WIDTH;
  try {
    const raw = localStorage.getItem(OUTLINE_WIDTH_STORAGE_KEY);
    if (raw === null) return DEFAULT_OUTLINE_WIDTH;
    const stored = Number(raw);
    return Number.isFinite(stored)
      ? clampOutlineWidth(stored)
      : DEFAULT_OUTLINE_WIDTH;
  } catch {
    return DEFAULT_OUTLINE_WIDTH;
  }
}

function persistOutlineWidth(width: number) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(OUTLINE_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // UI persistence should never block core editor state changes.
  }
}

interface UiState {
  selectedNodeIds: NodeId[];
  viewport: ViewportState;
  canvasSize: CanvasSizeState;
  outlineOpen: boolean;
  outlineWidth: number;
  inspectorOpen: boolean;
  activeDrawer: ActiveDrawer;
  exportFormat: ExportFormat;
  inspectorTab: "inspector" | "layout" | "data";
  searchQuery: string;
  selectionNotice: SelectionNotice | null;
  setSelection: (ids: NodeId[]) => void;
  toggleSelection: (id: NodeId) => void;
  clearSelection: () => void;
  setViewport: (viewport: ViewportState) => void;
  setCanvasSize: (size: CanvasSizeState) => void;
  setOutlineOpen: (open: boolean) => void;
  toggleOutline: () => void;
  setOutlineWidth: (width: number) => void;
  setInspectorOpen: (open: boolean) => void;
  toggleInspector: () => void;
  setActiveDrawer: (drawer: ActiveDrawer) => void;
  setExportFormat: (format: ExportFormat) => void;
  setInspectorTab: (tab: UiState["inspectorTab"]) => void;
  setSearchQuery: (query: string) => void;
  showSelectionNotice: (message: string) => void;
  clearSelectionNotice: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  selectedNodeIds: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  canvasSize: { w: 1200, h: 800 },
  outlineOpen: true,
  outlineWidth: readStoredOutlineWidth(),
  inspectorOpen: true,
  activeDrawer: null,
  exportFormat: "json",
  inspectorTab: "inspector",
  searchQuery: "",
  selectionNotice: null,
  setSelection: (ids) => set({ selectedNodeIds: ids }),
  toggleSelection: (id) => {
    const existing = get().selectedNodeIds;
    set({
      selectedNodeIds: existing.includes(id)
        ? existing.filter((item) => item !== id)
        : [...existing, id],
    });
  },
  clearSelection: () => set({ selectedNodeIds: [] }),
  setViewport: (viewport) => set({ viewport }),
  setCanvasSize: (canvasSize) => set({ canvasSize }),
  setOutlineOpen: (open) => set({ outlineOpen: open }),
  toggleOutline: () => set({ outlineOpen: !get().outlineOpen }),
  setOutlineWidth: (width) => {
    const outlineWidth = clampOutlineWidth(width);
    persistOutlineWidth(outlineWidth);
    set({ outlineWidth });
  },
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  toggleInspector: () => set({ inspectorOpen: !get().inspectorOpen }),
  setActiveDrawer: (drawer) => set({ activeDrawer: drawer }),
  setExportFormat: (format) => set({ exportFormat: format }),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  showSelectionNotice: (message) =>
    set({ selectionNotice: { message, createdAt: Date.now() } }),
  clearSelectionNotice: () => set({ selectionNotice: null }),
}));
