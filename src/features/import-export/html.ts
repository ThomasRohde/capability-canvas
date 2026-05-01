import type { CapabilityDocument } from '../../domain/document/types';
import { safeName } from './json';
import { renderSvg } from './svg';
import type { ExportAdapter, ExportResult } from './types';

export function htmlExport(doc: CapabilityDocument): ExportResult {
  const svg = renderSvg(doc);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${doc.title}</title>
    <style>
      body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Inter, system-ui, sans-serif; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      svg { max-width: 100%; height: auto; border: 1px solid #e2e8f0; background: #f1f5f9; }
    </style>
  </head>
  <body><main>${svg}</main></body>
</html>`;
  return {
    format: 'html',
    filename: `${safeName(doc.title)}.html`,
    mimeType: 'text/html',
    data: html,
    diagnostics: []
  };
}

export const htmlAdapter: ExportAdapter = {
  format: 'html',
  label: 'HTML',
  exportDocument: htmlExport
};

