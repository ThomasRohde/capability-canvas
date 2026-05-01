import {
  type CapabilityColor,
  type CapabilityDocument,
  type CapabilityNode,
  DOCUMENT_SCHEMA,
  DOCUMENT_VERSION,
  ROOT_PARENT_ID,
  type NodeId
} from './types';

export const CATEGORY_COLORS: CapabilityColor[] = ['mint', 'sky', 'coral', 'amber', 'lavender', 'peach'];

export const DEFAULT_SETTINGS = {
  gridEnabled: true,
  fixedLeafWidth: 168,
  fixedLeafHeight: 56,
  defaultParentWidth: 360,
  defaultParentHeight: 140,
  containerPaddingTop: 32,
  containerPaddingRight: 32,
  containerPaddingBottom: 32,
  containerPaddingLeft: 32,
  childGapX: 32,
  childGapY: 16,
  fontFamily: 'Inter',
  borderRadius: 8,
  layoutMode: 'adaptive' as const
};

export const DEFAULT_LAYOUT = {
  mode: 'adaptive' as const,
  isUserArranged: false,
  preservePositions: true,
  boundingBox: { x: 0, y: 0, w: 0, h: 0 }
};

export const DEFAULT_HEATMAP = {
  enabled: false,
  showLegend: true,
  palette: 'green-yellow-red' as const,
  fallbackColor: 'mint' as const
};

export function createNode(
  partial: Partial<CapabilityNode> & Pick<CapabilityNode, 'id' | 'label'>
): CapabilityNode {
  const timestamp = Date.now();
  return {
    id: partial.id,
    parentId: partial.parentId ?? null,
    label: partial.label,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    w: partial.w ?? DEFAULT_SETTINGS.fixedLeafWidth,
    h: partial.h ?? DEFAULT_SETTINGS.fixedLeafHeight,
    type: partial.type ?? 'leaf',
    color: partial.color ?? 'mint',
    description: partial.description,
    metadata: partial.metadata ?? {},
    layoutPreferences: partial.layoutPreferences,
    isManualPositioningEnabled: partial.isManualPositioningEnabled ?? false,
    isLockedAsIs: partial.isLockedAsIs ?? false,
    isTextLabel: partial.isTextLabel ?? partial.type === 'text',
    textStyle: partial.textStyle,
    heatmapValue: partial.heatmapValue,
    createdAt: partial.createdAt ?? timestamp,
    updatedAt: partial.updatedAt ?? timestamp
  };
}

export function createEmptyDocument(title = 'Untitled capability model'): CapabilityDocument {
  return {
    schema: DOCUMENT_SCHEMA,
    version: DOCUMENT_VERSION,
    nodesById: {},
    childrenByParentId: { [ROOT_PARENT_ID]: [] },
    settings: { ...DEFAULT_SETTINGS },
    layout: { ...DEFAULT_LAYOUT, boundingBox: { ...DEFAULT_LAYOUT.boundingBox } },
    heatmap: { ...DEFAULT_HEATMAP },
    timestamp: Date.now(),
    title
  };
}

export function nextColor(index: number): CapabilityColor {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length]!;
}

export function makeId(prefix = 'cap'): NodeId {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${random}`;
}
