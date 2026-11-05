/**
 * Style presets (5A).
 *
 * A suffix appended to the prompt at send time, never shown in the composer —
 * the composer stays the user's own words, so Edit prompt and Regenerate round
 * trip exactly what they typed. The result card names which style produced it,
 * because otherwise two visually different results from the same prompt have
 * no explanation.
 *
 * Every suffix ends with the same negative clause: image models read negatives
 * as prose rather than as a separate field, and repeating them per style is
 * more reliable than stating them once at the top.
 */

const NEGATIVES =
  'No text, no logos, no watermark, no cartoon, no flat vector style.';

export interface StylePreset {
  id: string;
  name: string;
  /** appended after the prompt, with a leading space; '' for None */
  suffix: string;
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  { id: 'none', name: 'None', suffix: '' },
  {
    id: 'cinematic',
    name: 'Cinematic elegant',
    suffix:
      'Cinematic, elegant, photorealistic, shallow depth of field, soft volumetric lighting, ' +
      'warm rim light with deep teal shadows, 35mm lens, subtle film grain, refined premium ' +
      `composition with negative space for a headline. ${NEGATIVES}`,
  },
  {
    id: 'corporate',
    name: 'Corporate clean',
    suffix:
      'Clean corporate photography, bright even lighting, neutral professional palette, crisp ' +
      'focus throughout, uncluttered modern workplace, natural candid posture, generous ' +
      `negative space for a headline. ${NEGATIVES}`,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    suffix:
      'Minimal composition, a single clear subject on a plain uncluttered background, soft ' +
      'diffuse light, restrained muted palette, generous empty space, calm and understated. ' +
      NEGATIVES,
  },
];

/** The default: what a new panel starts on. */
export const DEFAULT_STYLE_ID = 'cinematic';

export function styleById(id: string): StylePreset {
  return STYLE_PRESETS.find((s) => s.id === id) ?? STYLE_PRESETS[0];
}

/** The prompt as it goes to the provider. Order matters: style, then brand. */
export function composePrompt(prompt: string, styleId: string, brandSuffix = ''): string {
  const style = styleById(styleId).suffix;
  return [prompt.trim(), style, brandSuffix.trim()].filter(Boolean).join(' ');
}
