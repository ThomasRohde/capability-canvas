import { sortedNodes } from '../../domain/document/normalize';
import type { CapabilityDocument } from '../../domain/document/types';
import { safeName } from './json';
import { escapeXml } from './svg';
import type { ExportAdapter, ExportResult } from './types';

export function archimateExport(doc: CapabilityDocument): ExportResult {
  const nodes = sortedNodes(doc);
  const elements = nodes
    .map(
      (node) =>
        `<element identifier="${escapeXml(node.id)}" xsi:type="BusinessCapability"><name>${escapeXml(node.label)}</name><documentation>${escapeXml(node.description ?? '')}</documentation></element>`
    )
    .join('');
  const relationships = nodes
    .filter((node) => node.parentId)
    .map(
      (node) =>
        `<relationship identifier="rel-${escapeXml(node.parentId!)}-${escapeXml(node.id)}" source="${escapeXml(node.parentId!)}" target="${escapeXml(node.id)}" xsi:type="CompositionRelationship"/>`
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" identifier="${escapeXml(safeName(doc.title))}">
  <name>${escapeXml(doc.title)}</name>
  <elements>${elements}</elements>
  <relationships>${relationships}</relationships>
</model>`;
  return {
    format: 'archimate',
    filename: `${safeName(doc.title)}.archimate.xml`,
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

