import { Loader2, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { Brand } from '../types';
import { PRESETS } from '../lib/presets';
import {
  BRIEF_MAX_CHARS,
  KEY_POINT_MAX,
  SOURCE_TEXT_MAX_CHARS,
  briefTotalChars,
  type BriefFields,
  type BriefGoal,
  type BriefLanguage,
  type BriefTone,
} from '../lib/ai/brief-types';
import { grantTextConsent, hasTextConsent } from '../lib/ai/text-consent';

const GOALS: { value: BriefGoal; label: string }[] = [
  { value: 'inform', label: 'Inform' },
  { value: 'promote', label: 'Promote' },
  { value: 'announce', label: 'Announce' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'outreach', label: 'Outreach' },
];

const TONES: { value: BriefTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'warm', label: 'Warm' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'bold', label: 'Bold' },
  { value: 'formal', label: 'Formal' },
];

const LANGUAGES: BriefLanguage[] = ['English', 'Tamil', 'Hindi'];

const selectCls =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';
const inputCls =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';
const label = 'mb-1 block text-[11px] font-medium text-slate-600';

function briefError(fields: BriefFields): string | null {
  if (!fields.topic.trim()) return 'Topic is required.';
  const total = briefTotalChars(fields);
  if (total > BRIEF_MAX_CHARS) return `The brief is ${total} characters; the limit is ${BRIEF_MAX_CHARS}.`;
  if (fields.ctaUrl.trim() && !/^https:\/\//i.test(fields.ctaUrl.trim())) {
    return 'The CTA URL must start with https://.';
  }
  return null;
}

export function BriefForm({
  brand,
  fields,
  onChange,
  onGenerate,
  busy,
  error,
  hasKey,
}: {
  brand: Brand;
  fields: BriefFields;
  onChange: (fields: BriefFields) => void;
  onGenerate: () => void;
  busy: boolean;
  error: string | null;
  hasKey: boolean;
}) {
  const [consented, setConsented] = useState(() => hasTextConsent('openai'));
  const validation = briefError(fields);
  const total = briefTotalChars(fields);

  const setKeyPoint = (i: number, value: string) =>
    onChange({ ...fields, keyPoints: fields.keyPoints.map((p, j) => (i === j ? value : p)) });
  const addKeyPoint = () =>
    onChange({ ...fields, keyPoints: [...fields.keyPoints, ''] });
  const removeKeyPoint = (i: number) =>
    onChange({ ...fields, keyPoints: fields.keyPoints.filter((_, j) => j !== i) });

  const agreeAndGenerate = () => {
    grantTextConsent('openai');
    setConsented(true);
    onGenerate();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-2">
      <div>
        <label className={label} htmlFor="brief-topic">
          Topic <span className="text-red-500">*</span>
        </label>
        <input
          id="brief-topic"
          className={inputCls}
          placeholder="e.g. Diwali sale on annual plans"
          value={fields.topic}
          onChange={(e) => onChange({ ...fields, topic: e.target.value })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="brief-audience">
            Audience
          </label>
          <input
            id="brief-audience"
            className={inputCls}
            placeholder="e.g. existing customers"
            value={fields.audience}
            onChange={(e) => onChange({ ...fields, audience: e.target.value })}
          />
        </div>
        <div>
          <label className={label} htmlFor="brief-goal">
            Goal
          </label>
          <select
            id="brief-goal"
            className={selectCls}
            value={fields.goal}
            onChange={(e) => onChange({ ...fields, goal: e.target.value as BriefGoal })}
          >
            {GOALS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={label}>Key points ({fields.keyPoints.length}/{KEY_POINT_MAX})</label>
        <div className="space-y-1.5">
          {fields.keyPoints.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                aria-label={`Key point ${i + 1}`}
                className={inputCls}
                value={p}
                onChange={(e) => setKeyPoint(i, e.target.value)}
              />
              <button
                type="button"
                aria-label={`Remove key point ${i + 1}`}
                className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => removeKeyPoint(i)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        {fields.keyPoints.length < KEY_POINT_MAX && (
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            onClick={addKeyPoint}
          >
            <Plus size={12} /> Add a key point
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="brief-tone">
            Tone
          </label>
          <select
            id="brief-tone"
            className={selectCls}
            value={fields.tone}
            onChange={(e) => onChange({ ...fields, tone: e.target.value as BriefTone })}
          >
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {brand.voice?.description && (
            <p className="mt-1 text-[10px] leading-snug text-slate-400">
              {brand.name}'s voice also guides the result: "{brand.voice.description}"
            </p>
          )}
        </div>
        <div>
          <label className={label} htmlFor="brief-length">
            Length
          </label>
          <select
            id="brief-length"
            className={selectCls}
            value={fields.length}
            onChange={(e) => onChange({ ...fields, length: e.target.value as 'short' | 'medium' })}
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="brief-language">
            Language
          </label>
          <select
            id="brief-language"
            className={selectCls}
            value={fields.language}
            onChange={(e) => onChange({ ...fields, language: e.target.value as BriefLanguage })}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="brief-cta-label">
            CTA label
          </label>
          <input
            id="brief-cta-label"
            className={inputCls}
            placeholder="Leave blank to let AI write it"
            value={fields.ctaLabel}
            onChange={(e) => onChange({ ...fields, ctaLabel: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="brief-cta-url">
            CTA URL
          </label>
          <input
            id="brief-cta-url"
            className={inputCls}
            placeholder="https://…"
            value={fields.ctaUrl}
            onChange={(e) => onChange({ ...fields, ctaUrl: e.target.value })}
          />
        </div>
      </div>

      <div className="sm:w-48">
        <label className={label} htmlFor="brief-article-count">
          Articles / items
        </label>
        <input
          id="brief-article-count"
          type="number"
          min={1}
          max={10}
          className={inputCls}
          value={fields.articleCount}
          onChange={(e) => onChange({ ...fields, articleCount: Number(e.target.value) || 1 })}
        />
        <p className="mt-1 text-[10px] leading-snug text-slate-400">
          Only used by a preset that has an articles list; ignored otherwise.
        </p>
      </div>

      <div>
        <label className={label} htmlFor="brief-preset">
          Preset
        </label>
        <select
          id="brief-preset"
          className={selectCls}
          value={fields.presetId ?? ''}
          onChange={(e) => onChange({ ...fields, presetId: e.target.value || null })}
        >
          <option value="">Auto (best fit for the goal)</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label className={label} htmlFor="brief-source">
            Source text (optional)
          </label>
          <span className="text-[10px] text-slate-400">
            {fields.sourceText.length}/{SOURCE_TEXT_MAX_CHARS}
          </span>
        </div>
        <textarea
          id="brief-source"
          rows={4}
          className={`${inputCls} resize-none`}
          placeholder="Paste background material to draw facts from — a press release, a changelog, notes…"
          value={fields.sourceText}
          onChange={(e) => onChange({ ...fields, sourceText: e.target.value.slice(0, SOURCE_TEXT_MAX_CHARS) })}
        />
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 pt-3">
        <span className="text-[11px] text-slate-400">
          {total}/{BRIEF_MAX_CHARS} characters
        </span>
      </div>

      {!hasKey && (
        <p className="flex items-start gap-1.5 rounded bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-800">
          <TriangleAlert size={13} className="mt-px shrink-0" />
          Add an OpenAI key in AI settings before generating.
        </p>
      )}

      {error && (
        <p className="flex items-start gap-1.5 rounded bg-red-50 px-2.5 py-2 text-[11px] leading-snug text-red-700">
          <TriangleAlert size={13} className="mt-px shrink-0" />
          {error}
        </p>
      )}

      {!consented ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] leading-snug text-slate-600">
            Your brief and {brand.name}'s brand voice are sent to OpenAI to generate this draft.
            Nothing else — no API key, logo, footer or other saved content.
          </p>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={!!validation || busy || !hasKey}
            onClick={agreeAndGenerate}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Agree and generate
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={!!validation || busy || !hasKey}
          onClick={onGenerate}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {busy ? 'Generating…' : 'Generate'}
        </button>
      )}
      {validation && <p className="text-[11px] text-slate-400">{validation}</p>}
    </div>
  );
}
