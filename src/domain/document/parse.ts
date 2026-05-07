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
import { materializeActiveViewMetadata, normalizeVisualWorkspace } from '../visual/workspace';

export interface ParseResult {
  doc: CapabilityDocument | null;
  diagnostics: Diagnostic[];
}

export function parseDocument(input: unknown): ParseResult {
  const externalShape = parseCapabilityList(input);
  if (externalShape) return externalShape;

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
  const finalIdsByRawId = new Map<string, string[]>();
  for (const rawNode of parsed.data.nodes) {
    const count = idCounts.get(rawNode.id) ?? 0;
    idCounts.set(rawNode.id, count + 1);
    const id = count === 0 ? rawNode.id : `${rawNode.id}-${count + 1}`;
    if (id !== rawNode.id) {
      diagnostics.push(warning('duplicate-id-repaired', `Duplicate id ${rawNode.id} was renamed to ${id}.`, id));
    }
    rewrittenIds.set(`${rawNode.id}:${count}`, id);
    finalIdsByRawId.set(rawNode.id, [
      ...(finalIdsByRawId.get(rawNode.id) ?? []),
      id,
    ]);
  }

  const seenByOriginal = new Map<string, number>();
  for (const rawNode of parsed.data.nodes) {
    const seen = seenByOriginal.get(rawNode.id) ?? 0;
    seenByOriginal.set(rawNode.id, seen + 1);
    const id = rewrittenIds.get(`${rawNode.id}:${seen}`) ?? rawNode.id;
    const parentCandidates = rawNode.parentId
      ? finalIdsByRawId.get(rawNode.parentId) ?? []
      : [];
    let parentId: NodeId | null = null;
    if (rawNode.parentId && parentCandidates.length === 1) {
      parentId = parentCandidates[0]!;
    } else if (rawNode.parentId && parentCandidates.length === 0) {
      diagnostics.push(warning('missing-parent-repaired', `Missing parent ${rawNode.parentId}; ${id} moved to root.`, id));
    } else if (rawNode.parentId && parentCandidates.length > 1) {
      diagnostics.push(
        warning(
          'ambiguous-parent-repaired',
          `Parent reference ${rawNode.parentId} for raw child id ${rawNode.id} repaired as ${id} matched multiple imported nodes (${parentCandidates.join(', ')}); ${id} moved to root.`,
          id,
        ),
      );
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

  const visual = normalizeVisualWorkspace(doc, parsed.data.visual);
  doc.visual = visual.visual;
  for (const item of visual.diagnostics) {
    diagnostics.push(warning(item.code, item.message, item.nodeId));
  }

  return finalizeDocument(doc, diagnostics);
}

const EXTERNAL_ID_KEYS = [
  'id',
  'nodeid',
  'capabilityid',
  'capabilitykey',
  'uuid',
  'uid',
  'key',
  'identifier',
  'code',
  'slug',
];
const EXTERNAL_NAME_KEYS = [
  'name',
  'label',
  'title',
  'displayname',
  'displaylabel',
  'capabilityname',
  'text',
];
const EXTERNAL_DESCRIPTION_KEYS = [
  'description',
  'desc',
  'summary',
  'details',
  'documentation',
  'notes',
  'comment',
];
const EXTERNAL_PARENT_KEYS = [
  'parentid',
  'parent',
  'parentkey',
  'parentslug',
  'parentcode',
  'parentuuid',
  'parentidentifier',
  'parentcapabilityid',
];
const EXTERNAL_CHILD_KEYS = [
  'children',
  'childre',
  'childnodes',
  'childcapabilities',
  'subcapabilities',
  'items',
  'nodes',
];
const EXTERNAL_COLLECTION_KEYS = [
  'nodes',
  'items',
  'capabilities',
  'records',
  'data',
];
const EXTERNAL_ROOT_KEYS = ['root', 'model'];
const EXTERNAL_SEMANTIC_KEYS = new Set([
  ...EXTERNAL_ID_KEYS,
  ...EXTERNAL_NAME_KEYS,
  ...EXTERNAL_DESCRIPTION_KEYS,
  ...EXTERNAL_PARENT_KEYS,
  ...EXTERNAL_CHILD_KEYS,
]);

interface ExternalHierarchySource {
  nodes: ExternalNodeInput[];
  title?: string;
  importFormat: 'capability-list' | 'external-json-hierarchy';
  diagnosticCode: string;
  diagnosticMessage: string;
}

interface ExternalNodeInput {
  record: Record<string, unknown>;
  rawId: string | null;
  aliases: string[];
  label: string | null;
  description: string | null;
  parentRefs: string[];
  hasParentField: boolean;
  hasChildren: boolean;
  inferredParentIndex: number | null;
}

function parseCapabilityList(input: unknown): ParseResult | null {
  const source = collectExternalHierarchy(input);
  if (!source) return null;

  const diagnostics: Diagnostic[] = [
    warning(source.diagnosticCode, source.diagnosticMessage),
  ];
  const doc = createEmptyDocument(externalDocumentTitle(source));
  doc.layout = {
    ...doc.layout,
    isUserArranged: false,
    preservePositions: false,
  };

  const idByAlias = new Map<string, NodeId>();
  const idsByIndex: NodeId[] = [];
  const usedIds = new Set<NodeId>();
  for (const [index, item] of source.nodes.entries()) {
    const fallbackId =
      item.rawId ??
      slugFromLabel(item.label) ??
      `imported-${index + 1}`;
    const id = uniqueId(fallbackId, usedIds);
    idsByIndex[index] = id;
    usedIds.add(id);

    for (const alias of uniqueStrings([
      fallbackId,
      ...item.aliases,
      item.label,
    ])) {
      if (!idByAlias.has(alias)) idByAlias.set(alias, id);
    }
    if (id !== fallbackId) {
      diagnostics.push(
        warning(
          'duplicate-id-repaired',
          `Duplicate id ${fallbackId} was renamed to ${id}.`,
          id,
        ),
      );
    }
  }

  for (const [index, item] of source.nodes.entries()) {
    const id = idsByIndex[index] ?? `imported-${index + 1}`;
    const rawParent =
      item.inferredParentIndex !== null
        ? null
        : item.parentRefs.find((ref) => idByAlias.has(ref)) ??
          item.parentRefs[0] ??
          null;
    let parentId =
      item.inferredParentIndex !== null
        ? idsByIndex[item.inferredParentIndex] ?? null
        : rawParent
          ? idByAlias.get(rawParent) ?? null
          : null;
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
      label: item.label ?? id,
      parentId,
      type: parentId ? 'leaf' : 'root',
      description: item.description ?? undefined,
      color: nextColor(0),
      metadata: externalMetadata(item.record, source.importFormat),
      isOnCanvas: false,
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
  const rebuilt = migrateLegacyColorOverrides(
    breakInvalidRelations(rebuildChildren(doc), diagnostics),
  );
  const visual = normalizeVisualWorkspace(rebuilt, rebuilt.visual);
  let withVisual = { ...rebuilt, visual: visual.visual };
  for (const item of visual.diagnostics) {
    diagnostics.push(warning(item.code, item.message, item.nodeId));
  }
  withVisual = materializeActiveViewMetadata(withVisual);
  const contained = ensureParentContainment(withVisual);
  for (const nodeId of contained.changedNodeIds) {
    diagnostics.push(warning('parent-containment-repaired', `${nodeId} was expanded to contain its children.`, nodeId));
  }
  const validation = validateDocument(contained.doc);
  diagnostics.push(...validation.diagnostics);
  return { doc: contained.doc, diagnostics };
}

function migrateLegacyColorOverrides(doc: CapabilityDocument): CapabilityDocument {
  let changed = false;
  const nodesById = { ...doc.nodesById };
  for (const node of Object.values(doc.nodesById)) {
    if (node.colorOverride) continue;
    if (node.type !== "leaf" || node.isTextLabel) continue;
    const parentColor = node.parentId
      ? doc.nodesById[node.parentId]?.color
      : undefined;
    if (!parentColor || node.color === parentColor) continue;
    nodesById[node.id] = { ...node, colorOverride: node.color };
    changed = true;
  }
  return changed ? { ...doc, nodesById } : doc;
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

function collectExternalHierarchy(input: unknown): ExternalHierarchySource | null {
  if (Array.isArray(input)) {
    const nodes = collectExternalNodeArray(input, null);
    if (!isExternalSourceUseful(nodes, 'array')) return null;
    return {
      nodes,
      importFormat: hasLegacyCapabilityListShape(nodes)
        ? 'capability-list'
        : 'external-json-hierarchy',
      diagnosticCode: hasLegacyCapabilityListShape(nodes)
        ? 'external-capability-list-imported'
        : 'external-json-hierarchy-imported',
      diagnosticMessage: hasLegacyCapabilityListShape(nodes)
        ? 'Imported a capability list JSON array and converted it to a Capability Canvas document.'
        : 'Imported a schema-less JSON hierarchy and converted it to a Capability Canvas document.',
    };
  }

  if (!isRecord(input)) return null;
  if (typeof input.schema === 'string') return null;

  const wrapperTitle = valueForKeyCandidates(input, EXTERNAL_NAME_KEYS);
  const root = valueForKeyCandidates(input, EXTERNAL_ROOT_KEYS);
  if (isRecord(root)) {
    const nodes = collectExternalNodeRecord(root, null);
    if (nodes.length > 0) {
      return externalHierarchySource(
        nodes,
        scalarString(wrapperTitle) ?? undefined,
      );
    }
  }

  if (looksLikeExternalNode(input)) {
    const nodes = collectExternalNodeRecord(input, null);
    if (isExternalSourceUseful(nodes, 'self')) {
      return externalHierarchySource(
        nodes,
        scalarString(wrapperTitle) ?? undefined,
      );
    }
  }

  const collection = valueForKeyCandidates(input, EXTERNAL_COLLECTION_KEYS);
  if (Array.isArray(collection)) {
    const nodes = collectExternalNodeArray(collection, null);
    if (nodes.length > 0) {
      return externalHierarchySource(
        nodes,
        scalarString(wrapperTitle) ?? undefined,
      );
    }
  }

  return null;
}

function externalHierarchySource(
  nodes: ExternalNodeInput[],
  title?: string,
): ExternalHierarchySource {
  return {
    nodes,
    title,
    importFormat: 'external-json-hierarchy',
    diagnosticCode: 'external-json-hierarchy-imported',
    diagnosticMessage:
      'Imported a schema-less JSON hierarchy and converted it to a Capability Canvas document.',
  };
}

function collectExternalNodeArray(
  values: unknown[],
  parentIndex: number | null,
): ExternalNodeInput[] {
  const nodes: ExternalNodeInput[] = [];
  for (const value of values) {
    if (!isRecord(value)) continue;
    collectExternalNodeRecordInto(value, parentIndex, nodes);
  }
  return nodes;
}

function collectExternalNodeRecord(
  record: Record<string, unknown>,
  parentIndex: number | null,
): ExternalNodeInput[] {
  const nodes: ExternalNodeInput[] = [];
  collectExternalNodeRecordInto(record, parentIndex, nodes);
  return nodes;
}

function collectExternalNodeRecordInto(
  record: Record<string, unknown>,
  parentIndex: number | null,
  nodes: ExternalNodeInput[],
): void {
  const childValues = childRecordValues(record);
  let nextParentIndex = parentIndex;
  if (looksLikeExternalNode(record)) {
    nextParentIndex = nodes.length;
    nodes.push({
      record,
      rawId: valueForKeyCandidatesAsString(record, EXTERNAL_ID_KEYS),
      aliases: externalAliases(record),
      label: valueForKeyCandidatesAsString(record, EXTERNAL_NAME_KEYS),
      description: valueForKeyCandidatesAsString(
        record,
        EXTERNAL_DESCRIPTION_KEYS,
      ),
      parentRefs: parentReferences(record),
      hasParentField: hasKeyCandidate(record, EXTERNAL_PARENT_KEYS),
      hasChildren: childValues.length > 0,
      inferredParentIndex: parentIndex,
    });
  }

  for (const value of childValues) {
    collectExternalNodeRecordInto(value, nextParentIndex, nodes);
  }
}

function childRecordValues(record: Record<string, unknown>): Record<string, unknown>[] {
  const children: Record<string, unknown>[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!EXTERNAL_CHILD_KEYS.includes(normalizeExternalKey(key))) continue;
    if (!Array.isArray(value)) continue;
    for (const child of value) {
      if (isRecord(child)) children.push(child);
    }
  }
  return children;
}

function isExternalSourceUseful(
  nodes: ExternalNodeInput[],
  sourceKind: 'array' | 'self',
): boolean {
  if (nodes.length === 0) return false;
  if (nodes.some((node) => node.hasChildren || node.hasParentField)) {
    return true;
  }
  if (sourceKind === 'array') return nodes.length > 1;
  return false;
}

function hasLegacyCapabilityListShape(nodes: ExternalNodeInput[]): boolean {
  return (
    nodes.length > 0 &&
    nodes.every((node) => hasKeyCandidate(node.record, ['id'])) &&
    nodes.every((node) => hasKeyCandidate(node.record, ['name'])) &&
    nodes.some((node) => hasKeyCandidate(node.record, ['parent', 'parentid']))
  );
}

function looksLikeExternalNode(record: Record<string, unknown>): boolean {
  return (
    valueForKeyCandidatesAsString(record, EXTERNAL_ID_KEYS) !== null ||
    valueForKeyCandidatesAsString(record, EXTERNAL_NAME_KEYS) !== null
  );
}

function externalDocumentTitle(source: ExternalHierarchySource): string {
  if (source.title) return source.title;
  const root =
    source.nodes.find(
      (node) =>
        node.inferredParentIndex === null &&
        node.parentRefs.length === 0,
    ) ?? source.nodes[0];
  return root?.label ?? root?.rawId ?? 'Imported capability model';
}

function uniqueId(rawId: string, usedIds: Set<NodeId>): NodeId {
  const base = rawId.trim() || 'imported-node';
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function externalMetadata(
  item: Record<string, unknown>,
  importFormat: ExternalHierarchySource['importFormat'],
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { importFormat };
  for (const [key, value] of Object.entries(item)) {
    const normalizedKey = normalizeExternalKey(key);
    if (normalizedKey !== 'slug' && EXTERNAL_SEMANTIC_KEYS.has(normalizedKey)) {
      continue;
    }
    metadata[key] = value;
  }
  return metadata;
}

function parentReferences(item: Record<string, unknown>): string[] {
  const refs: string[] = [];
  for (const [key, value] of Object.entries(item)) {
    if (!EXTERNAL_PARENT_KEYS.includes(normalizeExternalKey(key))) continue;
    refs.push(...referenceStrings(value));
  }
  return uniqueStrings(refs);
}

function externalAliases(item: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...valuesForKeyCandidatesAsStrings(item, EXTERNAL_ID_KEYS),
    ...valuesForKeyCandidatesAsStrings(item, EXTERNAL_NAME_KEYS),
  ]);
}

function referenceStrings(value: unknown): string[] {
  const scalar = scalarString(value);
  if (scalar) return [scalar];
  if (!isRecord(value)) return [];
  return uniqueStrings([
    ...valuesForKeyCandidatesAsStrings(value, EXTERNAL_ID_KEYS),
    ...valuesForKeyCandidatesAsStrings(value, EXTERNAL_NAME_KEYS),
  ]);
}

function valueForKeyCandidatesAsString(
  record: Record<string, unknown>,
  candidates: string[],
): string | null {
  return scalarString(valueForKeyCandidates(record, candidates));
}

function valuesForKeyCandidatesAsStrings(
  record: Record<string, unknown>,
  candidates: string[],
): string[] {
  const values: string[] = [];
  for (const candidate of candidates) {
    for (const [key, value] of Object.entries(record)) {
      if (normalizeExternalKey(key) !== candidate) continue;
      const scalar = scalarString(value);
      if (scalar) values.push(scalar);
    }
  }
  return uniqueStrings(values);
}

function valueForKeyCandidates(
  record: Record<string, unknown>,
  candidates: string[],
): unknown {
  for (const candidate of candidates) {
    for (const [key, value] of Object.entries(record)) {
      if (normalizeExternalKey(key) === candidate) return value;
    }
  }
  return undefined;
}

function hasKeyCandidate(
  record: Record<string, unknown>,
  candidates: string[],
): boolean {
  return Object.keys(record).some((key) =>
    candidates.includes(normalizeExternalKey(key)),
  );
}

function scalarString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugFromLabel(label: string | null): string | null {
  if (!label) return null;
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = scalarString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeExternalKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
