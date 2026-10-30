import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import { type Issue, type Severity, groupBySeverity } from '../lib/checks';
import { collectImages } from '../lib/image-audit';
import { probeImage } from '../lib/image-storage';
import { resolvedDesign } from '../lib/output';
import { useActiveBrand, useEditor, useIgnoredIssues, useVisibleIssues } from '../store';

const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Errors',
  warning: 'Warnings',
  info: 'Suggestions',
};

const SEVERITY_STYLE: Record<Severity, { text: string; chip: string; icon: typeof AlertCircle }> = {
  error: { text: 'text-red-700', chip: 'bg-red-100 text-red-800', icon: AlertCircle },
  warning: { text: 'text-amber-800', chip: 'bg-amber-100 text-amber-900', icon: AlertTriangle },
  info: { text: 'text-slate-600', chip: 'bg-slate-100 text-slate-700', icon: Info },
};

/** Where an issue sends you. Email-level ones open the email settings. */
function destinationLabel(issue: Issue): string | null {
  if (issue.blockId) return 'Go to block';
  if (issue.field) return 'Email settings';
  return null;
}

function IssueCard({
  issue,
  ignored,
  onGo,
  onIgnore,
  onUnignore,
}: {
  issue: Issue;
  ignored: boolean;
  onGo: (issue: Issue) => void;
  onIgnore: (id: string) => void;
  onUnignore: (id: string) => void;
}) {
  const destination = destinationLabel(issue);
  return (
    <li className="rounded-md border border-slate-200 bg-white p-2.5">
      <p className="text-xs font-medium leading-snug text-slate-800">{issue.message}</p>
      {issue.hint && <p className="mt-1 text-[11px] leading-snug text-slate-500">{issue.hint}</p>}
      <div className="mt-2 flex items-center gap-2">
        {destination && (
          <button
            type="button"
            onClick={() => onGo(issue)}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 hover:border-brand-500 hover:text-brand-700"
          >
            {destination} &rarr;
          </button>
        )}
        {ignored ? (
          <button
            type="button"
            onClick={() => onUnignore(issue.id)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <Eye size={12} /> Un-ignore
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onIgnore(issue.id)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <EyeOff size={12} /> Ignore
          </button>
        )}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-slate-300">
          {issue.code}
        </span>
      </div>
    </li>
  );
}

/**
 * The Checks drawer. It overlays the properties panel rather than displacing
 * it, so a block jumped to from here has its settings waiting underneath once
 * the drawer closes.
 */
export function ChecksPanel() {
  const open = useEditor((s) => s.checksOpen);
  const setChecksOpen = useEditor((s) => s.setChecksOpen);
  const select = useEditor((s) => s.select);
  const ignoreIssue = useEditor((s) => s.ignoreIssue);
  const unignoreIssue = useEditor((s) => s.unignoreIssue);
  const setImageStatus = useEditor((s) => s.setImageStatus);
  const design = useEditor((s) => s.design);
  const brand = useActiveBrand();

  const visible = useVisibleIssues();
  const ignored = useIgnoredIssues();
  const groups = useMemo(() => groupBySeverity(visible), [visible]);
  const [showIgnored, setShowIgnored] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChecksOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setChecksOpen]);

  if (!open) return null;

  /** Jump to the block, leaving the drawer open so the list keeps its place. */
  const go = (issue: Issue) => {
    if (issue.blockId) select({ kind: 'block', id: issue.blockId });
    else select({ kind: 'body' });
  };

  /**
   * Probing is on demand: hitting every CDN URL on every keystroke would be
   * rude, and an image nobody has checked is never reported broken.
   */
  const checkImages = async () => {
    setChecking(true);
    const urls = new Set(
      collectImages(resolvedDesign(design, brand, 'export'))
        .map((use) => use.url)
        .filter((url) => /^https:\/\//i.test(url)),
    );
    const next: Record<string, 'ok' | 'broken'> = {};
    for (const url of urls) {
      const probe = await probeImage(url);
      next[url] = probe.ok ? 'ok' : 'broken';
    }
    setImageStatus(next);
    setChecking(false);
  };

  return (
    <aside
      role="complementary"
      aria-label="Checks"
      className="fixed bottom-0 right-0 top-14 z-40 flex w-[22rem] flex-col border-l border-slate-200 bg-slate-50 shadow-xl"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="flex-1 text-sm font-semibold text-slate-900">Checks</h2>
        <button
          type="button"
          aria-label="Close checks"
          onClick={() => setChecksOpen(false)}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
        >
          <X size={17} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {visible.length === 0 ? (
          <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800">
            <CheckCircle2 size={15} className="shrink-0" />
            Nothing to fix &mdash; this email passes every check.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(([severity, list]) => {
              const style = SEVERITY_STYLE[severity];
              const Icon = style.icon;
              return (
                <section key={severity}>
                  <h3 className={`flex items-center gap-1.5 text-xs font-semibold ${style.text}`}>
                    <Icon size={14} className="shrink-0" />
                    {SEVERITY_LABEL[severity]}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${style.chip}`}>
                      {list.length}
                    </span>
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {list.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        ignored={false}
                        onGo={go}
                        onIgnore={ignoreIssue}
                        onUnignore={unignoreIssue}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {ignored.length > 0 && (
          <section className="mt-4 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setShowIgnored((v) => !v)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Ignored ({ignored.length})
            </button>
            {showIgnored && (
              <ul className="mt-2 space-y-2 opacity-70">
                {ignored.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    ignored
                    onGo={go}
                    onIgnore={ignoreIssue}
                    onUnignore={unignoreIssue}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          disabled={checking}
          onClick={() => void checkImages()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {checking && <Loader2 size={13} className="animate-spin" />}
          {checking ? 'Checking images…' : 'Check images load'}
        </button>
        <p className="mt-2 text-[11px] leading-snug text-slate-400">
          Checks never block editing or export &mdash; they only tell you what an inbox will do
          with this email.
        </p>
      </div>
    </aside>
  );
}
