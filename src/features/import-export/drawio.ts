import { safeFileBaseName } from '../../domain/document/fileName';
import { sortedNodes } from '../../domain/document/normalize';
import { isNodeOnCanvas, type CapabilityDocument } from '../../domain/document/types';
import { resolveVisualDocument } from '../../domain/visual/workspace';
import { escapeXml } from './escape';
import {
  buildVisualExportModel,
  type VisualExportNodeModel,
} from './renderModel';
import type { ExportAdapter, ExportResult } from './types';

export function drawioExport(doc: CapabilityDocument): ExportResult {
  const visualDoc = resolveVisualDocument(doc);
  const model = buildVisualExportModel(doc);
  const nodeModels = new Map(model.nodes.map((node) => [node.id, node]));
  const visibleNodeIds = new Set(
    sortedNodes(visualDoc)
      .filter(isNodeOnCanvas)
      .map((node) => node.id),
  );
  const cells = [
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
    ...sortedNodes(visualDoc).filter(isNodeOnCanvas).map((node) => {
      const nodeModel = nodeModels.get(node.id);
      if (!nodeModel) return '';
      const parentNode =
        node.parentId && visibleNodeIds.has(node.parentId)
          ? visualDoc.nodesById[node.parentId]
          : null;
      const parent = parentNode?.id ?? '1';
      const x = parentNode ? node.x - parentNode.x : node.x;
      const y = parentNode ? node.y - parentNode.y : node.y;
      const style = drawioNodeStyle(nodeModel, model.fontFamily);
      const value = drawioLabelValue(nodeModel);
      return `<mxCell id="${escapeXml(node.id)}" value="${value}" style="${escapeXml(style)}" vertex="1" parent="${escapeXml(parent)}"><mxGeometry x="${num(x)}" y="${num(y)}" width="${num(node.w)}" height="${num(node.h)}" as="geometry"/></mxCell>`;
    })
  ];
  const xml = `<mxfile host="Capability Canvas"><diagram name="${escapeXml(model.title)}"><mxGraphModel><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`;
  return {
    format: 'drawio',
    filename: `${safeFileBaseName(model.title)}.drawio`,
    mimeType: 'application/xml',
    data: xml,
    diagnostics: []
  };
}

function drawioNodeStyle(
  node: VisualExportNodeModel,
  fontFamily: string,
): string {
  const labelPosition = node.isContainer
    ? [
        'verticalAlign=top',
        `spacingTop=${num(containerLabelTopSpacing(node))}`,
        'spacingBottom=6',
      ]
    : ['verticalAlign=middle', 'spacing=8'];
  const style = [
    'rounded=1',
    'absoluteArcSize=1',
    `arcSize=${num(node.radius * 2)}`,
    'whiteSpace=wrap',
    'html=1',
    'align=center',
    'labelPosition=center',
    'verticalLabelPosition=middle',
    ...labelPosition,
    `fillColor=${node.fill.background}`,
    `strokeColor=${node.fill.border}`,
    `strokeWidth=${num(node.strokeWidth)}`,
    `fontColor=${node.fill.text}`,
    `fontFamily=${fontFamily}`,
    `fontSize=${num(node.label.fontSize)}`,
    `fontStyle=${node.label.fontWeight >= 600 ? 1 : 0}`,
  ];
  return `${style.join(';')};`;
}

function drawioLabelValue(node: VisualExportNodeModel): string {
  return node.label.lines.map(escapeXml).join('&lt;br&gt;');
}

function containerLabelTopSpacing(node: VisualExportNodeModel): number {
  return Math.max(0, node.label.firstBaselineY - node.bounds.y - 12);
}

function num(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, '');
}

export const drawioAdapter: ExportAdapter = {
  format: 'drawio',
  label: 'Draw.io',
  description: 'diagrams.net XML for the active view.',
  scope: 'active-view',
  requiresValidDocument: true,
  hiddenNodes: 'excluded',
  heatmap: 'active-view-display',
  legend: 'not-rendered',
  exportDocument: drawioExport
};
