import type { ParseResult } from "../domain/document/parse";
import { useDocumentStore } from "./stores/documentStore";

export function applyImportedDocument(parsed: ParseResult, label: string) {
  const store = useDocumentStore.getState();
  if (!parsed.doc) {
    store.setDiagnostics(parsed.diagnostics);
    return;
  }

  store.setDocument(parsed.doc, label, parsed.diagnostics);
  if (!parsed.doc.layout.preservePositions) void store.autoLayout(true);
}
