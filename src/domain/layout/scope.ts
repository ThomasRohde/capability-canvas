import {
  canvasRootChildren,
  collectAncestorIds,
  isHierarchyAncestorOf,
  isNodeOnCanvas,
  type CapabilityDocument,
  type CapabilityNode,
  type NodeId,
} from "../document/types";
import type { Diagnostic } from "../validation/diagnostics";
import { info, warning } from "../validation/diagnostics";

export interface NormalizedLayoutScope {
  rootIds: NodeId[];
  documentScope: boolean;
  diagnostics: Diagnostic[];
}

export function normalizeScopedLayoutRoots(
  doc: CapabilityDocument,
  affectedNodeIds: NodeId[],
): NormalizedLayoutScope {
  const rootIds = new Set<NodeId>();
  const diagnostics: Diagnostic[] = [];
  let documentScope = false;

  for (const affectedNodeId of affectedNodeIds) {
    const node = doc.nodesById[affectedNodeId];
    if (!isNodeOnCanvas(node)) continue;

    const ancestors = canvasAncestorsOf(doc, node.id);
    const lockedAncestor = ancestors.find((ancestor) => ancestor.isLockedAsIs);
    if (lockedAncestor) {
      diagnostics.push(
        warning(
          "layout-scope-blocked-by-locked-ancestor",
          `Scoped auto layout for "${node.label}" was skipped because locked ancestor "${lockedAncestor.label}" preserves that subtree.`,
          node.id,
        ),
      );
      continue;
    }

    const manualAncestor = ancestors.find(
      (ancestor) => ancestor.isManualPositioningEnabled,
    );
    if (manualAncestor) {
      rootIds.add(manualAncestor.id);
      diagnostics.push(
        info(
          "layout-scope-promoted",
          `Scoped auto layout for "${node.label}" was promoted to manual ancestor "${manualAncestor.label}".`,
          manualAncestor.id,
        ),
      );
      continue;
    }

    const parent = ancestors[0];
    if (!parent) {
      documentScope = true;
      continue;
    }
    rootIds.add(parent.id);
  }

  if (documentScope) {
    return {
      rootIds: canvasRootChildren(doc),
      documentScope: true,
      diagnostics,
    };
  }

  return {
    rootIds: pruneDescendantScopeRoots(doc, [...rootIds]),
    documentScope: false,
    diagnostics,
  };
}

function canvasAncestorsOf(
  doc: CapabilityDocument,
  nodeId: NodeId,
): CapabilityNode[] {
  return collectAncestorIds(doc, nodeId, { canvasOnly: true })
    .ids.map((ancestorId) => doc.nodesById[ancestorId])
    .filter((ancestor): ancestor is CapabilityNode => !!ancestor);
}

function pruneDescendantScopeRoots(
  doc: CapabilityDocument,
  rootIds: NodeId[],
): NodeId[] {
  return rootIds.filter(
    (rootId) =>
      !rootIds.some(
        (candidateId) =>
          candidateId !== rootId &&
          isHierarchyAncestorOf(doc, candidateId, rootId),
      ),
  );
}
