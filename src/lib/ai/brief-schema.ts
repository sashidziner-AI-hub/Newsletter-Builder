/**
 * Builds the JSON Schema sent to OpenAI's `response_format: { type:
 * 'json_schema', json_schema: { schema, strict: true } }` (6A).
 *
 * Strict mode has one rule that shapes everything here: every object's
 * `required` array must list *all* of its own property names — there is no
 * such thing as an optional key under `strict: true`. A slot that is logically
 * optional (`Slot.required === false`) is therefore still listed in
 * `required`, but typed `["string", "null"]` so the model can answer `null`
 * for "this preset doesn't really need this field." `additionalProperties:
 * false` is set at every level, which is also what makes prompt-injected text
 * unable to smuggle extra fields into the response — the model is
 * token-level constrained to this exact shape, independent of what the
 * injected text asks for.
 */

import type { BriefSlotSchema } from './slots';
import { PREHEADER_MAX_CHARS, SUBJECT_MAX_CHARS, SUBJECT_OPTION_COUNT } from './slots';

type JsonSchema = Record<string, unknown>;

function stringSchema(maxChars: number, nullable: boolean): JsonSchema {
  const str: JsonSchema = { type: 'string', maxLength: maxChars };
  return nullable ? { anyOf: [str, { type: 'null' }] } : str;
}

function strictObject(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export const BRIEF_SCHEMA_NAME = 'email_brief_fill';

/** Build the full request schema from a slot schema. */
export function buildBriefJsonSchema(slots: BriefSlotSchema): JsonSchema {
  const slotProps: Record<string, JsonSchema> = {};
  for (const slot of slots.slots) {
    slotProps[slot.id] = stringSchema(slot.maxChars, !slot.required);
  }

  const repeaterProps: Record<string, JsonSchema> = {};
  for (const repeater of slots.repeaters) {
    const itemProps: Record<string, JsonSchema> = {};
    for (const field of repeater.itemSlots) itemProps[field.field] = stringSchema(field.maxChars, false);
    repeaterProps[repeater.id] = {
      type: 'array',
      items: strictObject(itemProps),
      minItems: repeater.count,
      maxItems: repeater.count,
    };
  }

  const imageProps: Record<string, JsonSchema> = {};
  for (const slot of slots.imageSlots) imageProps[slot.id] = stringSchema(slot.maxChars, true);

  const top: Record<string, JsonSchema> = {
    subjectOptions: {
      type: 'array',
      items: { type: 'string', maxLength: SUBJECT_MAX_CHARS },
      minItems: SUBJECT_OPTION_COUNT,
      maxItems: SUBJECT_OPTION_COUNT,
    },
    preheader: { type: 'string', maxLength: PREHEADER_MAX_CHARS },
    slots: strictObject(slotProps),
  };
  if (slots.repeaters.length > 0) top.repeaters = strictObject(repeaterProps);
  if (slots.imageSlots.length > 0) top.imagePrompts = strictObject(imageProps);

  return strictObject(top);
}
