import { stringifyDocument } from '../../domain/document/serialize';
import type { CapabilityDocument } from '../../domain/document/types';
import type { ExportAdapter, ExportResult } from './types';

export function jsonExport(doc: CapabilityDocument): ExportResult {
  return {
    format: 'json',
    filename: `${safeName(doc.title)}.capability-canvas.json`,
    mimeType: 'application/json',
    data: stringifyDocument(doc),
    diagnostics: []
  };
}

export const jsonAdapter: ExportAdapter = {
  format: 'json',
  label: 'JSON',
  exportDocument: jsonExport
};

export function safeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'capability-canvas';
}

