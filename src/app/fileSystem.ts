import { safeFileBaseName } from '../domain/document/fileName';
import { parseDocumentJson, type ParseResult } from '../domain/document/parse';
import type { CapabilityDocument } from '../domain/document/types';
import { stringifyDocument } from '../domain/document/serialize';

export interface OpenDocumentFileResult {
  parsed: ParseResult;
  file: {
    name: string;
    size: number;
    type: string;
  };
}

export type SaveFileResult = { status: 'saved' } | { status: 'canceled' };

export interface SaveFileOptions {
  filename: string;
  mimeType: string;
  data: Blob | string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

export async function openDocumentFile(): Promise<OpenDocumentFileResult | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';
    input.onchange = () => {
      void (async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
          resolve(null);
          return;
        }
        try {
          resolve({
            parsed: parseDocumentJson(await readFileText(file)),
            file: {
              name: file.name,
              size: file.size,
              type: file.type,
            },
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    };
    document.body.append(input);
    input.click();
  });
}

export async function saveDocumentFile(doc: CapabilityDocument): Promise<void> {
  const data = stringifyDocument(doc);
  const filename = `${safeFileBaseName(doc.title)}.capability-canvas.json`;
  await saveFile({
    filename,
    data,
    mimeType: 'application/json',
    types: [
      {
        description: 'Capability Canvas JSON',
        accept: { 'application/json': ['.json'] },
      },
    ],
  });
}

export async function saveFile({
  filename,
  mimeType,
  data,
  types,
}: SaveFileOptions): Promise<SaveFileResult> {
  if ('showSaveFilePicker' in window) {
    let handle: { createWritable(): Promise<FileSystemWritableFileStream> };
    try {
      handle = await (window as unknown as FileSystemWindow).showSaveFilePicker({
        suggestedName: filename,
        ...(types ? { types } : {}),
      });
    } catch (error) {
      if (isAbortError(error)) return { status: 'canceled' };
      if (isNativeSavePickerBlocked(error)) {
        return downloadFile({ filename, mimeType, data });
      }
      throw error;
    }
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    return { status: 'saved' };
  }

  return downloadFile({ filename, mimeType, data });
}

function downloadFile({
  filename,
  mimeType,
  data,
}: SaveFileOptions): SaveFileResult {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { status: 'saved' };
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isNativeSavePickerBlocked(error: unknown): boolean {
  if (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  ) {
    return true;
  }
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('showsavefilepicker') &&
    (message.includes('not allowed') ||
      message.includes('denied') ||
      message.includes('current context'))
  );
}
