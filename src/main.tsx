import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { useEditor } from './store';
import { findTemplate, listBrands, loadLastEmailId, migrateDraft } from './lib/storage';
import { resolveBrand } from './lib/brand';
import { FIRST_RUN_PRESET, PRESETS } from './lib/presets';

/** A preset, so the canvas is never empty the first time someone opens this. */
function firstRun() {
  const brand = resolveBrand(listBrands(), null);
  const preset = PRESETS.find((p) => p.id === FIRST_RUN_PRESET) ?? PRESETS[0];
  return { ...preset.build(brand), brandId: brand.id };
}

/**
 * Reopen the last edited email. Before 2B the open email lived in a single
 * unnamed draft slot, so that is migrated into a real record first — otherwise
 * a user's in-progress work would look lost after the upgrade.
 */
function boot() {
  const st = useEditor.getState();
  const migrated = migrateDraft();
  if (migrated) return st.openEmail(migrated);

  const last = findTemplate(loadLastEmailId());
  if (last) return st.openEmail(last);

  st.startNewEmail(firstRun());
}

boot();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
