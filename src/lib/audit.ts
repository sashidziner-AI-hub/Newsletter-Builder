/**
 * Placeholder-art detection.
 *
 * The image rules themselves live in `src/lib/checks.ts` now — this file keeps
 * only the host list, which both that engine and the image library consult.
 */

/**
 * Hosts used for placeholder art by presets and new blocks. An email going out
 * with one of these still in it has not been finished.
 */
export const PLACEHOLDER_PATTERN = /(^|\/\/|\.)((picsum\.photos)|(placehold(er)?\.(co|it|com))|(dummyimage\.com)|(via\.placeholder\.com))\//i;

export function isPlaceholderImage(src: string): boolean {
  return PLACEHOLDER_PATTERN.test((src || '').trim());
}
