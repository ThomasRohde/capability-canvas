import { safeFileBaseName } from '../../domain/document/fileName';
import { sortedNodes } from '../../domain/document/normalize';
import {
  isNodeOnCanvas,
  type CapabilityDocument,
  type CapabilityNode,
  type VisualView,
} from '../../domain/document/types';
import { resolveVisualDocument } from '../../domain/visual/workspace';
import { resolveNodeFill } from '../heatmap/resolveNodeFill';
import { escapeXml } from './escape';
import type { ExportAdapter, ExportResult } from './types';

interface ArchimateIdentifiers {
  model: string;
  nodes: Map<string, string>;
  relationships: Map<string, string>;
  used: Set<string>;
}

export function archimateExport(doc: CapabilityDocument): ExportResult {
  const nodes = sortedNodes(doc);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const identifiers = createArchimateIdentifiers(doc, nodes);
  const relationshipModels = createRelationshipModels(nodes, nodeIds, identifiers);
  const elements = nodes
    .map(
      (node) =>
        `<element identifier="${escapeXml(identifiers.nodes.get(node.id)!)}" xsi:type="Capability"><name>${escapeXml(node.label)}</name><documentation>${escapeXml(node.description ?? '')}</documentation></element>`
    )
    .join('');
  const relationships = relationshipModels
    .map(
      (relationship) =>
        `<relationship identifier="${escapeXml(relationship.id)}" source="${escapeXml(relationship.source)}" target="${escapeXml(relationship.target)}" xsi:type="Composition"><name></name></relationship>`,
    )
    .join('');
  const elementsSection = elements ? `  <elements>${elements}</elements>` : '';
  const relationshipsSection = relationships
    ? `  <relationships>${relationships}</relationships>`
    : '';
  const views = archimateViews(doc, identifiers);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengroup.org/xsd/archimate/3.0/ http://www.opengroup.org/xsd/archimate/3.0/archimate3_Diagram.xsd" identifier="${escapeXml(identifiers.model)}">
  <name>${escapeXml(doc.title)}</name>
${[elementsSection, relationshipsSection, views].filter(Boolean).join('\n')}
</model>`;
  return {
    format: 'archimate',
    filename: `${safeFileBaseName(doc.title)}.archimate.xml`,
    mimeType: 'application/xml',
    data: xml,
    diagnostics: []
  };
}

function createArchimateIdentifiers(
  doc: CapabilityDocument,
  nodes: CapabilityNode[],
): ArchimateIdentifiers {
  const used = new Set<string>();
  const model = nextArchimateIdentifier(used, 'cc-model', safeFileBaseName(doc.title));
  const nodeIdentifiers = new Map<string, string>();

  for (const node of nodes) {
    nodeIdentifiers.set(node.id, nextArchimateIdentifier(used, 'cc-node', node.id));
  }

  return { model, nodes: nodeIdentifiers, relationships: new Map(), used };
}

function createRelationshipModels(
  nodes: CapabilityNode[],
  nodeIds: Set<string>,
  identifiers: ArchimateIdentifiers,
) {
  return nodes
    .filter((node) => node.parentId && nodeIds.has(node.parentId))
    .map((node) => {
      const source = identifiers.nodes.get(node.parentId!)!;
      const target = identifiers.nodes.get(node.id)!;
      const id = nextArchimateIdentifier(identifiers.used, 'cc-rel', `${source}-${target}`);
      identifiers.relationships.set(relationshipKey(node.parentId!, node.id), id);
      return { id, source, target };
    });
}

function archimateViews(
  doc: CapabilityDocument,
  identifiers: ArchimateIdentifiers,
): string {
  const views = doc.visual.viewOrder
    .map((viewId) => doc.visual.viewsById[viewId])
    .filter((view): view is VisualView => Boolean(view))
    .map((view) => archimateView(doc, view, identifiers));

  if (views.length === 0) return '';
  return `  <views><diagrams>${views.join('')}</diagrams></views>`;
}

function archimateView(
  doc: CapabilityDocument,
  view: VisualView,
  identifiers: ArchimateIdentifiers,
): string {
  const visualDoc = resolveVisualDocument(doc, view.id);
  const nodes = sortedNodes(visualDoc).filter(isNodeOnCanvas);
  const viewNodeIds = new Map<string, string>();
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const offset = viewCoordinateOffset(nodes);
  const viewId = nextArchimateIdentifier(identifiers.used, 'cc-view', view.id);

  for (const node of nodes) {
    viewNodeIds.set(
      node.id,
      nextArchimateIdentifier(identifiers.used, 'cc-view-node', `${view.id}-${node.id}`),
    );
  }

  const viewNodes = nodes
    .map((node) => archimateViewNode(visualDoc, node, identifiers, viewNodeIds, offset))
    .join('');
  const viewConnections = nodes
    .filter((node) => node.parentId && visibleNodeIds.has(node.parentId))
    .map((node) => archimateViewConnection(view.id, node, identifiers, viewNodeIds))
    .join('');
  const documentation = view.description?.trim()
    ? `<documentation>${escapeXml(view.description.trim())}</documentation>`
    : '';

  return `<view identifier="${escapeXml(viewId)}" xsi:type="Diagram" viewpoint="Capability Map"><name>${escapeXml(view.name)}</name>${documentation}${viewNodes}${viewConnections}</view>`;
}

function archimateViewNode(
  visualDoc: CapabilityDocument,
  node: CapabilityNode,
  identifiers: ArchimateIdentifiers,
  viewNodeIds: Map<string, string>,
  offset: { x: number; y: number },
): string {
  return `<node identifier="${escapeXml(viewNodeIds.get(node.id)!)}" elementRef="${escapeXml(identifiers.nodes.get(node.id)!)}" xsi:type="Element" x="${nonNegativeInt(node.x + offset.x)}" y="${nonNegativeInt(node.y + offset.y)}" w="${positiveInt(node.w)}" h="${positiveInt(node.h)}">${archimateNodeStyle(visualDoc, node)}</node>`;
}

function archimateViewConnection(
  viewId: string,
  node: CapabilityNode,
  identifiers: ArchimateIdentifiers,
  viewNodeIds: Map<string, string>,
): string {
  const relationshipRef = identifiers.relationships.get(relationshipKey(node.parentId!, node.id));
  if (!relationshipRef) return '';
  const connectionId = nextArchimateIdentifier(
    identifiers.used,
    'cc-view-connection',
    `${viewId}-${node.parentId}-${node.id}`,
  );
  return `<connection identifier="${escapeXml(connectionId)}" relationshipRef="${escapeXml(relationshipRef)}" source="${escapeXml(viewNodeIds.get(node.parentId!)!)}" target="${escapeXml(viewNodeIds.get(node.id)!)}" xsi:type="Relationship">${archimateConnectionStyle()}</connection>`;
}

function archimateNodeStyle(visualDoc: CapabilityDocument, node: CapabilityNode): string {
  const fill = resolveNodeFill(node, visualDoc.heatmap);
  const lineColor = rgbFromHex(fill.border);
  const fillColor = rgbFromHex(fill.background);
  const fontColor = rgbFromHex(fill.text);
  const isContainer = node.type !== 'leaf' && !node.isTextLabel;

  return `<style lineWidth="${isContainer ? 2 : 1}"><lineColor ${rgbAttributes(lineColor)} a="100"/><fillColor ${rgbAttributes(fillColor)} a="100"/><font name="${escapeXml(visualDoc.settings.fontFamily)}" size="${isContainer ? 14 : 12}" style="${isContainer ? 'bold' : 'plain'}"><color ${rgbAttributes(fontColor)} a="100"/></font></style>`;
}

function archimateConnectionStyle(): string {
  return '<style lineWidth="1"><lineColor r="100" g="116" b="139" a="100"/></style>';
}

function viewCoordinateOffset(nodes: CapabilityNode[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 0, y: 0 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  return { x: -minX, y: -minY };
}

function relationshipKey(sourceId: string, targetId: string): string {
  return JSON.stringify([sourceId, targetId]);
}

function positiveInt(value: number): number {
  return Math.max(1, Math.round(value));
}

function nonNegativeInt(value: number): number {
  return Math.max(0, Math.round(value));
}

function rgbFromHex(color: string): { r: number; g: number; b: number } {
  const normalized = color.replace('#', '').trim();
  const hex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : normalized;
  const value = Number.parseInt(hex.slice(0, 6), 16);
  if (!Number.isFinite(value)) return { r: 0, g: 0, b: 0 };
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbAttributes(color: { r: number; g: number; b: number }): string {
  return `r="${color.r}" g="${color.g}" b="${color.b}"`;
}

function nextArchimateIdentifier(used: Set<string>, prefix: string, seed: string): string {
  const base = `${prefix}-${toNcNamePart(seed)}`;
  let candidate = base;
  let suffix = 2;

  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  used.add(candidate);
  return candidate;
}

function toNcNamePart(value: string): string {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9_.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  );
}

export const archimateAdapter: ExportAdapter = {
  format: 'archimate',
  label: 'ArchiMate',
  description: 'ArchiMate Open Exchange model and diagram view export.',
  scope: 'full-model',
  requiresValidDocument: false,
  hiddenNodes: 'included',
  heatmap: 'source-settings',
  legend: 'not-rendered',
  exportDocument: archimateExport
};
