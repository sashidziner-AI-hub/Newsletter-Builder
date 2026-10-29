# Progress

## Feature 1A — Brand kit + brand switcher — done (2026-10-29)

Internal tool for the Vee MARCOM team. No roles, membership or login — see
*Future-proofing* below for the seams left in place.

### What shipped

| Requirement | Where |
|---|---|
| Brand model + CRUD | `src/types.ts` (`Brand`), `src/lib/brand.ts`, `src/lib/storage.ts`, store actions in `src/store.ts` |
| Persistence | `localStorage` under `email-builder:brands:v1`, the same approach already used for templates. **No backend was introduced.** |
| Seed brand | `veeBrand()` in `src/lib/brand.ts` — Vee Technologies, with unconfirmed values marked `TODO` |
| Brand switcher | `src/components/TopBar.tsx`, next to the email title |
| Brand-aware colours / fonts | `ColorField` swatch row in `src/components/fields.tsx`, brand font options in `src/components/editors.tsx` |
| Email settings from brand + Reset to brand | `defaultBody()` in `src/lib/defaults.ts`, `resetBodyToBrand()` in `src/store.ts`, button in `BodyEditor` |
| Brands page | `src/components/BrandsModal.tsx` — list, create, edit, duplicate, archive/restore, logo upload, export/import JSON, live kit preview |
| Template stores brand_id | `Design.brandId`, `SavedTemplate.brandId` |
| Token-free export | `resolveDesign()` is applied by every consumer before `renderDesign()` |
| Renderer untouched | `src/lib/render.ts` has **no** brand logic |

### The core idea: resolve at the boundary

A colour or font field stores **either** a brand token (`"brand.primary"`) **or** a
literal override (`"#F58220"`).

```
design (tokens)  ──resolveDesign(design, brand, mode)──>  design (literals)  ──renderDesign()──>  HTML
```

* **Switching brands** changes `design.brandId` and nothing else. Tokens resolve
  against the new brand; literal values are untouched, so **manual overrides
  survive a brand switch** for free.
* **"Reset to brand"** writes the tokens back into the email settings.
* `renderDesign()` never sees a token, so **no `brand.*` string can reach an
  export** by construction — not by filtering after the fact.
* `resolveDesign()` uses immer, so untouched blocks keep their object identity
  and the canvas's React memoisation still holds.

Resolution order for a token: the active brand → the seed brand (when the brand
leaves that token blank) → `''`, which the renderer treats as "inherit".

### Logos: preview vs. export

Uploads are stored as data URIs, which email clients strip and which eat the
localStorage quota. So every brand has two pairs of fields:

* `logo` / `logo_dark` — upload, downscaled to **400 px** wide, **canvas preview only**
* `logo_url` / `logo_dark_url` — absolute https, **the only thing exports use**

`resolveToken('brand.logo', brand, 'export')` returns the hosted URL and never
the upload. The HTML export dialog also runs `auditImageSources()`
(`src/lib/audit.ts`) and shows a **non-blocking** warning for any `<img src>`
that is a `data:` URI or not https. Merge tags (`{{...}}`) are not flagged.

### Migration safety

* A design saved before this feature has no `brandId` → normalised to `null` →
  resolves to the default brand. **Its stored literal colours are never
  rewritten.**
* A `brandId` pointing at an archived or deleted brand falls back to the default
  brand silently (`resolveBrand()`). Covered by a test.
* Starter templates carry `brandId: null`; loading one keeps the brand that is
  currently active rather than resetting it.

### Future-proofing (no roles today)

1. `createdBy` / `updatedBy` — nullable on `Brand` and `SavedTemplate`.
2. `getAccessibleBrands(user, brands)` — the **only** read path for the brand
   list (switcher, brands page, template list all use it via
   `useAccessibleBrands()`). Returns every active brand today.
3. `canEditBrand(user, brand)` — the single permission seam. Returns `true` today.

No login was added.

### Known gaps / deliberate choices

* **Kanit will not render in most inboxes.** It is a Google web font and the
  export links no stylesheet, so the stack falls back to
  `Kanit, Arial, Helvetica, sans-serif`. Adding a `<link>` to the exported
  `<head>` is a one-line renderer change if the team decides webmail-only
  fidelity is worth it.
* `footer` and `social_links` are stored, editable and shown in the kit preview,
  but **nothing auto-inserts a footer block into an email yet**. That is a
  follow-up.
* Brand `button` tokens are applied on demand via "Apply … button style" in the
  button editor, not automatically to existing buttons.
* Brands are per-browser. Export/Import brand JSON is the sharing mechanism
  until a backend exists.
* `TODO` markers in `veeBrand()` need real values: logo URLs, muted, link,
  page_bg, border, footer address and legal text.

### Tests

`src/test/brand.test.ts` (25) + a `brand switcher` block in
`src/test/app.test.tsx` (3). Suite: **74 passing**, `tsc --noEmit` clean.

Covered: token / hex / override / missing-token fallback, per-brand resolution,
preview-vs-export logo mode, brand switch keeps content byte-identical, switch is
undoable, reset-to-brand, export contains no `brand.`, uploaded logo never
reaches HTML, image audit, seeding, pre-brand template migration, **a template
whose brand was deleted still renders**, brand JSON round-trip and rejection of
invalid JSON.

---

## Feature 1B — Header, Hero, Footer, Article list blocks — done (2026-10-29)

Four **composite** blocks, so a newsletter no longer has to be hand-assembled from
image + menu + heading + button. They follow the existing block pattern exactly; none of
the 9 original blocks were refactored.

### What shipped

| Block | Layouts | Notes |
|---|---|---|
| **Header** | `logo-left`, `logo-center` | Brand logo with a **brand-name text fallback** when the brand has no `logo_url`; nav repeater (max 6) rendered through the **Menu** renderer; optional hide-nav-on-mobile; bottom border |
| **Hero** | `image-right`, `image-left`, `centered`, `cards-2`, `cards-3` | Eyebrow / heading / subtext / image / CTA; CTA goes through the **Button** renderer so it stays bulletproof; cards stack on mobile |
| **Article list** | `thumb-left`, `thumb-top`, `text-only` | Repeater up to 10 items with add / remove / move up-down; optional divider between items; `text-only` covers category sections |
| **Footer** | — | Logo, address, legal text, unsubscribe text and social links all **pull from the active brand** with per-email override; social goes through the **Social** renderer |

### Reuse instead of duplication

Menu, Social and Button are `case` arms inside the module-private `renderBlockInner()`.
Rather than copy their HTML, a composite block builds a throwaway sub-block and renders it
through the real thing:

```ts
renderBlockInner(subBlock('menu', { items: v.navLinks, … }), design, ctx)
```

`subBlock()` spreads that block type's own defaults, so the `mso-padding-alt` button, the
`mailto:` coercion in `networkHref()` and the social badge/custom-icon logic all come along
unchanged. `renderInlineBlock()` is exported for the same purpose outside the module.

### Email safety

- Nested `<table role="presentation">` only. No flex, no grid, and the export contains no
  `position:` substring at all — the hero background image is written as the `background`
  shorthand (`background:url(…) center / cover no-repeat;`) rather than
  `background-position`, so a plain grep stays clean.
- Mobile stacking **reuses the existing `.eb-col`** media query, so no new stacking CSS was
  needed. Two classes were added to it: `.eb-hide-mobile` (declared *after* `.eb-col` so
  hiding wins) and `.eb-center-mobile`. `src/index.css` mirrors both for the canvas preview.
- Every `<img>` carries `alt`, `width`, `border="0"` and `display:block`. The editor marks
  alt **required** (red asterisk + warning) because inboxes block images by default.
- All links are absolute https; merge tags such as `{{unsubscribe_url}}` pass through
  untouched via the existing `safeUrl()` whitelist.

### The four decisions

1. **Full-bleed background.** A block renders inside `.eb-container` at `body.width`, so its
   own background can never reach the window edges — only `row.bgColor` can. Header and
   Footer therefore have an *Extend background full width* switch that writes their colour
   (token or hex) into the parent row. `resolveDesign()` already walks rows, so a token
   written there resolves correctly. Two such blocks in one row is last-writer-wins, and the
   panel says so.
2. **Hero centered background image** uses `<td background="https://…" bgcolor="#…">`. No
   VML, so **Outlook on Windows shows the solid colour** — pick one that works alone.
3. **`BodySettings.showFooter`** (default on, in Email settings). When off, `renderBlock()`
   returns `''` for footer blocks unless `ctx.editor`, so preview and export drop them while
   the canvas keeps them at 40 % opacity with a *Hidden on send* badge — still selectable and
   deletable.
4. **Hero card count follows the layout**: `cards-2` renders 2, `cards-3` renders 3. Changing
   layout pads with a default card or trims the tail, which avoids wrapping cards onto a
   second table row.

### Composite-block plumbing

`renderBlock()` gained two small, additive behaviours, both no-ops for the original blocks:
the footer skip above, and a `SELF_BG` set so the four composite blocks paint their
background on the wrapper cell (behind the block padding). Header/Footer borders sit on an
inner table, so they are inset by the horizontal padding — set padding to 0 and use the row
if you want an edge-to-edge rule.

### Migration

`normalizeDesign()` rebuilds each block from `createBlock(type)` and shallow-merges stored
`values`, so the new fields pick up defaults on old JSON automatically. Designs saved before
1B get `showFooter: true` explicitly.

### Known gaps

- Default blocks ship with `picsum.photos` placeholder images and placeholder alt text; both
  need replacing before a real send.
- 1C (presets) will compose these four into ready-made starting points.

### Tests

`src/test/blocks.test.ts` (62) + a `composite blocks (1B)` block in `src/test/app.test.tsx`.
Suite: **140 passing** (was 74), `tsc --noEmit` clean.

Covered: every block × every layout for no-flex / no-grid / no-position / no-`brand.` /
table-based, every image having alt + width + `border="0"`, every href https or a merge tag;
cards and thumb-left using stacking cells; the Outlook background-colour fallback; reuse of
the bulletproof button; brand switch re-theming all four while hex overrides survive; header
text fallback with and without a brand logo; footer brand pull-through and per-email
override; footer social from brand and overridden; `showFooter` off dropping only the footer;
`showFooter` defaulting to on for pre-1B designs; repeater add / reorder / remove preserving
item data; the 10-item cap; and a JSON round trip.

---

## Feature 1C — Starter presets — done (2026-10-29)

"New" used to drop the user on an empty canvas. It now opens a **New email** dialog: a grid
of Blank plus eight presets, each with a live thumbnail rendered with the active brand.

### What shipped

| Preset | Built from |
|---|---|
| **Newsletter** | Header (logo-left + nav), Hero `image-right`, intro Text, Article list `thumb-left` ×3, CTA band, Footer |
| **Promotional** | Header `logo-center`, Hero `centered` on `brand.secondary`, Heading + Text offer, 2-column feature cards, Button, Divider, Footer |
| **Product launch** | Header, Hero `cards-3`, Text, full-width Image, Button, Footer |
| **Welcome** | Header `logo-center`, Hero `centered`, Text with `{{first_name}}`, Article list `text-only` ×3 next steps, Button, Social, Footer |
| **Cold outreach** | Deliberately plain: no header, no hero, **no images at all**. Greeting, three paragraphs, one Button, signature, minimal footer |
| *Event invitation* · *Order confirmation* · *Weekly digest* | Ported from the old starters, structure unchanged, hex → `brand.*` tokens |

No new block types. The renderer was not touched.

### Presets superseded the old starters

`src/lib/starters.ts` is **deleted**. It predated 1A and 1B — 35 hardcoded hex values, no
brand tokens, atomic blocks only — and four of its seven entries clashed by name with the
presets 1C asked for. `src/lib/presets.ts` replaces it:

```ts
export interface Preset {
  id: string; name: string; description: string;
  build: (brand: Brand) => Design;
}
```

The three starters with no 1C counterpart (Event invitation, Order confirmation, Weekly
digest) were ported rather than dropped, so nothing was lost. The *Starter templates* tab is
gone from the Templates modal — the New dialog is the single entry point, and *My templates*
(saved emails) is unchanged. `src/main.tsx` first-run now builds the Welcome preset.

### Two things worth knowing

1. **Colours and fonts are `brand.*` tokens; the brand name is baked in.** Tokens resolve at
   the render boundary, so a preset keeps re-theming after a later brand switch. The brand
   *name* is different — `build(brand)` interpolates it into prose once, at apply time,
   because from then on it is ordinary editable text. So switching brands re-themes the
   colours but leaves "Welcome to Acme Health" as written. That is deliberate.
2. **`build()` already returns a fresh copy.** It goes through `createBlock`/`createRow`,
   which mint ids via `uid()`, so applying a preset twice cannot alias and editing the result
   cannot reach the preset. No `cloneWithNewIds` was needed. Tested both ways.

### Placeholder-image warning

`auditImageSources()` (`src/lib/audit.ts`) gained a `placeholders` count along
`embedded`/`insecure`, plus an exported `PLACEHOLDER_PATTERN` / `isPlaceholderImage()`
covering picsum, placehold.co/it/com, dummyimage and via.placeholder. The export dialog's
existing amber block now carries a **"Placeholder images still in use"** line, so nobody
sends a preset unedited. It clears when the URLs are replaced. `ok` is false while any
placeholder survives.

### Thumbnails

`NewEmailModal.tsx` renders each preset's real exported HTML into a sandboxed, inert
`<iframe srcDoc>` at 600 px and scales it with a CSS `transform`. The transform is builder
chrome and never reaches an email, so the no-flex/grid/position rule does not apply there.
The brand selector in the dialog header re-renders every thumbnail.

### Export sizes (limit 90 KB)

7.9–18.9 KB across all 8 presets × 2 brands. Cold outreach is the smallest at 7.9 KB; the
largest is Event invitation at 18.9 KB. Zero embedded and zero insecure images throughout.

### Known gaps

- Presets ship with `picsum.photos` art and placeholder copy on purpose; the export warning
  exists precisely because both must be replaced.
- The Cold outreach signature names a fictional sender ("Priya Raman") — edit it per send.

### Tests

`src/test/presets.test.ts` (125) plus updates to `src/test/app.test.tsx` and
`src/test/render.test.ts`. Suite: **266 passing** (was 140), `tsc --noEmit` clean.

Covered per preset × 2 brands: no `display:flex`/`display:grid`/`position:`/`brand.`; every
image has non-empty alt and a width; every href https or a merge tag; merge tags preserved
verbatim; export under 90 KB; themed by the brand; `normalizeDesign` round trip. Plus: brand
switch re-themes every preset while a hex override survives; fresh disjoint ids on every
apply; editing an applied design leaves `PRESETS` byte-identical; brand name baked at apply
time; subject and preheader pre-filled; Cold outreach has no images, no header/hero and no
page frame; and the placeholder audit flags, then clears.

One note on the image assertion: the original **Image block** emits `border:0` in its inline
style rather than a `border="0"` attribute (only the 1B composite blocks use the attribute).
The test accepts either, since refactoring that renderer was out of scope.

---

## Feature 2A — Merge tags, UTM tagger, plain text — done (2026-10-29)

Three things an email needs before it can actually be sent: personalisation that matches
whatever ESP you use, link tracking, and a plain-text alternative. All three happen **at the
export boundary**, so the stored design stays clean and portable.

### One boundary, extended — not a second pipeline

`resolveForOutput()` (`src/lib/output.ts`) *composes* 1A's `resolveDesign()`. All five
consumers switched to it: `Canvas.tsx`, `Modals.tsx` (preview + export), `NewEmailModal.tsx`
and `TopBar.tsx` (JSON). `resolveDesign()` is unchanged and still used directly by the brand
tests.

```
design ──resolveDesign──> brand tokens gone
       ──addUtm──────────> links tagged      (export mode only)
       ──formatMergeTags─> ESP tag spelling
       ──renderDesign────> HTML
       ──toPlainText─────> .txt
```

**Order matters.** UTM runs while tags are still canonical `{{tag}}`, so "is this URL nothing
but a merge tag?" stays one regex instead of a per-format problem.

### Merge tags

Designs **always** store `{{tag}}`; the format is applied on the way out, so switching ESP
never edits content. Built-ins: `first_name`, `last_name`, `company`, `email`,
`unsubscribe_url`, `view_in_browser_url`.

| canonical | Mailchimp | HubSpot |
|---|---|---|
| `first_name` | `*\|FNAME\|*` | `{{ contact.firstname }}` |
| `last_name` | `*\|LNAME\|*` | `{{ contact.lastname }}` |
| `company` | `*\|COMPANY\|*` | `{{ contact.company }}` |
| `email` | `*\|EMAIL\|*` | `{{ contact.email }}` |
| `unsubscribe_url` | `*\|UNSUB\|*` | `{{ unsubscribe_link }}` |
| `view_in_browser_url` | `*\|ARCHIVE\|*` | `{{ view_as_page_link }}` |

Real ESP spellings, not a naive uppercase — `*|FIRST_NAME|*` is not a Mailchimp tag. An
unknown tag falls back to uppercase (Mailchimp) or `contact.<tag>` (HubSpot). Custom format
takes a prefix and suffix. `curly` is the default, which makes the whole step an identity
transform — that is why all 266 pre-2A tests stayed green unchanged.

Insert-tag menus sit on the Text editor toolbar, Heading text, Button label, subject and
preheader, and write at the caret. **Sample-data preview** lives in the store and
`localStorage` (`email-builder:sample:v1`), never in the design, so it cannot reach an export
or a saved template.

### UTM tagger

Off by default. `utm_medium` defaults to `email`, and the campaign defaults to
`slugify(body.title)` the first time it is enabled. Applied **only** when
`mode === 'export'`, so the canvas and preset thumbnails stay clean — Preview already uses
`'export'`, so its "this is the exact HTML that will be exported" claim stays true.

`addUtm()` parses by hand rather than with `new URL()`, which throws on relative input. It
preserves an existing query string and `#hash`, and **never overwrites a `utm_*` the link
already carries**. Skipped: non-`http(s)` (`mailto:`, `tel:`, `#anchor`, relative),
merge-tag-only URLs, anything containing `{{unsubscribe_url}}` or `{{view_in_browser_url}}`,
and any link with its per-link opt-out set.

Per-link opt-out is a `noTrack` flag on every discrete link, plus `data-no-track="1"` on
rich-text anchors — set from a checkbox in the link dialog via a small `Link.extend()`, and
**stripped on export** so it never ships (stripped even when tracking is off).
`@tiptap/extension-link` was already installed as a transitive dependency at the same
version; 2A declares it explicitly rather than importing an undeclared package.

The export dialog shows *"UTM added to N links, skipped M"*. The skipped count deliberately
includes the untagged unsubscribe link rather than ignoring it, so the numbers add up to
something a sender can reconcile.

### Plain text

`toPlainText()` runs on the **already resolved** design, so URLs carry their UTM parameters
and tags carry the chosen format. Headings on their own line, paragraphs blank-line
separated, links as `text (url)`, Buttons as `Label: url`, Article items as title + excerpt +
url, Divider as `----------`, images skipped unless alt text is all the block has, Menu and
Social as dash lists, Footer only when `showFooter` is on. Wrapped at 72 characters, and a
URL longer than that goes on its own line rather than being broken — a split URL is an
unclickable URL.

The export dialog is now **Export** with **HTML | Plain text** tabs, each with its own Copy
and Download (`.html` / `.txt`). The image audit only applies to the HTML tab.

### `safeUrl()`

Already tolerated `{{tag}}`; `*|TAG|*` happened to survive through its bare-domain fallback.
2A makes that explicit by adding `*|` to the whitelist, so a Mailchimp-format unsubscribe
href is passed deliberately rather than by accident.

### Export sizes, all 8 presets, UTM on

HTML 8.0–17.8 KB, plain text 0.7–1.7 KB. Verified across all four tag formats: no stray
`{{` in Mailchimp output, no stray `*|` in curly output, no double `?` on any tagged URL, no
markup in any `.txt`, and the unsubscribe link untagged in every format.

### Known gaps

- The ESP tag table covers the six built-ins. A seventh tag typed by hand still works via
  the generic fallback, but will not match a bespoke ESP field name — the table in
  `src/lib/merge.ts` is the single place to extend.
- Sample values are per-browser, so a teammate opening the same template sees their own.
- `view_in_browser_url` is offered as a tag but no preset uses it yet.

### Tests

`src/test/utm.test.ts` (25), `src/test/merge.test.ts` (25), `src/test/plaintext.test.ts` (34)
— including **golden output** for the Newsletter and Cold outreach presets — plus a
`merge tags, UTM and plain text (2A)` block in `src/test/app.test.tsx` (5) covering the three
acceptance flows end to end. Suite: **354 passing** (was 266), `tsc --noEmit` clean.
