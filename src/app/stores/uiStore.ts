import { create } from "zustand";
import type { NodeId } from "../../domain/document/types";
import {
  DEFAULT_EXPORT_FORMAT,
  isExportFormat,
  type ExportFormat,
} from "../exportFormats";

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

export interface LabelEditRequest {
  nodeId: NodeId;
  requestedAt: number;
}

export type ActiveDrawer = "settings" | "export" | "views" | null;

export const DEFAULT_OUTLINE_WIDTH = 260;
export const MIN_OUTLINE_WIDTH = 220;
export const MAX_OUTLINE_WIDTH = 520;

const OUTLINE_WIDTH_STORAGE_KEY = "capability-canvas.outlineWidth";
const OUTLINE_OPEN_STORAGE_KEY = "capability-canvas.outlineOpen";
const INSPECTOR_OPEN_STORAGE_KEY = "capability-canvas.inspectorOpen";
const EXPORT_FORMAT_STORAGE_KEY = "capability-canvas.exportFormat";

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

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function readStoredExportFormat() {
  if (typeof localStorage === "undefined") return DEFAULT_EXPORT_FORMAT;
  try {
    const raw = localStorage.getItem(EXPORT_FORMAT_STORAGE_KEY);
    return isExportFormat(raw) ? raw : DEFAULT_EXPORT_FORMAT;
  } catch {
    return DEFAULT_EXPORT_FORMAT;
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

function persistBoolean(key: string, value: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // UI persistence should never block core editor state changes.
  }
}

function persistExportFormat(format: ExportFormat) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(EXPORT_FORMAT_STORAGE_KEY, format);
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
  helpDialogOpen: boolean;
  exportFormat: ExportFormat;
  inspectorTab: "inspector" | "layout" | "data";
  searchQuery: string;
  selectionNotice: SelectionNotice | null;
  labelEditRequest: LabelEditRequest | null;
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
  setHelpDialogOpen: (open: boolean) => void;
  setExportFormat: (format: ExportFormat) => void;
  setInspectorTab: (tab: UiState["inspectorTab"]) => void;
  setSearchQuery: (query: string) => void;
  showSelectionNotice: (message: string) => void;
  clearSelectionNotice: () => void;
  requestLabelEdit: (nodeId: NodeId) => void;
  clearLabelEditRequest: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  selectedNodeIds: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  canvasSize: { w: 1200, h: 800 },
  outlineOpen: readStoredBoolean(OUTLINE_OPEN_STORAGE_KEY, true),
  outlineWidth: readStoredOutlineWidth(),
  inspectorOpen: readStoredBoolean(INSPECTOR_OPEN_STORAGE_KEY, true),
  activeDrawer: null,
  helpDialogOpen: false,
  exportFormat: readStoredExportFormat(),
  inspectorTab: "inspector",
  searchQuery: "",
  selectionNotice: null,
  labelEditRequest: null,
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
  setOutlineOpen: (open) => {
    persistBoolean(OUTLINE_OPEN_STORAGE_KEY, open);
    set({ outlineOpen: open });
  },
  toggleOutline: () => {
    const outlineOpen = !get().outlineOpen;
    persistBoolean(OUTLINE_OPEN_STORAGE_KEY, outlineOpen);
    set({ outlineOpen });
  },
  setOutlineWidth: (width) => {
    const outlineWidth = clampOutlineWidth(width);
    persistOutlineWidth(outlineWidth);
    set({ outlineWidth });
  },
  setInspectorOpen: (open) => {
    persistBoolean(INSPECTOR_OPEN_STORAGE_KEY, open);
    set({ inspectorOpen: open });
  },
  toggleInspector: () => {
    const inspectorOpen = !get().inspectorOpen;
    persistBoolean(INSPECTOR_OPEN_STORAGE_KEY, inspectorOpen);
    set({ inspectorOpen });
  },
  setActiveDrawer: (drawer) => set({ activeDrawer: drawer }),
  setHelpDialogOpen: (open) => set({ helpDialogOpen: open }),
  setExportFormat: (format) => {
    persistExportFormat(format);
    set({ exportFormat: format });
  },
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  showSelectionNotice: (message) =>
    set({ selectionNotice: { message, createdAt: Date.now() } }),
  clearSelectionNotice: () => set({ selectionNotice: null }),
  requestLabelEdit: (nodeId) =>
    set({ labelEditRequest: { nodeId, requestedAt: Date.now() } }),
  clearLabelEditRequest: () => set({ labelEditRequest: null }),
}));
