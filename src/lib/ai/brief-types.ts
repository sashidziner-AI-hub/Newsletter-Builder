/**
 * The brief's own shape (6A) — kept in its own file so the form, the prompt
 * builder, storage, and the store can all import it without pulling in each
 * other.
 */

export type BriefGoal = 'inform' | 'promote' | 'announce' | 'welcome' | 'outreach';
export type BriefTone = 'professional' | 'warm' | 'friendly' | 'bold' | 'formal';
export type BriefLength = 'short' | 'medium';
export type BriefLanguage = 'English' | 'Tamil' | 'Hindi';

export const BRIEF_MAX_CHARS = 4000;
export const KEY_POINT_MAX = 8;
export const SOURCE_TEXT_MAX_CHARS = 3000;

export interface BriefFields {
  topic: string;
  audience: string;
  goal: BriefGoal;
  /** up to KEY_POINT_MAX, one line each */
  keyPoints: string[];
  tone: BriefTone;
  length: BriefLength;
  /** supplied by the user, not AI — AI only fills a CTA label when this is empty */
  ctaLabel: string;
  /** https only; '' means none given */
  ctaUrl: string;
  /** only meaningful for a preset with an `articles` repeater; ignored otherwise */
  articleCount: number;
  language: BriefLanguage;
  /** optional background material, capped at SOURCE_TEXT_MAX_CHARS */
  sourceText: string;
  /** null = Auto; otherwise one of PRESETS' ids */
  presetId: string | null;
}

export function defaultBriefFields(): BriefFields {
  return {
    topic: '',
    audience: '',
    goal: 'inform',
    keyPoints: [],
    tone: 'professional',
    length: 'medium',
    ctaLabel: '',
    ctaUrl: '',
    articleCount: 3,
    language: 'English',
    sourceText: '',
    presetId: null,
  };
}

/**
 * What's saved with the email so "Regenerate" and the Templates list's
 * "AI draft" badge both have something to work from. `resolvedPresetId` is
 * always concrete (Auto's resolution is recorded, not re-derived later).
 */
export interface BriefRecord {
  fields: BriefFields;
  resolvedPresetId: string;
  reviewed: boolean;
  generatedAt: number;
}

/** The brief's own character budget — topic + audience + key points + source text. */
export function briefTotalChars(fields: BriefFields): number {
  return (
    fields.topic.length +
    fields.audience.length +
    fields.keyPoints.reduce((sum, p) => sum + p.length, 0) +
    fields.ctaLabel.length +
    fields.sourceText.length
  );
}

const GOALS: readonly BriefGoal[] = ['inform', 'promote', 'announce', 'welcome', 'outreach'];
const TONES: readonly BriefTone[] = ['professional', 'warm', 'friendly', 'bold', 'formal'];
const LENGTHS: readonly BriefLength[] = ['short', 'medium'];
const LANGUAGES: readonly BriefLanguage[] = ['English', 'Tamil', 'Hindi'];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Coerce whatever came back out of `localStorage`'s JSON into a safe `BriefFields`. */
function normalizeBriefFields(raw: unknown): BriefFields {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const defaults = defaultBriefFields();
  return {
    topic: typeof r.topic === 'string' ? r.topic : defaults.topic,
    audience: typeof r.audience === 'string' ? r.audience : defaults.audience,
    goal: oneOf(r.goal, GOALS, defaults.goal),
    keyPoints: Array.isArray(r.keyPoints) ? r.keyPoints.filter((p): p is string => typeof p === 'string') : defaults.keyPoints,
    tone: oneOf(r.tone, TONES, defaults.tone),
    length: oneOf(r.length, LENGTHS, defaults.length),
    ctaLabel: typeof r.ctaLabel === 'string' ? r.ctaLabel : defaults.ctaLabel,
    ctaUrl: typeof r.ctaUrl === 'string' ? r.ctaUrl : defaults.ctaUrl,
    articleCount: Number.isFinite(r.articleCount) ? Number(r.articleCount) : defaults.articleCount,
    language: oneOf(r.language, LANGUAGES, defaults.language),
    sourceText: typeof r.sourceText === 'string' ? r.sourceText : defaults.sourceText,
    presetId: typeof r.presetId === 'string' ? r.presetId : null,
  };
}

/** `null` for anything that isn't a well-formed brief record — a missing or corrupt one is simply "no brief," not a crash. */
export function normalizeBriefRecord(raw: unknown): BriefRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.resolvedPresetId !== 'string' || !r.resolvedPresetId) return null;
  return {
    fields: normalizeBriefFields(r.fields),
    resolvedPresetId: r.resolvedPresetId,
    reviewed: r.reviewed === true,
    generatedAt: Number(r.generatedAt) || 0,
  };
}
