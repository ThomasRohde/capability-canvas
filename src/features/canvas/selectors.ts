import {
  canvasChildrenOf,
  canvasRootChildren,
  isNodeOnCanvas,
  type Bounds,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from '../../domain/document/types';

export interface NodeViewModel {
  node: CapabilityNode;
  depth: number;
  descendants: Set<NodeId>;
  bounds: Bounds;
  visible: boolean;
  zIndex: number;
}

export function createNodeViewModels(doc: CapabilityDocument, viewport?: Bounds): NodeViewModel[] {
  const depths = computeDepths(doc);
  return Object.values(doc.nodesById)
    .filter(isNodeOnCanvas)
    .map((node) => {
      const depth = depths.get(node.id) ?? 0;
      const bounds = { x: node.x, y: node.y, w: node.w, h: node.h };
      return {
        node,
        depth,
        descendants: new Set(descendantIds(doc, node.id)),
        bounds,
        visible: viewport ? intersects(bounds, viewport) : true,
        zIndex: depth * 10 + (node.type === 'leaf' ? 2 : 1)
      };
    })
    .sort((a, b) => a.depth - b.depth || a.node.id.localeCompare(b.node.id));
}

export function computeDepths(doc: CapabilityDocument): Map<NodeId, number> {
  const depths = new Map<NodeId, number>();
  const visit = (nodeId: NodeId, depth: number) => {
    depths.set(nodeId, depth);
    for (const childId of canvasChildrenOf(doc, nodeId)) visit(childId, depth + 1);
  };
  for (const rootId of canvasRootChildren(doc)) visit(rootId, 0);
  return depths;
}

export function descendantIds(doc: CapabilityDocument, nodeId: NodeId): NodeId[] {
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

export function viewportToDocumentBounds(
  viewport: { x: number; y: number; zoom: number },
  size: { w: number; h: number }
): Bounds {
  return {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    w: size.w / viewport.zoom,
    h: size.h / viewport.zoom
  };
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}
