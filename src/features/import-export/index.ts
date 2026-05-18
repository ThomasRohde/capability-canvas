import { saveFile, type SaveFileResult } from '../../app/fileSystem';
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

export async function saveExportResult(
  result: Awaited<ReturnType<ExportAdapter['exportDocument']>>,
): Promise<SaveFileResult> {
  return saveFile({
    filename: result.filename,
    mimeType: result.mimeType,
    data: result.data,
    types: [
      {
        description: `${result.format.toUpperCase()} export`,
        accept: { [result.mimeType]: exportFileExtensions(result.filename) },
      },
    ],
  });
}

function exportFileExtensions(filename: string): string[] {
  const match = filename.match(/(\.[A-Za-z0-9]+)$/);
  return match ? [match[1]!] : [];
}
