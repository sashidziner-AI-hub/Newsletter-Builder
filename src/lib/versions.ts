import type { Design } from '../types';

/**
 * Version history rules, kept pure so they can be reasoned about and tested
 * without touching localStorage.
 *
 * Snapshots are deliberately cheap and deterministic: one every five minutes of
 * active editing, one whenever the user asks, and one immediately before
 * anything that would replace the canvas. Nothing is ever snapshotted twice.
 */

export type SnapshotReason = 'manual' | 'auto' | 'pre-restore' | 'pre-replace';

export interface VersionRecord {
  id: string;
  /** which saved email this belongs to */
  emailId: string;
  at: number;
  note: string;
  reason: SnapshotReason;
  /** cached summary so the history list needs no design walk */
  rows: number;
  blocks: number;
  /** the design only — never brand definitions */
  design: Design;
  schemaVersion: number;
}

/** At most one automatic snapshot per five minutes of editing. */
export const AUTO_INTERVAL_MS = 5 * 60 * 1000;

/** Versions kept per email before the oldest are pruned. */
export const VERSION_CAP = 20;

export function summarise(design: Design): { rows: number; blocks: number } {
  return {
    rows: design.rows.length,
    blocks: design.rows.reduce(
      (total, row) => total + row.columns.reduce((n, col) => n + col.blocks.length, 0),
      0,
    ),
  };
}

/** Newest first, for one email. */
export function versionsFor(list: VersionRecord[], emailId: string): VersionRecord[] {
  return list.filter((v) => v.emailId === emailId).sort((a, b) => b.at - a.at);
}

const sameDesign = (a: Design, b: Design) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Should a snapshot be taken?
 * - identical to the newest snapshot for this email -> never
 * - 'auto' -> only once every AUTO_INTERVAL_MS
 * - everything else -> yes (the user asked, or the canvas is about to be replaced)
 */
export function shouldSnapshot(
  list: VersionRecord[],
  emailId: string,
  design: Design,
  now: number,
  reason: SnapshotReason,
): boolean {
  const mine = versionsFor(list, emailId);
  const latest = mine[0];
  if (!latest) return true;
  if (sameDesign(latest.design, design)) return false;
  if (reason === 'auto') return now - latest.at >= AUTO_INTERVAL_MS;
  return true;
}

/** Drop the oldest beyond the cap, per email. */
export function pruneToCap(list: VersionRecord[], cap = VERSION_CAP): VersionRecord[] {
  const byEmail = new Map<string, VersionRecord[]>();
  for (const v of list) {
    const bucket = byEmail.get(v.emailId);
    if (bucket) bucket.push(v);
    else byEmail.set(v.emailId, [v]);
  }
  const keep: VersionRecord[] = [];
  for (const bucket of byEmail.values()) {
    keep.push(...bucket.sort((a, b) => b.at - a.at).slice(0, cap));
  }
  return keep.sort((a, b) => b.at - a.at);
}

/**
 * Drop the `count` oldest versions across every email. Used by the quota
 * recovery path, where freeing space matters more than any one email's history.
 */
export function pruneOldestGlobal(list: VersionRecord[], count: number): VersionRecord[] {
  if (count <= 0) return list;
  const newestFirst = [...list].sort((a, b) => b.at - a.at);
  return newestFirst.slice(0, Math.max(0, newestFirst.length - count));
}

/** Coerce a stored record, tolerating anything written before this version. */
export function normalizeVersion(
  input: unknown,
  normalizeDesign: (d: unknown) => Design | null,
): VersionRecord | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const design = normalizeDesign(raw.design);
  if (!design) return null;
  if (typeof raw.id !== 'string' || typeof raw.emailId !== 'string') return null;

  const reasons: SnapshotReason[] = ['manual', 'auto', 'pre-restore', 'pre-replace'];
  const summary = summarise(design);
  return {
    id: raw.id,
    emailId: raw.emailId,
    at: Number(raw.at) || 0,
    note: typeof raw.note === 'string' ? raw.note : '',
    reason: reasons.includes(raw.reason as SnapshotReason)
      ? (raw.reason as SnapshotReason)
      : 'manual',
    rows: Number.isFinite(Number(raw.rows)) ? Number(raw.rows) : summary.rows,
    blocks: Number.isFinite(Number(raw.blocks)) ? Number(raw.blocks) : summary.blocks,
    design,
    // records written before schemaVersion existed are version 1
    schemaVersion: Number(raw.schemaVersion) || 1,
  };
}
