# Newsletter Builder
Newsletter Builder helps teams create polished company newsletters without writing code or depending on a designer. Add sections, drag them into place, and edit content directly on a live canvas preview. When the layout is ready, export it as email-ready HTML and send it through your mail tool.

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
| Composite blocks | Header (logo left / centered, nav), Hero (image left/right, centered, 2 or 3 cards), Article list (thumb left / thumb top / text only, up to 10 items), Footer (brand logo, address, legal, unsubscribe, social) |
| Editing | Drag & drop from the left panel, drag to reorder blocks (across columns) and rows, duplicate, delete, undo/redo (Ctrl+Z / Ctrl+Shift+Z), Delete key, Ctrl+D |
| Styling | Per-block colors, fonts (email-safe stacks), sizes, alignment, padding, border radius; global body width / colors / font / link color |
| Preview | Desktop / mobile canvas toggle, full preview modal (sandboxed iframe, real responsive media query) |
| Output | Email-safe HTML (table layout, inline styles, Outlook conditional tables, mobile CSS, preheader), copy / download `.html`, size warning for Gmail's ~102 KB clipping |
| Sending prep | Merge tags with per-ESP formats (double curly, Mailchimp, HubSpot, custom), UTM link tagger with per-link opt-out, and a plain-text version alongside the HTML |
| Data | Design is a plain JSON document (`src/types.ts`): export / import JSON, named templates |
| Saving | Auto-save every 2 s with visible status, reload recovery, 20-deep version history with read-only preview and restore |
| Saved blocks | Save any block or row to a searchable library with categories and brand-aware thumbnails, drag or click to reuse, export / import as JSON |
| Presets | **New** opens a dialog of Blank + 8 starter presets (Newsletter, Promotional, Product launch, Welcome, Cold outreach, Event invitation, Order confirmation, Weekly digest), each with a live thumbnail rendered in the active brand |
| Brands | Brand kits (colors, fonts, button style, logos, footer, social links), brand switcher in the top bar, brand color swatches on every color field, "Reset to brand", brands page with duplicate / archive / export / import JSON and a live kit preview |

`{{merge_tags}}` typed into text, headings, buttons or links are passed through untouched to the exported HTML.

## Project layout

```
src/
  types.ts              design schema (Design > Row > Column > Block)
  store.ts              zustand + immer store, undo/redo history, all mutations
  lib/render.ts         JSON -> email HTML (the only place HTML is produced)
  lib/design-ops.ts     lookups, row layout changes, JSON validation/normalisation
  lib/defaults.ts       block defaults, layouts, fonts
  lib/presets.ts        starter presets (brand-neutral, token-based)
  lib/output.ts         the export boundary: brand tokens -> UTM -> merge tags
  lib/merge.ts          merge tags, canonical form + per-ESP formats
  lib/utm.ts            UTM tagger and its skip rules
  lib/plaintext.ts      design -> plain-text version
  lib/blocks-library.ts saved blocks: validation, import planning, instantiation
  lib/versions.ts       snapshot rules, pruning (pure, no storage)
  lib/brand.ts          brand kit, token resolution, access helpers
  lib/storage.ts        localStorage drafts + templates + brands
  lib/image.ts          image upload downscaling
  lib/audit.ts          pre-send image checks for the export dialog
  components/           canvas (dnd-kit), panels, property editors, TipTap rich text, modals
  test/                 renderer, store, drop-targeting and UI tests
```

The editor canvas renders each block through the same `renderBlock()` used by the export, so what you see
is what is exported.

## Saving, history and saved blocks

**Auto-save** writes the open email about 2 s after your last change, creating its record on
the first edit, so closing the tab cannot lose work. The top bar always says where you stand —
"Saving…", "Saved 5 min ago", or **"Not saved: storage full"**. Reopening the app restores the
last email you edited.

Emails you have not named appear under **Drafts (auto-saved)** in the Templates dialog; naming
one with **Rename this email** moves it into your templates. **Save as a copy** branches the
email into a separate record and switches you to editing the copy.

**Version history** (History in the top bar) keeps the last 20 versions per email: one every
5 minutes of editing, one whenever you click Save version, and one immediately before a
restore or before a preset replaces the canvas. Identical designs are never snapshotted twice.
Restoring snapshots your current design first, so you can always go straight back.

**Saved blocks** — select a block or row, choose *Save as block*, and it joins a searchable
library in the left panel's **Saved** tab. Payloads keep their `brand.*` tokens, so a saved CTA
band re-themes with whichever brand is active, while anything you set by hand stays put.
Inserting always creates a copy with fresh ids, so editing it never touches the original.
Export / Import JSON shares a library with the team.

**Storage** is localStorage, roughly 5 MB. The Templates dialog shows current usage. If it
fills, the app prunes the oldest version snapshots, retries, and only then tells you — it never
fails silently. Export emails as JSON and delete them to reclaim space.

## Merge tags, tracking and plain text

All three are applied **at the export boundary** (`src/lib/output.ts`), which composes 1A's
`resolveDesign()` rather than adding a second pipeline:

```
design --resolveDesign--> brand tokens gone
       --addUtm---------> links tagged      (export only)
       --formatMergeTags-> ESP tag spelling
       --renderDesign---> HTML      --toPlainText--> .txt
```

**Merge tags** are always stored as `{{tag}}`. Email settings picks how they are *written*:
double curly, Mailchimp (`*|FNAME|*`), HubSpot (`{{ contact.firstname }}`) or a custom
prefix/suffix. Switching the format changes the export only — it never edits your content.
Insert-tag menus are on the Text toolbar, Heading, Button label, subject and preheader.
"Preview with sample data" swaps in sample values on the canvas; the export always keeps the
tags.

**UTM tagging** is off by default and applies at export only. It preserves existing query
strings and `#hash`, never overwrites a `utm_*` already on a link, and skips `mailto:`,
`tel:`, anchors, merge-tag-only URLs and the unsubscribe / view-in-browser links. Any single
link can opt out with "Don't add tracking" — including links inside a Text block, via the
rich-text link dialog. The export dialog reports how many links were tagged and how many were
skipped.

**Plain text** is generated from the same resolved design, so its URLs carry UTM parameters
and its tags use the chosen format. Export has **HTML | Plain text** tabs, each with Copy and
Download. Lines wrap at 72 characters, and a longer URL gets its own line rather than being
broken.

## Presets

**New** opens a dialog with Blank plus eight presets, each showing a live thumbnail of its real
exported HTML themed with the brand you pick in the dialog. Picking one creates a fresh copy —
`build()` mints new ids every call, so editing an email can never reach the preset.

Presets are brand-neutral: every colour and font is a `brand.*` token, so they keep re-theming
after a later brand switch. The brand **name** is the exception — it is interpolated into the copy
once, when the preset is applied, because from then on it is ordinary editable prose.

Presets live in `src/lib/presets.ts` as plain TypeScript constants; there is no backend.
*Cold outreach* is deliberately plain — no header, no hero, no images — so it reads as a personal
email rather than a campaign.

Every preset ships with placeholder art and placeholder copy on purpose. The HTML export dialog
warns **"Placeholder images still in use"** until they are replaced.

## Composite blocks

Header, Hero, Article list and Footer are built from the same block pattern as everything else, and
they **reuse the existing renderers** rather than duplicating their HTML: a composite block builds a
throwaway sub-block and renders it through the real Menu, Social or Button case, so the bulletproof
button and the social badge logic come along unchanged.

Two things worth knowing:

- **A block cannot paint edge-to-edge.** Every row is wrapped in a container at the content width, so
  a block's background stops there. Header and Footer have an *Extend background full width* switch
  that writes their colour to the parent row, which is the only element that spans the window.
- **Hero's centered background image uses `<td background="…">`**, so Outlook on Windows shows the
  background *colour* instead. Pick one that works on its own.

The *Show footer* switch in Email settings (default on) leaves every Footer block out of the preview
and the export. The canvas still shows them dimmed with a "Hidden on send" badge so they stay
selectable.

## Brands

A color or font field stores **either** a brand token (`"brand.primary"`) **or** a literal override
(`"#F58220"`). `resolveDesign(design, brand, mode)` replaces every token with a literal value just before
rendering, so:

- switching brands only changes `design.brandId` — content and manual overrides are untouched;
- `renderDesign()` never sees a token, so no `brand.*` string can reach an export;
- the renderer itself contains no brand logic.

Logo **uploads** are downscaled to 400 px and used for the canvas preview only. Exports use the hosted
`logo_url` / `logo_dark_url` instead, because email clients strip `data:` URIs. The HTML export dialog warns
about any image that is embedded or not served over https.

See `docs/PROGRESS.md` for the full design, the migration rules and the `TODO`s left in the seeded
Vee Technologies brand.

## Known limitations

- **Web fonts** (Kanit and anything else from Google Fonts) are not linked from the exported HTML, so Gmail
  and Outlook fall back to the web-safe end of the stack (`Kanit, Arial, Helvetica, sans-serif`). The fallback
  is chosen to look acceptable on its own.
- **Brands** live in this browser only. Use Export / Import brand JSON to share a kit with the team.
- **Everything is per-browser**, including saved blocks and version history. Nothing syncs
  between machines or teammates; JSON export is the sharing mechanism.
- **Deleting an email deletes its version history** with it. There is no trash.
- **Merge tags are stored as `{{tag}}` only.** The six built-ins map to real ESP field names;
  a hand-typed seventh tag falls back to a generic transform, which may not match a bespoke
  field. Extend the table in `src/lib/merge.ts`.
- **Merge-tag sample values are per-browser**, so a teammate opening the same template sees
  their own.
- **Presets ship with placeholder images and copy.** The export dialog warns while any remain;
  replace the art, the alt text and the sample copy (including the Cold outreach signature) before
  a real send.
- **Brand footers and social links** feed the Footer block, which pulls them from the active brand
  with a per-email override. Nothing auto-inserts a Footer block into a new email yet.
- **Outlook on Windows ignores background images**, so the Hero's centered background image falls
  back to its background colour there. No VML is emitted.
- New composite blocks ship with `picsum.photos` placeholder images and placeholder alt text —
  replace both before a real send.
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
