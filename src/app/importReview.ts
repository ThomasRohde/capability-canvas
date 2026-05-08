import type { ParseResult } from "../domain/document/parse";
import type { Diagnostic } from "../domain/validation/diagnostics";
import type { OpenDocumentFileResult } from "./fileSystem";

export interface ImportReview {
  sourceLabel: string;
  parsed: ParseResult;
  file?: OpenDocumentFileResult["file"];
  summary: ImportReviewSummary;
  groups: ImportDiagnosticGroups;
}

export interface ImportReviewSummary {
  title: string;
  nodeCount: number;
  viewCount: number;
  diagnosticsCount: number;
  repairCount: number;
  convertedInput: boolean;
  canApply: boolean;
}

export interface ImportDiagnosticGroups {
  duplicateIds: Diagnostic[];
  parentRepairs: Diagnostic[];
  repairs: Diagnostic[];
  warnings: Diagnostic[];
  validationErrors: Diagnostic[];
}

const EXTERNAL_CONVERSION_CODES = new Set([
  "external-capability-list-imported",
  "external-json-hierarchy-imported",
]);

const DUPLICATE_ID_CODES = new Set(["duplicate-id-repaired"]);

const PARENT_REPAIR_CODES = new Set([
  "missing-parent-repaired",
  "ambiguous-parent-repaired",
]);

export function createImportReview(args: {
  sourceLabel: string;
  parsed: ParseResult;
  file?: OpenDocumentFileResult["file"];
}): ImportReview {
  const { sourceLabel, parsed, file } = args;
  const groups = groupImportDiagnostics(parsed.diagnostics);
  const convertedInput = parsed.diagnostics.some((diagnostic) =>
    EXTERNAL_CONVERSION_CODES.has(diagnostic.code),
  );
  return {
    sourceLabel,
    parsed,
    file,
    summary: {
      title: parsed.doc?.title ?? "No importable document",
      nodeCount: parsed.doc ? Object.keys(parsed.doc.nodesById).length : 0,
      viewCount: parsed.doc
        ? Math.max(
            parsed.doc.visual.viewOrder.length,
            Object.keys(parsed.doc.visual.viewsById).length,
          )
        : 0,
      diagnosticsCount: parsed.diagnostics.length,
      repairCount: countRepairs(parsed.diagnostics),
      convertedInput,
      canApply: parsed.doc !== null,
    },
    groups,
  };
}

function groupImportDiagnostics(
  diagnostics: Diagnostic[],
): ImportDiagnosticGroups {
  const duplicateIds: Diagnostic[] = [];
  const parentRepairs: Diagnostic[] = [];
  const repairs: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const validationErrors: Diagnostic[] = [];

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error") {
      validationErrors.push(diagnostic);
    } else if (DUPLICATE_ID_CODES.has(diagnostic.code)) {
      duplicateIds.push(diagnostic);
    } else if (PARENT_REPAIR_CODES.has(diagnostic.code)) {
      parentRepairs.push(diagnostic);
    } else if (isRepairDiagnostic(diagnostic)) {
      repairs.push(diagnostic);
    } else {
      warnings.push(diagnostic);
    }
  }

  return {
    duplicateIds,
    parentRepairs,
    repairs,
    warnings,
    validationErrors,
  };
}

function countRepairs(diagnostics: Diagnostic[]): number {
  return diagnostics.filter(isRepairDiagnostic).length;
}

function isRepairDiagnostic(diagnostic: Diagnostic): boolean {
  if (diagnostic.severity === "error") return false;
  if (EXTERNAL_CONVERSION_CODES.has(diagnostic.code)) return false;
  return (
    diagnostic.code.endsWith("-repaired") ||
    diagnostic.code === "parent-containment-repaired" ||
    diagnostic.code === "stale-view-node-reference"
  );
}
