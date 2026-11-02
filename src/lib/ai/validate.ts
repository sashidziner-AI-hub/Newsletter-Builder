/**
 * The only path a provider's bytes may take into this app (5A).
 *
 * A generation response is untrusted input from a third party, so it is
 * accepted on evidence rather than on the provider's word: the bytes must
 * begin with a PNG, JPEG or WebP signature and the payload must be under the
 * cap. A declared `content-type` is never trusted on its own, and SVG is
 * refused outright — it is a document that can carry script, not an image.
 */

import { AiError, MAX_IMAGE_BYTES } from './provider';

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // 'RIFF'
const WEBP = [0x57, 0x45, 0x42, 0x50]; // 'WEBP', at offset 8

const startsWith = (bytes: Uint8Array, sig: number[], at = 0): boolean =>
  bytes.length >= at + sig.length && sig.every((b, i) => bytes[at + i] === b);

/** The real type of these bytes, or null if they are not an image we accept. */
export function sniffMime(bytes: Uint8Array): ImageMime | null {
  if (startsWith(bytes, PNG)) return 'image/png';
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp';
  return null;
}

/**
 * Validate and wrap. Throws `AiError('bad-response')` for anything that is not
 * a PNG, JPEG or WebP within the cap — including an SVG, an HTML error page
 * served with a 200, or a JSON body where an image was promised.
 */
export function toImageBlob(bytes: Uint8Array): { blob: Blob; mime: ImageMime } {
  if (bytes.length === 0) throw new AiError('bad-response', 'empty response');
  if (bytes.length > MAX_IMAGE_BYTES) {
    const mb = (bytes.length / (1024 * 1024)).toFixed(1);
    throw new AiError('bad-response', `image is ${mb} MB, over the 10 MB limit`);
  }
  const mime = sniffMime(bytes);
  if (!mime) throw new AiError('bad-response', 'not a PNG, JPEG or WebP');
  // Uint8Array -> ArrayBuffer slice keeps Blob happy across runtimes
  return { blob: new Blob([bytes.slice().buffer], { type: mime }), mime };
}

/**
 * Decode base64 without Buffer, which the browser does not have. The GPT image
 * models always answer in base64, so this is the hot path rather than an edge.
 */
export function decodeBase64(b64: string): Uint8Array {
  // a stray newline in a provider payload is not an error worth failing on
  const clean = b64.replace(/\s+/g, '');
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    throw new AiError('bad-response', 'payload is not valid base64');
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Natural size, read from the bytes rather than from the provider's reply.
 * Only PNG is parsed — it is the default output format, and a wrong-but-zero
 * size is better than a wrong-but-confident one, so the rest return 0 and let
 * the resolution note stay quiet.
 */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (!startsWith(bytes, PNG) || bytes.length < 24) return { width: 0, height: 0 };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
