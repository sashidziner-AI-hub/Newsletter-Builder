import { useState } from 'react';
import { DISPLAY_NAME_MAX, avatarColor, getCurrentUser, initialsOf, setDisplayName } from '../../lib/user';

export function ProfileSection({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState(() => getCurrentUser().name);
  const [lastSaved, setLastSaved] = useState(() => getCurrentUser().name);

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= DISPLAY_NAME_MAX;

  const save = () => {
    if (!valid) return;
    setDisplayName(name);
    setLastSaved(trimmed);
    onSaved();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ background: avatarColor(trimmed || 'Guest') }}
        >
          {initialsOf(trimmed || 'Guest')}
        </span>
        <p className="text-[11px] leading-snug text-slate-400">
          Shown on every email you create here, as "created by" / "updated by". There is no
          login — this is just a local label for this browser.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-600" htmlFor="profile-name">
          Display name
        </label>
        <input
          id="profile-name"
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          value={name}
          maxLength={DISPLAY_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
          <span>{!valid && trimmed.length === 0 ? 'A display name is required.' : ' '}</span>
          <span>
            {name.length}/{DISPLAY_NAME_MAX}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!valid}
          onClick={save}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Save
        </button>
        {trimmed === lastSaved && trimmed !== '' && <span className="text-[11px] text-emerald-700">Saved.</span>}
      </div>
    </div>
  );
}
