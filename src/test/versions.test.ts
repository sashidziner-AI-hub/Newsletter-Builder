import { beforeEach, describe, expect, it } from 'vitest';
import { createBlock, createRow, emptyDesign } from '../lib/defaults';
import { normalizeDesign } from '../lib/design-ops';
import { addVersion, deleteTemplate, listTemplates, listVersions, saveEmail } from '../lib/storage';
import {
  AUTO_INTERVAL_MS,
  VERSION_CAP,
  normalizeVersion,
  pruneOldestGlobal,
  pruneToCap,
  shouldSnapshot,
  summarise,
  versionsFor,
  type VersionRecord,
} from '../lib/versions';
import { useEditor } from '../store';
import type { Design } from '../types';

function designWith(headings: number): Design {
  const d = emptyDesign();
  const row = createRow([1]);
  for (let i = 0; i < headings; i++) row.columns[0].blocks.push(createBlock('heading'));
  d.rows.push(row);
  return d;
}

const version = (over: Partial<VersionRecord> = {}): VersionRecord => ({
  id: `ver_${Math.random().toString(36).slice(2)}`,
  emailId: 'tpl_a',
  at: 1_000,
  note: '',
  reason: 'auto',
  rows: 1,
  blocks: 1,
  design: designWith(1),
  schemaVersion: 2,
  ...over,
});

/* ------------------------------------------------------------- summarise */

describe('summarise', () => {
  it('counts rows and blocks across columns', () => {
    const d = emptyDesign();
    const a = createRow([1, 1]);
    a.columns[0].blocks.push(createBlock('heading'), createBlock('text'));
    a.columns[1].blocks.push(createBlock('button'));
    d.rows.push(a, createRow([1]));
    expect(summarise(d)).toEqual({ rows: 2, blocks: 3 });
  });

  it('handles an empty design', () => {
    expect(summarise(emptyDesign())).toEqual({ rows: 0, blocks: 0 });
  });
});

/* --------------------------------------------------------- shouldSnapshot */

describe('shouldSnapshot', () => {
  const now = 1_000_000;

  it('always snapshots the very first version', () => {
    expect(shouldSnapshot([], 'tpl_a', designWith(1), now, 'auto')).toBe(true);
    expect(shouldSnapshot([], 'tpl_a', designWith(1), now, 'manual')).toBe(true);
  });

  it('skips a design identical to the latest, whatever the reason', () => {
    const design = designWith(1);
    const list = [version({ design, at: now - 1 })];
    for (const reason of ['auto', 'manual', 'pre-restore', 'pre-replace'] as const) {
      expect(shouldSnapshot(list, 'tpl_a', design, now, reason), reason).toBe(false);
    }
  });

  it('throttles automatic snapshots to one per five minutes', () => {
    const list = [version({ at: now - AUTO_INTERVAL_MS + 1_000 })];
    expect(shouldSnapshot(list, 'tpl_a', designWith(2), now, 'auto')).toBe(false);

    const older = [version({ at: now - AUTO_INTERVAL_MS - 1 })];
    expect(shouldSnapshot(older, 'tpl_a', designWith(2), now, 'auto')).toBe(true);
  });

  it('lets a manual or pre-replace snapshot bypass the throttle', () => {
    const list = [version({ at: now - 1_000 })];
    expect(shouldSnapshot(list, 'tpl_a', designWith(2), now, 'manual')).toBe(true);
    expect(shouldSnapshot(list, 'tpl_a', designWith(2), now, 'pre-restore')).toBe(true);
    expect(shouldSnapshot(list, 'tpl_a', designWith(2), now, 'pre-replace')).toBe(true);
  });

  it('throttles per email, not globally', () => {
    const list = [version({ emailId: 'tpl_other', at: now - 1_000 })];
    // another email's recent snapshot must not block this one
    expect(shouldSnapshot(list, 'tpl_a', designWith(1), now, 'auto')).toBe(true);
  });
});

/* ------------------------------------------------------------------ prune */

describe('pruning', () => {
  it('keeps the newest VERSION_CAP per email and drops the oldest', () => {
    const list = Array.from({ length: VERSION_CAP + 5 }, (_, i) =>
      version({ id: `v${i}`, at: 1_000 + i }),
    );
    const kept = pruneToCap(list);
    expect(kept).toHaveLength(VERSION_CAP);
    // the five oldest are gone
    expect(kept.map((v) => v.id)).not.toContain('v0');
    expect(kept.map((v) => v.id)).not.toContain('v4');
    expect(kept.map((v) => v.id)).toContain(`v${VERSION_CAP + 4}`);
  });

  it('applies the cap independently per email', () => {
    const list = [
      ...Array.from({ length: VERSION_CAP + 3 }, (_, i) =>
        version({ id: `a${i}`, emailId: 'tpl_a', at: 1_000 + i }),
      ),
      ...Array.from({ length: 4 }, (_, i) => version({ id: `b${i}`, emailId: 'tpl_b', at: 1_000 + i })),
    ];
    const kept = pruneToCap(list);
    expect(versionsFor(kept, 'tpl_a')).toHaveLength(VERSION_CAP);
    expect(versionsFor(kept, 'tpl_b')).toHaveLength(4);
  });

  it('prunes the oldest across every email for the quota path', () => {
    const list = [
      version({ id: 'old-a', emailId: 'tpl_a', at: 1 }),
      version({ id: 'old-b', emailId: 'tpl_b', at: 2 }),
      version({ id: 'new-a', emailId: 'tpl_a', at: 100 }),
    ];
    const kept = pruneOldestGlobal(list, 2);
    expect(kept.map((v) => v.id)).toEqual(['new-a']);
  });

  it('pruneOldestGlobal is a no-op for zero or negative counts', () => {
    const list = [version()];
    expect(pruneOldestGlobal(list, 0)).toBe(list);
    expect(pruneOldestGlobal(list, -3)).toBe(list);
  });
});

/* ------------------------------------------------------------ normalising */

describe('normalizeVersion', () => {
  it('reads a record written before schemaVersion existed as version 1', () => {
    const record = normalizeVersion(
      { id: 'ver_1', emailId: 'tpl_a', at: 5, design: designWith(1) },
      normalizeDesign,
    );
    expect(record).not.toBeNull();
    expect(record!.schemaVersion).toBe(1);
    expect(record!.reason).toBe('manual');
  });

  it('recomputes a missing summary from the design', () => {
    const record = normalizeVersion(
      { id: 'ver_1', emailId: 'tpl_a', at: 5, design: designWith(3) },
      normalizeDesign,
    );
    expect(record!.rows).toBe(1);
    expect(record!.blocks).toBe(3);
  });

  it('rejects anything without a usable design or ids', () => {
    expect(normalizeVersion(null, normalizeDesign)).toBeNull();
    expect(normalizeVersion({ id: 'ver_1', emailId: 'a' }, normalizeDesign)).toBeNull();
    expect(normalizeVersion({ design: designWith(1) }, normalizeDesign)).toBeNull();
  });
});

/* --------------------------------------------------- through the store */

describe('version history in the store', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditor.getState().resetDesign();
  });

  const openSavedEmail = (design: Design) => {
    const { entry } = saveEmail(design, { name: 'Test email', autoSaved: false });
    useEditor.getState().openEmail(entry);
    return entry;
  };

  it('does nothing when the email has no record yet', () => {
    useEditor.getState().startNewEmail(designWith(1));
    useEditor.getState().snapshot('manual', 'should not land');
    expect(listVersions()).toHaveLength(0);
  });

  it('stores a manual snapshot with its note and summary', () => {
    openSavedEmail(designWith(2));
    useEditor.getState().snapshot('manual', 'before the legal review');

    const [v] = listVersions();
    expect(v.note).toBe('before the legal review');
    expect(v.reason).toBe('manual');
    expect(v.rows).toBe(1);
    expect(v.blocks).toBe(2);
    expect(v.schemaVersion).toBe(2);
  });

  it('skips a second snapshot of an unchanged design', () => {
    openSavedEmail(designWith(1));
    useEditor.getState().snapshot('manual');
    useEditor.getState().snapshot('manual');
    expect(listVersions()).toHaveLength(1);
  });

  it('restore loads the old design after snapshotting the present', () => {
    const entry = openSavedEmail(designWith(1));
    useEditor.getState().snapshot('manual', 'the original');
    const original = listVersions()[0];

    // move the email on
    useEditor.getState().updateBody({ title: 'Changed later' });
    expect(useEditor.getState().design.body.title).toBe('Changed later');

    // restore: snapshot the present first, then load the past
    useEditor.getState().snapshot('pre-restore', 'Before restoring');
    useEditor.getState().restoreVersion(original.design);

    expect(useEditor.getState().design.body.title).not.toBe('Changed later');
    const mine = versionsFor(listVersions(), entry.id);
    // nothing was destroyed: both the original and the pre-restore state are kept
    expect(mine).toHaveLength(2);
    expect(mine.some((v) => v.reason === 'pre-restore')).toBe(true);
    expect(mine.some((v) => v.note === 'the original')).toBe(true);
  });

  it('can restore forward again, because the newer state was snapshotted', () => {
    const entry = openSavedEmail(designWith(1));
    useEditor.getState().snapshot('manual', 'v1');
    const v1 = versionsFor(listVersions(), entry.id).find((v) => v.note === 'v1')!;

    useEditor.getState().updateBody({ title: 'v2 title' });
    useEditor.getState().snapshot('pre-restore');
    useEditor.getState().restoreVersion(v1.design);

    // the v2 state is in history, so it can be restored back
    const v2 = versionsFor(listVersions(), entry.id).find(
      (v) => v.design.body.title === 'v2 title',
    );
    expect(v2).toBeTruthy();
    useEditor.getState().restoreVersion(v2!.design);
    expect(useEditor.getState().design.body.title).toBe('v2 title');
  });

  it('caps stored history at 20 per email', () => {
    const entry = openSavedEmail(designWith(1));
    for (let i = 0; i < VERSION_CAP + 6; i++) {
      addVersion(entry.id, designWith(i + 1), 'manual', `v${i}`);
    }
    expect(versionsFor(listVersions(), entry.id)).toHaveLength(VERSION_CAP);
  });

  it('deleting an email removes its history too', () => {
    const entry = openSavedEmail(designWith(1));
    useEditor.getState().snapshot('manual');
    expect(listVersions()).toHaveLength(1);

    // deleteTemplate also clears the versions for that email
    deleteTemplate(entry.id);
    expect(listTemplates().some((t) => t.id === entry.id)).toBe(false);
    expect(listVersions()).toHaveLength(0);
  });
});
