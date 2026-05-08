import { useEffect, useMemo } from "react";
import { serializeDocument } from "../domain/document/serialize";
import type { WireDocument } from "../domain/document/types";
import { findParentContainmentViolations } from "../domain/layout/containment";
import { resolveVisualDocument } from "../domain/visual/workspace";
import { EditorRoute } from "../features/editor/EditorRoute";
import { ViewerRoute } from "../features/viewer/ViewerRoute";
import { useAutosave } from "./persistence/autosave";
import { useDocumentStore } from "./stores/documentStore";

export function App() {
  const isViewer = useMemo(() => currentRoutePath().startsWith("/viewer"), []);
  useAutosave(!isViewer);
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.__ccTestSerializeDocument = () =>
      serializeDocument(useDocumentStore.getState().doc);
    return () => {
      delete window.__ccTestSerializeDocument;
    };
  }, []);
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
  return isViewer ? <ViewerRoute /> : <EditorRoute />;
}

declare global {
  interface Window {
    __ccTestSerializeDocument?: () => WireDocument;
  }
}

function currentRoutePath() {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin)
    .pathname;
  const path = window.location.pathname;
  if (path.startsWith(base)) return `/${path.slice(base.length)}`;
  return path;
}
