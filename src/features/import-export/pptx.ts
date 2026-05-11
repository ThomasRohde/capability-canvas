import pptxgen from 'pptxgenjs';
import { safeFileBaseName } from '../../domain/document/fileName';
import type { Bounds, CapabilityDocument } from '../../domain/document/types';
import {
  buildVisualExportModel,
  type VisualExportLegendModel,
  type VisualExportModel,
  type VisualExportNodeModel,
} from './renderModel';
import type { ExportAdapter, ExportResult } from './types';

const SLIDE_WIDE_WIDTH = 13.333;
const SLIDE_WIDE_HEIGHT = 7.5;
const SLIDE_MARGIN = 0.35;
const TITLE_HEIGHT = 0.35;
const TITLE_GAP = 0.15;
const MAX_FONT_POINTS_PER_PIXEL = 0.72;
const MIN_FONT_SIZE = 1;

interface SlideMapper {
  x(value: number): number;
  y(value: number): number;
  w(value: number): number;
  h(value: number): number;
  font(value: number): number;
}

export async function pptxExport(doc: CapabilityDocument): Promise<ExportResult> {
  const model = buildVisualExportModel(doc);
  const deck = new pptxgen();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'Capability Canvas';
  deck.subject = model.title;
  deck.title = model.title;
  const slide = deck.addSlide();
  slide.background = { color: toPptColor(model.background) };

  const mapper = createSlideMapper(model);
  if (model.exportSettings.showTitle) {
    slide.addText(model.title, {
      x: SLIDE_MARGIN,
      y: 0.2,
      w: SLIDE_WIDE_WIDTH - SLIDE_MARGIN * 2,
      h: TITLE_HEIGHT,
      fontFace: model.fontFamily,
      fontSize: 13,
      bold: true,
      color: '0F172A',
      margin: 0,
    });
  }

  for (const node of model.nodes) {
    renderNode(slide, deck, model, mapper, node);
  }
  if (model.legend) {
    renderLegend(slide, deck, model, mapper, model.legend);
  }

  const blob = await deck.write({ outputType: 'blob' });
  return {
    format: 'pptx',
    filename: `${safeFileBaseName(model.title)}.pptx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    data: blob as Blob,
    diagnostics: []
  };
}

function renderNode(
  slide: pptxgen.Slide,
  deck: pptxgen,
  model: VisualExportModel,
  mapper: SlideMapper,
  node: VisualExportNodeModel,
): void {
  const shape = mapBounds(mapper, node.bounds);
  if (!node.fill.isTransparent) {
    slide.addShape(deck.ShapeType.roundRect, {
      ...shape,
      rectRadius: Math.max(0.02, Math.min(shape.w, shape.h, mapper.w(node.radius))),
      fill: { color: toPptColor(node.fill.background) },
      line: {
        color: toPptColor(node.fill.border),
        width: node.isContainer ? 0.8 : 0.5,
      },
    });
  }

  const labelTop =
    node.label.firstBaselineY - node.label.fontSize - node.label.lineHeight * 0.08;
  slide.addText(node.label.lines.join('\n'), {
    x: mapper.x(node.bounds.x + (node.isContainer ? 14 : 6)),
    y: mapper.y(labelTop),
    w: mapper.w(node.bounds.w - (node.isContainer ? 28 : 12)),
    h: mapper.h(node.label.lines.length * node.label.lineHeight),
    fontFace: model.fontFamily,
    fontSize: mapper.font(node.label.fontSize),
    bold: node.label.fontWeight >= 600,
    align: 'center',
    valign: 'top',
    color: '0F172A',
    fit: 'shrink',
    margin: 0,
    breakLine: false,
  });

  if (node.score) {
    const scoreBounds = mapBounds(mapper, node.score.bounds);
    slide.addShape(deck.ShapeType.roundRect, {
      ...scoreBounds,
      rectRadius: scoreBounds.h / 2,
      fill: { color: 'FFFFFF', transparency: 28 },
      line: { color: '64748B', transparency: 84, width: 0.4 },
    });
    slide.addText(node.score.value, {
      ...scoreBounds,
      fontFace: model.fontFamily,
      fontSize: mapper.font(node.score.fontSize),
      bold: true,
      align: 'center',
      valign: 'middle',
      color: '475569',
      fit: 'shrink',
      margin: 0,
    });
  }
}

function renderLegend(
  slide: pptxgen.Slide,
  deck: pptxgen,
  model: VisualExportModel,
  mapper: SlideMapper,
  legend: VisualExportLegendModel,
): void {
  slide.addShape(deck.ShapeType.roundRect, {
    ...mapBounds(mapper, legend.bounds),
    rectRadius: mapper.w(10),
    fill: { color: 'FFFFFF' },
    line: { color: 'E2E8F0', width: 0.5 },
  });
  slide.addText(legend.title, {
    x: mapper.x(legend.titleX),
    y: mapper.y(legend.titleY - 11),
    w: mapper.w(legend.bounds.w - 24),
    h: mapper.h(14),
    fontFace: model.fontFamily,
    fontSize: mapper.font(11),
    bold: true,
    color: '0F172A',
    margin: 0,
  });

  const segmentWidth = legend.barBounds.w / legend.stops.length;
  legend.stops.forEach((stop, index) => {
    slide.addShape(deck.ShapeType.rect, {
      x: mapper.x(legend.barBounds.x + segmentWidth * index),
      y: mapper.y(legend.barBounds.y),
      w: mapper.w(segmentWidth + 0.5),
      h: mapper.h(legend.barBounds.h),
      fill: { color: toPptColor(stop) },
      line: { color: toPptColor(stop), transparency: 100 },
    });
  });

  slide.addText(legend.lowLabel, {
    x: mapper.x(legend.barBounds.x),
    y: mapper.y(legend.labelY - 10),
    w: mapper.w(legend.barBounds.w / 2),
    h: mapper.h(12),
    fontFace: model.fontFamily,
    fontSize: mapper.font(11),
    color: '64748B',
    margin: 0,
  });
  slide.addText(legend.highLabel, {
    x: mapper.x(legend.barBounds.x + legend.barBounds.w / 2),
    y: mapper.y(legend.labelY - 10),
    w: mapper.w(legend.barBounds.w / 2),
    h: mapper.h(12),
    fontFace: model.fontFamily,
    fontSize: mapper.font(11),
    color: '64748B',
    align: 'right',
    margin: 0,
  });
}

function createSlideMapper(model: VisualExportModel): SlideMapper {
  const top = model.exportSettings.showTitle
    ? 0.2 + TITLE_HEIGHT + TITLE_GAP
    : SLIDE_MARGIN;
  const availableW = SLIDE_WIDE_WIDTH - SLIDE_MARGIN * 2;
  const availableH = SLIDE_WIDE_HEIGHT - top - SLIDE_MARGIN;
  const scale = Math.min(
    availableW / model.surfaceBounds.w,
    availableH / model.surfaceBounds.h,
  );
  const renderedW = model.surfaceBounds.w * scale;
  const renderedH = model.surfaceBounds.h * scale;
  const offsetX =
    SLIDE_MARGIN + (availableW - renderedW) / 2 - model.surfaceBounds.x * scale;
  const offsetY = top + (availableH - renderedH) / 2 - model.surfaceBounds.y * scale;

  return {
    x: (value) => offsetX + value * scale,
    y: (value) => offsetY + value * scale,
    w: (value) => Math.max(0.01, value * scale),
    h: (value) => Math.max(0.01, value * scale),
    font: (value) =>
      Math.max(MIN_FONT_SIZE, value * Math.min(MAX_FONT_POINTS_PER_PIXEL, scale * 72)),
  };
}

function mapBounds(mapper: SlideMapper, bounds: Bounds): Bounds {
  return {
    x: mapper.x(bounds.x),
    y: mapper.y(bounds.y),
    w: mapper.w(bounds.w),
    h: mapper.h(bounds.h),
  };
}

function toPptColor(color: string): string {
  return color.replace('#', '').toUpperCase();
}

export const pptxAdapter: ExportAdapter = {
  format: 'pptx',
  label: 'PowerPoint',
  description: 'Native PowerPoint shapes for the active view.',
  scope: 'active-view',
  requiresValidDocument: true,
  hiddenNodes: 'excluded',
  heatmap: 'active-view-display',
  legend: 'active-view-display',
  exportDocument: pptxExport
};
