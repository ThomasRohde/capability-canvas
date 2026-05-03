import { parseDocumentJson, type ParseResult } from '../domain/document/parse';
import type { CapabilityDocument } from '../domain/document/types';
import { stringifyDocument } from '../domain/document/serialize';

export async function openDocumentFile(): Promise<ParseResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      resolve(file ? parseDocumentJson(await readFileText(file)) : { doc: null, diagnostics: [] });
    };
    document.body.append(input);
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
  showSaveFilePicker(options: unknown): Promise<{ createWritable(): Promise<FileSystemWritableFileStream> }>;
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
    reader.readAsText(file);
  });
}
