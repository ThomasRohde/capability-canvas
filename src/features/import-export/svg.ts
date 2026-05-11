import { safeFileBaseName } from '../../domain/document/fileName';
import type { CapabilityDocument } from '../../domain/document/types';
import { escapeXml } from './escape';
import {
  buildVisualExportModel,
  type VisualExportLegendModel,
  type VisualExportModel,
  type VisualExportNodeModel,
} from './renderModel';
import type { ExportAdapter, ExportResult } from './types';

interface RenderSvgOptions {
  includeDescriptionData?: boolean;
}

export function svgExport(doc: CapabilityDocument): ExportResult {
  const model = buildVisualExportModel(doc);
  return {
    format: 'svg',
    filename: `${safeFileBaseName(model.title)}.svg`,
    mimeType: 'image/svg+xml',
    data: renderSvg(model),
    diagnostics: []
  };
}

export function renderSvg(
  model: VisualExportModel,
  options: RenderSvgOptions = {},
): string {
  const bounds = model.surfaceBounds;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${num(bounds.w)}" height="${num(bounds.h)}" viewBox="${num(bounds.x)} ${num(bounds.y)} ${num(bounds.w)} ${num(bounds.h)}">
  ${renderDefs(model)}
  <style>
    text { font-family: "${escapeXml(model.fontFamily)}", Arial, sans-serif; fill: #0f172a; }
    .node-label { font-size: 13px; font-weight: 500; }
    .container-label { font-size: 14px; font-weight: 600; }
    .heatmap-score { fill: #475569; font-variant-numeric: tabular-nums; }
    .heatmap-legend-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .heatmap-legend-label { font-size: 11px; fill: #64748b; }
  </style>
  <rect x="${num(bounds.x)}" y="${num(bounds.y)}" width="${num(bounds.w)}" height="${num(bounds.h)}" fill="${model.background}" />
  ${model.nodes.map((node) => renderNode(node, options)).join('\n  ')}
  ${model.legend ? renderLegend(model.legend) : ''}
</svg>`;
}

function renderDefs(model: VisualExportModel): string {
  if (!model.legend) return '<defs />';
  const stopCount = Math.max(1, model.legend.stops.length - 1);
  const stops = model.legend.stops
    .map(
      (color, index) =>
        `<stop offset="${num((index / stopCount) * 100)}%" stop-color="${color}" />`,
    )
    .join('');
  return `<defs><linearGradient id="cc-heatmap-gradient" x1="0%" y1="0%" x2="100%" y2="0%">${stops}</linearGradient></defs>`;
}

function renderNode(
  node: VisualExportNodeModel,
  options: RenderSvgOptions,
): string {
  const descriptionData =
    options.includeDescriptionData && node.description
      ? ` class="cc-node" tabindex="0" data-description="${escapeXml(node.description)}"`
      : '';
  return `<g data-node-id="${escapeXml(node.id)}"${descriptionData}>
    <rect x="${num(node.bounds.x)}" y="${num(node.bounds.y)}" width="${num(node.bounds.w)}" height="${num(node.bounds.h)}" rx="${num(node.radius)}" fill="${node.fill.background}" stroke="${node.fill.border}" stroke-width="${num(node.strokeWidth)}" />
    ${renderLabel(node)}
    ${node.score ? renderScore(node) : ''}
  </g>`;
}

function renderLabel(node: VisualExportNodeModel): string {
  const className = node.isContainer ? 'container-label' : 'node-label';
  const tspans = node.label.lines
    .map(
      (line, index) =>
        `<tspan x="${num(node.label.x)}" ${index === 0 ? `y="${num(node.label.firstBaselineY)}"` : `dy="${num(node.label.lineHeight)}"`}>${escapeXml(line)}</tspan>`,
    )
    .join('');
  return `<text text-anchor="middle" class="${className}" font-size="${num(node.label.fontSize)}" font-weight="${node.label.fontWeight}">${tspans}</text>`;
}

function renderScore(node: VisualExportNodeModel): string {
  const score = node.score;
  if (!score) return '';
  return `<g class="heatmap-score heatmap-score-badge">
      <rect x="${num(score.bounds.x)}" y="${num(score.bounds.y)}" width="${num(score.bounds.w)}" height="${num(score.bounds.h)}" rx="${num(score.bounds.h / 2)}" fill="#ffffff" fill-opacity="0.72" stroke="#64748b" stroke-opacity="0.16" />
      <text x="${num(score.textX)}" y="${num(score.textY)}" text-anchor="middle" font-size="${num(score.fontSize)}" font-weight="${score.fontWeight}">${score.value}</text>
    </g>`;
}

function renderLegend(legend: VisualExportLegendModel): string {
  return `<g class="heatmap-legend" data-legend-position="${legend.position}">
    <rect x="${num(legend.bounds.x)}" y="${num(legend.bounds.y)}" width="${num(legend.bounds.w)}" height="${num(legend.bounds.h)}" rx="10" fill="#ffffff" stroke="#e2e8f0" />
    <text class="heatmap-legend-title" x="${num(legend.titleX)}" y="${num(legend.titleY)}">${escapeXml(legend.title)}</text>
    <rect x="${num(legend.barBounds.x)}" y="${num(legend.barBounds.y)}" width="${num(legend.barBounds.w)}" height="${num(legend.barBounds.h)}" rx="${num(legend.barBounds.h / 2)}" fill="url(#cc-heatmap-gradient)" />
    <text class="heatmap-legend-label" x="${num(legend.barBounds.x)}" y="${num(legend.labelY)}">${escapeXml(legend.lowLabel)}</text>
    <text class="heatmap-legend-label" x="${num(legend.barBounds.x + legend.barBounds.w)}" y="${num(legend.labelY)}" text-anchor="end">${escapeXml(legend.highLabel)}</text>
  </g>`;
}

function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

export const svgAdapter: ExportAdapter = {
  format: 'svg',
  label: 'SVG',
  description: 'Vector export of the active visual view.',
  scope: 'active-view',
  requiresValidDocument: true,
  hiddenNodes: 'excluded',
  heatmap: 'active-view-display',
  legend: 'active-view-display',
  exportDocument: svgExport
};
