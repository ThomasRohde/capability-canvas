import { parseDocumentJson } from '../domain/document/parse';
import type { CapabilityDocument } from '../domain/document/types';
import { stringifyDocument } from '../domain/document/serialize';

export async function openDocumentFile(): Promise<CapabilityDocument | null> {
  if ('showOpenFilePicker' in window) {
    const [handle] = await (window as unknown as FileSystemWindow).showOpenFilePicker({
      types: [{ description: 'Capability Canvas JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false
    });
    const file = await handle.getFile();
    return parseDocumentJson(await file.text()).doc;
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? parseDocumentJson(await file.text()).doc : null);
    };
    input.click();
  });
}

export async function saveDocumentFile(doc: CapabilityDocument): Promise<void> {
  const data = stringifyDocument(doc);
  if ('showSaveFilePicker' in window) {
    const handle = await (window as unknown as FileSystemWindow).showSaveFilePicker({
      suggestedName: `${doc.title}.capability-canvas.json`,
      types: [{ description: 'Capability Canvas JSON', accept: { 'application/json': ['.json'] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    return;
  }

  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${doc.title}.capability-canvas.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface FileSystemWindow {
  showOpenFilePicker(options: unknown): Promise<Array<{ getFile(): Promise<File> }>>;
  showSaveFilePicker(options: unknown): Promise<{ createWritable(): Promise<FileSystemWritableFileStream> }>;
}
