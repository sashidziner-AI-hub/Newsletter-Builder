/**
 * Per-provider consent for sending a brief and the brand's voice to a text
 * provider (6A). Separate from image generation's consent (if any) — this is
 * specifically "your brief and brand voice are sent to `<provider>`," asked
 * once per provider, not once per feature.
 */

import { writeSafe } from '../storage';

const STORAGE_KEY = 'email-builder:ai-text-consent:v1';

function readGranted(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function hasTextConsent(providerId: string): boolean {
  return readGranted().has(providerId);
}

export function grantTextConsent(providerId: string): void {
  const next = readGranted();
  next.add(providerId);
  writeSafe(STORAGE_KEY, [...next]);
}

/** For tests: the storage key, so a sweep can prove nothing else holds one. */
export const AI_TEXT_CONSENT_STORAGE_KEY = STORAGE_KEY;
