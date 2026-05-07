import {
  DOCUMENT_VERSION,
  canvasChildrenOf,
  isNodeOnCanvas,
  now,
  type Bounds,
  type CapabilityDocument,
  type CapabilityNode,
  type HeatmapState,
  type LayoutMetadata,
  type NodeId,
  type VisualNodeState,
  type VisualView,
  type VisualViewId,
  type VisualViewport,
  type VisualWorkspace,
} from "../document/types";

export const DEFAULT_VIEW_ID = "view-default";

export interface VisualWorkspaceDiagnostics {
  code: string;
  message: string;
  nodeId?: string;
}

interface VisualViewInput {
  id?: VisualViewId;
  name?: string;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
  templateId?: string;
  templateContext?: VisualView["templateContext"];
  nodeStatesById?: Record<NodeId, VisualNodeState>;
  viewport?: VisualViewport;
  layout?: Partial<VisualView["layout"]>;
  heatmap?: Partial<VisualView["heatmap"]>;
  export?: Partial<VisualView["export"]>;
  [key: string]: unknown;
}

interface VisualWorkspaceInput {
  activeViewId?: VisualViewId;
  defaultViewId?: VisualViewId;
  viewOrder?: VisualViewId[];
  viewsById?: Record<VisualViewId, VisualViewInput>;
  [key: string]: unknown;
}

export function createVisualWorkspaceFromDocument(
  doc: CapabilityDocument,
  name = "Default view",
): VisualWorkspace {
  const timestamp = now();
  const view = createVisualViewFromDocument(doc, {
    id: DEFAULT_VIEW_ID,
    name,
    templateId: "full-model-default@1",
    timestamp,
  });
  return {
    activeViewId: view.id,
    defaultViewId: view.id,
    viewOrder: [view.id],
    viewsById: { [view.id]: view },
  };
}

export function createVisualViewFromDocument(
  doc: CapabilityDocument,
  options: {
    id: VisualViewId;
    name: string;
    description?: string;
    templateId?: string;
    timestamp?: number;
    templateContext?: VisualView["templateContext"];
    visibleNodeIds?: Set<NodeId>;
    collapsedNodeIds?: Set<NodeId>;
    layoutMode?: VisualView["layout"]["mode"];
    heatmap?: Partial<VisualView["heatmap"]>;
    exportSettings?: Partial<VisualView["export"]>;
  },
): VisualView {
  const timestamp = options.timestamp ?? now();
  const nodeStatesById: Record<NodeId, VisualNodeState> = {};
  for (const node of Object.values(doc.nodesById)) {
    nodeStatesById[node.id] = visualStateFromNode(node, {
      isOnCanvas: options.visibleNodeIds
        ? options.visibleNodeIds.has(node.id)
        : isNodeOnCanvas(node),
      isCollapsed: options.collapsedNodeIds?.has(node.id) || undefined,
    });
  }
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    createdAt: timestamp,
    updatedAt: timestamp,
    templateId: options.templateId,
    templateContext: cloneTemplateContext(options.templateContext),
    nodeStatesById,
    viewport: { x: 0, y: 0, zoom: 1 },
    layout: {
      mode: options.layoutMode ?? doc.layout.mode ?? doc.settings.layoutMode,
      boundingBox: computeVisualBounds(doc, nodeStatesById),
      isUserArranged: doc.layout.isUserArranged,
      preservePositions: doc.layout.preservePositions,
    },
    heatmap: {
      enabled: options.heatmap?.enabled ?? doc.heatmap.enabled,
      activeLensId: options.heatmap?.activeLensId,
      showLegend: options.heatmap?.showLegend ?? doc.heatmap.showLegend,
      legendPosition: options.heatmap?.legendPosition,
      legendBounds: cloneBounds(options.heatmap?.legendBounds),
    },
    export: {
      pagePreset: options.exportSettings?.pagePreset,
      showTitle: options.exportSettings?.showTitle,
      showSubtitle: options.exportSettings?.showSubtitle,
      showFooter: options.exportSettings?.showFooter,
      includeGrid: options.exportSettings?.includeGrid,
    },
  };
}

export function normalizeVisualWorkspace(
  doc: CapabilityDocument,
  visual: VisualWorkspaceInput | undefined,
): {
  visual: VisualWorkspace;
  diagnostics: VisualWorkspaceDiagnostics[];
} {
  if (!visual || Object.keys(visual.viewsById ?? {}).length === 0) {
    return { visual: createVisualWorkspaceFromDocument(doc), diagnostics: [] };
  }
  if (
    visual.viewOrder?.length === 1 &&
    visual.viewOrder[0] === DEFAULT_VIEW_ID &&
    Object.keys(visual.viewsById?.[DEFAULT_VIEW_ID]?.nodeStatesById ?? {})
      .length === 0 &&
    Object.keys(doc.nodesById).length > 0
  ) {
    return { visual: createVisualWorkspaceFromDocument(doc), diagnostics: [] };
  }

  const diagnostics: VisualWorkspaceDiagnostics[] = [];
  const nodeIds = new Set(Object.keys(doc.nodesById));
  const viewsById: Record<VisualViewId, VisualView> = {};

  for (const [viewId, rawView] of Object.entries(visual.viewsById ?? {})) {
    const nodeStatesById: Record<NodeId, VisualNodeState> = {};
    for (const [nodeId, state] of Object.entries(
      rawView.nodeStatesById ?? {},
    )) {
      if (!nodeIds.has(nodeId)) {
        diagnostics.push({
          code: "stale-view-node-reference",
          message: `View "${rawView.name || viewId}" referenced missing node ${nodeId}; the visual override was ignored.`,
          nodeId,
        });
        continue;
      }
      nodeStatesById[nodeId] = cloneVisualNodeState(state);
    }

    viewsById[viewId] = {
      ...rawView,
      id: rawView.id || viewId,
      name: rawView.name?.trim() || "Untitled view",
      createdAt: finiteOrNow(rawView.createdAt),
      updatedAt: finiteOrNow(rawView.updatedAt),
      templateContext: cloneTemplateContext(rawView.templateContext),
      nodeStatesById,
      viewport: cloneViewport(rawView.viewport),
      layout: {
        ...rawView.layout,
        mode: rawView.layout?.mode ?? doc.layout.mode,
        boundingBox: cloneBounds(rawView.layout?.boundingBox),
        isUserArranged:
          rawView.layout?.isUserArranged ?? doc.layout.isUserArranged,
        preservePositions:
          rawView.layout?.preservePositions ?? doc.layout.preservePositions,
      },
      heatmap: {
        ...rawView.heatmap,
        enabled: rawView.heatmap?.enabled ?? doc.heatmap.enabled,
        showLegend: rawView.heatmap?.showLegend ?? doc.heatmap.showLegend,
        legendBounds: cloneBounds(rawView.heatmap?.legendBounds),
      },
      export: { ...(rawView.export ?? {}) },
    };
  }

  const order = (visual.viewOrder ?? []).filter((id) => viewsById[id]);
  for (const viewId of Object.keys(viewsById)) {
    if (!order.includes(viewId)) order.push(viewId);
  }
  const firstViewId = order[0] ?? DEFAULT_VIEW_ID;
  if (!viewsById[firstViewId]) {
    const fallback = createVisualWorkspaceFromDocument(doc);
    return { visual: fallback, diagnostics };
  }

  const activeViewId = visual.activeViewId && viewsById[visual.activeViewId]
    ? visual.activeViewId
    : firstViewId;
  const defaultViewId = visual.defaultViewId && viewsById[visual.defaultViewId]
    ? visual.defaultViewId
    : activeViewId;

  return {
    visual: {
      ...visual,
      activeViewId,
      defaultViewId,
      viewOrder: order,
      viewsById,
    },
    diagnostics,
  };
}

export function reconcileVisualWorkspaceWithNodes(
  before: CapabilityDocument,
  after: CapabilityDocument,
): CapabilityDocument {
  const beforeIds = new Set(Object.keys(before.nodesById));
  const afterIds = new Set(Object.keys(after.nodesById));
  const activeViewId = after.visual.activeViewId;
  let changed = false;
  const visual = cloneVisualWorkspace(after.visual);

  for (const view of Object.values(visual.viewsById)) {
    for (const nodeId of Object.keys(view.nodeStatesById)) {
      if (afterIds.has(nodeId)) continue;
      delete view.nodeStatesById[nodeId];
      view.updatedAt = now();
      changed = true;
    }
    for (const nodeId of afterIds) {
      if (beforeIds.has(nodeId) || view.nodeStatesById[nodeId]) continue;
      const node = after.nodesById[nodeId];
      if (!node) continue;
      view.nodeStatesById[nodeId] = visualStateFromNode(node, {
        isOnCanvas: view.id === activeViewId ? isNodeOnCanvas(node) : false,
      });
      view.updatedAt = now();
      changed = true;
    }
    if (changed) {
      view.layout = {
        ...view.layout,
        boundingBox: computeVisualBounds(after, view.nodeStatesById),
      };
    }
  }

  const activeView = visual.viewsById[activeViewId];
  if (activeView) {
    const nextLayout = {
      ...activeView.layout,
      mode: after.layout.mode,
      isUserArranged: after.layout.isUserArranged,
      preservePositions: after.layout.preservePositions,
      boundingBox: computeVisualBounds(after, activeView.nodeStatesById),
    };
    if (
      activeView.layout.mode !== nextLayout.mode ||
      activeView.layout.isUserArranged !== nextLayout.isUserArranged ||
      activeView.layout.preservePositions !== nextLayout.preservePositions ||
      !sameBounds(activeView.layout.boundingBox, nextLayout.boundingBox)
    ) {
      activeView.layout = nextLayout;
      activeView.updatedAt = now();
      changed = true;
    }
  }

  return changed ? materializeActiveViewMetadata({ ...after, visual }) : after;
}

export function cloneVisualWorkspace(
  visual: VisualWorkspace,
): VisualWorkspace {
  return {
    ...visual,
    viewOrder: [...visual.viewOrder],
    viewsById: Object.fromEntries(
      Object.entries(visual.viewsById).map(([id, view]) => [
        id,
        cloneVisualView(view),
      ]),
    ),
  };
}

export function cloneVisualView(view: VisualView): VisualView {
  return {
    ...view,
    baseline: view.baseline ? { ...view.baseline } : undefined,
    templateContext: cloneTemplateContext(view.templateContext),
    nodeStatesById: Object.fromEntries(
      Object.entries(view.nodeStatesById).map(([id, state]) => [
        id,
        cloneVisualNodeState(state),
      ]),
    ),
    viewport: cloneViewport(view.viewport),
    layout: {
      ...view.layout,
      boundingBox: cloneBounds(view.layout.boundingBox),
    },
    heatmap: {
      ...view.heatmap,
      legendBounds: cloneBounds(view.heatmap.legendBounds),
    },
    export: { ...view.export },
  };
}

export function cloneVisualNodeState(
  state: VisualNodeState,
): VisualNodeState {
  return {
    ...state,
    textStyleOverride:
      state.textStyleOverride && typeof state.textStyleOverride === "object"
        ? { ...state.textStyleOverride }
        : state.textStyleOverride,
  };
}

export function activeVisualView(doc: CapabilityDocument): VisualView {
  return (
    doc.visual.viewsById[doc.visual.activeViewId] ??
    doc.visual.viewsById[doc.visual.defaultViewId] ??
    doc.visual.viewsById[doc.visual.viewOrder[0]!]!
  );
}

export function resolveVisualDocument(
  doc: CapabilityDocument,
  viewId = doc.visual.activeViewId,
): CapabilityDocument {
  const view =
    doc.visual.viewsById[viewId] ??
    doc.visual.viewsById[doc.visual.defaultViewId] ??
    activeVisualView(doc);
  const nodesById: CapabilityDocument["nodesById"] = {};

  for (const [nodeId, node] of Object.entries(doc.nodesById)) {
    const state = view.nodeStatesById[nodeId];
    nodesById[nodeId] = resolveVisualNode(node, state);
  }

  const collapsed = new Set(
    Object.entries(view.nodeStatesById)
      .filter(([, state]) => state.isCollapsed)
      .map(([nodeId]) => nodeId),
  );
  const childrenByParentId = Object.fromEntries(
    Object.entries(doc.childrenByParentId).map(([parentId, childIds]) => [
      parentId,
      [...childIds],
    ]),
  );
  if (collapsed.size > 0) {
    for (const node of Object.values(nodesById)) {
      if (hasCollapsedAncestor(doc, node.id, collapsed)) {
        nodesById[node.id] = { ...node, isOnCanvas: false };
      }
    }
    for (const nodeId of collapsed) childrenByParentId[nodeId] = [];
  }

  materializeCanvasLeafTypes({
    ...doc,
    nodesById,
    childrenByParentId,
  });
  materializeEffectiveColors(
    {
      ...doc,
      nodesById,
      childrenByParentId,
    },
    view,
  );

  const layout = resolveViewLayout(doc.layout, view);
  const heatmap = resolveViewHeatmap(doc.heatmap, view);
  return {
    ...doc,
    version: DOCUMENT_VERSION,
    nodesById,
    childrenByParentId,
    settings: { ...doc.settings, layoutMode: layout.mode },
    layout,
    heatmap,
    visual: cloneVisualWorkspace(doc.visual),
  };
}

export function applyResolvedVisualDocument(
  base: CapabilityDocument,
  resolved: CapabilityDocument,
  viewId = base.visual.activeViewId,
): CapabilityDocument {
  const visual = cloneVisualWorkspace(base.visual);
  const view = visual.viewsById[viewId];
  if (!view) return base;
  const collapsed = collapsedNodeIds(view);

  for (const [nodeId, baseNode] of Object.entries(base.nodesById)) {
    const resolvedNode = resolved.nodesById[nodeId];
    if (!resolvedNode) continue;
    if (hasCollapsedAncestor(base, nodeId, collapsed)) {
      if (view.nodeStatesById[nodeId]) {
        view.nodeStatesById[nodeId] = cloneVisualNodeState(
          view.nodeStatesById[nodeId],
        );
      }
      continue;
    }
    const previous = view.nodeStatesById[nodeId] ?? {};
    view.nodeStatesById[nodeId] = {
      ...previous,
      x: resolvedNode.x,
      y: resolvedNode.y,
      w: resolvedNode.w,
      h: resolvedNode.h,
      isOnCanvas: resolvedNode.isOnCanvas,
      lockedForView: resolvedNode.isLockedAsIs,
      isManualPositioningEnabled: resolvedNode.isManualPositioningEnabled,
      colorOverride: previous.colorOverride,
      labelOverride: previous.labelOverride,
      textStyleOverride: previous.textStyleOverride,
    };
    if (!baseNode) delete view.nodeStatesById[nodeId];
  }

  view.layout = {
    ...view.layout,
    mode: resolved.layout.mode,
    isUserArranged: resolved.layout.isUserArranged,
    preservePositions: resolved.layout.preservePositions,
    boundingBox: cloneBounds(resolved.layout.boundingBox),
  };
  view.heatmap = {
    ...view.heatmap,
    enabled: resolved.heatmap.enabled,
    showLegend: resolved.heatmap.showLegend,
  };
  view.updatedAt = now();

  return materializeActiveViewMetadata({
    ...base,
    version: DOCUMENT_VERSION,
    visual,
    timestamp: now(),
  });
}

export function materializeActiveViewMetadata(
  doc: CapabilityDocument,
): CapabilityDocument {
  const view = activeVisualView(doc);
  return {
    ...doc,
    settings: { ...doc.settings, layoutMode: view.layout.mode },
    layout: resolveViewLayout(doc.layout, view),
    heatmap: resolveViewHeatmap(doc.heatmap, view),
  };
}

export function updateActiveViewViewport(
  doc: CapabilityDocument,
  viewport: VisualViewport,
): CapabilityDocument {
  const visual = cloneVisualWorkspace(doc.visual);
  const view = visual.viewsById[visual.activeViewId];
  if (!view) return doc;
  view.viewport = cloneViewport(viewport);
  view.updatedAt = now();
  return { ...doc, visual, timestamp: now() };
}

export function visualStateFromNode(
  node: CapabilityNode,
  overrides: Partial<VisualNodeState> = {},
): VisualNodeState {
  return {
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
    isOnCanvas: node.isOnCanvas,
    lockedForView: node.isLockedAsIs,
    isManualPositioningEnabled: node.isManualPositioningEnabled,
    ...overrides,
  };
}

export function computeVisualBounds(
  doc: CapabilityDocument,
  nodeStatesById = activeVisualView(doc).nodeStatesById,
): Bounds {
  const boxes: Bounds[] = [];
  const collapsed = new Set(
    Object.entries(nodeStatesById)
      .filter(([, state]) => state.isCollapsed)
      .map(([nodeId]) => nodeId),
  );
  for (const node of Object.values(doc.nodesById)) {
    if (hasCollapsedAncestor(doc, node.id, collapsed)) continue;
    const state = nodeStatesById[node.id];
    const onCanvas = state?.isOnCanvas ?? node.isOnCanvas;
    if (!onCanvas) continue;
    boxes.push({
      x: state?.x ?? node.x,
      y: state?.y ?? node.y,
      w: state?.w ?? node.w,
      h: state?.h ?? node.h,
    });
  }
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  return { x, y, w: maxX - x, h: maxY - y };
}

function resolveVisualNode(
  node: CapabilityNode,
  state: VisualNodeState | undefined,
): CapabilityNode {
  if (!state) return { ...node, metadata: { ...node.metadata } };
  const isCollapsed = state.isCollapsed === true;
  return {
    ...node,
    metadata: { ...node.metadata },
    type:
      isCollapsed && node.type !== "text" && !node.isTextLabel
        ? "leaf"
        : node.type,
    x: numberOr(state.x, node.x),
    y: numberOr(state.y, node.y),
    w: positiveOr(state.w, node.w),
    h: positiveOr(state.h, node.h),
    isOnCanvas:
      typeof state.isOnCanvas === "boolean"
        ? state.isOnCanvas
        : node.isOnCanvas,
    isLockedAsIs:
      typeof state.lockedForView === "boolean"
        ? state.lockedForView
        : node.isLockedAsIs,
    isManualPositioningEnabled:
      typeof state.isManualPositioningEnabled === "boolean"
        ? state.isManualPositioningEnabled
        : node.isManualPositioningEnabled,
    label:
      typeof state.labelOverride === "string" && state.labelOverride.trim()
        ? state.labelOverride
        : node.label,
    color: state.colorOverride ?? node.color,
    textStyle: state.textStyleOverride
      ? { ...node.textStyle, ...state.textStyleOverride }
      : node.textStyle
        ? { ...node.textStyle }
        : undefined,
  };
}

function resolveViewLayout(
  fallback: LayoutMetadata,
  view: VisualView,
): LayoutMetadata {
  return {
    ...fallback,
    mode: view.layout.mode,
    isUserArranged: view.layout.isUserArranged ?? fallback.isUserArranged,
    preservePositions: view.layout.preservePositions,
    boundingBox: cloneBounds(view.layout.boundingBox) ?? {
      ...fallback.boundingBox,
    },
  };
}

function resolveViewHeatmap(
  fallback: HeatmapState,
  view: VisualView,
): HeatmapState {
  return {
    ...fallback,
    enabled: view.heatmap.enabled,
    showLegend: view.heatmap.showLegend,
  };
}

function materializeCanvasLeafTypes(doc: CapabilityDocument): void {
  for (const [nodeId, node] of Object.entries(doc.nodesById)) {
    if (!isNodeOnCanvas(node)) continue;
    if (node.type === "leaf" || node.type === "text" || node.isTextLabel) {
      continue;
    }
    if (canvasChildrenOf(doc, nodeId).length > 0) continue;
    doc.nodesById[nodeId] = { ...node, type: "leaf" };
  }
}

function materializeEffectiveColors(
  doc: CapabilityDocument,
  view: VisualView,
): void {
  for (const [nodeId, node] of Object.entries(doc.nodesById)) {
    const usesLeafDefault = node.type === "leaf" && !node.isTextLabel;
    const color =
      view.nodeStatesById[nodeId]?.colorOverride ??
      node.colorOverride ??
      (usesLeafDefault ? doc.settings.leafColor : node.color);
    if (node.color === color) continue;
    doc.nodesById[nodeId] = { ...node, color };
  }
}

function hasCollapsedAncestor(
  doc: CapabilityDocument,
  nodeId: NodeId,
  collapsed: Set<NodeId>,
): boolean {
  let current = doc.nodesById[nodeId];
  const seen = new Set<NodeId>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    if (collapsed.has(current.parentId)) return true;
    current = doc.nodesById[current.parentId];
  }
  return false;
}

function collapsedNodeIds(view: VisualView): Set<NodeId> {
  return new Set(
    Object.entries(view.nodeStatesById)
      .filter(([, state]) => state.isCollapsed)
      .map(([nodeId]) => nodeId),
  );
}

function finiteOrNow(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : now();
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function positiveOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function cloneBounds(bounds: Bounds | undefined): Bounds | undefined {
  return bounds ? { ...bounds } : undefined;
}

function sameBounds(
  left: Bounds | undefined,
  right: Bounds | undefined,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.w === right.w &&
    left.h === right.h
  );
}

function cloneViewport(
  viewport: VisualViewport | undefined,
): VisualViewport | undefined {
  return viewport ? { ...viewport } : undefined;
}

function cloneTemplateContext(
  context: VisualView["templateContext"],
): VisualView["templateContext"] {
  return context ? { ...context } : undefined;
}
