import { useState } from 'react';
import { useConfirm } from '../ConfirmDialog';
import { useEditor } from '../../store';
import { clearAllIgnored } from '../../lib/storage';

export function ChecksSection() {
  const ignoredIssues = useEditor((s) => s.ignoredIssues);
  const unignoreIssue = useEditor((s) => s.unignoreIssue);
  const runChecks = useEditor((s) => s.runChecks);
  const confirm = useConfirm();
  const [clearedAll, setClearedAll] = useState(false);

  const resetThisEmail = () => {
    if (ignoredIssues.length === 0) return;
    confirm(
      {
        title: 'Reset dismissed warnings for this email?',
        message: `${ignoredIssues.length} dismissed ${ignoredIssues.length === 1 ? 'warning' : 'warnings'} will show again in Checks.`,
        confirmLabel: 'Reset',
      },
      () => {
        for (const id of ignoredIssues) unignoreIssue(id);
      },
    );
  };

  const resetAll = () => {
    confirm(
      {
        title: 'Reset dismissed warnings for every email?',
        message: 'Every warning you have ever dismissed, on any saved email, will show again.',
        confirmLabel: 'Reset all',
      },
      () => {
        clearAllIgnored();
        runChecks();
        setClearedAll(true);
      },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] leading-snug text-slate-400">
          Dismissing a warning in the Checks drawer hides it until something changes. Reset to see
          everything again.
        </p>
        <button
          type="button"
          disabled={ignoredIssues.length === 0}
          onClick={resetThisEmail}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Reset for this email ({ignoredIssues.length})
        </button>
      </div>

      <div className="border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={resetAll}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Reset for every email
        </button>
        {clearedAll && <p className="mt-1.5 text-[11px] text-emerald-700">Done.</p>}
      </div>
    </div>
  );
}
