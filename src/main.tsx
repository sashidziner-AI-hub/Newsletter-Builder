import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { useEditor } from './store';
import { loadDraft, listBrands } from './lib/storage';
import { resolveBrand } from './lib/brand';
import { FIRST_RUN_PRESET, PRESETS } from './lib/presets';

// Restore the last working draft, or start from a preset on first run so the
// canvas is never empty the first time someone opens the builder.
function firstRun() {
  const brand = resolveBrand(listBrands(), null);
  const preset = PRESETS.find((p) => p.id === FIRST_RUN_PRESET) ?? PRESETS[0];
  return { ...preset.build(brand), brandId: brand.id };
}

useEditor.getState().loadDesign(loadDraft() ?? firstRun());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
