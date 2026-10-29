import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import {
  SCHEMA_VERSION,
  addVersion,
  deleteTemplate,
  duplicateTemplate,
  findTemplate,
  formatBytes,
  listTemplates,
  listVersions,
  loadLastEmailId,
  migrateDraft,
  renameTemplate,
  saveDraft,
  saveEmail,
  saveLastEmailId,
  saveTemplate,
  storageUsage,
  writeSafe,
} from '../lib/storage';
import { VERSION_CAP } from '../lib/versions';
import { useEditor } from '../store';
import type { Design } from '../types';

function designWith(title: string, headings = 1): Design {
  const d = emptyDesign();
  d.body.title = title;
  const row = createRow([1]);
  for (let i = 0; i < headings; i++) row.columns[0].blocks.push(createBlock('heading'));
  d.rows.push(row);
  return d;
}

beforeEach(() => {
  localStorage.clear();
  useEditor.getState().resetDesign();
});

/* ------------------------------------------------------------ schemaVersion */

describe('schema versioning', () => {
  it('stamps every record it writes', () => {
    const { entry } = saveEmail(designWith('Stamped'));
    expect(entry.schemaVersion).toBe(SCHEMA_VERSION);
    expect(listTemplates()[0].schemaVersion).toBe(SCHEMA_VERSION);

    const { record } = addVersion(entry.id, entry.design, 'manual');
    expect(record.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('loads a pre-2B record that has no schemaVersion or autoSaved flag', () => {
    // exactly the shape 1A–2A wrote
    localStorage.setItem(
      'email-builder:templates:v1',
      JSON.stringify([
        {
          id: 'tpl_old',
          name: 'Legacy email',
          updatedAt: 1_700_000_000_000,
          brandId: null,
          design: designWith('Legacy email', 2),
          createdBy: null,
          updatedBy: null,
        },
      ]),
    );

    const [t] = listTemplates();
    expect(t.name).toBe('Legacy email');
    expect(t.schemaVersion).toBe(1);
    // an old record was always a deliberate save, so it is not a draft
    expect(t.autoSaved).toBe(false);
    // createdAt falls back to updatedAt rather than 0
    expect(t.createdAt).toBe(1_700_000_000_000);
    // and the design is intact
    expect(t.design.rows[0].columns[0].blocks).toHaveLength(2);
  });

  it('keeps an old record loadable after a rewrite', () => {
    localStorage.setItem(
      'email-builder:templates:v1',
      JSON.stringify([
        { id: 'tpl_old', name: 'Legacy', updatedAt: 5, brandId: null, design: designWith('Legacy') },
      ]),
    );
    renameTemplate('tpl_old', 'Legacy renamed');
    const [t] = listTemplates();
    expect(t.name).toBe('Legacy renamed');
    expect(t.schemaVersion).toBe(SCHEMA_VERSION);
    expect(t.design.body.title).toBe('Legacy');
  });
});

/* --------------------------------------------------------------- the records */

describe('email records', () => {
  it('creates an auto-saved record and promotes it on rename', () => {
    const { entry } = saveEmail(designWith('Untitled email'));
    expect(entry.autoSaved).toBe(true);

    const renamed = renameTemplate(entry.id, 'Spring newsletter');
    expect(renamed!.autoSaved).toBe(false);
    expect(renamed!.name).toBe('Spring newsletter');
    // still one record, not two
    expect(listTemplates()).toHaveLength(1);
  });

  it('updates in place when given an existing id', () => {
    const { entry } = saveEmail(designWith('First'));
    saveEmail(designWith('Second'), { existingId: entry.id });
    const list = listTemplates();
    expect(list).toHaveLength(1);
    expect(list[0].design.body.title).toBe('Second');
    expect(list[0].id).toBe(entry.id);
  });

  it('saveTemplate marks a deliberate save', () => {
    const saved = saveTemplate('On purpose', designWith('x'));
    expect(saved!.autoSaved).toBe(false);
  });

  it('duplicateTemplate makes a second record, leaving the first alone', () => {
    const { entry } = saveEmail(designWith('Original'), { autoSaved: false, name: 'Original' });
    const copy = duplicateTemplate(designWith('Original'), 'Variant B');

    expect(copy!.id).not.toBe(entry.id);
    expect(listTemplates()).toHaveLength(2);
    expect(findTemplate(entry.id)!.name).toBe('Original');
  });

  it('preserves createdAt across updates', () => {
    const { entry } = saveEmail(designWith('a'));
    const created = entry.createdAt;
    const { entry: again } = saveEmail(designWith('b'), { existingId: entry.id });
    expect(again.createdAt).toBe(created);
    expect(again.updatedAt).toBeGreaterThanOrEqual(created);
  });

  it('findTemplate tolerates a null or unknown id', () => {
    expect(findTemplate(null)).toBeNull();
    expect(findTemplate('tpl_nope')).toBeNull();
  });
});

/* ------------------------------------------------------------- the session */

describe('reload recovery', () => {
  it('remembers which email to reopen', () => {
    const { entry } = saveEmail(designWith('Reopen me'));
    saveLastEmailId(entry.id);
    expect(loadLastEmailId()).toBe(entry.id);
    expect(findTemplate(loadLastEmailId())!.design.body.title).toBe('Reopen me');
  });

  it('openEmail records the pointer, startNewEmail clears it', () => {
    const { entry } = saveEmail(designWith('Open'));
    useEditor.getState().openEmail(entry);
    expect(loadLastEmailId()).toBe(entry.id);

    useEditor.getState().startNewEmail(emptyDesign());
    expect(loadLastEmailId()).toBeNull();
  });
});

/* ------------------------------------------------------------- draft migration */

describe('draft migration', () => {
  it('moves a pre-2B draft into a record and drops the old key', () => {
    saveDraft(designWith('Work in progress', 3));
    expect(localStorage.getItem('email-builder:draft:v1')).not.toBeNull();

    const migrated = migrateDraft();
    expect(migrated).not.toBeNull();
    expect(migrated!.name).toBe('Work in progress');
    expect(migrated!.autoSaved).toBe(true);
    expect(migrated!.design.rows[0].columns[0].blocks).toHaveLength(3);
    // the old slot is gone, so a second boot cannot duplicate it
    expect(localStorage.getItem('email-builder:draft:v1')).toBeNull();
    expect(migrateDraft()).toBeNull();
    expect(listTemplates()).toHaveLength(1);
  });

  it('does nothing when there is no draft', () => {
    expect(migrateDraft()).toBeNull();
    expect(listTemplates()).toHaveLength(0);
  });

  it('names an untitled draft something recognisable', () => {
    const design = emptyDesign();
    design.body.title = '';
    saveDraft(design);
    expect(migrateDraft()!.name).toBe('Recovered draft');
  });
});

/* ------------------------------------------------------------------- quota */

describe('quota handling', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Fail the first N setItem calls with a quota error, as a full browser does. */
  const failTimes = (n: number) => {
    let left = n;
    const real = Storage.prototype.setItem;
    return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (left > 0) {
        left -= 1;
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      return real.call(this, key, value);
    });
  };

  it('writes straight through when there is room', () => {
    expect(writeSafe('email-builder:test', { a: 1 })).toBe('ok');
  });

  it('prunes the oldest versions, then retries and succeeds', () => {
    const { entry } = saveEmail(designWith('Has history'));
    for (let i = 0; i < 12; i++) addVersion(entry.id, designWith(`v${i}`), 'manual', `v${i}`);
    const before = listVersions().length;
    expect(before).toBeGreaterThan(10);

    // the first write fails, the retry after pruning succeeds
    const spy = failTimes(1);
    const result = writeSafe('email-builder:test', { big: 'x' });
    spy.mockRestore();

    expect(result).toBe('pruned');
    expect(listVersions().length).toBeLessThan(before);
    // the value really did land
    expect(JSON.parse(localStorage.getItem('email-builder:test')!)).toEqual({ big: 'x' });
  });

  it('reports full when even pruning cannot make room', () => {
    const { entry } = saveEmail(designWith('Has history'));
    for (let i = 0; i < 12; i++) addVersion(entry.id, designWith(`v${i}`), 'manual', `v${i}`);

    const spy = failTimes(99); // nothing will ever succeed
    const result = writeSafe('email-builder:test', { big: 'x' });
    spy.mockRestore();

    expect(result).toBe('full');
  });

  it('reports full with no versions to prune', () => {
    const spy = failTimes(99);
    expect(writeSafe('email-builder:test', { a: 1 })).toBe('full');
    spy.mockRestore();
  });

  it('surfaces a storage failure in the save status rather than failing silently', () => {
    const { entry } = saveEmail(designWith('Doomed'));
    useEditor.getState().openEmail(entry);

    const spy = failTimes(99);
    useEditor.getState().saveNow();
    spy.mockRestore();

    const state = useEditor.getState().saveState;
    expect(state.status).toBe('error');
    expect(state.message).toContain('storage full');
  });

  it('caps version history so it cannot grow without bound', () => {
    const { entry } = saveEmail(designWith('Capped'));
    for (let i = 0; i < VERSION_CAP + 8; i++) {
      addVersion(entry.id, designWith(`v${i}`), 'manual', `v${i}`);
    }
    expect(listVersions()).toHaveLength(VERSION_CAP);
  });
});

/* ------------------------------------------------------------------- usage */

describe('usage readout', () => {
  it('counts only the keys this app owns, and grows with content', () => {
    const empty = storageUsage().bytes;
    localStorage.setItem('someone-elses-key', 'x'.repeat(5000));
    expect(storageUsage().bytes).toBe(empty);

    saveEmail(designWith('Something with content', 5));
    expect(storageUsage().bytes).toBeGreaterThan(empty);
    expect(storageUsage().limit).toBeGreaterThan(0);
  });

  it('formats bytes for people', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

/* ------------------------------------------------------------------ autosave */

describe('auto-save through the store', () => {
  it('creates the record on the first save and reuses it after', () => {
    useEditor.getState().startNewEmail(designWith('Brand new'));
    expect(useEditor.getState().currentEmailId).toBeNull();

    useEditor.getState().saveNow();
    const id = useEditor.getState().currentEmailId;
    expect(id).not.toBeNull();
    expect(listTemplates()).toHaveLength(1);

    useEditor.getState().updateBody({ title: 'Edited' });
    useEditor.getState().saveNow();
    expect(useEditor.getState().currentEmailId).toBe(id);
    expect(listTemplates()).toHaveLength(1);
    expect(listTemplates()[0].design.body.title).toBe('Edited');
  });

  it('moves the status to saved and clears dirty', () => {
    useEditor.getState().startNewEmail(designWith('Status'));
    useEditor.setState({ dirty: true, saveState: { status: 'saving', at: 0, message: '' } });

    useEditor.getState().saveNow();
    const state = useEditor.getState().saveState;
    expect(state.status).toBe('saved');
    expect(state.at).toBeGreaterThan(0);
    expect(useEditor.getState().dirty).toBe(false);
  });

  it('deleting an email clears its record, history and nothing else', () => {
    const { entry: keep } = saveEmail(designWith('Keep'));
    const { entry: drop } = saveEmail(designWith('Drop'));
    addVersion(keep.id, keep.design, 'manual');
    addVersion(drop.id, drop.design, 'manual');

    deleteTemplate(drop.id);
    expect(listTemplates().map((t) => t.id)).toEqual([keep.id]);
    expect(listVersions().map((v) => v.emailId)).toEqual([keep.id]);
  });
});
