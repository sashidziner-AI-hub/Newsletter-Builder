/**
 * The same "a nested component needs to open a top-level panel" hole 5A's
 * `registerAiPanel` (in `fields.tsx`) already solved, applied to the
 * Settings hub (6B): `LeftPanel.tsx` registers itself once on mount, and
 * anything anywhere — a modal, a side panel — can ask for a specific section
 * to open without either side needing a prop path or a zustand slice.
 */

import type { SectionId } from './SettingsHub';

type SettingsOpener = (section: SectionId) => void;

let openImpl: SettingsOpener | null = null;

export function registerSettingsOpener(fn: SettingsOpener | null): void {
  openImpl = fn;
}

export function openSettingsSection(section: SectionId): void {
  openImpl?.(section);
}

export const openAiSettings = () => openSettingsSection('ai');
