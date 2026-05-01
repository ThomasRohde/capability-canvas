import { create } from 'zustand';
import type { NodeId } from '../../domain/document/types';
import type { ExportFormat } from '../../features/import-export/types';

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export type ActiveDrawer = 'settings' | 'export' | null;

interface UiState {
  selectedNodeIds: NodeId[];
  viewport: ViewportState;
  outlineOpen: boolean;
  inspectorOpen: boolean;
  activeDrawer: ActiveDrawer;
  exportFormat: ExportFormat;
  inspectorTab: 'inspector' | 'layout' | 'data';
  searchQuery: string;
  setSelection: (ids: NodeId[]) => void;
  toggleSelection: (id: NodeId) => void;
  clearSelection: () => void;
  setViewport: (viewport: ViewportState) => void;
  setOutlineOpen: (open: boolean) => void;
  toggleOutline: () => void;
  setInspectorOpen: (open: boolean) => void;
  toggleInspector: () => void;
  setActiveDrawer: (drawer: ActiveDrawer) => void;
  setExportFormat: (format: ExportFormat) => void;
  setInspectorTab: (tab: UiState['inspectorTab']) => void;
  setSearchQuery: (query: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  selectedNodeIds: ['digital-onboarding'],
  viewport: { x: 0, y: 0, zoom: 1 },
  outlineOpen: true,
  inspectorOpen: true,
  activeDrawer: null,
  exportFormat: 'json',
  inspectorTab: 'inspector',
  searchQuery: '',
  setSelection: (ids) => set({ selectedNodeIds: ids }),
  toggleSelection: (id) => {
    const existing = get().selectedNodeIds;
    set({ selectedNodeIds: existing.includes(id) ? existing.filter((item) => item !== id) : [...existing, id] });
  },
  clearSelection: () => set({ selectedNodeIds: [] }),
  setViewport: (viewport) => set({ viewport }),
  setOutlineOpen: (open) => set({ outlineOpen: open }),
  toggleOutline: () => set({ outlineOpen: !get().outlineOpen }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  toggleInspector: () => set({ inspectorOpen: !get().inspectorOpen }),
  setActiveDrawer: (drawer) => set({ activeDrawer: drawer }),
  setExportFormat: (format) => set({ exportFormat: format }),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query })
}));
