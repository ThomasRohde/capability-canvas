import type { ParseResult } from "../domain/document/parse";
import { hasCanvasNodes, type CapabilityDocument } from "../domain/document/types";
import { ensureParentContainment } from "../domain/layout/containment";
import {
  applyLayoutMetadata,
  applyLayoutPatches,
  layoutDocument,
} from "../domain/layout/engine";
import { warning, type Diagnostic } from "../domain/validation/diagnostics";
import {
  applyResolvedVisualDocument,
  resolveVisualDocument,
} from "../domain/visual/workspace";
import { useDocumentStore } from "./stores/documentStore";
import { useUiStore } from "./stores/uiStore";

export async function applyImportedDocument(
  parsed: ParseResult,
  label: string,
): Promise<Diagnostic[]> {
  const store = useDocumentStore.getState();
  if (!parsed.doc) {
    store.setDiagnostics(parsed.diagnostics);
    return parsed.diagnostics;
  }

  const prepared = await prepareImportedDocument(
    parsed.doc,
    parsed.diagnostics,
  );
  store.setDocument(prepared.doc, label, prepared.diagnostics);
  useUiStore.getState().clearSelection();
  return prepared.diagnostics;
}

async function prepareImportedDocument(
  doc: CapabilityDocument,
  diagnostics: Diagnostic[],
): Promise<{ doc: CapabilityDocument; diagnostics: Diagnostic[] }> {
  if (doc.layout.preservePositions || !hasCanvasNodes(resolveVisualDocument(doc))) {
    return { doc, diagnostics };
  }

  try {
    const resolved = resolveVisualDocument(doc);
    const result = await layoutDocument({
      doc: resolved,
      force: true,
      mode: resolved.settings.layoutMode,
    });
    const laidOut = applyLayoutPatches(resolved, result.patches);
    const repaired = ensureParentContainment(laidOut);
    const withMetadata = applyLayoutMetadata(repaired.doc, result);
    const nextDoc =
      withMetadata === resolved
        ? doc
        : applyResolvedVisualDocument(doc, withMetadata);
    return {
      doc: nextDoc,
      diagnostics:
        repaired.changedNodeIds.length > 0
          ? [
              ...diagnostics,
              ...result.diagnostics,
              warning(
                "parent-containment-repaired",
                "Expanded parent capabilities to contain their children after import layout.",
              ),
            ]
          : [...diagnostics, ...result.diagnostics],
    };
  } catch (layoutError) {
    return {
      doc,
      diagnostics: [
        ...diagnostics,
        warning(
          "layout-failed",
          `Auto layout after import failed. ${
            layoutError instanceof Error
              ? layoutError.message
              : String(layoutError)
          }`,
        ),
      ],
    };
  }
}
