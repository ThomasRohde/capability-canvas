import {
  canvasRootChildren,
  collectDescendantIds,
  computeHierarchyDepths,
  isNodeOnCanvas,
  type Bounds,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../../domain/document/types";
import { intersectsBounds } from "../../domain/layout/bounds";

export interface NodeViewModel {
  node: CapabilityNode;
  depth: number;
  descendants: Set<NodeId>;
  bounds: Bounds;
  visible: boolean;
  zIndex: number;
}

export function createNodeViewModels(
  doc: CapabilityDocument,
  viewport?: Bounds,
): NodeViewModel[] {
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
        visible: viewport
          ? intersectsBounds(bounds, viewport, { inclusive: true })
          : true,
        zIndex: depth * 10 + (node.type === "leaf" ? 2 : 1),
      };
    })
    .sort((a, b) => a.depth - b.depth || a.node.id.localeCompare(b.node.id));
}

export function computeDepths(doc: CapabilityDocument): Map<NodeId, number> {
  return computeHierarchyDepths(doc, canvasRootChildren(doc), {
    canvasOnly: true,
  }).depths;
}

export function descendantIds(
  doc: CapabilityDocument,
  nodeId: NodeId,
): NodeId[] {
  return collectDescendantIds(doc, nodeId, { canvasOnly: true }).ids;
}

export function viewportToDocumentBounds(
  viewport: { x: number; y: number; zoom: number },
  size: { w: number; h: number },
): Bounds {
  return {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    w: size.w / viewport.zoom,
    h: size.h / viewport.zoom,
  };
}
