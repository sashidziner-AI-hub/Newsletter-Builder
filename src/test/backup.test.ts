import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, importBackup, summarizeBackup, validateBackupShape } from '../lib/backup';
import { clearAllLocalData } from '../lib/clear-all';
import { createBlock, emptyDesign } from '../lib/defaults';
import { emptyBrand } from '../lib/brand';
import {
  listBrands,
  listImages,
  listSavedBlocks,
  listTemplates,
  saveBrands,
  saveEmail,
  saveImages,
  saveSavedBlocks,
} from '../lib/storage';
import { clearAllKeys, saveKey } from '../lib/ai/key-store';
import { grantTextConsent } from '../lib/ai/text-consent';
import { draftStore, type DraftImage } from '../lib/drafts';

const FAKE_KEY = 'sk-test-DO-NOT-LEAK-abcdef123456';

beforeEach(() => {
  localStorage.clear();
  clearAllKeys();
});

function seedEverything() {
  saveBrands([...listBrands(), emptyBrand('Backup Co')]);
  saveEmail(emptyDesign(), { name: 'Backup test email', autoSaved: false });
  saveSavedBlocks([
    ...listSavedBlocks(),
    {
      id: 'sb1',
      name: 'My block',
      category: '',
      kind: 'block' as const,
      payload: createBlock('heading'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: 1,
    },
  ]);
  saveImages([
    ...listImages(),
    {
      id: 'img1',
      url: 'https://example.com/a.png',
      name: 'a',
      defaultAlt: '',
      tags: [],
      width: 100,
      height: 100,
      brandId: null,
      createdAt: Date.now(),
      status: 'unknown' as const,
      checkedAt: 0,
      schemaVersion: 1,
    },
  ]);
  saveKey('openai', 'gpt-5.4-mini', FAKE_KEY, true);
  grantTextConsent('openai');
}

describe('exportBackup', () => {
  it('contains the seeded brand/email/block/image', () => {
    seedEverything();
    const data = exportBackup();
    expect(data.brands.some((b) => b.name === 'Backup Co')).toBe(true);
    expect(data.templates.some((t) => t.name === 'Backup test email')).toBe(true);
    expect(data.savedBlocks.some((b) => b.name === 'My block')).toBe(true);
    expect(data.images.some((i) => i.id === 'img1')).toBe(true);
  });

  it('never contains the AI key, anywhere in the serialized JSON', () => {
    seedEverything();
    const json = JSON.stringify(exportBackup());
    expect(json).not.toContain(FAKE_KEY);
    expect(json.toLowerCase()).not.toContain('aikeys');
    expect(json.toLowerCase()).not.toContain('sk-test');
  });

  it('has no field at all for keys, drafts, or consent', () => {
    seedEverything();
    const data = exportBackup() as unknown as Record<string, unknown>;
    expect(data).not.toHaveProperty('keys');
    expect(data).not.toHaveProperty('aikeys');
    expect(data).not.toHaveProperty('drafts');
    expect(data).not.toHaveProperty('consent');
  });

  it('summarizeBackup reports accurate counts', () => {
    seedEverything();
    const summary = summarizeBackup(exportBackup());
    expect(summary.brands).toBeGreaterThan(0);
    expect(summary.templates).toBeGreaterThan(0);
    expect(summary.savedBlocks).toBe(1);
    expect(summary.images).toBe(1);
  });
});

describe('validateBackupShape', () => {
  it('accepts a real export round-tripped through JSON', () => {
    seedEverything();
    const roundTripped = JSON.parse(JSON.stringify(exportBackup()));
    const result = validateBackupShape(roundTripped);
    expect(result.ok).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(validateBackupShape(null).ok).toBe(false);
    expect(validateBackupShape('a string').ok).toBe(false);
    expect(validateBackupShape(42).ok).toBe(false);
  });

  it('rejects an object missing the required lists', () => {
    expect(validateBackupShape({ brands: [] }).ok).toBe(false);
  });

  it('rejects a payload with nothing recognizable, even with the right shape', () => {
    const empty = { brands: [], templates: [], savedBlocks: [], images: [], versions: [] };
    expect(validateBackupShape(empty).ok).toBe(false);
  });

  it('drops a malformed individual record rather than failing the whole import', () => {
    seedEverything();
    const data = exportBackup() as unknown as Record<string, unknown[]>;
    const corrupted = { ...data, brands: [...data.brands, { not: 'a brand' }] };
    const result = validateBackupShape(corrupted);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.brands.length).toBe((data.brands as unknown[]).length);
  });
});

describe('importBackup', () => {
  it('overwrites the relevant storage categories', () => {
    seedEverything();
    const data = exportBackup();
    localStorage.clear(); // simulate a different browser with nothing in it
    const result = importBackup(data);
    expect(result).toBe('ok');
    expect(listBrands().some((b) => b.name === 'Backup Co')).toBe(true);
    expect(listTemplates().some((t) => t.name === 'Backup test email')).toBe(true);
  });

  it('never touches the AI key store — importing a backup does not grant a key', () => {
    seedEverything();
    const data = exportBackup();
    clearAllKeys();
    importBackup(data);
    // the key store was never written to by importBackup; it stays empty
    expect(localStorage.getItem('email-builder:aikeys:v2')).toBeNull();
  });
});

describe('clearAllLocalData', () => {
  it('wipes every email-builder:* localStorage key and the AI key store', async () => {
    seedEverything();
    expect(localStorage.length).toBeGreaterThan(0);
    await clearAllLocalData();
    for (let i = 0; i < localStorage.length; i++) {
      expect(localStorage.key(i)?.startsWith('email-builder:')).toBe(false);
    }
  });

  it('also removes IndexedDB draft bytes', async () => {
    const draft: DraftImage = {
      id: 'd1',
      blob: new Blob(['x']),
      mime: 'image/png',
      width: 1,
      height: 1,
      prompt: 'test',
      alt: 'test',
      model: 'test',
      createdAt: Date.now(),
    };
    await draftStore.put(draft);
    expect(await draftStore.keys()).toContain('d1');
    await clearAllLocalData();
    expect(await draftStore.keys()).not.toContain('d1');
  });
});
