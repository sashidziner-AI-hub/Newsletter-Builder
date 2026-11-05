import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { veeBrand } from '../lib/brand';
import { generateBriefDraft, writeBriefDraftOntoDesign } from '../lib/ai/create-from-brief';
import { defaultBriefFields } from '../lib/ai/brief-types';
import { AiError } from '../lib/ai/provider';
import { clearAllKeys, markConnected, saveKey, setActiveProvider } from '../lib/ai/key-store';
import { PRESETS } from '../lib/presets';
import type { ArticleItem, Block, Design } from '../types';

const vee = veeBrand();
const KEY = 'sk-test-key';

/** Fills every slot/repeater/image field with short placeholder text, matching whatever schema is sent. */
function fillFromJsonSchema(node: Record<string, unknown>): unknown {
  if (Array.isArray(node.anyOf)) {
    const str = (node.anyOf as Record<string, unknown>[]).find((s) => s.type === 'string');
    return str ? fillFromJsonSchema(str) : null;
  }
  if (node.type === 'string') return 'Filled text'.slice(0, (node.maxLength as number) ?? 20);
  if (node.type === 'array') {
    const count = (node.minItems as number) ?? 1;
    return Array.from({ length: count }, () => fillFromJsonSchema(node.items as Record<string, unknown>));
  }
  if (node.type === 'object') {
    const props = (node.properties ?? {}) as Record<string, Record<string, unknown>>;
    const out: Record<string, unknown> = {};
    for (const [key, sub] of Object.entries(props)) out[key] = fillFromJsonSchema(sub);
    return out;
  }
  return null;
}

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fetchMock = vi.fn();

/** Responds to a real /chat/completions call by filling whatever schema it was sent. */
function respondBySchema() {
  fetchMock.mockImplementation((_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { response_format: { json_schema: { schema: object } } };
    const content = JSON.stringify(fillFromJsonSchema(body.response_format.json_schema.schema as Record<string, unknown>));
    return okResponse({ choices: [{ message: { content } }] });
  });
}

function setupKey() {
  saveKey('openai', 'unused', KEY, true);
  setActiveProvider('openai');
  markConnected('openai', true);
}

beforeEach(() => {
  localStorage.clear();
  clearAllKeys();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setupKey();
});
afterEach(() => vi.unstubAllGlobals());

const baseOpts = (overrides: Partial<Parameters<typeof generateBriefDraft>[0]> = {}) => ({
  brand: vee,
  fields: { ...defaultBriefFields(), topic: 'Diwali sale', goal: 'promote' as const, presetId: 'promotional' },
  signal: new AbortController().signal,
  ...overrides,
});

describe('generateBriefDraft', () => {
  it('resolves an explicit preset id and produces a schema-matching draft', async () => {
    respondBySchema();
    const result = await generateBriefDraft(baseOpts());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.presetId).toBe('promotional');
  });

  it('resolves Auto via pickAutoPreset when no preset id is given', async () => {
    respondBySchema();
    const result = await generateBriefDraft(baseOpts({ fields: { ...defaultBriefFields(), topic: 'x', goal: 'welcome', presetId: null } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.presetId).toBe('welcome');
  });

  it('fails cleanly on an unknown preset id, without calling the provider', async () => {
    respondBySchema();
    const result = await generateBriefDraft(baseOpts({ fields: { ...defaultBriefFields(), topic: 'x', presetId: 'not-a-real-preset' } }));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resizes the articles repeater before deriving the schema sent to the model', async () => {
    respondBySchema();
    await generateBriefDraft(
      baseOpts({
        fields: { ...defaultBriefFields(), topic: 'x', presetId: 'newsletter', articleCount: 5 },
      }),
    );
    // newsletter's hero also carries a default `cards` repeater (unrelated to
    // this preset's layout, inherited from createBlock('hero')'s defaults) —
    // select the articles one by id rather than assuming it is the only one.
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const sentSchema = sentBody.response_format.json_schema.schema as {
      properties: { repeaters: { properties: Record<string, { minItems: number }> } };
    };
    const [, articlesSchema] = Object.entries(sentSchema.properties.repeaters.properties).find(([id]) =>
      id.includes('articles'),
    )!;
    expect(articlesSchema.minItems).toBe(5);
  });

  it('propagates a provider AiError untouched, for the caller to show Regenerate', async () => {
    fetchMock.mockImplementation(() => okResponse({ error: { code: 'rate_limit_exceeded' } }, 429));
    const err: AiError = await generateBriefDraft(baseOpts()).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe('rate-limit');
  });

  it('returns ok:false (not a throw) when the response fails validation', async () => {
    fetchMock.mockImplementation(() =>
      okResponse({ choices: [{ message: { content: JSON.stringify({ subjectOptions: [], preheader: '', slots: {} }) } }] }),
    );
    const result = await generateBriefDraft(baseOpts());
    expect(result.ok).toBe(false);
  });

  it('a user-supplied CTA label removes cta_label fields from the schema sent to the model', async () => {
    respondBySchema();
    await generateBriefDraft(
      baseOpts({
        fields: { ...defaultBriefFields(), topic: 'x', presetId: 'promotional', ctaLabel: 'Shop now' },
      }),
    );
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const sentSchema = sentBody.response_format.json_schema.schema as { properties: { slots: { properties: Record<string, unknown> } } };
    const slotKeys = Object.keys(sentSchema.properties.slots.properties);
    // promotional's hero.ctaLabel slot id contains "ctaLabel"
    expect(slotKeys.some((k) => k.includes('ctaLabel'))).toBe(false);
  });
});

describe('writeBriefDraftOntoDesign', () => {
  function heroBlock(design: Design): Extract<Block, { type: 'hero' }> {
    const block = design.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.type === 'hero');
    return block as Extract<Block, { type: 'hero' }>;
  }

  it('writes AI text onto the design, and sets the chosen subject + preheader', async () => {
    respondBySchema();
    const result = await generateBriefDraft(baseOpts());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    writeBriefDraftOntoDesign(result.draft, baseOpts().fields, 'My chosen subject');
    const hero = heroBlock(result.draft.design);
    expect(hero.values.heading).toBe('Filled text');
    expect(result.draft.design.body.title).toBe('My chosen subject');
    expect(result.draft.design.body.preheader).toBe(result.draft.data.preheader);
  });

  it('applies the user CTA label onto the slot the AI schema excluded, without touching AI-filled text', async () => {
    respondBySchema();
    const fields = { ...defaultBriefFields(), topic: 'x', presetId: 'promotional', ctaLabel: 'Shop now' };
    const result = await generateBriefDraft(baseOpts({ fields }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    writeBriefDraftOntoDesign(result.draft, fields, 'Subject');
    const hero = heroBlock(result.draft.design);
    expect(hero.values.ctaLabel).toBe('Shop now');
    // the AI-filled heading is untouched by the CTA write-back
    expect(hero.values.heading).toBe('Filled text');
  });

  it('applies an https CTA URL onto the matching href field, and ignores a non-https one', async () => {
    respondBySchema();
    const fields = { ...defaultBriefFields(), topic: 'x', presetId: 'promotional', ctaUrl: 'https://example.com/sale' };
    const result = await generateBriefDraft(baseOpts({ fields }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const before = heroBlock(result.draft.design).values.ctaHref;
    writeBriefDraftOntoDesign(result.draft, fields, 'Subject');
    expect(heroBlock(result.draft.design).values.ctaHref).toBe('https://example.com/sale');

    const fieldsBadUrl = { ...fields, ctaUrl: 'javascript:alert(1)' };
    const result2 = await generateBriefDraft(baseOpts({ fields: fieldsBadUrl }));
    if (!result2.ok) return;
    writeBriefDraftOntoDesign(result2.draft, fieldsBadUrl, 'Subject');
    expect(heroBlock(result2.draft.design).values.ctaHref).not.toBe('javascript:alert(1)');
    expect(heroBlock(result2.draft.design).values.ctaHref).toBe(before);
  });

  it('writes repeater items onto the design in order', async () => {
    respondBySchema();
    const fields = { ...defaultBriefFields(), topic: 'x', presetId: 'newsletter', articleCount: 2 };
    const result = await generateBriefDraft(baseOpts({ fields }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    writeBriefDraftOntoDesign(result.draft, fields, 'Subject');
    const articlesBlock = result.draft.design.rows
      .flatMap((r) => r.columns.flatMap((c) => c.blocks))
      .find((b) => b.type === 'articles') as Extract<Block, { type: 'articles' }>;
    expect(articlesBlock.values.items).toHaveLength(2);
    for (const item of articlesBlock.values.items as ArticleItem[]) {
      expect(item.title).toBe('Filled text');
    }
  });

  it('never mutates the PRESETS catalog itself — a second build is unaffected', async () => {
    respondBySchema();
    const fields = { ...defaultBriefFields(), topic: 'x', presetId: 'promotional', ctaLabel: 'Shop now' };
    const result = await generateBriefDraft(baseOpts({ fields }));
    if (!result.ok) return;
    writeBriefDraftOntoDesign(result.draft, fields, 'Subject');

    const fresh = PRESETS.find((p) => p.id === 'promotional')!.build(vee);
    const freshHero = heroBlock(fresh);
    expect(freshHero.values.ctaLabel).toBe('Claim the offer'); // the preset's own default, unchanged
  });
});
