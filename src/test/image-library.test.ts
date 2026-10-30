import { beforeEach, describe, expect, it } from 'vitest';
import {
  type ImageLoader,
  type LibraryImage,
  IMAGE_SCHEMA,
  LocalImageStorage,
  UPLOAD_UNAVAILABLE,
  UploadUnavailableError,
  filterImages,
  findByUrl,
  imageExportEnvelope,
  makeLibraryImage,
  nameFromUrl,
  normalizeLibraryImage,
  parseUrlList,
  planImageImport,
  probeImage,
  validateImageUrl,
} from '../lib/image-storage';
import { listImages } from '../lib/storage';
import { useEditor } from '../store';

/** Stand-in for the browser's image loader, which jsdom never runs. */
const loader = (sizes: Record<string, [number, number]>): ImageLoader =>
  async (url) => {
    const found = sizes[url];
    return found ? { ok: true, width: found[0], height: found[1] } : { ok: false, width: 0, height: 0 };
  };

const img = (url: string, patch: Partial<LibraryImage> = {}) => makeLibraryImage(url, patch);

beforeEach(() => {
  localStorage.clear();
  useEditor.setState({ images: [] });
  useEditor.getState().resetDesign();
});

/* ------------------------------------------------------------- validation */

describe('validateImageUrl', () => {
  it('accepts an https URL', () => {
    const r = validateImageUrl('https://cdn.example.com/a.png');
    expect(r.ok).toBe(true);
    expect(r.url).toBe('https://cdn.example.com/a.png');
  });

  it('trims surrounding whitespace', () => {
    expect(validateImageUrl('  https://cdn.example.com/a.png  ').url).toBe(
      'https://cdn.example.com/a.png',
    );
  });

  it('rejects http, data and blob with a reason worth reading', () => {
    const http = validateImageUrl('http://cdn.example.com/a.png');
    expect(http.ok).toBe(false);
    expect(http.reason).toBe('not-https');
    expect(http.message).toMatch(/https/i);

    const data = validateImageUrl('data:image/png;base64,AAAA');
    expect(data.ok).toBe(false);
    expect(data.reason).toBe('data');
    expect(data.message).toMatch(/strip/i);

    const blob = validateImageUrl('blob:http://localhost/abc-123');
    expect(blob.ok).toBe(false);
    expect(blob.reason).toBe('blob');
  });

  it('rejects empty and malformed input', () => {
    expect(validateImageUrl('').reason).toBe('empty');
    expect(validateImageUrl('   ').reason).toBe('empty');
    expect(validateImageUrl('just some words').reason).toBe('malformed');
    expect(validateImageUrl('https://nodot').reason).toBe('malformed');
    expect(validateImageUrl('ftp://cdn.example.com/a.png').reason).toBe('malformed');
  });
});

/* ------------------------------------------------------------ multi-line */

describe('parseUrlList', () => {
  it('splits one URL per line and drops blanks', () => {
    expect(parseUrlList('https://a.test/1.png\n\n  https://a.test/2.png  \n')).toEqual([
      'https://a.test/1.png',
      'https://a.test/2.png',
    ]);
  });

  it('collapses duplicates inside one paste', () => {
    expect(parseUrlList('https://a.test/1.png\nhttps://a.test/1.png')).toEqual([
      'https://a.test/1.png',
    ]);
  });

  it('handles an empty paste', () => {
    expect(parseUrlList('')).toEqual([]);
  });
});

describe('nameFromUrl', () => {
  it('reads a readable name out of the last path segment', () => {
    expect(nameFromUrl('https://cdn.example.com/photos/spring-hero.jpg')).toBe('Spring Hero');
    expect(nameFromUrl('https://cdn.example.com/logo_dark.png?v=2')).toBe('Logo Dark');
  });

  it('falls back when there is nothing to read', () => {
    expect(nameFromUrl('https://cdn.example.com/')).toBe('Image');
  });
});

/* ----------------------------------------------------------------- probe */

describe('probeImage', () => {
  it('reports size for a URL that loads', async () => {
    const probe = await probeImage(
      'https://a.test/x.png',
      loader({ 'https://a.test/x.png': [1200, 800] }),
    );
    expect(probe).toEqual({ ok: true, width: 1200, height: 800 });
  });

  it('reports failure for a URL that does not', async () => {
    const probe = await probeImage('https://a.test/missing.png', loader({}));
    expect(probe.ok).toBe(false);
    expect(probe.width).toBe(0);
  });
});

/* --------------------------------------------------------------- records */

describe('library records', () => {
  it('stamps the schema and guesses a name', () => {
    const image = img('https://cdn.example.com/spring-hero.jpg');
    expect(image.schemaVersion).toBe(IMAGE_SCHEMA);
    expect(image.name).toBe('Spring Hero');
    expect(image.brandId).toBeNull();
  });

  it('reads a record written before schemaVersion existed as version 1', () => {
    const record = normalizeLibraryImage({
      id: 'img_old',
      url: 'https://cdn.example.com/a.png',
      name: 'Old record',
    });
    expect(record).not.toBeNull();
    expect(record!.schemaVersion).toBe(1);
    expect(record!.status).toBe('unknown');
    expect(record!.tags).toEqual([]);
  });

  it('refuses to normalise anything that is not an https image', () => {
    expect(normalizeLibraryImage({ url: 'data:image/png;base64,AA' })).toBeNull();
    expect(normalizeLibraryImage({ url: 'http://a.test/x.png' })).toBeNull();
    expect(normalizeLibraryImage(null)).toBeNull();
    expect(normalizeLibraryImage({ name: 'no url' })).toBeNull();
  });
});

/* ----------------------------------------------------------- the adapter */

describe('LocalImageStorage', () => {
  const storage = new LocalImageStorage();

  it('adds, updates, removes and persists', () => {
    const a = img('https://a.test/1.png', { name: 'One' });
    storage.add(a);
    expect(storage.list()).toHaveLength(1);

    storage.update(a.id, { name: 'Renamed', tags: ['hero'] });
    expect(storage.list()[0].name).toBe('Renamed');
    expect(storage.list()[0].tags).toEqual(['hero']);
    // a fresh read is what a reload would do
    expect(listImages()[0].name).toBe('Renamed');

    storage.remove(a.id);
    expect(storage.list()).toHaveLength(0);
  });

  it('replaceAll writes the whole library at once', () => {
    storage.replaceAll([img('https://a.test/1.png'), img('https://a.test/2.png')]);
    expect(storage.list()).toHaveLength(2);
    storage.replaceAll([]);
    expect(storage.list()).toHaveLength(0);
  });

  it('never implements upload, and never returns a data: URI', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await expect(storage.upload(file)).rejects.toThrow(UploadUnavailableError);
    await expect(storage.upload(file)).rejects.toThrow(UPLOAD_UNAVAILABLE);
    expect(UPLOAD_UNAVAILABLE).toContain('https');
  });

  it('drops a stored record whose URL is no longer acceptable', () => {
    // something hand-edited into localStorage, or written by an older build
    localStorage.setItem(
      'email-builder:images:v1',
      JSON.stringify([
        { id: 'img_a', url: 'https://a.test/ok.png', name: 'Fine' },
        { id: 'img_b', url: 'data:image/png;base64,AAAA', name: 'Sneaky' },
      ]),
    );
    const list = storage.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Fine');
  });
});

/* ----------------------------------------------------------------- import */

describe('import', () => {
  const existing = [img('https://a.test/1.png', { name: 'One' })];

  it('skips a URL already in the library', () => {
    const plan = planImageImport(imageExportEnvelope(existing), existing);
    expect(plan!.duplicates).toBe(1);
    expect(plan!.added).toHaveLength(0);
  });

  it('adds genuinely new images', () => {
    const plan = planImageImport(imageExportEnvelope([img('https://a.test/2.png')]), existing);
    expect(plan!.added).toHaveLength(1);
  });

  it('reports a name clash for the caller to confirm', () => {
    const plan = planImageImport(
      imageExportEnvelope([img('https://a.test/other.png', { name: 'One' })]),
      existing,
    );
    expect(plan!.clashes).toHaveLength(1);
    expect(plan!.added).toHaveLength(0);
  });

  it('counts unusable entries rather than failing the import', () => {
    const plan = planImageImport({ images: [{ url: 'http://a.test/x.png' }, null, 5] }, existing);
    expect(plan!.rejected).toBe(3);
  });

  it('collapses duplicates inside the incoming file too', () => {
    const dupe = img('https://a.test/same.png');
    const plan = planImageImport([dupe, { ...dupe, id: 'img_other' }], []);
    expect(plan!.added).toHaveLength(1);
    expect(plan!.duplicates).toBe(1);
  });

  it('rejects JSON that is not an image library', () => {
    expect(planImageImport({ rows: [] }, [])).toBeNull();
    expect(planImageImport(null, [])).toBeNull();
  });
});

/* -------------------------------------------------------------- querying */

describe('filtering', () => {
  const images = [
    img('https://a.test/shared.png', { name: 'Shared logo', tags: ['logo'] }),
    img('https://a.test/vee.png', { name: 'Vee hero', brandId: 'brand_vee', tags: ['hero'] }),
    img('https://a.test/acme.png', { name: 'Acme hero', brandId: 'brand_acme' }),
  ];

  it('filters by brand', () => {
    expect(filterImages(images, '', 'shared', 'brand_vee').map((i) => i.name)).toEqual([
      'Shared logo',
    ]);
    // "this brand" keeps shared images too, since they apply everywhere
    expect(filterImages(images, '', 'this', 'brand_vee').map((i) => i.name)).toEqual([
      'Shared logo',
      'Vee hero',
    ]);
    expect(filterImages(images, '', 'all', 'brand_vee')).toHaveLength(3);
  });

  it('searches name, tag and URL', () => {
    expect(filterImages(images, 'hero', 'all', null)).toHaveLength(2);
    expect(filterImages(images, 'logo', 'all', null)).toHaveLength(1);
    expect(filterImages(images, 'acme.png', 'all', null)).toHaveLength(1);
    expect(filterImages(images, 'nothing', 'all', null)).toHaveLength(0);
  });

  it('finds an image by its exact URL', () => {
    expect(findByUrl(images, 'https://a.test/vee.png')?.name).toBe('Vee hero');
    expect(findByUrl(images, 'https://a.test/nope.png')).toBeUndefined();
    expect(findByUrl(images, '')).toBeUndefined();
  });
});

/* ------------------------------------------------------------- the store */

describe('the library in the store', () => {
  it('adds and persists through the adapter', () => {
    useEditor.getState().addImage(img('https://a.test/1.png', { name: 'One' }));
    expect(useEditor.getState().images).toHaveLength(1);
    expect(listImages()).toHaveLength(1);
  });

  it('edits in the library do not touch an email already using the URL', () => {
    const image = img('https://a.test/hero.png', { name: 'Hero', defaultAlt: 'A hero' });
    useEditor.getState().addImage(image);

    // an email uses the URL
    const st = useEditor.getState();
    const rowId = st.addRow([1]);
    const colId = useEditor.getState().design.rows.find((r) => r.id === rowId)!.columns[0].id;
    const blockId = useEditor.getState().addBlock('image', colId)!;
    useEditor.getState().updateBlock(blockId, { src: image.url, alt: 'A hero' });

    // the library entry is renamed and its alt changed
    useEditor.getState().updateImage(image.id, { name: 'Renamed', defaultAlt: 'Totally different' });

    const block = useEditor
      .getState()
      .design.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
      .find((b) => b.id === blockId)!;
    expect((block.values as { src: string }).src).toBe(image.url);
    expect((block.values as { alt: string }).alt).toBe('A hero');
  });

  it('removing an image leaves the email alone', () => {
    const image = img('https://a.test/hero.png');
    useEditor.getState().addImage(image);
    const rowId = useEditor.getState().addRow([1]);
    const colId = useEditor.getState().design.rows.find((r) => r.id === rowId)!.columns[0].id;
    const blockId = useEditor.getState().addBlock('image', colId)!;
    useEditor.getState().updateBlock(blockId, { src: image.url });

    useEditor.getState().removeImage(image.id);
    expect(useEditor.getState().images).toHaveLength(0);
    const block = useEditor
      .getState()
      .design.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
      .find((b) => b.id === blockId)!;
    expect((block.values as { src: string }).src).toBe(image.url);
  });
});
