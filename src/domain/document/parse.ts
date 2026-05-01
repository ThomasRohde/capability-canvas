import { createEmptyDocument, DEFAULT_HEATMAP, DEFAULT_LAYOUT, DEFAULT_SETTINGS } from './defaults';
import { rebuildChildren } from './normalize';
import { WireDocumentSchema } from './schema';
import { DOCUMENT_SCHEMA, DOCUMENT_VERSION, ROOT_PARENT_ID, type CapabilityDocument, type CapabilityNode } from './types';
import { ensureParentContainment } from '../layout/containment';
import { type Diagnostic, error, warning } from '../validation/diagnostics';
import { validateDocument } from '../validation/validate';

export interface ParseResult {
  doc: CapabilityDocument | null;
  diagnostics: Diagnostic[];
}

export function parseDocument(input: unknown): ParseResult {
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
