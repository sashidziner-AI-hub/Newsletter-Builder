/**
 * WCAG 2.1 contrast maths.
 *
 * Kept separate and pure so the numbers can be checked against the published
 * worked examples: #000 on #fff is 21:1, #767676 on white is 4.54 (passes AA
 * for normal text), #777777 is 4.48 (fails).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** #abc and #aabbcc, with or without the hash. Anything else is null. */
export function hexToRgb(hex: string): Rgb | null {
  const value = (hex || '').trim().replace(/^#/, '');
  const full =
    value.length === 3
      ? value[0] + value[0] + value[1] + value[1] + value[2] + value[2]
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** One sRGB channel, 0-255, linearised per the WCAG definition. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * Contrast ratio between two colours, 1 to 21.
 * Returns null when either colour cannot be read, so callers can stay quiet
 * rather than inventing a number.
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  if (!fg || !bg) return null;
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG "large text": 24px, or 18.66px when bold. */
export function isLargeText(fontSize: number, bold: boolean): boolean {
  return fontSize >= 24 || (bold && fontSize >= 18.66);
}

/** AA wants 3:1 for large text and 4.5:1 for everything else. */
export function requiredRatio(fontSize: number, bold: boolean): number {
  return isLargeText(fontSize, bold) ? 3 : 4.5;
}

export function meetsAA(ratio: number, fontSize: number, bold: boolean): boolean {
  // round to two places first, so 4.4999 from floating point does not fail 4.5
  return round2(ratio) >= requiredRatio(fontSize, bold);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Darken or lighten the foreground until it passes, so the message can suggest
 * something concrete rather than "pick a better colour".
 */
export function suggestFix(foreground: string, background: string, fontSize: number, bold: boolean): string | null {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  if (!fg || !bg) return null;

  const target = requiredRatio(fontSize, bold);
  // move away from the background: darker text on light, lighter on dark
  const towardsBlack = relativeLuminance(bg) > 0.5;

  for (let step = 1; step <= 20; step++) {
    const factor = step / 20;
    const candidate: Rgb = towardsBlack
      ? { r: Math.round(fg.r * (1 - factor)), g: Math.round(fg.g * (1 - factor)), b: Math.round(fg.b * (1 - factor)) }
      : {
          r: Math.round(fg.r + (255 - fg.r) * factor),
          g: Math.round(fg.g + (255 - fg.g) * factor),
          b: Math.round(fg.b + (255 - fg.b) * factor),
        };
    const hex = rgbToHex(candidate);
    const ratio = contrastRatio(hex, background);
    if (ratio !== null && round2(ratio) >= target) return hex;
  }
  return towardsBlack ? '#000000' : '#FFFFFF';
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const pair = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${pair(r)}${pair(g)}${pair(b)}`.toUpperCase();
}
