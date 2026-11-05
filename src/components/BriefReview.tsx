import { Check, Copy, Loader2, Pencil, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Brand } from '../types';
import { PRESETS } from '../lib/presets';
import type { BriefDraft } from '../lib/ai/create-from-brief';
import { SUBJECT_MAX_CHARS } from '../lib/ai/slots';
import { PresetThumb } from './NewEmailModal';

const btn =
  'inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const primary =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';

const BRACKET_RE = /\[[^[\]\n]{1,80}\]/g;

/** Every missing-fact placeholder still left in the draft, for a heads-up before Create. */
function remainingPlaceholders(draft: BriefDraft): string[] {
  const texts: string[] = [draft.data.preheader, ...draft.data.subjectOptions];
  for (const value of Object.values(draft.data.slotValues)) if (value) texts.push(value);
  for (const items of Object.values(draft.data.repeaterValues)) {
    for (const item of items) for (const value of Object.values(item)) texts.push(value);
  }
  for (const value of Object.values(draft.data.imagePrompts)) if (value) texts.push(value);

  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(BRACKET_RE)) {
      if (!match[0].startsWith('[%')) found.add(match[0]);
    }
  }
  return [...found];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={btn}
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function BriefReview({
  draft,
  brand,
  chosenSubject,
  onChosenSubjectChange,
  onCreate,
  onRegenerate,
  onEditBrief,
  busy,
}: {
  draft: BriefDraft;
  brand: Brand;
  chosenSubject: string;
  onChosenSubjectChange: (subject: string) => void;
  onCreate: () => void;
  onRegenerate: () => void;
  onEditBrief: () => void;
  busy: boolean;
}) {
  const preset = PRESETS.find((p) => p.id === draft.presetId);
  const placeholders = useMemo(() => remainingPlaceholders(draft), [draft]);

  return (
    <div className={`mx-auto max-w-3xl space-y-4 pb-2 ${busy ? 'opacity-60' : ''}`}>
      <div className="flex gap-4">
        <PresetThumb design={draft.design} brand={brand} />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-xs text-slate-500">
            Preset: <span className="font-medium text-slate-700">{preset?.name ?? draft.presetId}</span>
          </p>

          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-600">Subject line</p>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {draft.data.subjectOptions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onChosenSubjectChange(s)}
                  className={`rounded-md border px-2 py-1 text-left text-[11px] ${
                    s === chosenSubject
                      ? 'border-brand-500 bg-brand-50 text-brand-800'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <input
              aria-label="Subject line"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
              maxLength={SUBJECT_MAX_CHARS}
              value={chosenSubject}
              onChange={(e) => onChosenSubjectChange(e.target.value)}
            />
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-600">Preheader</p>
            <p className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
              {draft.data.preheader}
            </p>
          </div>
        </div>
      </div>

      {Object.keys(draft.data.imagePrompts).length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-slate-600">Suggested image prompts</p>
          <ul className="space-y-1.5">
            {draft.schema.imageSlots.map((slot) => {
              const text = draft.data.imagePrompts[slot.id];
              if (!text) return null;
              return (
                <li
                  key={slot.id}
                  className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{slot.label}</p>
                    <p className="truncate text-xs text-slate-700">{text}</p>
                  </div>
                  <CopyButton text={text} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {placeholders.length > 0 && (
        <div className="rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-800">
          <p className="flex items-start gap-1.5 font-medium">
            <TriangleAlert size={13} className="mt-px shrink-0" />
            The brief didn't give enough to fill {placeholders.length === 1 ? 'this' : 'these'}:
          </p>
          <ul className="ml-[18px] mt-1 list-disc">
            {placeholders.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="ml-[18px] mt-1">Fill it in after creating, or edit the brief and regenerate.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
        <button type="button" className={primary} disabled={busy || !chosenSubject.trim()} onClick={onCreate}>
          <Sparkles size={14} /> Create email
        </button>
        <button type="button" className={btn} disabled={busy} onClick={onRegenerate}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Regenerate
        </button>
        <button type="button" className={btn} disabled={busy} onClick={onEditBrief}>
          <Pencil size={12} /> Edit brief
        </button>
      </div>
    </div>
  );
}
