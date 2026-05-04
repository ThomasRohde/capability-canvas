import { safeFileBaseName } from '../../domain/document/fileName';
import { sortedNodes } from '../../domain/document/normalize';
import { isNodeOnCanvas, type CapabilityDocument } from '../../domain/document/types';
import { escapeXml } from './escape';
import type { ExportAdapter, ExportResult } from './types';

export function archimateExport(doc: CapabilityDocument): ExportResult {
  const nodes = sortedNodes(doc).filter(isNodeOnCanvas);
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const elements = nodes
    .map(
      (node) =>
        `<element identifier="${escapeXml(node.id)}" xsi:type="Capability"><name>${escapeXml(node.label)}</name><documentation>${escapeXml(node.description ?? '')}</documentation></element>`
    )
    .join('');
  const relationships = nodes
    .filter((node) => node.parentId && visibleNodeIds.has(node.parentId))
    .map(
      (node) =>
        `<relationship identifier="rel-${escapeXml(node.parentId!)}-${escapeXml(node.id)}" source="${escapeXml(node.parentId!)}" target="${escapeXml(node.id)}" xsi:type="CompositionRelationship"/>`
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="${escapeXml(safeFileBaseName(doc.title))}">
  <name>${escapeXml(doc.title)}</name>
  <elements>${elements}</elements>
  <relationships>${relationships}</relationships>
</model>`;
  return {
    format: 'archimate',
    filename: `${safeFileBaseName(doc.title)}.archimate.xml`,
    mimeType: 'application/xml',
    data: xml,
    diagnostics: []
  };
}

export const archimateAdapter: ExportAdapter = {
  format: 'archimate',
  label: 'ArchiMate',
  exportDocument: archimateExport
};
