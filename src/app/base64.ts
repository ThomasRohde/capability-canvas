export function encodeBase64Text(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function decodeBase64Text(encoded: string): string {
  return new TextDecoder().decode(base64ToBytes(encoded));
}

export function encodeBase64UrlBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function decodeBase64UrlBytes(encoded: string): Uint8Array {
  const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return base64ToBytes(`${normalized}${"=".repeat(paddingLength)}`);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
