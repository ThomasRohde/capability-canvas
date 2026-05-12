export const DOCUMENT_SCHEMA = "capability-canvas.document";
export const DOCUMENT_VERSION = "1.2";
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
  | "teal"
  | "slate"
  | "stone"
  | "transparent";
export type ColorPalette = "default" | "darker";
export type LayoutMode = "uniform" | "flow" | "adaptive" | "balanced" | "free";
export type LayoutAspectRatioPreset =
  | "auto"
  | "16:9"
  | "4:3"
  | "1:1"
  | "custom";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutAspectRatioTarget {
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
  colorPalette: ColorPalette;
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
  layoutAspectRatioPreset: LayoutAspectRatioPreset;
  customLayoutAspectRatioWidth: number;
  customLayoutAspectRatioHeight: number;
}

export interface LayoutMetadata {
  mode: LayoutMode;
  isUserArranged: boolean;
  preservePositions: boolean;
  boundingBox: Bounds;
  aspectRatioFrame?: Bounds;
  aspectRatioTarget?: LayoutAspectRatioTarget;
}

export interface HeatmapState {
  enabled: boolean;
  showLegend: boolean;
  showValuePills: boolean;
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
  baseline?: {
    fullHash: string;
    layoutHash: string;
  };
  nodeStatesById: Record<NodeId, VisualNodeState>;
  viewport?: VisualViewport;
  layout: {
    mode: LayoutMode;
    boundingBox?: Bounds;
    aspectRatioFrame?: Bounds;
    aspectRatioTarget?: LayoutAspectRatioTarget;
    isUserArranged: boolean;
    preservePositions: boolean;
  };
  heatmap: {
    enabled: boolean;
    activeLensId?: string;
    showLegend: boolean;
    showValuePills: boolean;
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

export type HierarchyTraversalIssueCode =
  | "cycle"
  | "missing-parent"
  | "missing-child";

export interface HierarchyTraversalIssue {
  code: HierarchyTraversalIssueCode;
  nodeId: NodeId;
  parentId?: NodeId | null;
}

export interface HierarchyTraversalResult {
  ids: NodeId[];
  issues: HierarchyTraversalIssue[];
}

export interface HierarchyDepthResult {
  depths: Map<NodeId, number>;
  issues: HierarchyTraversalIssue[];
}

export interface SafeChildrenResult {
  childrenByParentId: Record<NodeId, NodeId[]>;
  issues: HierarchyTraversalIssue[];
}

interface DescendantTraversalOptions {
  includeRoot?: boolean;
  canvasOnly?: boolean;
  maxDepth?: number;
}

interface AncestorTraversalOptions {
  canvasOnly?: boolean;
}

interface DepthTraversalOptions {
  canvasOnly?: boolean;
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
  return collectCanvasRootIds(doc).ids;
}

export function collectCanvasRootIds(
  doc: CapabilityDocument,
): HierarchyTraversalResult {
  const roots: NodeId[] = [];
  const issues: HierarchyTraversalIssue[] = [];
  const emitted = new Set<NodeId>();
  const active = new Set<NodeId>();
  const stack: Array<{
    parentId: NodeId | null;
    parentIsOnCanvas: boolean;
    childIds: NodeId[];
    index: number;
  }> = [
    {
      parentId: null,
      parentIsOnCanvas: false,
      childIds: childrenOf(doc, null),
      index: 0,
    },
  ];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.index >= frame.childIds.length) {
      if (frame.parentId) active.delete(frame.parentId);
      stack.pop();
      continue;
    }

    const childId = frame.childIds[frame.index++]!;
    const child = doc.nodesById[childId];
    if (!child) {
      pushTraversalIssue(issues, {
        code: "missing-child",
        nodeId: childId,
        parentId: frame.parentId,
      });
      continue;
    }
    if (active.has(childId)) {
      pushTraversalIssue(issues, {
        code: "cycle",
        nodeId: childId,
        parentId: frame.parentId,
      });
      continue;
    }

    const childIsOnCanvas = isNodeOnCanvas(child);
    if (childIsOnCanvas && !frame.parentIsOnCanvas && !emitted.has(childId)) {
      roots.push(childId);
      emitted.add(childId);
    }

    active.add(childId);
    stack.push({
      parentId: childId,
      parentIsOnCanvas: childIsOnCanvas,
      childIds: childrenOf(doc, childId),
      index: 0,
    });
  }

  return { ids: roots, issues };
}

export function collectDescendantIds(
  doc: CapabilityDocument,
  nodeId: NodeId,
  options: DescendantTraversalOptions = {},
): HierarchyTraversalResult {
  const root = doc.nodesById[nodeId];
  if (!root) {
    return {
      ids: [],
      issues: [{ code: "missing-child", nodeId }],
    };
  }

  if (options.canvasOnly && !isNodeOnCanvas(root)) {
    return { ids: [], issues: [] };
  }

  const ids: NodeId[] = [];
  const issues: HierarchyTraversalIssue[] = [];
  const emitted = new Set<NodeId>();
  const active = new Set<NodeId>([nodeId]);

  if (options.includeRoot) {
    ids.push(nodeId);
    emitted.add(nodeId);
  }

  const stack: Array<{
    id: NodeId;
    depth: number;
    childIds: NodeId[];
    index: number;
  }> = [
    {
      id: nodeId,
      depth: 0,
      childIds: childrenOf(doc, nodeId),
      index: 0,
    },
  ];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.index >= frame.childIds.length) {
      active.delete(frame.id);
      stack.pop();
      continue;
    }

    const childId = frame.childIds[frame.index++]!;
    const child = doc.nodesById[childId];
    if (!child) {
      pushTraversalIssue(issues, {
        code: "missing-child",
        nodeId: childId,
        parentId: frame.id,
      });
      continue;
    }
    if (options.canvasOnly && !isNodeOnCanvas(child)) continue;
    if (active.has(childId)) {
      pushTraversalIssue(issues, {
        code: "cycle",
        nodeId: childId,
        parentId: frame.id,
      });
      continue;
    }
    if (emitted.has(childId)) continue;

    const depth = frame.depth + 1;
    if (options.maxDepth !== undefined && depth > options.maxDepth) continue;

    ids.push(childId);
    emitted.add(childId);
    active.add(childId);
    stack.push({
      id: childId,
      depth,
      childIds: childrenOf(doc, childId),
      index: 0,
    });
  }

  return { ids, issues };
}

export function collectAncestorIds(
  doc: CapabilityDocument,
  nodeId: NodeId,
  options: AncestorTraversalOptions = {},
): HierarchyTraversalResult {
  const ids: NodeId[] = [];
  const issues: HierarchyTraversalIssue[] = [];
  const active = new Set<NodeId>();
  let current = doc.nodesById[nodeId];

  if (!current) {
    return {
      ids,
      issues: [{ code: "missing-child", nodeId }],
    };
  }

  active.add(current.id);
  while (current.parentId) {
    const parentId = current.parentId;
    if (active.has(parentId)) {
      pushTraversalIssue(issues, {
        code: "cycle",
        nodeId: parentId,
        parentId: current.id,
      });
      break;
    }

    const parent = doc.nodesById[parentId];
    if (!parent) {
      pushTraversalIssue(issues, {
        code: "missing-parent",
        nodeId: current.id,
        parentId,
      });
      break;
    }

    active.add(parentId);
    if (!options.canvasOnly || isNodeOnCanvas(parent)) ids.push(parentId);
    current = parent;
  }

  return { ids, issues };
}

export function isHierarchyAncestorOf(
  doc: CapabilityDocument,
  ancestorId: NodeId,
  nodeId: NodeId,
): boolean {
  return collectAncestorIds(doc, nodeId).ids.includes(ancestorId);
}

export function computeHierarchyDepths(
  doc: CapabilityDocument,
  rootIds: NodeId[],
  options: DepthTraversalOptions = {},
): HierarchyDepthResult {
  const depths = new Map<NodeId, number>();
  const issues: HierarchyTraversalIssue[] = [];
  const emitted = new Set<NodeId>();

  for (const rootId of rootIds) {
    const root = doc.nodesById[rootId];
    if (!root) {
      pushTraversalIssue(issues, {
        code: "missing-child",
        nodeId: rootId,
        parentId: null,
      });
      continue;
    }
    if (options.canvasOnly && !isNodeOnCanvas(root)) continue;
    if (emitted.has(rootId)) continue;

    const active = new Set<NodeId>([rootId]);
    emitted.add(rootId);
    depths.set(rootId, 0);
    const stack: Array<{
      id: NodeId;
      depth: number;
      childIds: NodeId[];
      index: number;
    }> = [
      {
        id: rootId,
        depth: 0,
        childIds: childrenOf(doc, rootId),
        index: 0,
      },
    ];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.index >= frame.childIds.length) {
        active.delete(frame.id);
        stack.pop();
        continue;
      }

      const childId = frame.childIds[frame.index++]!;
      const child = doc.nodesById[childId];
      if (!child) {
        pushTraversalIssue(issues, {
          code: "missing-child",
          nodeId: childId,
          parentId: frame.id,
        });
        continue;
      }
      if (options.canvasOnly && !isNodeOnCanvas(child)) continue;
      if (active.has(childId)) {
        pushTraversalIssue(issues, {
          code: "cycle",
          nodeId: childId,
          parentId: frame.id,
        });
        continue;
      }
      if (emitted.has(childId)) continue;

      const depth = frame.depth + 1;
      emitted.add(childId);
      depths.set(childId, depth);
      active.add(childId);
      stack.push({
        id: childId,
        depth,
        childIds: childrenOf(doc, childId),
        index: 0,
      });
    }
  }

  return { depths, issues };
}

export function buildSafeChildrenByParentId(
  doc: CapabilityDocument,
  rootIds = childrenOf(doc, null),
): SafeChildrenResult {
  const childrenByParentId: Record<NodeId, NodeId[]> = { [ROOT_PARENT_ID]: [] };
  const issues: HierarchyTraversalIssue[] = [];
  const emitted = new Set<NodeId>();

  for (const rootId of rootIds) {
    const root = doc.nodesById[rootId];
    if (!root) {
      pushTraversalIssue(issues, {
        code: "missing-child",
        nodeId: rootId,
        parentId: null,
      });
      continue;
    }
    if (emitted.has(rootId)) continue;

    childrenByParentId[ROOT_PARENT_ID]!.push(rootId);
    childrenByParentId[rootId] ??= [];
    emitted.add(rootId);
    const active = new Set<NodeId>([rootId]);
    const stack: Array<{ id: NodeId; childIds: NodeId[]; index: number }> = [
      { id: rootId, childIds: childrenOf(doc, rootId), index: 0 },
    ];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.index >= frame.childIds.length) {
        active.delete(frame.id);
        stack.pop();
        continue;
      }

      const childId = frame.childIds[frame.index++]!;
      const child = doc.nodesById[childId];
      if (!child) {
        pushTraversalIssue(issues, {
          code: "missing-child",
          nodeId: childId,
          parentId: frame.id,
        });
        continue;
      }
      if (active.has(childId)) {
        pushTraversalIssue(issues, {
          code: "cycle",
          nodeId: childId,
          parentId: frame.id,
        });
        continue;
      }
      if (emitted.has(childId)) continue;

      childrenByParentId[frame.id] ??= [];
      childrenByParentId[frame.id]!.push(childId);
      childrenByParentId[childId] ??= [];
      emitted.add(childId);
      active.add(childId);
      stack.push({
        id: childId,
        childIds: childrenOf(doc, childId),
        index: 0,
      });
    }
  }

  return { childrenByParentId, issues };
}

export function collectHierarchyIssues(
  doc: CapabilityDocument,
): HierarchyTraversalIssue[] {
  const issues: HierarchyTraversalIssue[] = [];
  const visited = new Set<NodeId>();
  const startIds = [...childrenOf(doc, null), ...Object.keys(doc.nodesById)];

  for (const startId of startIds) {
    if (visited.has(startId)) continue;
    const start = doc.nodesById[startId];
    if (!start) {
      pushTraversalIssue(issues, {
        code: "missing-child",
        nodeId: startId,
        parentId: null,
      });
      continue;
    }

    const active = new Set<NodeId>([startId]);
    const stack: Array<{ id: NodeId; childIds: NodeId[]; index: number }> = [
      { id: startId, childIds: childrenOf(doc, startId), index: 0 },
    ];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.index >= frame.childIds.length) {
        active.delete(frame.id);
        visited.add(frame.id);
        stack.pop();
        continue;
      }

      const childId = frame.childIds[frame.index++]!;
      const child = doc.nodesById[childId];
      if (!child) {
        pushTraversalIssue(issues, {
          code: "missing-child",
          nodeId: childId,
          parentId: frame.id,
        });
        continue;
      }
      if (active.has(childId)) {
        pushTraversalIssue(issues, {
          code: "cycle",
          nodeId: childId,
          parentId: frame.id,
        });
        continue;
      }
      if (visited.has(childId)) continue;

      active.add(childId);
      stack.push({
        id: childId,
        childIds: childrenOf(doc, childId),
        index: 0,
      });
    }
  }

  return issues;
}

export function canvasDescendantsOf(
  doc: CapabilityDocument,
  nodeId: NodeId,
): NodeId[] {
  return collectDescendantIds(doc, nodeId, { canvasOnly: true }).ids;
}

export function subtreeNodeIds(
  doc: CapabilityDocument,
  nodeId: NodeId,
): NodeId[] {
  return collectDescendantIds(doc, nodeId, { includeRoot: true }).ids;
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

function pushTraversalIssue(
  issues: HierarchyTraversalIssue[],
  issue: HierarchyTraversalIssue,
) {
  if (
    issues.some(
      (existing) =>
        existing.code === issue.code &&
        existing.nodeId === issue.nodeId &&
        existing.parentId === issue.parentId,
    )
  ) {
    return;
  }
  issues.push(issue);
}
