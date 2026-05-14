import { error, type Diagnostic } from "../../domain/validation/diagnostics";

export interface PastedJsonParseResult {
  input?: unknown;
  diagnostics: Diagnostic[];
}

export function parsePastedJsonText(text: string): PastedJsonParseResult {
  try {
    return { input: JSON.parse(extractPastedJsonText(text)) as unknown, diagnostics: [] };
  } catch {
    return {
      diagnostics: [
        error("json-invalid", "The pasted content is not valid JSON."),
      ],
    };
  }
}

function extractPastedJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
