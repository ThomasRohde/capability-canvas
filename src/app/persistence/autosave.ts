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
        store.hydrateDocument(doc);
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
      const scheduledState = useDocumentStore.getState();
      if (!scheduledState.dirty || scheduledState.saveStatus === "saving")
        return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const state = useDocumentStore.getState();
        if (!state.dirty || state.saveStatus === "saving") return;
        if (!useTransientStore.getState().isIdle) return;
        const revision = state.revision;
        const doc = state.doc;
        state.markSaveStarted(revision);
        void saveActiveDocument(doc)
          .then(() =>
            useDocumentStore.getState().markSaveSucceeded(revision),
          )
          .catch((error: unknown) =>
            useDocumentStore.getState().markSaveFailed(revision, error),
          );
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
