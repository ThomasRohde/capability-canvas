import { sortedNodes } from '../../domain/document/normalize';
import type { CapabilityDocument, CapabilityNode } from '../../domain/document/types';
import { resolveNodeFill } from '../heatmap/resolveNodeFill';
import { safeName } from './json';
import type { ExportAdapter, ExportResult } from './types';

export function svgExport(doc: CapabilityDocument): ExportResult {
  return {
    format: 'svg',
    filename: `${safeName(doc.title)}.svg`,
    mimeType: 'image/svg+xml',
    data: renderSvg(doc),
    diagnostics: []
  };
}

export function renderSvg(doc: CapabilityDocument): string {
  const bounds = doc.layout.boundingBox.w > 0 ? doc.layout.boundingBox : { x: 0, y: 0, w: 1200, h: 800 };
  const nodes = sortedNodes(doc);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.w + 96}" height="${bounds.h + 96}" viewBox="${bounds.x - 48} ${bounds.y - 48} ${bounds.w + 96} ${bounds.h + 96}">
  <style>
    text { font-family: Inter, Arial, sans-serif; fill: #0f172a; }
    .node-label { font-size: 13px; font-weight: 500; }
    .container-label { font-size: 15px; font-weight: 600; }
  </style>
  <rect x="${bounds.x - 48}" y="${bounds.y - 48}" width="${bounds.w + 96}" height="${bounds.h + 96}" fill="#f1f5f9" />
  ${nodes.map((node) => renderNode(doc, node)).join('\n  ')}
</svg>`;
}

function renderNode(doc: CapabilityDocument, node: CapabilityNode): string {
  const fill = resolveNodeFill(node, doc.heatmap);
  const isContainer = node.type === 'root' || node.type === 'parent';
  const radius = isContainer ? 8 : 6;
  return `<g data-node-id="${escapeXml(node.id)}">
    <rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${radius}" fill="${fill.background}" stroke="${fill.border}" stroke-width="${isContainer ? 1.5 : 1}" />
    <text x="${node.x + node.w / 2}" y="${node.y + (isContainer ? 26 : node.h / 2 + 5)}" text-anchor="middle" class="${isContainer ? 'container-label' : 'node-label'}">${escapeXml(node.label)}</text>
    ${node.heatmapValue !== undefined ? `<text x="${node.x + node.w / 2}" y="${node.y + node.h / 2 + 20}" text-anchor="middle" font-size="11">${node.heatmapValue.toFixed(2)}</text>` : ''}
  </g>`;
}

export function escapeXml(input: string): string {
  return input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export const svgAdapter: ExportAdapter = {
  format: 'svg',
  label: 'SVG',
  exportDocument: svgExport
};

