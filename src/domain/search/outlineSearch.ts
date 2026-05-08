import {
  ROOT_PARENT_ID,
  buildSafeChildrenByParentId,
  collectAncestorIds,
  type CapabilityDocument,
  type NodeId,
} from "../document/types";

export type OutlineMatchedField = "label" | "id" | "description" | "metadata";

export interface OutlineHighlightRange {
  start: number;
  end: number;
}

export interface OutlineSearchMatch {
  nodeId: NodeId;
  field: OutlineMatchedField;
  value: string;
  range: OutlineHighlightRange;
  metadataKey?: string;
}

export interface OutlineSearchResult {
  query: string;
  normalizedQuery: string;
  matchingNodeIds: NodeId[];
  visibleNodeIds: Set<NodeId>;
  ancestorNodeIds: Set<NodeId>;
  matchesByNodeId: Record<NodeId, OutlineSearchMatch[]>;
  pathLabelsByNodeId: Record<NodeId, string[]>;
}

export function searchOutline(
  doc: CapabilityDocument,
  query: string,
): OutlineSearchResult {
  const normalizedQuery = query.trim().toLowerCase();
  const matchingNodeIds: NodeId[] = [];
  const visibleNodeIds = new Set<NodeId>();
  const ancestorNodeIds = new Set<NodeId>();
  const matchesByNodeId: Record<NodeId, OutlineSearchMatch[]> = {};
  const pathLabelsByNodeId: Record<NodeId, string[]> = {};

  if (normalizedQuery.length === 0) {
    return {
      query,
      normalizedQuery,
      matchingNodeIds,
      visibleNodeIds,
      ancestorNodeIds,
      matchesByNodeId,
      pathLabelsByNodeId,
    };
  }

  for (const nodeId of orderedNodeIds(doc)) {
    const node = doc.nodesById[nodeId];
    if (!node) continue;
    const matches = matchesForNode(doc, nodeId, normalizedQuery);
    if (matches.length === 0) continue;

    matchingNodeIds.push(nodeId);
    visibleNodeIds.add(nodeId);
    matchesByNodeId[nodeId] = matches;
    pathLabelsByNodeId[nodeId] = pathLabelsForNode(doc, nodeId);

    for (const ancestorId of collectAncestorIds(doc, nodeId).ids) {
      visibleNodeIds.add(ancestorId);
      ancestorNodeIds.add(ancestorId);
    }
  }

  return {
    query,
    normalizedQuery,
    matchingNodeIds,
    visibleNodeIds,
    ancestorNodeIds,
    matchesByNodeId,
    pathLabelsByNodeId,
  };
}

export function getOutlineVisibleIdsForSearch(
  doc: CapabilityDocument,
  query: string,
): Set<NodeId> {
  return searchOutline(doc, query).visibleNodeIds;
}

function matchesForNode(
  doc: CapabilityDocument,
  nodeId: NodeId,
  normalizedQuery: string,
): OutlineSearchMatch[] {
  const node = doc.nodesById[nodeId];
  if (!node) return [];
  const matches: OutlineSearchMatch[] = [];

  addTextMatch(matches, nodeId, "label", node.label, normalizedQuery);
  addTextMatch(matches, nodeId, "id", node.id, normalizedQuery);
  if (node.description) {
    addTextMatch(matches, nodeId, "description", node.description, normalizedQuery);
  }

  for (const [key, value] of Object.entries(node.metadata)) {
    if (!isSearchableMetadataValue(value)) continue;
    const valueText = String(value);
    const display = `${key}: ${valueText}`;
    const keyIndex = findInsensitive(key, normalizedQuery);
    if (keyIndex >= 0) {
      matches.push({
        nodeId,
        field: "metadata",
        metadataKey: key,
        value: display,
        range: { start: keyIndex, end: keyIndex + normalizedQuery.length },
      });
      continue;
    }
    const valueIndex = findInsensitive(valueText, normalizedQuery);
    if (valueIndex >= 0) {
      const offset = key.length + 2;
      matches.push({
        nodeId,
        field: "metadata",
        metadataKey: key,
        value: display,
        range: {
          start: offset + valueIndex,
          end: offset + valueIndex + normalizedQuery.length,
        },
      });
    }
  }

  return matches;
}

function addTextMatch(
  matches: OutlineSearchMatch[],
  nodeId: NodeId,
  field: OutlineMatchedField,
  value: string,
  normalizedQuery: string,
) {
  const start = findInsensitive(value, normalizedQuery);
  if (start < 0) return;
  matches.push({
    nodeId,
    field,
    value,
    range: { start, end: start + normalizedQuery.length },
  });
}

function findInsensitive(value: string, normalizedQuery: string): number {
  return value.toLowerCase().indexOf(normalizedQuery);
}

function pathLabelsForNode(doc: CapabilityDocument, nodeId: NodeId): string[] {
  const node = doc.nodesById[nodeId];
  if (!node) return [nodeId];
  return [
    ...collectAncestorIds(doc, nodeId)
      .ids.reverse()
      .map((ancestorId) => doc.nodesById[ancestorId]?.label ?? ancestorId),
    node.label,
  ];
}

function orderedNodeIds(doc: CapabilityDocument): NodeId[] {
  const safeChildren = buildSafeChildrenByParentId(doc).childrenByParentId;
  const ordered: NodeId[] = [];
  const emitted = new Set<NodeId>();
  const visit = (parentId: NodeId) => {
    for (const childId of safeChildren[parentId] ?? []) {
      if (emitted.has(childId)) continue;
      emitted.add(childId);
      ordered.push(childId);
      visit(childId);
    }
  };

  visit(ROOT_PARENT_ID);
  for (const nodeId of Object.keys(doc.nodesById).sort()) {
    if (emitted.has(nodeId)) continue;
    emitted.add(nodeId);
    ordered.push(nodeId);
  }
  return ordered;
}

function isSearchableMetadataValue(
  value: unknown,
): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
