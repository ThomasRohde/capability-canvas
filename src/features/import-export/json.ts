import { stringifyDocument } from '../../domain/document/serialize';
import type { CapabilityDocument } from '../../domain/document/types';
import { safeFileBaseName } from '../../domain/document/fileName';
import type { ExportAdapter, ExportResult } from './types';

export function jsonExport(doc: CapabilityDocument): ExportResult {
  return {
    format: 'json',
    filename: `${safeFileBaseName(doc.title)}.capability-canvas.json`,
    mimeType: 'application/json',
    data: stringifyDocument(doc),
    diagnostics: []
  };
}

export const jsonAdapter: ExportAdapter = {
  format: 'json',
  label: 'JSON',
  description: 'Full-fidelity source model with all visual views.',
  scope: 'full-model',
  requiresValidDocument: false,
  hiddenNodes: 'included',
  heatmap: 'source-settings',
  legend: 'source-settings',
  exportDocument: jsonExport
};
