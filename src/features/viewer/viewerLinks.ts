import { encodeBase64Text } from "../../app/base64";

const VIEWER_STORAGE_PREFIX = "capability-canvas.viewer.";
export const MAX_PORTABLE_VIEWER_URL_LENGTH = 120_000;

export function buildPortableViewerUrl(serializedDocument: string): string {
  const payload = encodeBase64Text(serializedDocument);
  return `${viewerBaseUrl()}#doc=${encodeURIComponent(payload)}`;
}

export function buildStoredViewerUrl(storageKey: string): string {
  return `${viewerBaseUrl()}?storage=${encodeURIComponent(storageKey)}`;
}

export function storageKeyForViewerDocument(serializedDocument: string): string {
  return `${VIEWER_STORAGE_PREFIX}${serializedDocument.length}.${hashText(serializedDocument)}`;
}

export function persistViewerDocument(
  storageKey: string,
  serializedDocument: string,
): void {
  window.localStorage.setItem(storageKey, serializedDocument);
}

export function viewerRouteParams(location: Location = window.location): {
  doc: string | null;
  source: string | null;
  storageKey: string | null;
} {
  const query = new URLSearchParams(location.search);
  const hash = hashParams(location.hash);
  return {
    doc: query.get("doc") ?? hash.get("doc"),
    source: query.get("src") ?? hash.get("src"),
    storageKey: query.get("storage") ?? hash.get("storage"),
  };
}

function viewerBaseUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}viewer`;
}

function hashParams(hash: string): URLSearchParams {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
