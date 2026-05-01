import { createNode, makeId, nextColor } from '../document/defaults';
import { cloneDocument, rebuildChildren } from '../document/normalize';
import { childrenOf, hasChildren, now, type CapabilityDocument, type CapabilityNode, type NodeId } from '../document/types';
import { ensureParentContainment } from '../layout/containment';
import { computeDocumentBounds } from '../layout/engine';
import { canAlign, canDistribute } from '../selection/rules';
import { descendantsOf, isDescendantOf, validateDocument } from '../validation/validate';
import { error, type Diagnostic } from '../validation/diagnostics';
import {
  type AlignDirection,
  type Command,
  type DistributionAxis,
  type SizeAxis,
  type Transaction
} from './types';

type MutableDoc = CapabilityDocument;

export function transaction(label: string, commands: Command[], meta?: Transaction['meta']): Transaction {
  return { label, commands, meta };
}

export function runTransaction(doc: CapabilityDocument, txn: Transaction): { doc: CapabilityDocument; diagnostics: Diagnostic[] } {
  let next = cloneDocument(doc);
  const diagnostics: Diagnostic[] = [];
  for (const command of txn.commands) {
    const result = command.apply(next);
    diagnostics.push(...result.diagnostics);
    if (result.diagnostics.some((diag) => diag.severity === 'error')) {
      return { doc, diagnostics };
    }
    next = result.doc;
  }
  const contained = ensureParentContainment(next).doc;
  const validation = validateDocument(contained);
  if (!validation.valid) {
    return { doc, diagnostics: [...diagnostics, ...validation.diagnostics] };
  }
  return {
    doc: { ...contained, timestamp: now(), layout: { ...contained.layout, boundingBox: computeDocumentBounds(contained) } },
    diagnostics
  };
}

export function addRoot(label = 'New capability'): Transaction {
  return transaction('Add root capability', [
    command('add-root', { label }, (doc) => {
      const next = cloneDocument(doc);
      const rootCount = childrenOf(next, null).length;
      const id = makeId('root');
      next.nodesById[id] = createNode({
        id,
        label,
        parentId: null,
        type: 'root',
        color: nextColor(rootCount),
        x: 48,
        y: 48 + rootCount * 168,
        w: next.settings.defaultParentWidth * 2,
        h: next.settings.defaultParentHeight
      });
      next.childrenByParentId.__root__ = [...childrenOf(next, null), id];
      next.childrenByParentId[id] = [];
      return ok(next);
    })
  ]);
}

export function addChild(parentId: NodeId, label = 'New capability'): Transaction {
  return transaction('Add child capability', [
    command('add-child', { parentId, label }, (doc) => {
      const parent = doc.nodesById[parentId];
      if (!parent) return fail(doc, 'missing-parent', 'Select a valid parent before adding a child.');
      if (parent.isTextLabel || parent.type === 'text') return fail(doc, 'text-label-parent', 'Text labels cannot contain children.');
      const next = cloneDocument(doc);
      const childCount = childrenOf(next, parentId).length;
      const id = makeId('cap');
      next.nodesById[id] = createNode({
        id,
        label,
        parentId,
        type: 'leaf',
        color: parent.color,
        x: parent.x + 32 + childCount * 184,
        y: parent.y + 64,
        w: next.settings.fixedLeafWidth,
        h: next.settings.fixedLeafHeight,
        heatmapValue: 0
      });
      next.nodesById[parentId] = { ...parent, type: parent.type === 'root' ? 'root' : 'parent', updatedAt: now() };
      next.childrenByParentId[parentId] = [...childrenOf(next, parentId), id];
      next.childrenByParentId[id] = [];
      return ok(next);
    })
  ]);
}

export function addTextLabel(parentId: NodeId | null, label = 'Text label'): Transaction {
  return transaction('Add text label', [
    command('add-text-label', { parentId, label }, (doc) => {
      const next = cloneDocument(doc);
      const id = makeId('text');
      next.nodesById[id] = createNode({
        id,
        label,
        parentId,
        type: 'text',
        color: 'teal',
        isTextLabel: true,
        x: parentId ? (next.nodesById[parentId]?.x ?? 0) + 24 : 24,
        y: parentId ? (next.nodesById[parentId]?.y ?? 0) + 24 : 24,
        w: 180,
        h: 36
      });
      const key = parentId ?? '__root__';
      next.childrenByParentId[key] = [...(next.childrenByParentId[key] ?? []), id];
      next.childrenByParentId[id] = [];
      return ok(next);
    })
  ]);
}

export function updateNode(nodeId: NodeId, patch: Partial<CapabilityNode>): Transaction {
  return transaction('Update capability', [
    command('update-node', { nodeId, patch }, (doc) => {
      const node = doc.nodesById[nodeId];
      if (!node) return fail(doc, 'missing-node', 'The selected capability no longer exists.');
      const next = cloneDocument(doc);
      next.nodesById[nodeId] = { ...node, ...patch, id: node.id, updatedAt: now() };
      return ok(next);
    })
  ]);
}

export function updateDocumentTitle(title: string): Transaction {
  return transaction('Update document title', [
    command('update-document-title', { title }, (doc) => ok({ ...doc, title: title.trim() || 'Untitled capability model' }))
  ]);
}

export function updateDocumentSettings(patch: Partial<CapabilityDocument['settings']>): Transaction {
  return transaction('Update document settings', [
    command('update-document-settings', { patch }, (doc) =>
      ok({
        ...doc,
        settings: {
          ...doc.settings,
          ...patch
        },
        layout: {
          ...doc.layout,
          mode: patch.layoutMode ?? doc.layout.mode
        }
      })
    )
  ]);
}

export function updateHeatmapSettings(patch: Partial<CapabilityDocument['heatmap']>): Transaction {
  return transaction('Update heatmap settings', [
    command('update-heatmap-settings', { patch }, (doc) => ok({ ...doc, heatmap: { ...doc.heatmap, ...patch } }))
  ]);
}

export function deleteNodes(nodeIds: NodeId[]): Transaction {
  return transaction('Delete capability', [
    command('delete-nodes', { nodeIds }, (doc) => {
      const next = cloneDocument(doc);
      const toDelete = new Set<NodeId>();
      for (const id of nodeIds) {
        if (!next.nodesById[id]) continue;
        toDelete.add(id);
        for (const descendantId of descendantsOf(next, id)) toDelete.add(descendantId);
      }
      for (const id of toDelete) delete next.nodesById[id];
      for (const [parentId, children] of Object.entries(next.childrenByParentId)) {
        next.childrenByParentId[parentId] = children.filter((childId) => !toDelete.has(childId));
      }
      return ok(rebuildChildren(next));
    })
  ]);
}

export function moveNodes(nodeIds: NodeId[], dx: number, dy: number): Transaction {
  return transaction(
    'Move capability',
    [
      command('move-nodes', { nodeIds, dx, dy }, (doc) => {
        const next = cloneDocument(doc);
        for (const nodeId of nodeIds) {
          const ids = [nodeId, ...descendantsOf(next, nodeId)];
          for (const id of ids) {
            const node = next.nodesById[id];
            if (!node || node.isLockedAsIs) continue;
            next.nodesById[id] = { ...node, x: node.x + dx, y: node.y + dy, updatedAt: now() };
          }
        }
        return ok({ ...next, layout: { ...next.layout, isUserArranged: true } });
      })
    ],
    { source: 'drag' }
  );
}

export function resizeNode(nodeId: NodeId, w: number, h: number): Transaction {
  return transaction('Resize capability', [
    command('resize-node', { nodeId, w, h }, (doc) => {
      const node = doc.nodesById[nodeId];
      if (!node) return fail(doc, 'missing-node', 'The selected capability no longer exists.');
      if (node.isLockedAsIs) return fail(doc, 'locked-node', 'Locked capabilities cannot be resized.');
      const childBounds = boundsForNodes(doc, childrenOf(doc, nodeId));
      const minW = childBounds ? childBounds.x + childBounds.w - node.x + 32 : 80;
      const minH = childBounds ? childBounds.y + childBounds.h - node.y + 32 : 40;
      return updateOnly(doc, nodeId, { w: Math.max(w, minW), h: Math.max(h, minH) });
    })
  ]);
}

export function reparentNode(nodeId: NodeId, parentId: NodeId | null): Transaction {
  return transaction('Reparent capability', [
    command('reparent-node', { nodeId, parentId }, (doc) => {
      const node = doc.nodesById[nodeId];
      const parent = parentId ? doc.nodesById[parentId] : null;
      if (!node) return fail(doc, 'missing-node', 'The selected capability no longer exists.');
      if (parent?.isTextLabel || parent?.type === 'text') return fail(doc, 'text-label-parent', 'Text labels cannot be parents.');
      if (parentId && isDescendantOf(doc, parentId, nodeId)) return fail(doc, 'cycle', 'A node cannot be moved into its descendant.');
      const next = cloneDocument(doc);
      next.nodesById[nodeId] = { ...node, parentId, type: parentId ? node.type === 'root' ? 'parent' : node.type : 'root' };
      return ok(rebuildChildren(next));
    })
  ]);
}

export function duplicateNodes(nodeIds: NodeId[]): Transaction {
  return transaction('Duplicate capability', [
    command('duplicate-nodes', { nodeIds }, (doc) => {
      const next = cloneDocument(doc);
      const idMap = new Map<NodeId, NodeId>();
      const sourceIds = new Set<NodeId>();
      for (const rootId of nodeIds) {
        sourceIds.add(rootId);
        for (const descendantId of descendantsOf(doc, rootId)) sourceIds.add(descendantId);
      }
      for (const id of sourceIds) idMap.set(id, makeId('copy'));
      for (const id of sourceIds) {
        const node = doc.nodesById[id]!;
        const newId = idMap.get(id)!;
        const parentId = node.parentId && sourceIds.has(node.parentId) ? idMap.get(node.parentId)! : node.parentId;
        next.nodesById[newId] = {
          ...node,
          id: newId,
          parentId,
          label: `${node.label} copy`,
          x: node.x + 24,
          y: node.y + 24,
          createdAt: now(),
          updatedAt: now()
        };
      }
      return ok(rebuildChildren(next));
    })
  ]);
}

export function alignNodes(nodeIds: NodeId[], direction: AlignDirection): Transaction {
  return transaction(
    `Align ${direction}`,
    [
      command('align-nodes', { nodeIds, direction }, (doc) => {
        const allowed = canAlign(doc, nodeIds);
        if (!allowed.valid) return fail(doc, 'invalid-selection', allowed.reason ?? 'Invalid selection.');
        const nodes = nodeIds.map((id) => doc.nodesById[id]!);
        const next = cloneDocument(doc);
        const target = alignTarget(nodes, direction);
        for (const node of nodes) {
          const patch =
            direction === 'left'
              ? { x: target }
              : direction === 'center'
                ? { x: target - node.w / 2 }
                : direction === 'right'
                  ? { x: target - node.w }
                  : direction === 'top'
                    ? { y: target }
                    : direction === 'middle'
                      ? { y: target - node.h / 2 }
                      : { y: target - node.h };
          next.nodesById[node.id] = { ...node, ...patch, updatedAt: now() };
        }
        return ok({ ...next, layout: { ...next.layout, isUserArranged: true } });
      })
    ],
    { source: 'bulk' }
  );
}

export function distributeNodes(nodeIds: NodeId[], axis: DistributionAxis): Transaction {
  return transaction(
    `Distribute ${axis}`,
    [
      command('distribute-nodes', { nodeIds, axis }, (doc) => {
        const allowed = canDistribute(doc, nodeIds);
        if (!allowed.valid) return fail(doc, 'invalid-selection', allowed.reason ?? 'Invalid selection.');
        const nodes = nodeIds.map((id) => doc.nodesById[id]!).sort((a, b) => (axis === 'horizontal' ? a.x - b.x : a.y - b.y));
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        const totalSize = nodes.reduce((sum, node) => sum + (axis === 'horizontal' ? node.w : node.h), 0);
        const span = axis === 'horizontal' ? last.x + last.w - first.x : last.y + last.h - first.y;
        const gap = (span - totalSize) / (nodes.length - 1);
        const next = cloneDocument(doc);
        let cursor = axis === 'horizontal' ? first.x : first.y;
        for (const node of nodes) {
          next.nodesById[node.id] =
            axis === 'horizontal' ? { ...node, x: cursor, updatedAt: now() } : { ...node, y: cursor, updatedAt: now() };
          cursor += (axis === 'horizontal' ? node.w : node.h) + gap;
        }
        return ok({ ...next, layout: { ...next.layout, isUserArranged: true } });
      })
    ],
    { source: 'bulk' }
  );
}

export function sameSize(nodeIds: NodeId[], anchorId: NodeId, axis: SizeAxis = 'both'): Transaction {
  return transaction(
    'Same size',
    [
      command('same-size', { nodeIds, anchorId, axis }, (doc) => {
        const anchor = doc.nodesById[anchorId];
        if (!anchor) return fail(doc, 'missing-anchor', 'Anchor node no longer exists.');
        const next = cloneDocument(doc);
        for (const id of nodeIds) {
          const node = next.nodesById[id];
          if (!node || node.isLockedAsIs) continue;
          next.nodesById[id] = {
            ...node,
            w: axis === 'height' ? node.w : anchor.w,
            h: axis === 'width' ? node.h : anchor.h,
            updatedAt: now()
          };
        }
        return ok(next);
      })
    ],
    { source: 'bulk' }
  );
}

export function fitParentToChildren(nodeId: NodeId): Transaction {
  return transaction('Fit parent to children', [
    command('fit-parent-to-children', { nodeId }, (doc) => {
      const node = doc.nodesById[nodeId];
      if (!node) return fail(doc, 'missing-node', 'The selected capability no longer exists.');
      const bounds = boundsForNodes(doc, childrenOf(doc, nodeId));
      if (!bounds) return ok(doc);
      const margin = {
        top: (node.layoutPreferences?.marginTop ?? doc.settings.containerPaddingTop) + 28,
        right: node.layoutPreferences?.marginRight ?? doc.settings.containerPaddingRight,
        bottom: node.layoutPreferences?.marginBottom ?? doc.settings.containerPaddingBottom,
        left: node.layoutPreferences?.marginLeft ?? doc.settings.containerPaddingLeft
      };
      const x = Math.min(node.x, bounds.x - margin.left);
      const y = Math.min(node.y, bounds.y - margin.top);
      return updateOnly(doc, nodeId, {
        x,
        y,
        w: bounds.x + bounds.w - x + margin.right,
        h: bounds.y + bounds.h - y + margin.bottom
      });
    })
  ]);
}

export function lockSubtree(nodeId: NodeId, locked: boolean): Transaction {
  return transaction(locked ? 'Lock subtree' : 'Unlock subtree', [
    command('lock-subtree', { nodeId, locked }, (doc) => {
      const next = cloneDocument(doc);
      for (const id of [nodeId, ...descendantsOf(next, nodeId)]) {
        const node = next.nodesById[id];
        if (node) next.nodesById[id] = { ...node, isLockedAsIs: locked, updatedAt: now() };
      }
      return ok(next);
    })
  ]);
}

export function setManualPositioning(nodeId: NodeId, enabled: boolean): Transaction {
  return updateNode(nodeId, { isManualPositioningEnabled: enabled });
}

function command<TArgs>(type: string, args: TArgs, apply: (doc: MutableDoc) => { doc: CapabilityDocument; diagnostics: Diagnostic[] }): Command<TArgs> {
  return { type, args, apply };
}

function ok(doc: CapabilityDocument) {
  return { doc, diagnostics: [] };
}

function fail(doc: CapabilityDocument, code: string, message: string) {
  return { doc, diagnostics: [error(code, message)] };
}

function updateOnly(doc: CapabilityDocument, nodeId: NodeId, patch: Partial<CapabilityNode>) {
  const next = cloneDocument(doc);
  const node = next.nodesById[nodeId];
  if (!node) return fail(doc, 'missing-node', 'The selected capability no longer exists.');
  next.nodesById[nodeId] = { ...node, ...patch, updatedAt: now() };
  return ok(next);
}

function alignTarget(nodes: CapabilityNode[], direction: AlignDirection): number {
  if (direction === 'left') return Math.min(...nodes.map((node) => node.x));
  if (direction === 'center') return nodes[0]!.x + nodes[0]!.w / 2;
  if (direction === 'right') return Math.max(...nodes.map((node) => node.x + node.w));
  if (direction === 'top') return Math.min(...nodes.map((node) => node.y));
  if (direction === 'middle') return nodes[0]!.y + nodes[0]!.h / 2;
  return Math.max(...nodes.map((node) => node.y + node.h));
}

function boundsForNodes(doc: CapabilityDocument, ids: NodeId[]) {
  const nodes = ids.map((id) => doc.nodesById[id]).filter(Boolean);
  if (nodes.length === 0) return null;
  const x = Math.min(...nodes.map((node) => node.x));
  const y = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.w));
  const maxY = Math.max(...nodes.map((node) => node.y + node.h));
  return { x, y, w: maxX - x, h: maxY - y };
}

export function deriveNodeType(doc: CapabilityDocument, node: CapabilityNode): CapabilityNode['type'] {
  if (!node.parentId) return 'root';
  if (node.isTextLabel) return 'text';
  return hasChildren(doc, node.id) ? 'parent' : 'leaf';
}
