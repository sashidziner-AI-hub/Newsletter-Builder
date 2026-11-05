import { useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Database,
  Info,
  Mail,
  Palette,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { ProfileSection } from './ProfileSection';
import { AiSection } from './AiSection';
import { BrandsSection } from './BrandsSection';
import { EmailDefaultsSection } from './EmailDefaultsSection';
import { ChecksSection } from './ChecksSection';
import { DataSection } from './DataSection';
import { AboutSection } from './AboutSection';

export type SectionId = 'profile' | 'ai' | 'brands' | 'email-defaults' | 'checks' | 'data' | 'about';

const SECTIONS: { id: SectionId; label: string; description: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', description: 'Your display name', icon: User },
  { id: 'ai', label: 'AI', description: 'Providers, keys, model', icon: Sparkles },
  { id: 'brands', label: 'Brands', description: 'Manage brands, default brand', icon: Palette },
  { id: 'email-defaults', label: 'Email defaults', description: 'Merge tags, UTM, dark mode', icon: Mail },
  { id: 'checks', label: 'Checks', description: 'Reset dismissed warnings', icon: ShieldCheck },
  { id: 'data', label: 'Data & storage', description: 'Backup, restore, clear data', icon: Database },
  { id: 'about', label: 'About', description: 'Version, shortcuts', icon: Info },
];

export function SettingsHub({
  section,
  onSelectSection,
  onBackToList,
  onClose,
  onProfileSaved,
  notify,
}: {
  /** null = the section list; a SectionId = that section's own screen */
  section: SectionId | null;
  onSelectSection: (id: SectionId) => void;
  /** from inside a section, back to the list (not out of the hub) */
  onBackToList: () => void;
  /** from the list, closes the whole hub */
  onClose: () => void;
  onProfileSaved: () => void;
  notify: (m: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.focus();
  }, [section]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (section) onBackToList();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [section, onBackToList, onClose]);

  if (section) {
    const meta = SECTIONS.find((s) => s.id === section)!;
    return (
      <div ref={rootRef} tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2.5">
          <button
            type="button"
            onClick={onBackToList}
            aria-label="Back to Settings"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <ArrowLeft size={16} />
          </button>
          <h3 className="text-sm font-semibold text-slate-900">{meta.label}</h3>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
          {section === 'profile' && <ProfileSection onSaved={onProfileSaved} />}
          {section === 'ai' && <AiSection />}
          {section === 'brands' && <BrandsSection notify={notify} />}
          {section === 'email-defaults' && <EmailDefaultsSection />}
          {section === 'checks' && <ChecksSection />}
          {section === 'data' && <DataSection notify={notify} />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Settings"
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
        </button>
        <h3 className="text-sm font-semibold text-slate-900">Settings</h3>
      </div>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelectSection(s.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left hover:bg-slate-50"
            >
              <s.icon size={16} className="shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-slate-800">{s.label}</span>
                <span className="block truncate text-[11px] text-slate-400">{s.description}</span>
              </span>
              <ChevronRight size={14} className="shrink-0 text-slate-300" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
