import { sortedNodes } from '../../domain/document/normalize';
import { safeFileBaseName } from '../../domain/document/fileName';
import { isNodeOnCanvas, type CapabilityDocument, type CapabilityNode } from '../../domain/document/types';
import { resolveNodeFill } from '../heatmap/resolveNodeFill';
import { escapeXml } from './escape';
import type { ExportAdapter, ExportResult } from './types';

interface RenderSvgOptions {
  includeDescriptionData?: boolean;
}

export function svgExport(doc: CapabilityDocument): ExportResult {
  return {
    format: 'svg',
    filename: `${safeFileBaseName(doc.title)}.svg`,
    mimeType: 'image/svg+xml',
    data: renderSvg(doc),
    diagnostics: []
  };
}

export function renderSvg(doc: CapabilityDocument, options: RenderSvgOptions = {}): string {
  const bounds = doc.layout.boundingBox.w > 0 ? doc.layout.boundingBox : { x: 0, y: 0, w: 1200, h: 800 };
  const nodes = sortedNodes(doc).filter(isNodeOnCanvas);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.w + 96}" height="${bounds.h + 96}" viewBox="${bounds.x - 48} ${bounds.y - 48} ${bounds.w + 96} ${bounds.h + 96}">
  <style>
    text { font-family: Inter, Arial, sans-serif; fill: #0f172a; }
    .node-label { font-size: 13px; font-weight: 500; }
    .container-label { font-size: 15px; font-weight: 600; }
  </style>
  <rect x="${bounds.x - 48}" y="${bounds.y - 48}" width="${bounds.w + 96}" height="${bounds.h + 96}" fill="#f1f5f9" />
  ${nodes.map((node) => renderNode(doc, node, options)).join('\n  ')}
</svg>`;
}

function renderNode(
  doc: CapabilityDocument,
  node: CapabilityNode,
  options: RenderSvgOptions,
): string {
  const fill = resolveNodeFill(node, doc.heatmap);
  const isContainer = node.type === 'root' || node.type === 'parent';
  const radius = isContainer ? 8 : 6;
  const label = renderLabel(doc, node, isContainer);
  const heatmapScore =
    doc.heatmap.enabled && node.heatmapValue !== undefined
      ? `<text x="${node.x + node.w / 2}" y="${node.y + node.h / 2 + 20}" text-anchor="middle" font-size="11">${node.heatmapValue.toFixed(2)}</text>`
      : '';
  const description = node.description?.trim();
  const descriptionData =
    options.includeDescriptionData && description
      ? ` class="cc-node" tabindex="0" data-description="${escapeXml(description)}"`
      : '';
  return `<g data-node-id="${escapeXml(node.id)}"${descriptionData}>
    <rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${radius}" fill="${fill.background}" stroke="${fill.border}" stroke-width="${isContainer ? 1.5 : 1}" />
    ${label}
    ${heatmapScore}
  </g>`;
}

function renderLabel(
  doc: CapabilityDocument,
  node: CapabilityNode,
  isContainer: boolean,
): string {
  const className = isContainer ? 'container-label' : 'node-label';
  const x = node.x + node.w / 2;
  const maxChars = Math.max(8, Math.floor((node.w - 16) / (isContainer ? 8 : 7)));
  const lines = wrapLabel(node.label, maxChars, isContainer ? 2 : 3);
  const lineHeight = isContainer ? 17 : 15;
  const firstY = isContainer
    ? node.y + doc.settings.containerLabelOffsetTop + 12
    : node.y + node.h / 2 - ((lines.length - 1) * lineHeight) / 2 + 5;
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${x}" ${index === 0 ? `y="${firstY}"` : `dy="${lineHeight}"`}>${escapeXml(line)}</tspan>`,
    )
    .join('');
  return `<text text-anchor="middle" class="${className}">${tspans}</text>`;
}

function wrapLabel(label: string, maxChars: number, maxLines: number): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxChars ? `${word.slice(0, Math.max(1, maxChars - 3))}...` : word;
    if (lines.length === maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1]!;
    lines[maxLines - 1] =
      last.length > maxChars - 3
        ? `${last.slice(0, Math.max(1, maxChars - 3))}...`
        : `${last}...`;
  }
  return lines;
}

export const svgAdapter: ExportAdapter = {
  format: 'svg',
  label: 'SVG',
  exportDocument: svgExport
};
