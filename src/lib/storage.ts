import type { Design } from '../types';
import { normalizeDesign } from './design-ops';
import { uid } from './util';

const DRAFT_KEY = 'email-builder:draft:v1';
const TEMPLATES_KEY = 'email-builder:templates:v1';

export interface SavedTemplate {
  id: string;
  name: string;
  updatedAt: number;
  design: Design;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full or unavailable (e.g. private mode)
  }
}

export function loadDraft(): Design | null {
  return normalizeDesign(read<unknown>(DRAFT_KEY));
}

export function saveDraft(design: Design): boolean {
  return write(DRAFT_KEY, design);
}

export function listTemplates(): SavedTemplate[] {
  const raw = read<SavedTemplate[]>(TEMPLATES_KEY);
  if (!Array.isArray(raw)) return [];
  const out: SavedTemplate[] = [];
  for (const t of raw) {
    const design = normalizeDesign(t?.design);
    if (design && typeof t.id === 'string') {
      out.push({
        id: t.id,
        name: typeof t.name === 'string' ? t.name : 'Untitled',
        updatedAt: Number(t.updatedAt) || 0,
        design,
      });
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveTemplate(name: string, design: Design, existingId?: string): SavedTemplate | null {
  const list = listTemplates();
  const entry: SavedTemplate = {
    id: existingId ?? uid('tpl'),
    name: name.trim() || 'Untitled',
    updatedAt: Date.now(),
    design,
  };
  const next = [entry, ...list.filter((t) => t.id !== entry.id)];
  return write(TEMPLATES_KEY, next) ? entry : null;
}

export function deleteTemplate(id: string): void {
  write(
    TEMPLATES_KEY,
    listTemplates().filter((t) => t.id !== id),
  );
}
