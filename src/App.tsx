import { useCallback, useEffect, useRef, useState } from 'react';
import type { Block, Row } from './types';
import type { LibraryImage } from './lib/image-storage';
import { useEditor } from './store';

import { DndShell } from './components/dnd';
import { LeftPanel } from './components/LeftPanel';
import { Canvas } from './components/Canvas';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import { ExportHtmlModal, PreviewModal, TemplatesModal } from './components/Modals';
import { HistoryModal } from './components/HistoryModal';
import { SaveBlockDialog } from './components/SaveBlockDialog';
import { ImagePickerModal } from './components/ImageLibrary';
import { registerImagePicker } from './components/fields';
import { BrandsModal } from './components/BrandsModal';
import { NewEmailModal } from './components/NewEmailModal';
import { ConfirmProvider, DELETE_BLOCK, DELETE_ROW, useConfirm } from './components/ConfirmDialog';

type ModalName = 'preview' | 'html' | 'templates' | 'brands' | 'new' | 'history' | null;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export default function App() {
  // the provider has to sit above the editor so the shortcuts below can use it
  return (
    <ConfirmProvider>
      <Editor />
    </ConfirmProvider>
  );
}

type SaveBlockTarget = { kind: 'block' | 'row'; payload: Block | Row } | null;

function Editor() {
  const confirm = useConfirm();
  const [modal, setModal] = useState<ModalName>(null);
  const [saveBlock, setSaveBlock] = useState<SaveBlockTarget>(null);
  const [picker, setPicker] = useState<((image: LibraryImage) => void) | null>(null);

  // every image field opens the picker through this one hole, so fields.tsx
  // never has to import the library (which itself uses those fields)
  useEffect(() => {
    registerImagePicker(({ onPick }) => setPicker(() => onPick));
    return () => registerImagePicker(null);
  }, []);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number>(0);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  }, []);

  /**
   * Auto-save. Every design change marks the email dirty and restarts a 2 s
   * debounce; the flush writes the record, creating it on the first edit, so
   * closing the tab can no longer lose work.
   */
  useEffect(() => {
    let timer = 0;
    const unsub = useEditor.subscribe((state, prev) => {
      if (state.design === prev.design) return;
      // `revision` bumps when a whole design is loaded (open, restore, undo).
      // Those are not edits, so they must not mark the email dirty or the app
      // would claim unsaved changes the moment an email is opened.
      if (state.revision !== prev.revision) return;
      const st = useEditor.getState();
      if (!st.dirty || st.saveState.status !== 'saving') {
        useEditor.setState({
          dirty: true,
          saveState: { ...st.saveState, status: 'saving' },
        });
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => useEditor.getState().saveNow(), 2000);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  // a tab closed mid-debounce still keeps the work
  useEffect(() => {
    const flush = () => {
      if (useEditor.getState().dirty) useEditor.getState().saveNow();
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
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
          const id = st.selection.id;
          confirm(DELETE_BLOCK, () => st.deleteBlock(id));
        } else if (st.selection.kind === 'row') {
          e.preventDefault();
          const id = st.selection.id;
          confirm(DELETE_ROW, () => st.deleteRow(id));
        }
      } else if (e.key === 'Escape') {
        st.select({ kind: 'body' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, confirm]);

  return (
    <div className="flex h-full flex-col">
      <TopBar openModal={setModal} notify={notify} />
      <div className="flex min-h-0 flex-1">
        <DndShell>
          <LeftPanel notify={notify} />
          <Canvas />
        </DndShell>
        <RightPanel onSaveAsBlock={(kind, payload) => setSaveBlock({ kind, payload })} />
      </div>

      {modal === 'preview' && <PreviewModal onClose={() => setModal(null)} />}
      {modal === 'html' && <ExportHtmlModal onClose={() => setModal(null)} notify={notify} />}
      {modal === 'templates' && <TemplatesModal onClose={() => setModal(null)} notify={notify} />}
      {modal === 'brands' && <BrandsModal onClose={() => setModal(null)} notify={notify} />}
      {modal === 'new' && <NewEmailModal onClose={() => setModal(null)} notify={notify} />}
      {modal === 'history' && <HistoryModal onClose={() => setModal(null)} notify={notify} />}
      {picker && (
        <ImagePickerModal
          notify={notify}
          onClose={() => setPicker(null)}
          onPick={(image) => {
            picker(image);
            setPicker(null);
          }}
        />
      )}
      {saveBlock && (
        <SaveBlockDialog
          kind={saveBlock.kind}
          payload={saveBlock.payload}
          onClose={() => setSaveBlock(null)}
          notify={notify}
        />
      )}

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
