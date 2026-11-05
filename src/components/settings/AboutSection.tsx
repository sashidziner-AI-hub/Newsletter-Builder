import pkg from '../../../package.json';

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl/Cmd + Z', action: 'Undo' },
  { keys: 'Ctrl/Cmd + Shift + Z (or Ctrl/Cmd + Y)', action: 'Redo' },
  { keys: 'Ctrl/Cmd + D', action: 'Duplicate the selected block or row' },
  { keys: 'Delete / Backspace', action: 'Delete the selected block or row' },
  { keys: 'Escape', action: 'Deselect' },
];

export function AboutSection() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-medium text-slate-600">Newsletter Builder</p>
        <p className="text-sm text-slate-900">v{pkg.version}</p>
      </div>

      <a
        href="https://github.com/sashidziner-AI-hub/Newsletter-Builder"
        target="_blank"
        rel="noreferrer"
        className="inline-block text-xs font-medium text-brand-700 hover:underline"
      >
        Project docs / README →
      </a>

      <div className="border-t border-slate-200 pt-3">
        <p className="mb-1.5 text-[11px] font-medium text-slate-600">Keyboard shortcuts</p>
        <ul className="space-y-1">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-baseline justify-between gap-3 text-[11px] text-slate-600">
              <span className="shrink-0 font-mono text-[10px] text-slate-500">{s.keys}</span>
              <span className="text-right">{s.action}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
