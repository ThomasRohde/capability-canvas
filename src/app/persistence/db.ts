import { openDB, type DBSchema } from 'idb';
import { parseDocument } from '../../domain/document/parse';
import { serializeDocument } from '../../domain/document/serialize';
import type { CapabilityDocument, WireDocument } from '../../domain/document/types';

const DB_NAME = 'capability-canvas';
const STORE = 'documents';
const ACTIVE_KEY = 'active';

interface CapabilityCanvasDb extends DBSchema {
  documents: {
    key: string;
    value: WireDocument;
  };
}

async function db() {
  return openDB<CapabilityCanvasDb>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE);
    }
  });
}

export async function saveActiveDocument(doc: CapabilityDocument): Promise<void> {
  const database = await db();
  await database.put(STORE, serializeDocument(doc), ACTIVE_KEY);
}

export async function loadActiveDocument(): Promise<CapabilityDocument | null> {
  const database = await db();
  const wire = await database.get(STORE, ACTIVE_KEY);
  if (!wire) return null;
  const parsed = parseDocument(wire);
  return parsed.doc;
}

export async function clearSavedDocument(): Promise<void> {
  const database = await db();
  await database.delete(STORE, ACTIVE_KEY);
}

