import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** Shows the dialog, then runs `onConfirm` only if the user accepts. */
export type Ask = (options: ConfirmOptions, onConfirm: () => void) => void;

const ConfirmContext = createContext<Ask>(() => {});

export function useConfirm(): Ask {
  return useContext(ConfirmContext);
}

/* Shared wording for the destructive actions, so it stays consistent across
   the canvas toolbars, the right panel and the Delete-key shortcut. */
export const DELETE_BLOCK: ConfirmOptions = {
  title: 'Delete this block?',
  message: 'The block will be removed from the email. You can undo this with Ctrl+Z.',
  confirmLabel: 'Delete',
  danger: true,
};

export const DELETE_ROW: ConfirmOptions = {
  title: 'Delete this row?',
  message: 'The row and every block inside it will be removed. You can undo this with Ctrl+Z.',
  confirmLabel: 'Delete',
  danger: true,
};

type Pending = ConfirmOptions & { onConfirm: () => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  const ask = useCallback<Ask>((options, onConfirm) => {
    setPending({ ...options, onConfirm });
  }, []);

  useEffect(() => {
    if (pending) confirmBtn.current?.focus();
  }, [pending]);

  const cancel = () => setPending(null);

  const accept = () => {
    const run = pending?.onConfirm;
    setPending(null);
    run?.();
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}

      {pending && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cancel();
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.title}
            aria-describedby="confirm-message"
            className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
            // keep Escape/Delete/Ctrl+Z from reaching the editor's global shortcuts
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') cancel();
              if (e.key === 'Enter') accept();
            }}
          >
            <div className="flex gap-3 px-5 pb-4 pt-5">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  pending.danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                }`}
              >
                <AlertTriangle size={18} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900">{pending.title}</h2>
                <p id="confirm-message" className="mt-1 text-sm text-slate-600">
                  {pending.message}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={cancel}
                className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {pending.cancelLabel ?? 'Cancel'}
              </button>
              <button
                ref={confirmBtn}
                type="button"
                onClick={accept}
                className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white ${
                  pending.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
                }`}
              >
                {pending.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
