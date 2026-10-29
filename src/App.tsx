import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from './store';
import { saveDraft } from './lib/storage';
import { DndShell } from './components/dnd';
import { LeftPanel } from './components/LeftPanel';
import { Canvas } from './components/Canvas';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import { ExportHtmlModal, PreviewModal, TemplatesModal } from './components/Modals';

type ModalName = 'preview' | 'html' | 'templates' | null;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export default function App() {
  const [modal, setModal] = useState<ModalName>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number>(0);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  }, []);

  // autosave the working draft to localStorage
  useEffect(() => {
    let timer = 0;
    const unsub = useEditor.subscribe((state, prev) => {
      if (state.design === prev.design) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => saveDraft(state.design), 400);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || modal) return;
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        if (st.selection.kind === 'block') {
          e.preventDefault();
          st.duplicateBlock(st.selection.id);
        } else if (st.selection.kind === 'row') {
          e.preventDefault();
          st.duplicateRow(st.selection.id);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.selection.kind === 'block') {
          e.preventDefault();
          st.deleteBlock(st.selection.id);
        } else if (st.selection.kind === 'row') {
          e.preventDefault();
          st.deleteRow(st.selection.id);
        }
      } else if (e.key === 'Escape') {
        st.select({ kind: 'body' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  return (
    <div className="flex h-full flex-col">
      <TopBar openModal={setModal} notify={notify} />
      <div className="flex min-h-0 flex-1">
        <DndShell>
          <LeftPanel />
          <Canvas />
        </DndShell>
        <RightPanel />
      </div>

      {modal === 'preview' && <PreviewModal onClose={() => setModal(null)} />}
      {modal === 'html' && <ExportHtmlModal onClose={() => setModal(null)} notify={notify} />}
      {modal === 'templates' && <TemplatesModal onClose={() => setModal(null)} notify={notify} />}

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
