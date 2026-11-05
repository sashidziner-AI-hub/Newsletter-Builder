import { useState } from 'react';
import { Check, Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { SettingsView, STATUS_LABEL, STATUS_STYLE } from '../AiImagePanel';
import { loadKey, statusOf } from '../../lib/ai/key-store';
import { clearModelAccessDenied, deniedModelFor, recordModelAccessDenied } from '../../lib/ai/model-access';
import { verifyModelListed } from '../../lib/ai/openai';
import { testTextModel } from '../../lib/ai/openai-text';
import { isModelAccessError } from '../../lib/ai/run-task';
import { toAiError } from '../../lib/ai/provider';
import { hasTextConsent } from '../../lib/ai/text-consent';
import {
  AI_TASKS,
  ALL_TASK_IDS,
  TEXT_TEMPERATURE_VALUE,
  isKnownModel,
  providersFor,
  type AiCapability,
  type AiTaskId,
  type ImageTaskOptions,
  type TextTaskOptions,
  type TextTemperature,
} from '../../lib/ai/tasks';
import {
  loadTaskSettings,
  resetTaskSettings,
  setTaskRoute,
  type FallbackEntry,
  type TaskRoute,
} from '../../lib/ai/task-settings';

const selectCls =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';
const inputCls =
  'w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';
const miniLabel = 'mb-0.5 block text-[10px] font-medium text-slate-500';
const btn =
  'inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

/** Provider + model, with a free-text "Other model id" escape hatch. Reused for the primary route and every fallback entry. */
function RouteModelPicker({
  capability,
  providerId,
  model,
  onChange,
}: {
  capability: AiCapability;
  providerId: string;
  model: string;
  onChange: (next: { providerId: string; model: string }) => void;
}) {
  const providers = providersFor(capability);
  const current = providers.find((p) => p.providerId === providerId) ?? providers[0];
  const [other, setOther] = useState(() => !isKnownModel(capability, providerId, model));

  return (
    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-1.5">
      <div>
        <label className={miniLabel}>Provider</label>
        <select
          className={selectCls}
          value={current?.providerId ?? ''}
          onChange={(e) => {
            const next = providers.find((p) => p.providerId === e.target.value);
            if (next) onChange({ providerId: next.providerId, model: next.models[0] ?? '' });
          }}
        >
          {providers.map((p) => (
            <option key={p.providerId} value={p.providerId}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={miniLabel}>Model</label>
        {other ? (
          <input
            className={inputCls}
            value={model}
            placeholder="exact model id"
            onChange={(e) => onChange({ providerId: current?.providerId ?? providerId, model: e.target.value })}
          />
        ) : (
          <select
            className={selectCls}
            value={model}
            onChange={(e) => onChange({ providerId: current?.providerId ?? providerId, model: e.target.value })}
          >
            {current?.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>
      <button
        type="button"
        className={btn}
        onClick={() => setOther((v) => !v)}
        title={other ? 'Pick from the list instead' : 'Type a model id instead'}
      >
        {other ? 'List' : 'Other'}
      </button>
    </div>
  );
}

type TestState = { status: 'idle' | 'testing' | 'ok' | 'unverified' | 'error'; message?: string };

function TaskRow({ taskId, onChanged }: { taskId: AiTaskId; onChanged: () => void }) {
  const def = AI_TASKS[taskId];
  const route = loadTaskSettings()[taskId];
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  const setRoute = (next: TaskRoute) => {
    setTaskRoute(taskId, next);
    setTest({ status: 'idle' });
    onChanged();
  };

  const status = statusOf(route.providerId);
  const denied = deniedModelFor(taskId, route.model);

  const runTest = async () => {
    const record = loadKey(route.providerId);
    if (!record) {
      setTest({ status: 'error', message: 'No key saved for this provider.' });
      return;
    }
    setTest({ status: 'testing' });
    const signal = new AbortController().signal;
    try {
      if (def.capability === 'text') {
        // a tiny real request with the selected model — this is itself a
        // generation, so a model-access failure updates the chip the same
        // way a real "Generate from brief" failure would
        await testTextModel(route.model, record.key, signal);
        clearModelAccessDenied(taskId);
        setTest({ status: 'ok' });
      } else {
        // never a billed generation — this can only prove the key works and
        // (best-effort) whether the model is listed, never prove access
        const listed = await verifyModelListed(route.model, record.key, signal);
        setTest(
          listed
            ? { status: 'ok' }
            : { status: 'unverified', message: 'Key OK, model access not verified until first use.' },
        );
      }
    } catch (e) {
      const err = toAiError(e);
      if (isModelAccessError(err)) recordModelAccessDenied(taskId, route.model);
      setTest({ status: 'error', message: [err.message, err.detail].filter(Boolean).join(' — ') });
    }
  };

  const addFallback = () => {
    const providers = providersFor(def.capability);
    const first = providers.find((p) => p.providerId !== route.providerId) ?? providers[0];
    if (!first) return;
    setRoute({ ...route, fallbacks: [...route.fallbacks, { providerId: first.providerId, model: first.models[0] ?? '' }] });
  };

  const updateFallback = (i: number, entry: FallbackEntry) => {
    setRoute({ ...route, fallbacks: route.fallbacks.map((f, j) => (j === i ? entry : f)) });
  };

  const removeFallback = (i: number) => {
    setRoute({ ...route, fallbacks: route.fallbacks.filter((_, j) => j !== i) });
  };

  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="flex-1 text-xs font-semibold text-slate-900">{def.label}</h4>
        {denied ? (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
            No access to {denied}
          </span>
        ) : (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>
      {denied && (
        <p className="mb-2 text-[10px] leading-snug text-red-700">
          Choose another model or enable this one in your OpenAI project's Allowed models.
        </p>
      )}

      <RouteModelPicker
        capability={def.capability}
        providerId={route.providerId}
        model={route.model}
        onChange={({ providerId, model }) => setRoute({ ...route, providerId, model })}
      />

      <div className="mt-2">
        {def.capability === 'image' ? (
          <div>
            <label className={miniLabel}>Quality</label>
            <select
              className={selectCls}
              value={(route.options as Partial<ImageTaskOptions>).quality ?? 'medium'}
              onChange={(e) =>
                setRoute({ ...route, options: { ...route.options, quality: e.target.value as ImageTaskOptions['quality'] } })
              }
            >
              <option value="low">Low (draft)</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        ) : (
          <div>
            <label className={miniLabel}>Temperature</label>
            <select
              className={selectCls}
              value={(route.options as Partial<TextTaskOptions>).temperature ?? 'low'}
              onChange={(e) =>
                setRoute({ ...route, options: { ...route.options, temperature: e.target.value as TextTemperature } })
              }
            >
              {(Object.keys(TEXT_TEMPERATURE_VALUE) as TextTemperature[]).map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button type="button" className={btn} disabled={test.status === 'testing'} onClick={() => void runTest()}>
          {test.status === 'testing' && <Loader2 size={11} className="animate-spin" />}
          Test connection
        </button>
        {test.status === 'ok' && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-700">
            <Check size={12} /> Connected
          </span>
        )}
        {test.status === 'unverified' && (
          <span className="flex items-center gap-1 text-[11px] text-amber-700">
            <TriangleAlert size={12} /> {test.message}
          </span>
        )}
        {test.status === 'error' && (
          <span className="flex items-center gap-1 text-[11px] text-red-700">
            <TriangleAlert size={12} /> {test.message}
          </span>
        )}
      </div>
      {def.capability === 'image' && (
        <p className="mt-1 text-[10px] leading-snug text-slate-400">
          Never generates an image to test — it only checks the key and whether this model is
          listed for it.
        </p>
      )}

      <div className="mt-3 border-t border-slate-100 pt-2">
        <p className="mb-1 text-[10px] font-medium text-slate-500">
          Fallback chain{route.fallbacks.length > 0 ? ` (${route.fallbacks.length})` : ''}
        </p>
        <div className="space-y-1.5">
          {route.fallbacks.map((f, i) => (
            <div key={i} className="flex items-end gap-1.5">
              <div className="flex-1">
                <RouteModelPicker
                  capability={def.capability}
                  providerId={f.providerId}
                  model={f.model}
                  onChange={(entry) => updateFallback(i, entry)}
                />
              </div>
              <button
                type="button"
                aria-label={`Remove fallback ${i + 1}`}
                className="mb-0.5 shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => removeFallback(i)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className={`${btn} mt-1.5`} onClick={addFallback}>
          <Plus size={11} /> Add fallback
        </button>
        <p className="mt-1 text-[10px] leading-snug text-slate-400">
          Tried in order only if the primary fails to reach the provider — never on a refused or
          invalid response.
        </p>
      </div>

      {def.capability === 'text' && (
        <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
          Data consent:{' '}
          <span className={hasTextConsent(route.providerId) ? 'text-emerald-700' : 'text-slate-400'}>
            {hasTextConsent(route.providerId) ? 'given' : 'not yet given'}
          </span>
        </p>
      )}
    </div>
  );
}

export function AiSection() {
  const [, setRevision] = useState(0);
  const refresh = () => setRevision((n) => n + 1);

  const reset = () => {
    resetTaskSettings();
    refresh();
  };

  return (
    <div className="-mx-3 -my-3">
      {/* SettingsView already paints its own padding/scroll region; this is
          the exact component the AI image panel's own ⚙ shows — same code,
          same `key-store.ts` state, not a second implementation. */}
      <SettingsView onChanged={refresh} onCancelInFlight={() => {}} onDone={() => {}} hasSession={false} />

      <div className="space-y-3 border-t border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Models per task</h4>
          <button type="button" className={btn} onClick={reset}>
            Reset to defaults
          </button>
        </div>
        {ALL_TASK_IDS.map((id) => (
          <TaskRow key={id} taskId={id} onChanged={refresh} />
        ))}
        <p className="text-[10px] leading-snug text-slate-400">
          Every AI call in this app goes through whichever route is set here — nothing elsewhere
          picks its own model.
        </p>
      </div>
    </div>
  );
}
