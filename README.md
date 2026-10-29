# Newsletter Builder

A drag-and-drop email template builder (React + Vite + TypeScript + Tailwind). Everything runs in the
browser; templates are stored in `localStorage`.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + component tests (vitest)
npm run build      # type-check + production build into dist/
```

## What it does

| Area | Included |
|---|---|
| Layout | Rows with 1-4 columns and ratio layouts (1:2, 2:1, 1:2:1), row background + content background, padding, stack-on-mobile toggle |
| Blocks | Heading (H1-H6), Text (rich text), Image (URL or upload), Button, Divider, Menu, Social, Video thumbnail, custom HTML |
| Editing | Drag & drop from the left panel, drag to reorder blocks (across columns) and rows, duplicate, delete, undo/redo (Ctrl+Z / Ctrl+Shift+Z), Delete key, Ctrl+D |
| Styling | Per-block colors, fonts (email-safe stacks), sizes, alignment, padding, border radius; global body width / colors / font / link color |
| Preview | Desktop / mobile canvas toggle, full preview modal (sandboxed iframe, real responsive media query) |
| Output | Email-safe HTML (table layout, inline styles, Outlook conditional tables, mobile CSS, preheader), copy / download `.html`, size warning for Gmail's ~102 KB clipping |
| Data | Design is a plain JSON document (`src/types.ts`): export / import JSON, autosaved draft, named templates, 3 starter templates |

`{{merge_tags}}` typed into text, headings, buttons or links are passed through untouched to the exported HTML.

## Project layout

```
src/
  types.ts              design schema (Design > Row > Column > Block)
  store.ts              zustand + immer store, undo/redo history, all mutations
  lib/render.ts         JSON -> email HTML (the only place HTML is produced)
  lib/design-ops.ts     lookups, row layout changes, JSON validation/normalisation
  lib/defaults.ts       block defaults, layouts, fonts
  lib/starters.ts       starter templates
  lib/storage.ts        localStorage drafts + templates
  components/           canvas (dnd-kit), panels, property editors, TipTap rich text, modals
  test/                 renderer, store, drop-targeting and UI tests
```

The editor canvas renders each block through the same `renderBlock()` used by the export, so what you see
is what is exported.

## Known limitations

- **Images** uploaded from the device are embedded as base64 data URLs. Gmail and several other clients do
  not display those, and they inflate the HTML. Use hosted image URLs (your own storage/CDN) for real sends.
- **Social icons** are colored text badges (work everywhere). Paste a hosted PNG URL per network to use real logos.
- **Video** blocks are a thumbnail linking to the video (email clients cannot play video). YouTube thumbnails are
  automatic; other platforms need a thumbnail URL.
- Buttons use the padding + `mso-padding-alt` technique, not VML, so Outlook desktop shows a slightly squarer button.
- No sending: export the HTML and send it through your ESP (SES, SendGrid, ...).
- Always test final HTML in the clients you care about (Litmus / Email on Acid / real inboxes).

## Ideas for next versions

Merge-tag picker with groups, display conditions, countdown timer block, content/accessibility audit,
template gallery thumbnails, Supabase persistence (auth + `templates` table with the design JSON in a `jsonb`
column), test-email sending, AI "generate section" using the design JSON schema.
