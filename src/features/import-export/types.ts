import type { CapabilityDocument } from '../../domain/document/types';
import type { Diagnostic } from '../../domain/validation/diagnostics';

export type ExportFormat = 'json' | 'svg' | 'html' | 'pptx' | 'drawio' | 'archimate';

export type ExportScope = 'full-model' | 'active-view';
export type ExportHiddenNodes = 'included' | 'excluded';
export type ExportHeatmapBehavior =
  | 'source-settings'
  | 'active-view-display'
  | 'not-included';
export type ExportLegendBehavior = 'source-settings' | 'not-rendered';

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
  description: string;
  scope: ExportScope;
  requiresValidDocument: boolean;
  hiddenNodes: ExportHiddenNodes;
  heatmap: ExportHeatmapBehavior;
  legend: ExportLegendBehavior;
  exportDocument(doc: CapabilityDocument): Promise<ExportResult> | ExportResult;
}
