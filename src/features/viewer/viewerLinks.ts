import {
  decodeBase64Text,
  decodeBase64UrlBytes,
  encodeBase64UrlBytes,
} from "../../app/base64";

const COMPRESSED_DOCUMENT_PREFIX = "gz.";
const TEXT_DOCUMENT_PREFIX = "txt.";
export const MAX_PORTABLE_VIEWER_URL_LENGTH = 120_000;

export async function buildPortableViewerUrl(
  serializedDocument: string,
): Promise<string> {
  const payload = await encodeViewerDocumentPayload(serializedDocument);
  return `${viewerBaseUrl()}#doc=${payload}`;
}

export async function decodeViewerDocumentPayload(
  payload: string,
): Promise<string> {
  if (payload.startsWith(COMPRESSED_DOCUMENT_PREFIX)) {
    const encodedBytes = payload.slice(COMPRESSED_DOCUMENT_PREFIX.length);
    return decompressText(decodeBase64UrlBytes(encodedBytes));
  }

  if (payload.startsWith(TEXT_DOCUMENT_PREFIX)) {
    const encodedBytes = payload.slice(TEXT_DOCUMENT_PREFIX.length);
    return new TextDecoder().decode(decodeBase64UrlBytes(encodedBytes));
  }

  return decodeBase64Text(payload);
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

async function encodeViewerDocumentPayload(
  serializedDocument: string,
): Promise<string> {
  try {
    const compressed = await compressText(serializedDocument);
    return `${COMPRESSED_DOCUMENT_PREFIX}${encodeBase64UrlBytes(compressed)}`;
  } catch {
    const encoded = encodeBase64UrlBytes(
      new TextEncoder().encode(serializedDocument),
    );
    return `${TEXT_DOCUMENT_PREFIX}${encoded}`;
  }
}

async function compressText(text: string): Promise<Uint8Array> {
  const stream = bytesToStream(new TextEncoder().encode(text)).pipeThrough(
    new CompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressText(bytes: Uint8Array): Promise<string> {
  const stream = bytesToStream(bytes).pipeThrough(
    new DecompressionStream("gzip"),
  );
  return new Response(stream).text();
}

function bytesToStream(bytes: Uint8Array): ReadableStream<BufferSource> {
  return new ReadableStream({
    start(controller) {
      const chunk = new Uint8Array(bytes.byteLength);
      chunk.set(bytes);
      controller.enqueue(chunk);
      controller.close();
    },
  });
}
