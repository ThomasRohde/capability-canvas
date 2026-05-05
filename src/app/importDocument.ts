import type { ParseResult } from "../domain/document/parse";
import { hasCanvasNodes } from "../domain/document/types";
import { resolveVisualDocument } from "../domain/visual/workspace";
import { useDocumentStore } from "./stores/documentStore";
import { useUiStore } from "./stores/uiStore";

export function applyImportedDocument(parsed: ParseResult, label: string) {
  const store = useDocumentStore.getState();
  if (!parsed.doc) {
    store.setDiagnostics(parsed.diagnostics);
    return;
  }

  store.setDocument(parsed.doc, label, parsed.diagnostics);
  useUiStore.getState().clearSelection();
  if (
    !parsed.doc.layout.preservePositions &&
    hasCanvasNodes(resolveVisualDocument(parsed.doc))
  )
    void store.autoLayout(true);
}
