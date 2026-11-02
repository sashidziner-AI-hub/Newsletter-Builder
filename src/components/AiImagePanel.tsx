import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import {
  AiError,
  MIN_REQUEST_GAP_MS,
  type AspectChoice,
  toAiError,
} from '../lib/ai/provider';
import { PROVIDERS, providerById } from '../lib/ai/openai';
import { clearKey, isRemembered, loadKey, maskKey, saveKey, setModel } from '../lib/ai/key-store';
import { draftStore, newDraftId, type DraftImage } from '../lib/drafts';
import { imageHosting } from '../lib/image-storage';
import { downloadFile } from '../lib/util';
import { useActiveBrand, useEditor } from '../store';
import type { AiTarget } from './fields';

const ASPECTS: { value: AspectChoice; label: string }[] = [
  { value: 'match', label: 'Match block width' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '3:2', label: '3:2' },
  { value: '4:3', label: '4:3' },
];

/** One turn in the session. Results are held in memory; nothing here persists. */
interface Turn {
  id: string;
  prompt: string;
  state: 'loading' | 'done' | 'error';
  draft?: DraftImage;
  objectUrl?: string;
  error?: AiError;
}

const btn =
  'inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const primary =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';

export function AiImagePanel({ target, onBack }: { target: AiTarget; onBack: () => void }) {
  const brand = useActiveBrand();
  const refreshDrafts = useEditor((s) => s.refreshDrafts);

  const existing = loadKey();
  const [providerId, setProviderId] = useState(existing?.providerId || PROVIDERS[0].id);
  const provider = providerById(providerId) ?? PROVIDERS[0];
  const [model, setModelState] = useState(existing?.model || provider.models[0]);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [remember, setRemember] = useState(isRemembered());
  const [configured, setConfigured] = useState(existing !== null);
  const [tested, setTested] = useState(existing !== null);
  const [testing, setTesting] = useState(false);
  const [setupError, setSetupError] = useState('');

  const [prompt, setPrompt] = useState(target.seed ? `${target.seed}` : '');
  const [aspect, setAspect] = useState<AspectChoice>('match');
  const [useBrandColors, setUseBrandColors] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const lastSent = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const listEnd = useRef<HTMLDivElement>(null);

  // object URLs are the only place blob: appears, and they die with the panel
  useEffect(
    () => () => {
      abort.current?.abort();
      for (const t of turns) if (t.objectUrl) URL.revokeObjectURL(t.objectUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    listEnd.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns]);

  /** The palette, as names and hex only. No logo, no footer, no brand name. */
  const brandSuffix = useMemo(() => {
    const c = brand.tokens.colors;
    return ` Use this colour palette: primary ${c.primary}, secondary ${c.secondary}, accent ${c.accent}.`;
  }, [brand]);

  const composerReady = configured && tested && !busy;

  /* ------------------------------------------------------------- setup */

  const testConnection = async () => {
    const key = keyInput.trim() || existing?.key || '';
    if (!key) return setSetupError('Enter an API key first.');
    setTesting(true);
    setSetupError('');
    const ctl = new AbortController();
    try {
      await provider.testKey(key, ctl.signal);
      setTested(true);
    } catch (e) {
      setTested(false);
      setSetupError(toAiError(e).message);
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    const key = keyInput.trim();
    if (!key) return setSetupError('Enter an API key first.');
    if (saveKey(provider.id, model, key, remember) === 'full') {
      return setSetupError('Browser storage is full, so the key was kept for this session only.');
    }
    setConfigured(true);
    setKeyInput('');
    setSetupError('');
  };

  const removeKey = () => {
    clearKey();
    setConfigured(false);
    setTested(false);
    setKeyInput('');
    setRemember(false);
  };

  /* -------------------------------------------------------- generation */

  const run = async (text: string) => {
    const key = loadKey()?.key;
    if (!key) {
      setConfigured(false);
      return;
    }
    setBusy(true);
    const id = newDraftId();
    setTurns((prev) => [...prev, { id, prompt: text, state: 'loading' }]);

    const since = Date.now() - lastSent.current;
    if (since < MIN_REQUEST_GAP_MS) {
      await new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS - since));
    }
    lastSent.current = Date.now();

    const ctl = new AbortController();
    abort.current = ctl;
    const full = useBrandColors ? text + brandSuffix : text;

    try {
      const result = await provider.generate(
        { prompt: full, aspect, blockWidth: target.blockWidth, model, signal: ctl.signal },
        key,
      );
      const draft: DraftImage = {
        id,
        blob: result.blob,
        mime: result.mime,
        width: result.width,
        height: result.height,
        prompt: text,
        alt: text.slice(0, 120),
        model,
        createdAt: Date.now(),
      };
      await draftStore.put(draft);
      const objectUrl = URL.createObjectURL(result.blob);
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, state: 'done', draft, objectUrl } : t)),
      );
    } catch (e) {
      const err = toAiError(e);
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, state: 'error', error: err } : t)));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const send = () => {
    const text = prompt.trim();
    if (!text || !composerReady || busy) return;
    void run(text);
  };

  /* ------------------------------------------------------------- using */

  const [altFor, setAltFor] = useState<string | null>(null);
  const [altText, setAltText] = useState('');

  const beginUse = (turn: Turn) => {
    setAltFor(turn.id);
    setAltText(turn.draft?.alt ?? turn.prompt.slice(0, 120));
  };

  const confirmUse = async (turn: Turn) => {
    const alt = altText.trim();
    if (!alt || !turn.draft) return;
    await draftStore.put({ ...turn.draft, alt });
    target.onUse({ draftId: turn.id, alt });
    await refreshDrafts();
    onBack();
  };

  /* -------------------------------------------------------------- view */

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to properties"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-900">
            <Sparkles size={14} className="shrink-0 text-brand-600" /> AI image
          </h2>
          <p className="truncate text-[11px] text-slate-400">{target.label}</p>
        </div>
      </div>

      {!configured || !tested ? (
        /* ---------------------------------------------------- setup state */
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Provider</span>
            <select
              aria-label="Provider"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setTested(false);
              }}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Model</span>
            <select
              aria-label="Model"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={model}
              onChange={(e) => {
                setModelState(e.target.value);
                setModel(e.target.value);
              }}
            >
              {provider.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">API key</span>
            <div className="flex gap-1">
              <input
                aria-label="API key"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs"
                placeholder={configured ? maskKey(existing?.key ?? '') : 'sk-…'}
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  setTested(false);
                }}
              />
              <button
                type="button"
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                onClick={() => setShowKey((v) => !v)}
                className="rounded-md border border-slate-300 px-2 text-slate-500 hover:bg-slate-50"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </label>

          <label className="flex items-start gap-2 text-[11px] leading-snug text-slate-600">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>
              Remember on this device.
              <span className="block text-amber-700">
                Stored unencrypted in this browser. Anyone with access to this machine, or any
                script that runs on this page, could read it.
              </span>
            </span>
          </label>

          {setupError && (
            <p className="flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              {setupError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={testing} onClick={() => void testConnection()}>
              {testing && <Loader2 size={12} className="animate-spin" />}
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button type="button" className={primary} onClick={save}>
              Save
            </button>
            {configured && (
              <button type="button" className={btn} onClick={removeKey}>
                <Trash2 size={12} /> Remove key
              </button>
            )}
          </div>

          <p className="text-[11px] leading-snug text-slate-400">
            Your key stays in this browser — it is never sent anywhere except {provider.name}, and
            never written into a design, brand, saved block or export. Generations may be billed by
            your provider.
          </p>
          {!tested && configured && (
            <p className="text-[11px] text-slate-500">Run Test connection to enable the composer.</p>
          )}
        </div>
      ) : (
        /* ----------------------------------------------------- chat state */
        <>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {turns.length === 0 && (
              <p className="text-[11px] leading-snug text-slate-400">
                Describe the image you want. Results stay in this panel until you use one — they are
                not saved with the email.
              </p>
            )}

            {turns.map((turn) => (
              <div key={turn.id} className="space-y-1.5">
                <p className="ml-auto w-fit max-w-full rounded-lg bg-brand-50 px-2.5 py-1.5 text-right text-xs text-brand-900">
                  {turn.prompt}
                </p>

                {turn.state === 'loading' && (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-500">
                    <Loader2 size={13} className="animate-spin" /> Generating…
                    <button type="button" className={`${btn} ml-auto`} onClick={() => abort.current?.abort()}>
                      Cancel
                    </button>
                  </div>
                )}

                {turn.state === 'error' && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] text-red-700">
                    <TriangleAlert size={13} className="mt-px shrink-0" />
                    {turn.error?.message}
                  </p>
                )}

                {turn.state === 'done' && turn.objectUrl && (
                  <div className="rounded-lg border border-slate-200 p-2">
                    <img
                      src={turn.objectUrl}
                      alt={turn.prompt}
                      className="mb-2 w-full rounded bg-slate-100"
                    />
                    {altFor === turn.id ? (
                      <div className="space-y-1.5">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-medium text-slate-600">
                            Alt text (required)
                          </span>
                          <input
                            aria-label="Alt text"
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                            value={altText}
                            onChange={(e) => setAltText(e.target.value)}
                          />
                        </label>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            className={primary}
                            disabled={!altText.trim()}
                            onClick={() => void confirmUse(turn)}
                          >
                            Add to email
                          </button>
                          <button type="button" className={btn} onClick={() => setAltFor(null)}>
                            Cancel
                          </button>
                        </div>
                        {!altText.trim() && (
                          <p className="text-[11px] text-amber-700">
                            Inboxes block images by default, so alt text is what most readers see.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" className={btn} onClick={() => beginUse(turn)}>
                          Use this image
                        </button>
                        <button
                          type="button"
                          className={btn}
                          disabled={busy}
                          onClick={() => void run(turn.prompt)}
                        >
                          <RefreshCw size={12} /> Regenerate
                        </button>
                        <button type="button" className={btn} onClick={() => setPrompt(turn.prompt)}>
                          <Pencil size={12} /> Edit prompt
                        </button>
                        <button
                          type="button"
                          className={btn}
                          onClick={() =>
                            turn.draft &&
                            downloadFile(`${turn.id}.png`, turn.draft.blob, turn.draft.mime)
                          }
                        >
                          <Download size={12} /> PNG
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={listEnd} />
          </div>

          {/* ------------------------------------------------------ composer */}
          <div className="shrink-0 space-y-2 border-t border-slate-200 px-4 py-3">
            {!imageHosting.configured && (
              <p className="rounded bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-800">
                No image hosting is configured, so a generated image stays a local draft and the
                export ships a placeholder until you host it yourself.
              </p>
            )}

            <div className="flex items-center gap-1.5">
              <select
                aria-label="Image size"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-1.5 py-1 text-[11px]"
                value={aspect}
                onChange={(e) => setAspect(e.target.value as AspectChoice)}
              >
                {ASPECTS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={useBrandColors}
                  onChange={(e) => setUseBrandColors(e.target.checked)}
                />
                Brand colours
              </label>
            </div>

            <div className="flex gap-1.5">
              <textarea
                aria-label="Image prompt"
                rows={2}
                className="min-w-0 flex-1 resize-none rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                placeholder="A quiet office at sunrise, soft light…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
                }}
              />
              <button
                type="button"
                aria-label="Generate"
                className={primary}
                disabled={!composerReady || !prompt.trim()}
                onClick={send}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              {provider.name} · {model}
            </p>
          </div>
        </>
      )}
    </aside>
  );
}
