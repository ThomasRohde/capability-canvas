import { useEffect } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { useTransientStore } from '../stores/transientStore';
import { loadActiveDocument, saveActiveDocument } from './db';

export function useAutosave(enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer: number | undefined;
    const scheduleSave = () => {
      if (!useDocumentStore.getState().dirty) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!useDocumentStore.getState().dirty) return;
        if (!useTransientStore.getState().isIdle) return;
        void saveActiveDocument(useDocumentStore.getState().doc);
      }, 500);
    };
    const unsubscribeDocument = useDocumentStore.subscribe(scheduleSave);
    const unsubscribeTransient = useTransientStore.subscribe((state) => {
      if (state.isIdle) scheduleSave();
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribeDocument();
      unsubscribeTransient();
    };
  }, [enabled]);
}
