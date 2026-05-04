import { safeFileBaseName } from '../../domain/document/fileName';
import { sortedNodes } from '../../domain/document/normalize';
import type { CapabilityDocument } from '../../domain/document/types';
import { resolveNodeFill } from '../heatmap/resolveNodeFill';
import { escapeXml } from './escape';
import type { ExportAdapter, ExportResult } from './types';

export function drawioExport(doc: CapabilityDocument): ExportResult {
  const cells = [
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
    ...sortedNodes(doc).map((node) => {
      const fill = resolveNodeFill(node, doc.heatmap);
      const parentNode = node.parentId ? doc.nodesById[node.parentId] : null;
      const parent = parentNode?.id ?? '1';
      const x = parentNode ? node.x - parentNode.x : node.x;
      const y = parentNode ? node.y - parentNode.y : node.y;
      const style = `rounded=1;whiteSpace=wrap;html=1;fillColor=${fill.background};strokeColor=${fill.border};fontColor=#0f172a;`;
      return `<mxCell id="${escapeXml(node.id)}" value="${escapeXml(node.label)}" style="${style}" vertex="1" parent="${escapeXml(parent)}"><mxGeometry x="${x}" y="${y}" width="${node.w}" height="${node.h}" as="geometry"/></mxCell>`;
    })
  ];
  const xml = `<mxfile host="Capability Canvas"><diagram name="${escapeXml(doc.title)}"><mxGraphModel><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`;
  return {
    format: 'drawio',
    filename: `${safeFileBaseName(doc.title)}.drawio`,
    mimeType: 'application/xml',
    data: xml,
    diagnostics: []
  };
}

export const drawioAdapter: ExportAdapter = {
  format: 'drawio',
  label: 'Draw.io',
  exportDocument: drawioExport
};
