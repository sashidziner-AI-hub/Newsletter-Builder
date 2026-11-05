import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plug,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import {
  AiError,
  MIN_REQUEST_GAP_MS,
  type AspectChoice,
  type ImageQuality,
  normalizeKey,
  toAiError,
} from '../lib/ai/provider';
import { DEFAULT_STYLE_ID, STYLE_PRESETS, composePrompt, styleById } from '../lib/ai/styles';
import { PROVIDERS, providerById } from '../lib/ai/openai';
import {
  type ProviderStatus,
  activeProvider,
  clearKey,
  isConnected,
  isRemembered,
  loadKey,
  markConnected,
  maskKey,
  saveKey,
  setActiveProvider,
  setModel,
  statusOf,
} from '../lib/ai/key-store';
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

const STATUS_LABEL: Record<ProviderStatus, string> = {
  'not-configured': 'Not configured',
  configured: 'Configured',
  connected: 'Connected',
};

const STATUS_STYLE: Record<ProviderStatus, string> = {
  'not-configured': 'bg-slate-100 text-slate-500',
  configured: 'bg-amber-100 text-amber-800',
  connected: 'bg-emerald-100 text-emerald-800',
};

const QUALITIES: { value: ImageQuality; label: string }[] = [
  { value: 'low', label: 'Draft' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/** One turn in the session. Results are held in memory; nothing here persists. */
interface Turn {
  id: string;
  prompt: string;
  /** the style that produced it, named on the card */
  styleName: string;
  /** when it was dispatched, for the live elapsed counter */
  startedAt: number;
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

  /** Bumped whenever the key store changes, to re-read it without a subscription. */
  const [keyRevision, setKeyRevision] = useState(0);
  const bumpKeys = () => setKeyRevision((n) => n + 1);

  const active = useMemo(() => activeProvider(), [keyRevision]);
  const activeAdapter = active ? providerById(active) : null;
  const activeRecord = active ? loadKey(active) : null;
  const activeConnected = !!active && isConnected(active);

  /**
   * Which half of the panel is showing. Deliberately independent of whether a
   * key exists — that coupling was the bug: once configured, there was no way
   * back to settings.
   */
  const [view, setView] = useState<'chat' | 'settings'>(() =>
    activeProvider() && isConnected(activeProvider()!) ? 'chat' : 'settings',
  );

  const [prompt, setPrompt] = useState(target.seed ? `${target.seed}` : '');
  const [aspect, setAspect] = useState<AspectChoice>('match');
  const [styleId, setStyleId] = useState(DEFAULT_STYLE_ID);
  const [quality, setQuality] = useState<ImageQuality>('high');
  const [useBrandColors, setUseBrandColors] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  /** ticks once a second while a generation is in flight, for "Generating 12s" */
  const [now, setNow] = useState(() => Date.now());
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

  // a slow model can take most of a minute; a counter is the difference
  // between "it is working" and "it has hung"
  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  /** The palette, as names and hex only. No logo, no footer, no brand name. */
  const brandSuffix = useMemo(() => {
    const c = brand.tokens.colors;
    return ` Use this colour palette: primary ${c.primary}, secondary ${c.secondary}, accent ${c.accent}.`;
  }, [brand]);

  const composerReady = !!activeAdapter && activeConnected && !busy;

  /** An in-flight generation must not outlive the provider it was sent to. */
  const cancelInFlight = () => {
    abort.current?.abort();
    abort.current = null;
  };

  /* -------------------------------------------------------- generation */

  const run = async (text: string) => {
    if (!activeAdapter || !active) return;
    const key = loadKey(active)?.key;
    if (!key) {
      setView('settings');
      return;
    }
    setBusy(true);
    const id = newDraftId();
    const style = styleById(styleId);
    setTurns((prev) => [
      ...prev,
      { id, prompt: text, styleName: style.name, startedAt: Date.now(), state: 'loading' },
    ]);

    const since = Date.now() - lastSent.current;
    if (since < MIN_REQUEST_GAP_MS) {
      await new Promise((r) => setTimeout(r, MIN_REQUEST_GAP_MS - since));
    }
    lastSent.current = Date.now();

    const ctl = new AbortController();
    abort.current = ctl;
    // style first, brand second — the palette should qualify the style, not
    // be buried under it
    const full = composePrompt(text, styleId, useBrandColors ? brandSuffix : '');
    const model = loadKey(active)?.model || activeAdapter.models[0];

    try {
      const result = await activeAdapter.generate(
        { prompt: full, aspect, blockWidth: target.blockWidth, model, quality, signal: ctl.signal },
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

  /**
   * Returns whether the send was accepted. The composer is cleared only then:
   * a blocked validation must leave what was typed alone.
   */
  const send = (): boolean => {
    const text = prompt.trim();
    if (!text || !composerReady || busy) return false;
    void run(text);
    setPrompt('');
    return true;
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
          <p className="truncate text-[11px] text-slate-400">
            {view === 'chat' && activeAdapter
              ? `Provider: ${activeAdapter.name} / ${activeRecord?.model || activeAdapter.models[0]}`
              : target.label}
          </p>
        </div>
        {/* reachable from both views — this is what was missing */}
        <button
          type="button"
          aria-label={view === 'settings' ? 'Back to chat' : 'AI settings'}
          title={view === 'settings' ? 'Back to chat' : 'AI settings'}
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          className={`rounded-md p-1.5 ${
            view === 'settings'
              ? 'bg-slate-100 text-slate-900'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          {view === 'settings' ? <ArrowLeft size={17} /> : <Settings size={17} />}
        </button>
      </div>

      {view === 'settings' ? (
        <SettingsView
          onChanged={bumpKeys}
          onCancelInFlight={cancelInFlight}
          onDone={() => setView('chat')}
          hasSession={turns.length > 0}
        />
      ) : (
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
                    <Loader2 size={13} className="animate-spin" />
                    Generating… {Math.max(0, Math.round((now - turn.startedAt) / 1000))}s
                    <button type="button" className={`${btn} ml-auto`} onClick={cancelInFlight}>
                      Cancel
                    </button>
                  </div>
                )}

                {turn.state === 'error' && (
                  <div className="rounded-lg bg-red-50 px-2.5 py-2 text-[11px] text-red-700">
                    <p className="flex items-start gap-1.5">
                      <TriangleAlert size={13} className="mt-px shrink-0" />
                      {turn.error?.message}
                    </p>
                    {turn.error?.detail && (
                      <p className="ml-[18px] mt-0.5 text-red-600/80">{turn.error.detail}</p>
                    )}
                  </div>
                )}

                {turn.state === 'done' && turn.objectUrl && (
                  <div className="rounded-lg border border-slate-200 p-2">
                    <img
                      src={turn.objectUrl}
                      alt={turn.prompt}
                      className="mb-2 w-full rounded bg-slate-100"
                    />
                    {turn.styleName && turn.styleName !== 'None' && (
                      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                        Style: {turn.styleName}
                      </p>
                    )}
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
                          disabled={busy || !composerReady}
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
            {!activeAdapter || !activeConnected ? (
              <p className="flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
                <TriangleAlert size={13} className="mt-px shrink-0" />
                {activeAdapter
                  ? `${activeAdapter.name} is not connected. Open AI settings and run Test connection.`
                  : 'No provider is active. Open AI settings to configure one.'}
              </p>
            ) : (
              !imageHosting.configured && (
                <p className="rounded bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-800">
                  No image hosting is configured, so a generated image stays a local draft and the
                  export ships a placeholder until you host it yourself.
                </p>
              )
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
              <select
                aria-label="Image style"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-1.5 py-1 text-[11px]"
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
              >
                {STYLE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                aria-label="Image quality"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-1.5 py-1 text-[11px]"
                value={quality}
                onChange={(e) => setQuality(e.target.value as ImageQuality)}
              >
                {QUALITIES.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
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
                disabled={!composerReady}
                className="min-w-0 flex-1 resize-none rounded-md border border-slate-300 px-2 py-1.5 text-xs disabled:bg-slate-50"
                placeholder="A quiet office at sunrise, soft light…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  // an IME commits its candidate with Enter; that keystroke
                  // belongs to the input method, not to us
                  if (e.nativeEvent.isComposing) return;
                  if (e.shiftKey) return; // newline
                  e.preventDefault();
                  send();
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
          </div>
        </>
      )}
    </aside>
  );
}

/* ========================================================== settings view */

/**
 * Every registered provider, its status, and the four actions.
 *
 * A key only becomes the stored one after a passing Test connection, so a
 * failed replacement leaves whatever was working in place.
 */
function SettingsView({
  onChanged,
  onCancelInFlight,
  onDone,
  hasSession,
}: {
  onChanged: () => void;
  onCancelInFlight: () => void;
  onDone: () => void;
  hasSession: boolean;
}) {
  const [, forceRender] = useState(0);
  const refresh = () => {
    forceRender((n) => n + 1);
    onChanged();
  };

  const [editing, setEditing] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [remember, setRemember] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, { message: string; detail: string }>>({});

  const active = activeProvider();

  const beginEdit = (id: string) => {
    setEditing(id);
    setDraftKey('');
    setShowKey(false);
    setRemember(isRemembered(id));
    setErrors((e) => ({ ...e, [id]: { message: '', detail: '' } }));
  };

  /**
   * Test, then save only if it passed. The previous key is never touched until
   * the new one has proven itself.
   */
  const testAndSave = async (id: string) => {
    const adapter = providerById(id);
    if (!adapter) return;
    const candidate = normalizeKey(draftKey) || loadKey(id)?.key || '';
    if (!candidate) {
      setErrors((e) => ({ ...e, [id]: { message: 'Enter an API key first.', detail: '' } }));
      return;
    }
    setTestingId(id);
    setErrors((e) => ({ ...e, [id]: { message: '', detail: '' } }));
    try {
      await adapter.testKey(candidate, new AbortController().signal);
      const model = loadKey(id)?.model || adapter.models[0];
      if (saveKey(id, model, candidate, remember) === 'full') {
        setErrors((e) => ({
          ...e,
          [id]: { message: 'Storage is full, so the key is kept for this session only.', detail: '' },
        }));
      }
      markConnected(id, true);
      setEditing(null);
      setDraftKey('');
      refresh();
      // configuring the active provider is the first-run path; land on the chat
      if (activeProvider() === id) onDone();
    } catch (e) {
      // the stored key is untouched, which is the point
      markConnected(id, false);
      const ai = toAiError(e);
      setErrors((err) => ({ ...err, [id]: { message: ai.message, detail: ai.detail } }));
    } finally {
      setTestingId(null);
    }
  };

  const makeActive = (id: string) => {
    onCancelInFlight();
    setActiveProvider(id);
    refresh();
  };

  const remove = (id: string) => {
    if (id === active) onCancelInFlight();
    clearKey(id);
    // fall back to the first connected provider, else leave none active
    if (id === active) {
      const next = PROVIDERS.find((p) => p.id !== id && isConnected(p.id));
      if (next) setActiveProvider(next.id);
    }
    if (editing === id) setEditing(null);
    refresh();
  };

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
      {hasSession && (
        <button type="button" className={btn} onClick={onDone}>
          <ArrowLeft size={12} /> Back to chat
        </button>
      )}

      {PROVIDERS.map((provider) => {
        const status = statusOf(provider.id);
        const record = loadKey(provider.id);
        const isActive = provider.id === active;
        const open = editing === provider.id;

        return (
          <section key={provider.id} className="rounded-lg border border-slate-200 p-2.5">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 truncate text-xs font-semibold text-slate-900">
                {provider.name}
                {isActive && (
                  <span className="ml-1.5 rounded bg-brand-100 px-1 py-0.5 text-[10px] font-bold text-brand-700">
                    ACTIVE
                  </span>
                )}
              </h3>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[status]}`}
              >
                {STATUS_LABEL[status]}
              </span>
            </div>

            {record && !open && (
              <p className="mt-1 font-mono text-[10px] text-slate-400">{maskKey(record.key)}</p>
            )}

            {open ? (
              <div className="mt-2 space-y-2">
                <div className="flex gap-1">
                  <input
                    aria-label={`${provider.name} API key`}
                    type={showKey ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs"
                    placeholder={record ? 'Enter a replacement key' : 'sk-…'}
                    value={draftKey}
                    onChange={(e) => setDraftKey(e.target.value)}
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
                      Stored unencrypted in this browser, for this provider only.
                    </span>
                  </span>
                </label>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={primary}
                    disabled={testingId === provider.id}
                    onClick={() => void testAndSave(provider.id)}
                  >
                    {testingId === provider.id && <Loader2 size={12} className="animate-spin" />}
                    {testingId === provider.id ? 'Testing…' : 'Test and save'}
                  </button>
                  <button type="button" className={btn} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
                <p className="text-[11px] leading-snug text-slate-400">
                  The key is only stored once Test connection passes, so a failed attempt leaves
                  your working key alone.
                </p>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={btn} onClick={() => beginEdit(provider.id)}>
                  <Plug size={12} /> {record ? 'Replace key' : 'Add key'}
                </button>
                {record && (
                  <button
                    type="button"
                    className={btn}
                    disabled={testingId === provider.id}
                    onClick={() => void testAndSave(provider.id)}
                  >
                    {testingId === provider.id ? 'Testing…' : 'Test connection'}
                  </button>
                )}
                {record && !isActive && (
                  <button type="button" className={btn} onClick={() => makeActive(provider.id)}>
                    <Check size={12} /> Set as active
                  </button>
                )}
                {record && (
                  <button type="button" className={btn} onClick={() => remove(provider.id)}>
                    <Trash2 size={12} /> Remove key
                  </button>
                )}
              </div>
            )}

            {errors[provider.id]?.message && (
              <div className="mt-1.5 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
                <p className="flex items-start gap-1.5">
                  <TriangleAlert size={12} className="mt-px shrink-0" />
                  {errors[provider.id].message}
                </p>
                {errors[provider.id].detail && (
                  <p className="ml-[17px] mt-0.5 text-red-600/80">{errors[provider.id].detail}</p>
                )}
              </div>
            )}

            {record && (
              <label className="mt-2 block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Model</span>
                <select
                  aria-label={`${provider.name} model`}
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                  value={record.model || provider.models[0]}
                  onChange={(e) => {
                    setModel(provider.id, e.target.value);
                    refresh();
                  }}
                >
                  {provider.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        );
      })}

      <p className="text-[11px] leading-snug text-slate-400">
        Keys stay in this browser — each is sent only to its own provider, and never written into a
        design, brand, saved block or export. Generations may be billed by your provider.
      </p>
    </div>
  );
}
