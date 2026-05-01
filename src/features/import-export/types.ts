import type { CapabilityDocument } from '../../domain/document/types';
import type { Diagnostic } from '../../domain/validation/diagnostics';

export type ExportFormat = 'json' | 'svg' | 'html' | 'pptx' | 'drawio' | 'archimate';

export interface ExportResult {
  format: ExportFormat;
  filename: string;
  mimeType: string;
  data: Blob | string;
  diagnostics: Diagnostic[];
}

export interface ExportAdapter {
  format: ExportFormat;
  label: string;
  exportDocument(doc: CapabilityDocument): Promise<ExportResult> | ExportResult;
}

