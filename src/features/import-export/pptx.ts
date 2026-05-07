import pptxgen from 'pptxgenjs';
import { safeFileBaseName } from '../../domain/document/fileName';
import { sortedNodes } from '../../domain/document/normalize';
import { isNodeOnCanvas, type CapabilityDocument } from '../../domain/document/types';
import { resolveVisualDocument } from '../../domain/visual/workspace';
import { resolveNodeFill } from '../heatmap/resolveNodeFill';
import type { ExportAdapter, ExportResult } from './types';

export async function pptxExport(doc: CapabilityDocument): Promise<ExportResult> {
  const visualDoc = resolveVisualDocument(doc);
  const deck = new pptxgen();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'Capability Canvas';
  deck.subject = visualDoc.title;
  deck.title = visualDoc.title;
  const slide = deck.addSlide();
  slide.background = { color: 'F8FAFC' };
  slide.addText(visualDoc.title, { x: 0.35, y: 0.2, w: 12.5, h: 0.3, fontFace: 'Aptos', fontSize: 13, bold: true });

  const bounds = visualDoc.layout.boundingBox.w > 0 ? visualDoc.layout.boundingBox : { x: 0, y: 0, w: 1200, h: 800 };
  const scale = Math.min(12 / bounds.w, 6.6 / bounds.h);
  const offsetX = 0.5 - bounds.x * scale;
  const offsetY = 0.7 - bounds.y * scale;

  for (const node of sortedNodes(visualDoc).filter(isNodeOnCanvas)) {
    const fill = resolveNodeFill(node, visualDoc.heatmap);
    slide.addShape(deck.ShapeType.roundRect, {
      x: offsetX + node.x * scale,
      y: offsetY + node.y * scale,
      w: Math.max(0.2, node.w * scale),
      h: Math.max(0.2, node.h * scale),
      rectRadius: 0.05,
      fill: { color: fill.background.replace('#', '') },
      line: { color: fill.border.replace('#', ''), width: node.type === 'leaf' ? 0.5 : 0.8 }
    });
    const label =
      visualDoc.heatmap.enabled && node.heatmapValue !== undefined
        ? `${node.label}\n${node.heatmapValue.toFixed(2)}`
        : node.label;
    slide.addText(label, {
      x: offsetX + node.x * scale + 0.04,
      y: offsetY + node.y * scale + 0.04,
      w: Math.max(0.1, node.w * scale - 0.08),
      h: Math.max(0.1, node.h * scale - 0.08),
      fontFace: 'Aptos',
      fontSize: node.type === 'leaf' ? 7 : 8,
      align: 'center',
      valign: 'middle',
      color: '0F172A',
      bold: node.type !== 'leaf'
    });
  }

  const blob = await deck.write({ outputType: 'blob' });
  return {
    format: 'pptx',
    filename: `${safeFileBaseName(visualDoc.title)}.pptx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    data: blob as Blob,
    diagnostics: []
  };
}

export const pptxAdapter: ExportAdapter = {
  format: 'pptx',
  label: 'PowerPoint',
  description: 'Native PowerPoint shapes for the active view.',
  scope: 'active-view',
  requiresValidDocument: true,
  hiddenNodes: 'excluded',
  heatmap: 'active-view-display',
  legend: 'not-rendered',
  exportDocument: pptxExport
};
