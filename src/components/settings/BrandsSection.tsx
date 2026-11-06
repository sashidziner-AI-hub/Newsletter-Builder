import { useState } from 'react';
import { BrandsModal } from '../BrandsModal';
import { useAccessibleBrands, useActiveBrand } from '../../store';
import { loadEmailDefaults, saveEmailDefaults } from '../../lib/email-defaults';

export function BrandsSection({ notify }: { notify: (m: string) => void }) {
  const brands = useAccessibleBrands();
  const active = useActiveBrand();
  const [showManage, setShowManage] = useState(false);
  const [defaultBrandId, setDefaultBrandId] = useState(() => loadEmailDefaults().defaultBrandId);

  const setDefault = (id: string) => {
    const resolved = id || null;
    setDefaultBrandId(resolved);
    saveEmailDefaults({ ...loadEmailDefaults(), defaultBrandId: resolved });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-medium text-slate-600">Currently editing with</p>
        <p className="text-sm text-slate-900">{active.name}</p>
      </div>

      <button
        type="button"
        onClick={() => setShowManage(true)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Manage brands
      </button>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-600" htmlFor="default-brand">
          Default brand for new emails
        </label>
        <select
          id="default-brand"
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          value={defaultBrandId ?? ''}
          onChange={(e) => setDefault(e.target.value)}
        >
          <option value="">No override (use whichever brand you're already on)</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] leading-snug text-slate-400">
          Pre-selects this brand in the New email dialog. Existing emails are never changed.
        </p>
      </div>

      {showManage && <BrandsModal onClose={() => setShowManage(false)} notify={notify} />}
    </div>
  );
}
