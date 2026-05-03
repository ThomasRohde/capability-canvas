import { useEffect, useMemo } from "react";
import { parseDocumentJson } from "../domain/document/parse";
import { findParentContainmentViolations } from "../domain/layout/containment";
import { EditorRoute } from "../features/editor/EditorRoute";
import { ViewerRoute } from "../features/viewer/ViewerRoute";
import { applyImportedDocument } from "./importDocument";
import { useAutosave } from "./persistence/autosave";
import { useDocumentStore } from "./stores/documentStore";

export function App() {
  useAutosave();
  useEffect(() => {
    useDocumentStore.getState().repairContainment();
  }, []);
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    return useDocumentStore.subscribe((state) => {
      const violations = findParentContainmentViolations(state.doc);
      if (violations.length > 0) {
        console.warn("Capability Canvas containment violations", violations);
      }
    });
  }, []);
  useEffect(() => {
    const pending = localStorage.getItem("capability-canvas.import");
    if (!pending) return;
    localStorage.removeItem("capability-canvas.import");
    const parsed = parseDocumentJson(pending);
    applyImportedDocument(parsed, "Import from viewer");
  }, []);
  const isViewer = useMemo(() => currentRoutePath().startsWith("/viewer"), []);
  return isViewer ? <ViewerRoute /> : <EditorRoute />;
}

function currentRoutePath() {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin)
    .pathname;
  const path = window.location.pathname;
  if (path.startsWith(base)) return `/${path.slice(base.length)}`;
  return path;
}
