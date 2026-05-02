export const DOCUMENT_SCHEMA = 'capability-canvas.document';
export const DOCUMENT_VERSION = '1.0';
export const ROOT_PARENT_ID = '__root__';

export type NodeId = string;
export type NodeType = 'root' | 'parent' | 'leaf' | 'text';
export type CapabilityColor = 'mint' | 'sky' | 'coral' | 'amber' | 'lavender' | 'peach' | 'teal';
export type LayoutMode = 'uniform' | 'flow' | 'adaptive' | 'free';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutPreferences {
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  gapX: number;
  gapY: number;
  mode?: LayoutMode;
}

export interface CapabilityNode extends Bounds {
  id: NodeId;
  parentId: NodeId | null;
  label: string;
  type: NodeType;
  color: CapabilityColor;
  description?: string;
  metadata: Record<string, unknown>;
  layoutPreferences?: Partial<LayoutPreferences>;
  isManualPositioningEnabled: boolean;
  isLockedAsIs: boolean;
  isTextLabel: boolean;
  textStyle?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    align?: 'left' | 'center' | 'right';
  };
  heatmapValue?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DiagramSettings {
  gridEnabled: boolean;
  fixedLeafWidth: number;
  fixedLeafHeight: number;
  defaultParentWidth: number;
  defaultParentHeight: number;
  containerPaddingTop: number;
  containerPaddingRight: number;
  containerPaddingBottom: number;
  containerPaddingLeft: number;
  containerTitleHeight: number;
  childGapX: number;
  childGapY: number;
  fontFamily: string;
  borderRadius: number;
  layoutMode: LayoutMode;
}

export interface LayoutMetadata {
  mode: LayoutMode;
  isUserArranged: boolean;
  preservePositions: boolean;
  boundingBox: Bounds;
}

export interface HeatmapState {
  enabled: boolean;
  showLegend: boolean;
  palette: 'green-yellow-red' | 'mint-amber-coral';
  fallbackColor: CapabilityColor;
}

export interface CapabilityDocument {
  schema: typeof DOCUMENT_SCHEMA;
  version: typeof DOCUMENT_VERSION;
  nodesById: Record<NodeId, CapabilityNode>;
  childrenByParentId: Record<NodeId, NodeId[]>;
  settings: DiagramSettings;
  layout: LayoutMetadata;
  heatmap: HeatmapState;
  timestamp: number;
  title: string;
}

export interface WireDocument {
  schema: string;
  version: string;
  nodes: CapabilityNode[];
  settings: DiagramSettings;
  layout: LayoutMetadata;
  heatmap: HeatmapState;
  timestamp: number;
  title?: string;
}

export function rootChildren(doc: CapabilityDocument): NodeId[] {
  return doc.childrenByParentId[ROOT_PARENT_ID] ?? [];
}

export function childrenOf(doc: CapabilityDocument, parentId: NodeId | null): NodeId[] {
  return doc.childrenByParentId[parentId ?? ROOT_PARENT_ID] ?? [];
}

export function hasChildren(doc: CapabilityDocument, nodeId: NodeId): boolean {
  return childrenOf(doc, nodeId).length > 0;
}

export function now(): number {
  return Date.now();
}
