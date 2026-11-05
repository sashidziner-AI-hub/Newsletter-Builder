import { useEffect, useState } from 'react';
import { draftDataUrl } from '../lib/drafts';

/**
 * AI draft images as `data:` URIs, for the canvas and the preview.
 *
 * One loader shared by both surfaces. `null` for an id means this browser does
 * not hold that draft — a normal state for an imported design or a saved block
 * from another machine — and is what the "Draft image missing" badge and the
 * `AI_IMAGE_MISSING_DRAFT` check already key off, so it must stay
 * distinguishable from "not loaded yet" (absent from the record).
 */
export function useDraftImages(ids: string[]): Record<string, string | null> {
  // a stable dependency: the hook is called with a fresh array every render
  const key = ids.join(',');
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!key) {
      setUrls({});
      return;
    }
    let live = true;
    void (async () => {
      const next: Record<string, string | null> = {};
      for (const id of key.split(',')) next[id] = await draftDataUrl(id);
      if (live) setUrls(next);
    })();
    return () => {
      live = false;
    };
  }, [key]);

  return urls;
}

/** Every `aiDraftId` under a block, including the ones on cards and items. */
export function draftIdsOf(block: { type: string; values: unknown }): string[] {
  const values = block.values as Record<string, unknown>;
  const out: string[] = [];
  const take = (holder: Record<string, unknown>) => {
    if (typeof holder.aiDraftId === 'string' && holder.aiDraftId.trim()) out.push(holder.aiDraftId);
  };
  take(values);
  for (const key of ['items', 'cards']) {
    const arr = values[key];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item === 'object') take(item as Record<string, unknown>);
      }
    }
  }
  return out;
}

/** Every `aiDraftId` in a whole design, for the preview. */
export function draftIdsInDesign(design: {
  rows: { columns: { blocks: { type: string; values: unknown }[] }[] }[];
}): string[] {
  const out: string[] = [];
  for (const row of design.rows) {
    for (const col of row.columns) {
      for (const block of col.blocks) out.push(...draftIdsOf(block));
    }
  }
  return [...new Set(out)];
}
