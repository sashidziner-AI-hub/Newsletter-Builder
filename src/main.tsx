import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { useEditor } from './store';
import { loadDraft } from './lib/storage';
import { STARTERS } from './lib/starters';

// Restore the last working draft, or start from the welcome template on first run.
useEditor.getState().loadDesign(loadDraft() ?? STARTERS[0].build());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
