import {
  createEmptyDocument,
  createNode,
  DEFAULT_HEATMAP,
  DEFAULT_LAYOUT,
  DEFAULT_SETTINGS,
  nextColor,
} from './defaults';
import { rebuildChildren } from './normalize';
import { WireDocumentSchema } from './schema';
import { DOCUMENT_SCHEMA, DOCUMENT_VERSION, ROOT_PARENT_ID, type CapabilityDocument, type CapabilityNode, type NodeId } from './types';
import { ensureParentContainment } from '../layout/containment';
import { type Diagnostic, error, warning } from '../validation/diagnostics';
import { validateDocument } from '../validation/validate';

export interface ParseResult {
  doc: CapabilityDocument | null;
  diagnostics: Diagnostic[];
}

export function parseDocument(input: unknown): ParseResult {
  const tasted = tasteDocumentShape(input);
  if (tasted) return tasted;

  const parsed = WireDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      doc: null,
      diagnostics: parsed.error.issues.map((issue) =>
        error('schema-invalid', `${issue.path.join('.') || 'document'}: ${issue.message}`)
      )
    };
  }

  const diagnostics: Diagnostic[] = [];
  const doc = createEmptyDocument(parsed.data.title ?? 'Imported capability model');
  doc.schema = DOCUMENT_SCHEMA;
  doc.version = DOCUMENT_VERSION;
  doc.settings = { ...DEFAULT_SETTINGS, ...parsed.data.settings };
  doc.layout = {
    ...DEFAULT_LAYOUT,
    ...parsed.data.layout,
    boundingBox: { ...DEFAULT_LAYOUT.boundingBox, ...parsed.data.layout.boundingBox }
  };
  doc.heatmap = { ...DEFAULT_HEATMAP, ...parsed.data.heatmap };
  doc.timestamp = parsed.data.timestamp;

  const idCounts = new Map<string, number>();
  const rewrittenIds = new Map<string, string>();
  for (const rawNode of parsed.data.nodes) {
    const count = idCounts.get(rawNode.id) ?? 0;
    idCounts.set(rawNode.id, count + 1);
    const id = count === 0 ? rawNode.id : `${rawNode.id}-${count + 1}`;
    if (id !== rawNode.id) {
      diagnostics.push(warning('duplicate-id-repaired', `Duplicate id ${rawNode.id} was renamed to ${id}.`, rawNode.id));
    }
    rewrittenIds.set(`${rawNode.id}:${count}`, id);
  }

  const seenByOriginal = new Map<string, number>();
  for (const rawNode of parsed.data.nodes) {
    const seen = seenByOriginal.get(rawNode.id) ?? 0;
    seenByOriginal.set(rawNode.id, seen + 1);
    const id = rewrittenIds.get(`${rawNode.id}:${seen}`) ?? rawNode.id;
    const parentId = rawNode.parentId && idCounts.has(rawNode.parentId) ? rawNode.parentId : null;
    if (rawNode.parentId && !idCounts.has(rawNode.parentId)) {
      diagnostics.push(warning('missing-parent-repaired', `Missing parent ${rawNode.parentId}; ${id} moved to root.`, id));
    }
    const node: CapabilityNode = {
      ...rawNode,
      id,
      parentId,
      type: parentId === null ? 'root' : rawNode.type,
      w: Math.max(rawNode.w, 1),
      h: Math.max(rawNode.h, 1),
      metadata: { ...(rawNode.metadata ?? {}) },
      isTextLabel: rawNode.isTextLabel || rawNode.type === 'text'
    };
    doc.nodesById[node.id] = node;
  }

  return finalizeDocument(doc, diagnostics);
}

function tasteDocumentShape(input: unknown): ParseResult | null {
  const capabilityList = parseCapabilityList(input);
  if (capabilityList) return capabilityList;
  return null;
}

function parseCapabilityList(input: unknown): ParseResult | null {
  if (!Array.isArray(input)) return null;
  if (input.length === 0) return null;
  const items = input.filter(isCapabilityListItem);
  if (items.length !== input.length) return null;
  if (!items.some((item) => 'parent' in item || 'parentId' in item)) {
    return null;
  }

  const diagnostics: Diagnostic[] = [
    warning(
      'external-capability-list-imported',
      'Imported a capability list JSON array and converted it to a Capability Canvas document.',
    ),
  ];
  const firstRoot = items.find((item) => parentReference(item) === null);
  const doc = createEmptyDocument(
    stringValue(firstRoot?.name) ?? stringValue(items[0]?.name) ?? 'Imported capability model',
  );
  doc.layout = {
    ...doc.layout,
    isUserArranged: false,
    preservePositions: false,
  };

  const idByOriginal = new Map<string, NodeId>();
  const idsByIndex: NodeId[] = [];
  const usedIds = new Set<NodeId>();
  for (const [index, item] of items.entries()) {
    const rawId = stringValue(item.id) ?? `imported-${index + 1}`;
    const id = uniqueId(rawId, usedIds);
    idsByIndex[index] = id;
    usedIds.add(id);
    if (!idByOriginal.has(rawId)) idByOriginal.set(rawId, id);
    if (id !== rawId) {
      diagnostics.push(
        warning(
          'duplicate-id-repaired',
          `Duplicate id ${rawId} was renamed to ${id}.`,
          id,
        ),
      );
    }
  }

  for (const [index, item] of items.entries()) {
    const id = idsByIndex[index] ?? `imported-${index + 1}`;
    const rawParent = parentReference(item);
    let parentId = rawParent ? idByOriginal.get(rawParent) ?? null : null;
    if (rawParent && !parentId) {
      diagnostics.push(
        warning(
          'missing-parent-repaired',
          `Missing parent ${rawParent}; ${id} moved to root.`,
          id,
        ),
      );
    }
    if (parentId === id) {
      diagnostics.push(
        warning(
          'cycle-repaired',
          `${id} referenced itself as parent and was moved to root.`,
          id,
        ),
      );
      parentId = null;
    }

    doc.nodesById[id] = createNode({
      id,
      label: stringValue(item.name) ?? stringValue(item.label) ?? id,
      parentId,
      type: parentId ? 'leaf' : 'root',
      description: stringValue(item.description) ?? undefined,
      color: nextColor(0),
      metadata: externalMetadata(item),
      x: DEFAULT_SETTINGS.containerPaddingLeft,
      y:
        DEFAULT_SETTINGS.containerPaddingTop +
        index * (DEFAULT_SETTINGS.fixedLeafHeight + DEFAULT_SETTINGS.childGapY),
    });
  }

  const rebuilt = assignImportedTypesAndColors(rebuildChildren(doc));
  return finalizeDocument(rebuilt, diagnostics);
}

function finalizeDocument(
  doc: CapabilityDocument,
  diagnostics: Diagnostic[],
): ParseResult {
  const rebuilt = breakInvalidRelations(rebuildChildren(doc), diagnostics);
  const contained = ensureParentContainment(rebuilt);
  for (const nodeId of contained.changedNodeIds) {
    diagnostics.push(warning('parent-containment-repaired', `${nodeId} was expanded to contain its children.`, nodeId));
  }
  const validation = validateDocument(contained.doc);
  diagnostics.push(...validation.diagnostics);
  return { doc: contained.doc, diagnostics };
}

export function parseDocumentJson(json: string): ParseResult {
  try {
    return parseDocument(JSON.parse(json) as unknown);
  } catch {
    return { doc: null, diagnostics: [error('json-invalid', 'The selected file is not valid JSON.')] };
  }
}

function breakInvalidRelations(doc: CapabilityDocument, diagnostics: Diagnostic[]): CapabilityDocument {
  const next = { ...doc, nodesById: { ...doc.nodesById }, childrenByParentId: { ...doc.childrenByParentId } };

  for (const node of Object.values(next.nodesById)) {
    if (node.parentId && next.nodesById[node.parentId]?.isTextLabel) {
      diagnostics.push(warning('text-parent-repaired', `${node.id} was moved to root because text labels cannot be parents.`));
      next.nodesById[node.id] = { ...node, parentId: null, type: 'root' };
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of Object.values(next.nodesById)) {
      const chain = new Set<string>();
      let current: CapabilityNode | undefined = node;
      while (current?.parentId) {
        if (chain.has(current.parentId)) {
          diagnostics.push(warning('cycle-repaired', `Cycle involving ${node.id} was repaired by moving it to root.`, node.id));
          next.nodesById[node.id] = { ...node, parentId: null, type: 'root' };
          changed = true;
          break;
        }
        chain.add(current.id);
        current = next.nodesById[current.parentId];
      }
    }
  }

  const rebuilt = rebuildChildren(next);
  rebuilt.childrenByParentId[ROOT_PARENT_ID] ??= [];
  return rebuilt;
}

function assignImportedTypesAndColors(doc: CapabilityDocument): CapabilityDocument {
  const next = {
    ...doc,
    nodesById: { ...doc.nodesById },
    childrenByParentId: { ...doc.childrenByParentId },
  };
  const rootIds = next.childrenByParentId[ROOT_PARENT_ID] ?? [];
  const colorBuckets =
    rootIds.length === 1 && (next.childrenByParentId[rootIds[0]!] ?? []).length > 0
      ? next.childrenByParentId[rootIds[0]!] ?? []
      : rootIds;
  const colorByBucket = new Map<NodeId, ReturnType<typeof nextColor>>();
  colorBuckets.forEach((nodeId, index) => colorByBucket.set(nodeId, nextColor(index)));

  for (const node of Object.values(next.nodesById)) {
    const hasChildren = (next.childrenByParentId[node.id] ?? []).length > 0;
    const type = node.parentId === null ? 'root' : hasChildren ? 'parent' : 'leaf';
    next.nodesById[node.id] = {
      ...node,
      type,
      color: colorForImportedNode(next, node.id, colorByBucket),
    };
  }
  return next;
}

function colorForImportedNode(
  doc: CapabilityDocument,
  nodeId: NodeId,
  colorByBucket: Map<NodeId, ReturnType<typeof nextColor>>,
) {
  let current = doc.nodesById[nodeId];
  let color = colorByBucket.get(nodeId);
  while (!color && current?.parentId) {
    color = colorByBucket.get(current.parentId);
    current = doc.nodesById[current.parentId];
  }
  return color ?? nextColor(0);
}

function uniqueId(rawId: string, usedIds: Set<NodeId>): NodeId {
  let id = rawId.trim();
  if (!id) id = 'imported-node';
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${rawId}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function isCapabilityListItem(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return stringValue(value.id) !== null && stringValue(value.name) !== null;
}

function externalMetadata(item: Record<string, unknown>): Record<string, unknown> {
  const metadata: Record<string, unknown> = { importFormat: 'capability-list' };
  for (const [key, value] of Object.entries(item)) {
    if (['id', 'name', 'label', 'description', 'parent', 'parentId'].includes(key)) continue;
    metadata[key] = value;
  }
  return metadata;
}

function parentReference(item: Record<string, unknown>): string | null {
  return stringValue(item.parent) ?? stringValue(item.parentId);
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
