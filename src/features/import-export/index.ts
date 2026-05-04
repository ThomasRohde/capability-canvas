import { archimateAdapter } from './archimate';
import { drawioAdapter } from './drawio';
import { htmlAdapter } from './html';
import { jsonAdapter } from './json';
import { pptxAdapter } from './pptx';
import { svgAdapter } from './svg';
import type { ExportAdapter, ExportFormat } from './types';

export const EXPORT_ADAPTERS: ExportAdapter[] = [
  jsonAdapter,
  svgAdapter,
  htmlAdapter,
  pptxAdapter,
  drawioAdapter,
  archimateAdapter
];

export function adapterFor(format: ExportFormat): ExportAdapter {
  const adapter = EXPORT_ADAPTERS.find((item) => item.format === format);
  if (!adapter) throw new Error(`Missing export adapter: ${format}`);
  return adapter;
}

export async function saveExportResult(result: Awaited<ReturnType<ExportAdapter['exportDocument']>>): Promise<void> {
  const blob = result.data instanceof Blob ? result.data : new Blob([result.data], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
