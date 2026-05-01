import { useEffect, useMemo } from 'react';
import { parseDocumentJson } from '../domain/document/parse';
import { EditorRoute } from '../features/editor/EditorRoute';
import { ViewerRoute } from '../features/viewer/ViewerRoute';
import { useAutosave } from './persistence/autosave';
import { useDocumentStore } from './stores/documentStore';

export function App() {
  useAutosave();
  useEffect(() => {
    const pending = localStorage.getItem('capability-canvas.import');
    if (!pending) return;
    localStorage.removeItem('capability-canvas.import');
    const parsed = parseDocumentJson(pending);
    if (parsed.doc) useDocumentStore.getState().setDocument(parsed.doc, 'Import from viewer');
  }, []);
  const isViewer = useMemo(() => window.location.pathname.startsWith('/viewer'), []);
  return isViewer ? <ViewerRoute /> : <EditorRoute />;
}
