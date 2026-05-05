import { useEffect, useMemo } from "react";
import { parseDocumentJson } from "../domain/document/parse";
import { findParentContainmentViolations } from "../domain/layout/containment";
import { resolveVisualDocument } from "../domain/visual/workspace";
import { EditorRoute } from "../features/editor/EditorRoute";
import { ViewerRoute } from "../features/viewer/ViewerRoute";
import { applyImportedDocument } from "./importDocument";
import { useAutosave } from "./persistence/autosave";
import { useDocumentStore } from "./stores/documentStore";

export function App() {
  const isViewer = useMemo(() => currentRoutePath().startsWith("/viewer"), []);
  useAutosave(!isViewer);
  useEffect(() => {
    if (isViewer) return;
    useDocumentStore.getState().repairContainment();
  }, [isViewer]);
  useEffect(() => {
    if (isViewer) return undefined;
    if (!import.meta.env.DEV) return undefined;
    return useDocumentStore.subscribe((state) => {
      const violations = findParentContainmentViolations(
        resolveVisualDocument(state.doc),
      );
      if (violations.length > 0) {
        console.warn("Capability Canvas containment violations", violations);
      }
    });
  }, [isViewer]);
  useEffect(() => {
    if (isViewer) return;
    const pending = localStorage.getItem("capability-canvas.import");
    if (!pending) return;
    localStorage.removeItem("capability-canvas.import");
    const parsed = parseDocumentJson(pending);
    applyImportedDocument(parsed, "Import from viewer");
  }, [isViewer]);
  return isViewer ? <ViewerRoute /> : <EditorRoute />;
}

function currentRoutePath() {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin)
    .pathname;
  const path = window.location.pathname;
  if (path.startsWith(base)) return `/${path.slice(base.length)}`;
  return path;
}
