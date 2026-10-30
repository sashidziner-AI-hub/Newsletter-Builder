import type { WriteResult } from './storage';
import { listImages, saveImages } from './storage';
import { slugify, uid } from './util';

/**
 * The image library.
 *
 * Hosting is not decided yet, so storage sits behind an interface: today it is
 * localStorage holding URLs someone pasted, tomorrow it can be an uploader that
 * returns a public URL. The one thing it must never do is fall back to a
 * `data:` URI — those are stripped by most inboxes, so an "upload" that quietly
 * embedded one would be worse than no upload at all.
 */

export interface LibraryImage {
  id: string;
  /** https only, enforced on the way in */
  url: string;
  name: string;
  defaultAlt: string;
  tags: string[];
  /** natural size, detected on add; 0 when it could not be measured */
  width: number;
  height: number;
  /** null means shared across every brand */
  brandId: string | null;
  createdAt: number;
  /** cached result of the last load check */
  status: 'ok' | 'broken' | 'unknown';
  checkedAt: number;
  schemaVersion: number;
}

export interface ImageStorage {
  list(): LibraryImage[];
  add(item: LibraryImage): WriteResult;
  update(id: string, patch: Partial<LibraryImage>): WriteResult;
  remove(id: string): WriteResult;
  /** bulk write, for import and reordering */
  replaceAll(items: LibraryImage[]): WriteResult;
  /** Not implemented until hosting exists. Never returns a data: URI. */
  upload?(file: File): Promise<string>;
}

export const IMAGE_SCHEMA = 2;

export const UPLOAD_UNAVAILABLE =
  'Upload needs image hosting. Paste a public https image URL instead.';

/** Thrown by `upload()` until a real host is wired up. */
export class UploadUnavailableError extends Error {
  constructor() {
    super(UPLOAD_UNAVAILABLE);
    this.name = 'UploadUnavailableError';
  }
}

/* ------------------------------------------------------------- validation */

export type UrlRejection = 'empty' | 'not-https' | 'data' | 'blob' | 'malformed';

export interface UrlCheck {
  ok: boolean;
  url: string;
  reason?: UrlRejection;
  message?: string;
}

const REJECTIONS: Record<UrlRejection, string> = {
  empty: 'Enter an image URL.',
  'not-https': 'Only https URLs work in email. http:// images are blocked by most clients.',
  data: 'Embedded data: images are stripped by Gmail and most inboxes. Host the file and paste its https URL.',
  blob: 'blob: URLs only exist inside this browser tab. Host the file and paste its https URL.',
  malformed: 'That does not look like a URL.',
};

/** https only. Everything else is rejected with a reason worth reading. */
export function validateImageUrl(raw: string): UrlCheck {
  const url = (raw || '').trim();
  if (!url) return { ok: false, url, reason: 'empty', message: REJECTIONS.empty };
  if (/^data:/i.test(url)) return { ok: false, url, reason: 'data', message: REJECTIONS.data };
  if (/^blob:/i.test(url)) return { ok: false, url, reason: 'blob', message: REJECTIONS.blob };
  if (/^http:\/\//i.test(url)) {
    return { ok: false, url, reason: 'not-https', message: REJECTIONS['not-https'] };
  }
  if (!/^https:\/\/[^\s/]+\.[^\s/]/i.test(url)) {
    return { ok: false, url, reason: 'malformed', message: REJECTIONS.malformed };
  }
  return { ok: true, url };
}

/** One URL per line, blanks dropped, duplicates within the paste collapsed. */
export function parseUrlList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of (text || '').split(/[\r\n]+/)) {
    const url = line.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** A readable name guessed from the last path segment. */
export function nameFromUrl(url: string): string {
  try {
    // strip the protocol and host first, or a URL with no path would end up
    // named after its domain
    const afterHost = url.replace(/^https?:\/\/[^/]*/i, '');
    const path = afterHost.split('?')[0].split('#')[0];
    const last = path.split('/').filter(Boolean).pop() ?? '';
    const base = last.replace(/\.(png|jpe?g|gif|webp|avif|svg)$/i, '');
    const pretty = base.replace(/[-_]+/g, ' ').trim();
    return pretty ? pretty.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Image';
  } catch {
    return 'Image';
  }
}

/* ------------------------------------------------------------------ probe */

export interface ProbeResult {
  ok: boolean;
  width: number;
  height: number;
}

/**
 * Load a URL to confirm it really is a reachable image and measure it.
 *
 * The loader is injectable because jsdom never loads images — tests pass a fake
 * so the add flow is exercised rather than mocked around.
 */
export type ImageLoader = (url: string) => Promise<ProbeResult>;

const browserLoader: ImageLoader = (url) =>
  new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve({ ok: false, width: 0, height: 0 });
    const img = new Image();
    const done = (r: ProbeResult) => {
      img.onload = null;
      img.onerror = null;
      resolve(r);
    };
    img.onload = () => done({ ok: true, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => done({ ok: false, width: 0, height: 0 });
    img.src = url;
  });

export function probeImage(url: string, loader: ImageLoader = browserLoader): Promise<ProbeResult> {
  return loader(url);
}

/* ------------------------------------------------------------- the record */

export function makeLibraryImage(
  url: string,
  patch: Partial<LibraryImage> = {},
): LibraryImage {
  return {
    id: uid('img'),
    url: url.trim(),
    name: patch.name?.trim() || nameFromUrl(url),
    defaultAlt: patch.defaultAlt ?? '',
    tags: patch.tags ?? [],
    width: patch.width ?? 0,
    height: patch.height ?? 0,
    brandId: patch.brandId ?? null,
    createdAt: Date.now(),
    status: patch.status ?? 'unknown',
    checkedAt: patch.checkedAt ?? 0,
    schemaVersion: IMAGE_SCHEMA,
  };
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Coerce stored or imported JSON into a LibraryImage, or reject it. */
export function normalizeLibraryImage(input: unknown): LibraryImage | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const check = validateImageUrl(str(raw.url));
  if (!check.ok) return null;

  const status = raw.status === 'ok' || raw.status === 'broken' ? raw.status : 'unknown';
  return {
    id: str(raw.id) || uid('img'),
    url: check.url,
    name: str(raw.name).trim() || nameFromUrl(check.url),
    defaultAlt: str(raw.defaultAlt),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    width: num(raw.width),
    height: num(raw.height),
    brandId: typeof raw.brandId === 'string' && raw.brandId ? raw.brandId : null,
    createdAt: num(raw.createdAt, Date.now()),
    status,
    checkedAt: num(raw.checkedAt),
    // records written before schemaVersion existed read as version 1
    schemaVersion: num(raw.schemaVersion, 1),
  };
}

/* ----------------------------------------------------------- the adapter */

export class LocalImageStorage implements ImageStorage {
  list(): LibraryImage[] {
    return listImages();
  }

  add(item: LibraryImage): WriteResult {
    const next = [item, ...this.list().filter((i) => i.id !== item.id)];
    return saveImages(next);
  }

  update(id: string, patch: Partial<LibraryImage>): WriteResult {
    return saveImages(
      this.list().map((i) => (i.id === id ? { ...i, ...patch, id: i.id } : i)),
    );
  }

  remove(id: string): WriteResult {
    return saveImages(this.list().filter((i) => i.id !== id));
  }

  replaceAll(items: LibraryImage[]): WriteResult {
    return saveImages(items);
  }

  /**
   * Deliberately unimplemented. Falling back to a data: URI here would put an
   * image in the email that most inboxes refuse to render, so this refuses
   * loudly instead.
   */
  async upload(_file: File): Promise<string> {
    throw new UploadUnavailableError();
  }
}

export const imageStorage: ImageStorage = new LocalImageStorage();

/* --------------------------------------------------------------- import */

export interface ImageImportPlan {
  added: LibraryImage[];
  /** URL already in the library */
  duplicates: number;
  /** same name, different URL — the caller confirms before overwriting */
  clashes: { incoming: LibraryImage; existing: LibraryImage }[];
  rejected: number;
}

export function planImageImport(
  incoming: unknown,
  existing: LibraryImage[],
): ImageImportPlan | null {
  const list = Array.isArray(incoming)
    ? incoming
    : Array.isArray((incoming as { images?: unknown[] })?.images)
      ? (incoming as { images: unknown[] }).images
      : null;
  if (!list) return null;

  const byUrl = new Set(existing.map((i) => i.url));
  const byName = new Map(existing.map((i) => [i.name.trim().toLowerCase(), i]));
  const plan: ImageImportPlan = { added: [], duplicates: 0, clashes: [], rejected: 0 };

  for (const entry of list) {
    const image = normalizeLibraryImage(entry);
    if (!image) {
      plan.rejected += 1;
      continue;
    }
    if (byUrl.has(image.url)) {
      plan.duplicates += 1;
      continue;
    }
    byUrl.add(image.url);
    const clash = byName.get(image.name.trim().toLowerCase());
    if (clash) plan.clashes.push({ incoming: image, existing: clash });
    else plan.added.push(image);
  }
  return plan;
}

export function imageExportEnvelope(images: LibraryImage[]) {
  return { schemaVersion: IMAGE_SCHEMA, exportedAt: Date.now(), images };
}

export function imageExportFilename(images: LibraryImage[]): string {
  return images.length === 1
    ? `image-${slugify(images[0].name)}.json`
    : `image-library-${images.length}.json`;
}

/* --------------------------------------------------------------- queries */

export type BrandFilter = 'this' | 'shared' | 'all';

export function filterImages(
  images: LibraryImage[],
  query: string,
  brandFilter: BrandFilter,
  brandId: string | null,
): LibraryImage[] {
  const q = query.trim().toLowerCase();
  return images.filter((i) => {
    if (brandFilter === 'shared' && i.brandId !== null) return false;
    if (brandFilter === 'this' && i.brandId !== null && i.brandId !== brandId) return false;
    if (!q) return true;
    return (
      i.name.toLowerCase().includes(q) ||
      i.tags.some((t) => t.toLowerCase().includes(q)) ||
      i.url.toLowerCase().includes(q)
    );
  });
}

export function findByUrl(images: LibraryImage[], url: string): LibraryImage | undefined {
  const trimmed = (url || '').trim();
  return trimmed ? images.find((i) => i.url === trimmed) : undefined;
}
