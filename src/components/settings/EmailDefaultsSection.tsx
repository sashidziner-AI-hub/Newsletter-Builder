import { useState } from 'react';
import { SelectField, TextField, ToggleField } from '../fields';
import { loadEmailDefaults, saveEmailDefaults, type EmailDefaults } from '../../lib/email-defaults';

export function EmailDefaultsSection() {
  const [defaults, setDefaults] = useState<EmailDefaults>(() => loadEmailDefaults());

  const update = (patch: Partial<EmailDefaults>) => {
    const next = { ...defaults, ...patch };
    setDefaults(next);
    saveEmailDefaults(next);
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-snug text-slate-400">
        Apply only to a brand-new email, at the moment it is created. Changing these never edits
        an email you already have open or saved.
      </p>

      <div>
        <SelectField
          label="Merge tag format"
          value={defaults.mergeFormat}
          onChange={(mergeFormat) => update({ mergeFormat })}
          options={[
            { value: 'curly' as const, label: 'Double curly — {{tag}}' },
            { value: 'mailchimp' as const, label: 'Mailchimp — *|TAG|*' },
            { value: 'hubspot' as const, label: 'HubSpot — {{ contact.tag }}' },
            { value: 'custom' as const, label: 'Custom prefix / suffix' },
          ]}
        />
        {defaults.mergeFormat === 'custom' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <TextField
              label="Prefix"
              value={defaults.mergeCustom.prefix}
              onChange={(prefix) => update({ mergeCustom: { ...defaults.mergeCustom, prefix } })}
            />
            <TextField
              label="Suffix"
              value={defaults.mergeCustom.suffix}
              onChange={(suffix) => update({ mergeCustom: { ...defaults.mergeCustom, suffix } })}
            />
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <p className="text-[11px] font-medium text-slate-600">UTM defaults</p>
        <TextField
          label="utm_source"
          value={defaults.utmSource}
          placeholder="e.g. newsletter"
          onChange={(utmSource) => update({ utmSource })}
        />
        <TextField
          label="utm_medium"
          value={defaults.utmMedium}
          placeholder="e.g. email"
          onChange={(utmMedium) => update({ utmMedium })}
        />
        <p className="text-[10px] leading-snug text-slate-400">
          Pre-fills these two fields when a new email turns link tracking on — it does not turn
          tracking on by itself.
        </p>
      </div>

      <div className="border-t border-slate-200 pt-3">
        <ToggleField
          label="Dark mode support for new emails"
          value={defaults.darkMode}
          onChange={(darkMode) => update({ darkMode })}
        />
      </div>
    </div>
  );
}
