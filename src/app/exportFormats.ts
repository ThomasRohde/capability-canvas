export const EXPORT_FORMATS = [
  "json",
  "svg",
  "html",
  "pptx",
  "drawio",
  "archimate",
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const DEFAULT_EXPORT_FORMAT: ExportFormat = "json";

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  json: "JSON",
  svg: "SVG",
  html: "HTML",
  pptx: "PowerPoint",
  drawio: "diagrams.net",
  archimate: "ArchiMate",
};

export const EXPORT_FORMAT_OPTIONS: Array<{
  value: ExportFormat;
  label: string;
}> = EXPORT_FORMATS.map((value) => ({
  value,
  label: EXPORT_FORMAT_LABELS[value],
}));

const EXPORT_FORMAT_SET = new Set<string>(EXPORT_FORMATS);

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === "string" && EXPORT_FORMAT_SET.has(value);
}
