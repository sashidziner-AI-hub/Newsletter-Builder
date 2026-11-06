import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import {
  DEFAULT_DISPLAY_NAME,
  avatarColor,
  getCurrentUser,
  initialsOf,
  shouldShowNameHint,
} from '../lib/user';

export function ProfileBar({
  /**
   * Bumped by the parent whenever the Profile section saves a new name.
   * `getCurrentUser()` always re-reads localStorage fresh, so the only job
   * this prop has is forcing React to re-render and pick that fresh read up
   * — a `storage` event would not do it, since that event never fires in the
   * same tab/window that made the change.
   */
  revision,
  onOpenSettings,
  onOpenProfile,
}: {
  revision: number;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
}) {
  const name = getCurrentUser().name;
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    setShowHint(shouldShowNameHint());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  void revision; // read only to force this component to re-render when it changes

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
      <button
        type="button"
        onClick={onOpenProfile}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left hover:bg-slate-50"
        title={name}
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: avatarColor(name) }}
        >
          {initialsOf(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-slate-800">{name}</span>
          {showHint && name === DEFAULT_DISPLAY_NAME && (
            <span className="block truncate text-[10px] text-brand-600">Set your name →</span>
          )}
        </span>
      </button>
      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        onClick={onOpenSettings}
        className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <Settings size={16} />
      </button>
    </div>
  );
}
