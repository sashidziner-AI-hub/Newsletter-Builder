/**
 * "Clear all local data" (7A's Data & storage danger zone) — the one place in
 * the app allowed to touch the AI key store and IndexedDB drafts for the
 * purpose of deleting them. Kept out of `backup.ts` on purpose: that file's
 * own guarantee is that it never imports either, so a reviewer can trust its
 * export path cannot leak a key without reading past its import list.
 */

import { clearAllKeys } from './ai/key-store';
import { draftStore } from './drafts';

const EMAIL_BUILDER_PREFIX = 'email-builder:';

export async function clearAllLocalData(): Promise<void> {
  clearAllKeys();

  try {
    const ids = await draftStore.keys();
    await Promise.all(ids.map((id) => draftStore.remove(id)));
  } catch {
    // best effort — the localStorage sweep below still runs either way
  }

  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(EMAIL_BUILDER_PREFIX)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  } catch {
    // nothing more we can do from here
  }
}
