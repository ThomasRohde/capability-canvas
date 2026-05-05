import pptxgen from 'pptxgenjs';
import { safeFileBaseName } from '../../domain/document/fileName';
import { sortedNodes } from '../../domain/document/normalize';
import { isNodeOnCanvas, type CapabilityDocument } from '../../domain/document/types';
import { resolveNodeFill } from '../heatmap/resolveNodeFill';
import type { ExportAdapter, ExportResult } from './types';

export async function pptxExport(doc: CapabilityDocument): Promise<ExportResult> {
  const deck = new pptxgen();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'Capability Canvas';
  deck.subject = doc.title;
  deck.title = doc.title;
  const slide = deck.addSlide();
  slide.background = { color: 'F8FAFC' };
  slide.addText(doc.title, { x: 0.35, y: 0.2, w: 12.5, h: 0.3, fontFace: 'Aptos', fontSize: 13, bold: true });

  const bounds = doc.layout.boundingBox.w > 0 ? doc.layout.boundingBox : { x: 0, y: 0, w: 1200, h: 800 };
  const scale = Math.min(12 / bounds.w, 6.6 / bounds.h);
  const offsetX = 0.5 - bounds.x * scale;
  const offsetY = 0.7 - bounds.y * scale;

  for (const node of sortedNodes(doc).filter(isNodeOnCanvas)) {
    const fill = resolveNodeFill(node, doc.heatmap);
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
      doc.heatmap.enabled && node.heatmapValue !== undefined
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
    filename: `${safeFileBaseName(doc.title)}.pptx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    data: blob as Blob,
    diagnostics: []
  };
}

export const pptxAdapter: ExportAdapter = {
  format: 'pptx',
  label: 'PowerPoint',
  exportDocument: pptxExport
};
