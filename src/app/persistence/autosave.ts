import { useEffect } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { useTransientStore } from '../stores/transientStore';
import { loadActiveDocument, saveActiveDocument } from './db';

export function useAutosave(): void {
  useEffect(() => {
    let disposed = false;
    void loadActiveDocument().then((doc) => {
      const store = useDocumentStore.getState();
      if (!disposed && doc && !store.dirty) {
        store.setDocument(doc, 'Restore saved document');
      }
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = useDocumentStore.subscribe((state) => {
      if (!state.dirty || !useTransientStore.getState().isIdle) return;
      window.clearTimeout((window as Window & { __ccAutosaveTimer?: number }).__ccAutosaveTimer);
      (window as Window & { __ccAutosaveTimer?: number }).__ccAutosaveTimer = window.setTimeout(() => {
        if (useTransientStore.getState().isIdle) void saveActiveDocument(useDocumentStore.getState().doc);
      }, 500);
    });
    return unsubscribe;
  }, []);
}
