export const DOCUMENT_SCHEMA = "capability-canvas.document";
export const DOCUMENT_VERSION = "1.1";
export const ROOT_PARENT_ID = "__root__";

export type NodeId = string;
export type VisualViewId = string;
export type NodeType = "root" | "parent" | "leaf" | "text";
export type CapabilityColor =
  | "mint"
  | "sky"
  | "coral"
  | "amber"
  | "lavender"
  | "peach"
  | "teal";
export type LayoutMode = "uniform" | "flow" | "adaptive" | "free";

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
  colorOverride?: CapabilityColor;
  description?: string;
  metadata: Record<string, unknown>;
  layoutPreferences?: Partial<LayoutPreferences>;
  isManualPositioningEnabled: boolean;
  isLockedAsIs: boolean;
  isTextLabel: boolean;
  isOnCanvas: boolean;
  textStyle?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    align?: "left" | "center" | "right";
  };
  heatmapValue?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DiagramSettings {
  gridEnabled: boolean;
  gridSize: number;
  resizeSnapToGrid: boolean;
  fixedLeafWidth: number;
  fixedLeafHeight: number;
  leafColor: CapabilityColor;
  defaultParentWidth: number;
  defaultParentHeight: number;
  containerPaddingTop: number;
  containerPaddingRight: number;
  containerPaddingBottom: number;
  containerPaddingLeft: number;
  containerTitleHeight: number;
  containerLabelOffsetTop: number;
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
  palette: "green-yellow-red" | "mint-amber-coral";
  fallbackColor: CapabilityColor;
}

export type LegendPosition =
  | "top-right"
  | "bottom-right"
  | "bottom-left"
  | "top-left"
  | "custom";

export interface VisualNodeState {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  isOnCanvas?: boolean;
  isCollapsed?: boolean;
  labelOverride?: string;
  colorOverride?: CapabilityColor;
  textStyleOverride?: CapabilityNode["textStyle"];
  lockedForView?: boolean;
  isManualPositioningEnabled?: boolean;
  [key: string]: unknown;
}

export interface VisualViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface VisualView {
  id: VisualViewId;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  templateId?: string;
  templateContext?: {
    rootId?: NodeId;
  };
  nodeStatesById: Record<NodeId, VisualNodeState>;
  viewport?: VisualViewport;
  layout: {
    mode: LayoutMode;
    boundingBox?: Bounds;
    preservePositions: boolean;
  };
  heatmap: {
    enabled: boolean;
    activeLensId?: string;
    showLegend: boolean;
    legendPosition?: LegendPosition;
    legendBounds?: Bounds;
  };
  export: {
    pagePreset?: string;
    showTitle?: boolean;
    showSubtitle?: boolean;
    showFooter?: boolean;
    includeGrid?: boolean;
  };
  [key: string]: unknown;
}

export interface VisualWorkspace {
  activeViewId: VisualViewId;
  defaultViewId: VisualViewId;
  viewOrder: VisualViewId[];
  viewsById: Record<VisualViewId, VisualView>;
  [key: string]: unknown;
}

export interface CapabilityDocument {
  schema: typeof DOCUMENT_SCHEMA;
  version: typeof DOCUMENT_VERSION;
  nodesById: Record<NodeId, CapabilityNode>;
  childrenByParentId: Record<NodeId, NodeId[]>;
  settings: DiagramSettings;
  layout: LayoutMetadata;
  heatmap: HeatmapState;
  visual: VisualWorkspace;
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
  visual?: VisualWorkspace;
  timestamp: number;
  title?: string;
}

export function rootChildren(doc: CapabilityDocument): NodeId[] {
  return doc.childrenByParentId[ROOT_PARENT_ID] ?? [];
}

export function childrenOf(
  doc: CapabilityDocument,
  parentId: NodeId | null,
): NodeId[] {
  return doc.childrenByParentId[parentId ?? ROOT_PARENT_ID] ?? [];
}

export function hasChildren(doc: CapabilityDocument, nodeId: NodeId): boolean {
  return childrenOf(doc, nodeId).length > 0;
}

export function isNodeOnCanvas(node: CapabilityNode | undefined): boolean {
  return node?.isOnCanvas ?? true;
}

export function canvasChildrenOf(
  doc: CapabilityDocument,
  parentId: NodeId | null,
): NodeId[] {
  return childrenOf(doc, parentId).filter((id) =>
    isNodeOnCanvas(doc.nodesById[id]),
  );
}

export function canvasRootChildren(doc: CapabilityDocument): NodeId[] {
  const roots: NodeId[] = [];
  const visit = (parentId: NodeId | null, parentIsOnCanvas: boolean) => {
    for (const childId of childrenOf(doc, parentId)) {
      const child = doc.nodesById[childId];
      if (!child) continue;
      const childIsOnCanvas = isNodeOnCanvas(child);
      if (childIsOnCanvas && !parentIsOnCanvas) roots.push(childId);
      visit(childId, childIsOnCanvas);
    }
  };
  visit(null, false);
  return roots;
}

export function canvasDescendantsOf(
  doc: CapabilityDocument,
  nodeId: NodeId,
): NodeId[] {
  const out: NodeId[] = [];
  const walk = (id: NodeId) => {
    for (const childId of canvasChildrenOf(doc, id)) {
      out.push(childId);
      walk(childId);
    }
  };
  walk(nodeId);
  return out;
}

export function subtreeNodeIds(
  doc: CapabilityDocument,
  nodeId: NodeId,
): NodeId[] {
  if (!doc.nodesById[nodeId]) return [];
  const out: NodeId[] = [nodeId];
  const walk = (id: NodeId) => {
    for (const childId of childrenOf(doc, id)) {
      if (!doc.nodesById[childId]) continue;
      out.push(childId);
      walk(childId);
    }
  };
  walk(nodeId);
  return out;
}

export function hasCanvasChildren(
  doc: CapabilityDocument,
  nodeId: NodeId,
): boolean {
  return canvasChildrenOf(doc, nodeId).length > 0;
}

export function hasCanvasNodes(doc: CapabilityDocument): boolean {
  return Object.values(doc.nodesById).some(isNodeOnCanvas);
}

export function now(): number {
  return Date.now();
}
