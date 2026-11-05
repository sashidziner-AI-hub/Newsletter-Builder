import { describe, expect, it } from 'vitest';
import { veeBrand } from '../lib/brand';
import { buildSlotSchema, resizeArticleRepeater } from '../lib/ai/slots';
import { buildBriefJsonSchema } from '../lib/ai/brief-schema';
import { PRESETS } from '../lib/presets';

const vee = veeBrand();

/** AJV-free structural check: every string leaf has an enforced maxLength. */
function assertEveryStringHasMaxLength(schema: Record<string, unknown>, path = 'root'): void {
  const type = schema.type;
  if (type === 'string') {
    expect(typeof schema.maxLength, `${path} is a string with no maxLength`).toBe('number');
    return;
  }
  if (type === 'object') {
    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    const required = (schema.required ?? []) as string[];
    expect(schema.additionalProperties, `${path} must forbid extra properties`).toBe(false);
    // strict mode: every declared property must be required, with no exceptions
    expect(new Set(required)).toEqual(new Set(Object.keys(props)));
    for (const [key, sub] of Object.entries(props)) assertEveryStringHasMaxLength(sub, `${path}.${key}`);
    return;
  }
  if (type === 'array') {
    assertEveryStringHasMaxLength(schema.items as Record<string, unknown>, `${path}[]`);
    return;
  }
  if (Array.isArray(schema.anyOf)) {
    for (const [i, sub] of (schema.anyOf as Record<string, unknown>[]).entries()) {
      if ((sub.type as string) !== 'null') assertEveryStringHasMaxLength(sub, `${path}.anyOf[${i}]`);
    }
  }
}

describe('slot derivation, across all 8 presets', () => {
  for (const preset of PRESETS) {
    it(`${preset.id}: derives at least one slot, and every slot has a maxChars budget`, () => {
      const design = preset.build(vee);
      const schema = buildSlotSchema(preset.id, design, { length: 'medium', ctaLabelProvided: false });

      const totalFields =
        schema.slots.length +
        schema.repeaters.reduce((n, r) => n + r.itemSlots.length, 0) +
        schema.imageSlots.length;
      expect(totalFields, preset.id).toBeGreaterThan(0);

      for (const slot of schema.slots) expect(slot.maxChars, slot.id).toBeGreaterThan(0);
      for (const repeater of schema.repeaters) {
        for (const field of repeater.itemSlots) expect(field.maxChars, field.field).toBeGreaterThan(0);
      }
      for (const slot of schema.imageSlots) expect(slot.maxChars, slot.id).toBeGreaterThan(0);
    });

    it(`${preset.id}: the JSON schema sent to the model has a maxLength on every string`, () => {
      const design = preset.build(vee);
      const schema = buildSlotSchema(preset.id, design, { length: 'medium', ctaLabelProvided: false });
      const json = buildBriefJsonSchema(schema);
      assertEveryStringHasMaxLength(json);
    });
  }

  it('never touches footer, divider, social, menu, video, or html blocks', () => {
    for (const preset of PRESETS) {
      const design = preset.build(vee);
      const schema = buildSlotSchema(preset.id, design, { length: 'medium', ctaLabelProvided: false });
      const touchedTypes = new Set(schema.slots.map((s) => s.block.type));
      for (const forbidden of ['footer', 'divider', 'social', 'menu', 'video', 'html'] as const) {
        expect(touchedTypes.has(forbidden), `${preset.id} must not expose a ${forbidden} slot`).toBe(false);
      }
    }
  });

  it('never exposes a hero-cards repeater for a layout that cannot render cards', () => {
    // createBlock('hero') always populates a default `cards` array, but
    // render.ts only draws it for layout 'cards-2'/'cards-3' — every other
    // layout must not expose it as an AI slot, or the AI would write copy
    // that can never appear in the email.
    for (const preset of PRESETS) {
      const design = preset.build(vee);
      const schema = buildSlotSchema(preset.id, design, { length: 'medium', ctaLabelProvided: false });
      for (const repeater of schema.repeaters) {
        if (repeater.block.type !== 'hero') continue;
        const layout = (repeater.block.values as unknown as Record<string, unknown>).layout;
        expect(layout, preset.id).toMatch(/^cards-[23]$/);
      }
    }
  });

  it('product-launch (the one cards-3 preset) does expose its hero cards', () => {
    const design = PRESETS.find((p) => p.id === 'product-launch')!.build(vee);
    const schema = buildSlotSchema('product-launch', design, { length: 'medium', ctaLabelProvided: false });
    expect(schema.repeaters.some((r) => r.block.type === 'hero')).toBe(true);
  });

  it('never exposes a logo field or hero.bgImage as an image slot', () => {
    for (const preset of PRESETS) {
      const design = preset.build(vee);
      const schema = buildSlotSchema(preset.id, design, { length: 'medium', ctaLabelProvided: false });
      for (const slot of schema.imageSlots) {
        expect(slot.field, preset.id).not.toContain('logoSrc');
        expect(slot.field, preset.id).not.toBe('bgImage');
      }
    }
  });

  it('a required slot reflects a non-empty preset default; an empty default is optional', () => {
    // newsletter's hero eyebrow ships with real copy -> required
    const newsletter = PRESETS.find((p) => p.id === 'newsletter')!.build(vee);
    const nSchema = buildSlotSchema('newsletter', newsletter, { length: 'medium', ctaLabelProvided: false });
    const eyebrow = nSchema.slots.find((s) => s.field === 'eyebrow' && s.block.type === 'hero');
    expect(eyebrow?.required).toBe(true);

    // welcome's hero eyebrow ships empty -> optional
    const welcome = PRESETS.find((p) => p.id === 'welcome')!.build(vee);
    const wSchema = buildSlotSchema('welcome', welcome, { length: 'medium', ctaLabelProvided: false });
    const welcomeEyebrow = wSchema.slots.find((s) => s.field === 'eyebrow' && s.block.type === 'hero');
    expect(welcomeEyebrow?.required).toBe(false);
  });

  it('a user-supplied CTA label removes the cta_label slots from the schema', () => {
    const design = PRESETS.find((p) => p.id === 'newsletter')!.build(vee);
    const without = buildSlotSchema('newsletter', design, { length: 'medium', ctaLabelProvided: false });
    const withCta = buildSlotSchema('newsletter', design, { length: 'medium', ctaLabelProvided: true });
    expect(without.slots.some((s) => s.kind === 'cta_label')).toBe(true);
    expect(withCta.slots.some((s) => s.kind === 'cta_label')).toBe(false);
  });

  it('a short length asks for a smaller budget than medium, same preset', () => {
    const design = PRESETS.find((p) => p.id === 'promotional')!.build(vee);
    const short = buildSlotSchema('promotional', design, { length: 'short', ctaLabelProvided: false });
    const medium = buildSlotSchema('promotional', design, { length: 'medium', ctaLabelProvided: false });
    const find = (schema: typeof short, field: string) => schema.slots.find((s) => s.field === field)!;
    expect(find(short, 'subtext').maxChars).toBeLessThan(find(medium, 'subtext').maxChars);
  });
});

describe('resizeArticleRepeater', () => {
  it('shrinks, grows, and leaves non-articles presets untouched', () => {
    const newsletter = PRESETS.find((p) => p.id === 'newsletter')!.build(vee);
    resizeArticleRepeater(newsletter, 1);
    const shrunk = newsletter.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.type === 'articles');
    expect(shrunk?.type === 'articles' && shrunk.values.items).toHaveLength(1);

    resizeArticleRepeater(newsletter, 7);
    const grown = newsletter.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.type === 'articles');
    expect(grown?.type === 'articles' && grown.values.items).toHaveLength(7);
    // every item keeps a distinct, freshly-minted id
    const ids = grown?.type === 'articles' ? grown.values.items.map((i) => i.id) : [];
    expect(new Set(ids).size).toBe(ids.length);

    // clamped to the documented 1..10 range
    resizeArticleRepeater(newsletter, 99);
    const clamped = newsletter.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.type === 'articles');
    expect(clamped?.type === 'articles' && clamped.values.items).toHaveLength(10);

    // cold-outreach has no articles block at all; resizing is a no-op, not a crash
    const coldOutreach = PRESETS.find((p) => p.id === 'cold-outreach')!.build(vee);
    expect(() => resizeArticleRepeater(coldOutreach, 5)).not.toThrow();
  });
});
