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

---

## Feature 2B — Saved blocks, auto-save, version history — done (2026-10-29)

Editing used to be risky and repetitive: closing a tab lost whatever was not explicitly
saved, there was no way back once the undo stack was gone, and a CTA band built once had to
be rebuilt by hand next time. All three are fixed on localStorage, through one shared
storage helper that degrades honestly when the quota runs out.

### Auto-save replaced the draft slot

Before 2B the open email lived in a single unnamed `email-builder:draft:v1` slot, written
400 ms after each change, while *templates* were a separate list written only on an explicit
click. Auto-save now writes a **real record** in the templates storage, debounced 2 s,
creating it on the first edit. A `beforeunload` flush covers a tab closed mid-debounce.

| Decision | Why |
|---|---|
| Auto-saved records carry `autoSaved: true` | They group under **Drafts (auto-saved)** in the Templates dialog, so the list does not fill with "Untitled email". Naming one promotes it. |
| Records predating 2B have no flag → read as named templates | The existing list is undisturbed, which is the no-migration-loss guarantee |
| The old draft is migrated once, then its key is deleted | Otherwise in-progress work would look lost after the upgrade, or re-migrate into duplicates every boot |
| `loadDesign` split into `openEmail` / `startNewEmail` | **Without this, picking a preset would auto-save the new design over the email you just left.** `startNewEmail` leaves `currentEmailId` null so the first edit mints its own record. |
| The Templates name field became **Rename this email** + **Save as a copy** | With auto-save the email is already saved, so "Save current design" no longer meant anything coherent |
| The "New" confirm now fires only when `dirty` | Auto-save means a replace loses nothing except an unflushed change from the last couple of seconds |

Status is always visible in the top bar — "Saving…", "Saved just now" (ticking over to
"Saved 5 min ago" on a 30 s interval), or **"Not saved: storage full"**. A failed write is
never silent.

### A bug this surfaced

`openEmail` / `startNewEmail` set `dirty: false`, but the auto-save subscription immediately
flipped it back to `true` because the design reference had changed — so the app believed a
freshly opened email had unsaved edits, and the New dialog asked for no reason. The store
already bumps `revision` on whole-design loads, so the subscription now skips those: a load
is not an edit. `resetDesign` was also rewritten to delegate to `startNewEmail`, since a
reset that left `currentEmailId` behind would auto-save the blank canvas over the email it
had just discarded.

### Saved blocks

"Save as block" sits on the selected block's and row's panel header. The dialog takes a name
(required) and a free-text category, and **warns if the payload contains a `data:` image**,
since those do not survive a real inbox.

The library is a third left-panel tab (**Content / Rows / Saved**) with search, category
grouping, per-item thumbnails rendered with the **active** brand, rename, delete,
click-to-insert and drag. Export / Import brand-neutral JSON is there too: duplicates by id
are skipped silently, and a name clash is confirmed separately so the unambiguous entries
still import.

Payloads keep their `brand.*` tokens as tokens and hex overrides as hex, so a saved CTA band
re-themes per brand. Inserting always goes through `cloneWithNewIds()`, so the copy can never
alias the original.

**`cloneWithNewIds()` was stale.** Its regex covered only `blk|row|col|mi|si`, but 1B/1C
added `nv` (nav links), `hc` (hero cards) and `ai` (article items) — so duplicating a Header,
Hero-cards or Article-list block reused those nested ids. Benign until now (they are only
React keys inside their own block's array), but it broke 2B's fresh-ids rule. The regex now
covers every live prefix.

Drag integration rides the existing rails: `DragKind` gained `saved-block` (joining `tool` in
the block/column targeting branch) and `saved-row` (joining `layout` in the row branch).

### Version history

Rules are pure and in `src/lib/versions.ts`, so they are tested directly:

- a **manual** "Save version" with an optional note,
- an **automatic** snapshot at most once every 5 minutes of active editing,
- a **pre-restore** and **pre-replace** snapshot before anything replaces the canvas,
- and **never** a snapshot of a design identical to the latest one.

Last 20 per email, oldest pruned first. **Restore destroys nothing**: it snapshots the
present first, so you can immediately restore forward again — which is the third acceptance
test. One consequence worth knowing: clicking "Save version" straight after an auto-save does
nothing, because the state is already captured; the dialog says "No changes since the last
version" rather than pretending.

Versions store the design only — rows, blocks, email settings, `brandId` — never brand
definitions.

### Storage safety

One writer, `writeSafe()`. On `QuotaExceededError` it prunes the **10 oldest versions across
every email** (which is why versions live in one key rather than one per email), retries once,
and only then returns `'full'` for the caller to surface. Every record carries
`schemaVersion: 2`; anything without one reads as version 1 and is kept.

The Templates dialog footer shows live usage — "Storage: 2.1 MB of about 5 MB" — with a
warning past 80 %. Usage counts only `email-builder:` keys, in UTF-16 code units, which is
what the quota is actually measured in.

### Known gaps

- `STORAGE_LIMIT_BYTES` is a fixed 5 MB. Browsers vary and none expose the real figure, so
  the readout is approximate by nature.
- Saved-block thumbnails render a full iframe each; a library of a hundred blocks would want
  virtualising.
- Deleting an email deletes its history with it, by design — there is no trash.

### Tests

`src/test/storage.test.ts` (25), `src/test/versions.test.ts` (21),
`src/test/saved-blocks.test.ts` (25), `src/test/acceptance-2b.test.ts` (3 — the three stated
acceptance flows end to end), plus auto-save, drafts-grouping and rename/copy cases in
`src/test/app.test.tsx`. Suite: **430 passing** (was 354), `tsc --noEmit` clean.

The quota path is tested by stubbing `Storage.prototype.setItem` to throw
`QuotaExceededError` a set number of times, proving prune-then-retry succeeds, that an
unrecoverable failure reports `'full'`, and that the failure reaches the save status.

---

## Feature 2C-1 — URL-based image library — done (2026-10-30)

Images were the weakest part of the builder: every URL typed by hand into whichever block
needed it, the same hero pasted into four emails with four different alt texts, and nothing
telling you an image was broken, low-resolution or still preset stock art until it reached an
inbox. 2C-1 adds a library of vetted URLs, a picker on every image field, and an export check
list that names each problem and jumps to the block.

Hosting is undecided, so this is **URL-only**. No file upload.

### Twelve fields, not seven

The brief listed seven image fields; there are twelve. `SocialItem.iconUrl` and
`VideoValues.thumbnail` were missing from it, and both now get the picker and the checks —
a field that escapes the audit is precisely the gap the audit exists to close.

| | |
|---|---|
| Image block | `src` |
| Hero | `imageSrc`, `bgImage`, `cards[].imageSrc` |
| Article list | `items[].imageSrc` |
| Header / Footer | `logoSrc` |
| Social | `items[].iconUrl` |
| Video | `thumbnail` |
| Brand | `logo_url`, `logo_dark_url` |

`Brand.logo` / `logo_dark` stay as 1A left them: canvas-preview-only uploads that never export.

### The storage adapter

`ImageStorage` is an interface — `list` / `add` / `update` / `remove` / `replaceAll`, plus an
optional `upload(file)`. `LocalImageStorage` implements it over 2B's `writeSafe()`, so the
library inherits the quota prune-and-retry and the honest "storage full" message for free.
Every record carries `schemaVersion: 2`; anything without one reads as version 1 and is kept.

`upload()` exists and **deliberately throws**:

> Upload needs image hosting. Paste a public https image URL instead.

It must never fall back to a `data:` URI — an "upload" that silently embedded one would put an
image in the email that most inboxes refuse to render, which is worse than no upload at all.

### The conflict in the brief, and how it was resolved

The acceptance criterion said *no `data:` URI can enter an email*, but the Image block's
**Upload from device** wrote one straight into `values.src` and that **does** export — while
the rules said not to refactor existing blocks. Both could not hold.

The button now routes through `storage.upload()` and surfaces the refusal. That is an editor
change rather than a block or renderer change, and it closes the hole. Emails that already
contain a `data:` URI keep it, and the export warns, exactly as before.

### Design-level audit, not HTML

1A's `auditImageSources(html)` regexes `<img src>` out of the rendered output. That cannot
say which block an image came from — so "jump to block" is impossible from it — and it misses
the hero background entirely, because that renders as `<td background="…">`, not an `<img>`.

`src/lib/image-audit.ts` walks the **design** instead: `collectImages()` returns every use
with its block id, a human label ("Hero card 2 image", "Article 3 thumbnail") and the width it
renders at; `auditDesignImages()` classifies each as `not-https` / `missing-alt` /
`placeholder` / `embedded` / `broken`. It runs over the **resolved** design, so a
`brand.logo` token is checked as the URL that actually ships — and since `resolveDesign`
preserves block ids, the jump still lands. `auditImageSources` is untouched and still used by
the 1A/1C tests.

Alt text is only demanded where the field has one. Backgrounds, social icons and logos carry
no alt of their own, so they are never reported for it. Merge tags are skipped entirely.

### Checks that do not lie

Structural problems are computed the instant the export dialog opens. Load failures are not:
a **Check images load** button probes the URLs and caches the result, and an image that has
not been probed is **never** reported as broken. The dialog opens fast, works offline, and
only claims what it has actually checked. The library re-checks its own items when it opens
and shows a *Could not load* badge.

Export is never blocked — warnings only.

### Resolution notes

Non-blocking, shown beside the field when the image is in the library: **Low resolution** when
the natural width is under twice the rendered width (what a retina screen wants) and **Very
large image** above 1600px.

### Known gaps

- Resolution notes need the image to be in the library, since that is where its measured size
  lives. A hand-pasted URL gets them once it is saved.
- The library re-check probes every item on open. Fine for tens of images; a library of
  hundreds would want batching.
- `probeImage` is injectable precisely because jsdom never loads images — the browser loader
  is only exercised in the real-browser pass, not in the unit tests.

### Tests

`src/test/image-library.test.ts` (30), `src/test/image-audit.test.ts` (22), plus an
`image library (2C-1)` block in `src/test/app.test.tsx` (7). Suite: **489 passing** (was 430),
`tsc --noEmit` clean.

Covered: https accepted; `http:`, `data:`, `blob:`, empty and malformed rejected with a
reason; multi-line paste with in-paste de-duplication; duplicate URLs skipped on import; name
clashes reported separately; a stored `data:` record dropped on read; `upload()` always
throwing; all twelve fields collected; hero cards limited to the rendered layout; text-only
articles contributing none; the brand-token logo audited as its real URL; broken only when
probed; both resolution thresholds; the picker filling URL **and** alt; library edits not
mutating emails that already use the image; the upload refusal writing nothing.

Verified in a real browser: three seeded images listed with thumbnails, the brand filter
narrowing to shared, the picker filling a Hero's URL and alt, the export list grouping two
placeholders with working jump-to-block, and a pasted `data:` URI refused with a reason.

## Feature 3A — Checks panel — done (2026-10-30)

### What it is

One engine that reads what is actually sent and says what an inbox will do with it. It
**never blocks** editing or export — the Export dialog's buttons are live with errors
outstanding, by design and by test.

### One source of truth

`checkDesign(resolvedDesign, exportedHtml, brand, opts)` in `src/lib/checks.ts` returns
`Issue[]`. It is handed exactly the pair the export dialog builds:

```ts
const out  = resolveForOutput(design, brand, 'export'); // brand tokens, UTM, merge format
const html = renderDesign(out.design);                  // the string that ships
```

So every rule sees resolved colours, UTM-tagged links and ESP-formatted merge tags, not the
stored document. Passing the **unresolved** design is a caller bug: a `brand.logo` token is
not a URL the engine can judge, and it will be reported as one.

Two older audits were retired into it rather than left running alongside:

- 1A's `auditImageSources(html)` — gone. `src/lib/audit.ts` now holds only
  `isPlaceholderImage()` / `PLACEHOLDER_PATTERN`.
- 2C-1's `auditDesignImages()` / `groupProblems()` / `PROBLEM_LABEL` / `PROBLEM_HELP` — gone.
  `src/lib/image-audit.ts` keeps `collectImages()` (the collector) and `resolutionNote()`.

The export dialog's hardcoded `kb > 100` Gmail warning is gone too; it is the SIZE rule now.

### The rules

| Group | Codes |
|---|---|
| SIZE | `SIZE_NEAR_LIMIT` warning ≥ 90 KB, `SIZE_OVER_LIMIT` error ≥ 102 KB, counted in UTF-8 bytes on the real HTML |
| LINKS | `LINK_EMPTY`, `LINK_HASH`, `LINK_RELATIVE`, `LINK_HTTP`, `LINK_PLACEHOLDER_DOMAIN` |
| UNSUBSCRIBE | `UNSUBSCRIBE_MISSING` warning |
| SUBJECT / PREHEADER | `SUBJECT_EMPTY` error, `SUBJECT_LONG` info > 60, `PREHEADER_EMPTY` warning, `PREHEADER_LONG` info > 110 |
| CONTRAST | `CONTRAST_TEXT` / `CONTRAST_BUTTON` / `CONTRAST_LINK` errors, `CONTRAST_UNKNOWN` info |
| READABILITY | `TEXT_TOO_SMALL` warning < 12px, `TAP_TARGET_SMALL` warning under 44px |
| CONTENT | `CONTENT_THIN` warning |
| IMAGES | `IMAGE_EMBEDDED`, `IMAGE_NOT_HTTPS`, `IMAGE_MISSING_ALT`, `IMAGE_PLACEHOLDER`, `IMAGE_BROKEN`, `IMAGE_TOO_WIDE` |

Merge tags are never a broken link or image; well-formed `mailto:` and `tel:` are valid.

### Contrast

`src/lib/contrast.ts` is the WCAG 2.1 maths, kept pure so the numbers are checkable:
sRGB linearisation, relative luminance, 4.5:1 normal / 3:1 large (≥ 24px, or ≥ 18.66px bold).
`suggestFix()` walks the foreground towards black or white until it passes, which is where the
"Try #919191" in a message comes from.

The effective background follows the renderer's own chain:
`block.bgColor → row.contentBgColor → body.contentBgColor → row.bgColor → body.bgColor`.
A button is judged against its own fill; text over a hero background image is not judged at
all, and says so (`CONTRAST_UNKNOWN`).

### Stable ids, so Ignore means something

`` `${code}#${blockId ?? 'email'}#${discriminator}` ``. The same problem keeps the same id
across runs and across unrelated edits elsewhere in the email, which is what lets a dismissal
persist. Ignored ids live under `email-builder:ignored:v1`, keyed by email id — a warning
waved away on one newsletter is still raised on the next — and are written through 2B's
`writeSafe()`. Deleting an email takes its ignore list with it.

An email with no record yet has nowhere to store them; the store flushes them the moment
auto-save mints its id.

### The UI

- **Top bar badge** — red error count, else amber warning count, else a green tick. A readout,
  never a gate.
- **Drawer** (`src/components/ChecksPanel.tsx`) — overlays the properties panel rather than
  displacing it, so a block jumped to from here has its settings waiting underneath. Grouped
  by severity; each issue has its message, hint, **Go to block** (or **Email settings**),
  **Ignore**, and its code. An **Ignored (n)** section brings them back.
- **Canvas** scrolls the selected block into view with `block: 'nearest'`, which is a no-op
  when the block is already visible — so an ordinary click never jolts the page.
- **Export dialog** shows a one-line summary and an **Open checks →** hand-off, instead of
  repeating the list.

Checks are debounced at 500 ms. Unlike auto-save they also run on a whole-design load: a badge
that stayed empty until the first edit would be lying about the email you just opened.

### Checks that do not lie

Load failures are still on demand — **Check images load** probes the URLs, and an image that
has not been probed is **never** called broken. The library's own cached statuses and measured
widths seed the engine, which is where `IMAGE_TOO_WIDE` gets its numbers.

### Known gaps

- Links are classified, not fetched. A well-formed https URL that 404s is not detectable
  without a server.
- Contrast is computed from the colours in the design. A background image, a gradient pasted
  into an HTML block, or a client that forces dark mode are all beyond it.
- Editing a brand re-runs the checks, but adding or re-probing an image in the library does
  not; the next design edit picks it up.
- The engine takes the resolved design by contract and does not defend against being handed
  the raw one.

### Tests

`src/test/contrast.test.ts` (15) and `src/test/checks.test.ts` (44), plus a `checks` block in
`src/test/app.test.tsx` (4). `image-audit.test.ts` drops to 14 as its problem taxonomy moved
into the engine. Suite: **546 passing** (was 489), `tsc --noEmit` clean.

Covered: #000/#fff = 21:1, #777777/#fff ≈ 4.48 failing and #767676/#fff ≈ 4.54 passing, the
large-text threshold; size at 89/90/101/102 KB and bytes-not-characters; every link verdict,
merge tags, mailto/tel, UTM-tagged links; the unsubscribe tag in all four ESP formats and the
Show-footer-off case; the renderer's background chain; a button against its own fill; a hero
background image skipped with a reason; text under 12px and buttons under 44px; thin content
with the hidden preheader excluded; images broken only once probed and alt only where the
field has one; ids stable across runs and distinct per block; ignore persisting across a
reopen and un-ignore restoring without a re-run; export never disabled.

Verified in a real browser: a 2.32:1 heading reported with its ratio, its 3:1 large-text
threshold and a suggested #919191; **Go to block** selecting and scrolling to it with the
drawer still open; Ignore dropping the badge from `1 error, 1 warning` to `0 errors, 1 warning`
and surviving a reload via `email-builder:ignored:v1`; the unsubscribe warning with the footer
off; typing a readable hex clearing the error live with no reload; and the export dialog
agreeing at `1 warning` with Copy and Download both enabled and no `Gmail clips` string left.

## Feature 3B — Dark mode support — done (2026-10-30)

### The shape of it

Light mode never changes. Dark mode is **additive only**: class names beside the inline
styles, two meta tags, and one `<style>` block. With **Dark mode support** off the exported
HTML is byte-identical to a pre-3B export — guarded by a snapshot per preset recorded against
the old renderer before a line of 3B was written.

Measured on the Newsletter preset: dark support costs **2,031 bytes** (19,657 vs 17,626).

### How a dark colour is decided

Not in the renderer. `darkBrand()` swaps the brand's colour tokens for the dark palette and
the design is resolved a **second time** through the existing 2A boundary:

```ts
const light = resolveForOutput(design, brand, 'export').design;
const dark  = resolveForOutput(design, darkBrand(brand), 'export').design;
```

Which gives the rule the feature asks for with no provenance tracking at all:

- a colour that came from a `brand.*` token differs between the passes → it moves, and the
  renderer emits a class
- a hex somebody typed by hand is identical in both passes → no class, so it stays exactly
  as it is

A per-block or per-row **Dark** override beats both, and is applied to the dark pass in
`prepareDarkDesign()`.

### Where the role mapping bites, and what was done about it

A brand kit names colours by identity (`primary`, `secondary`, `accent`), not by role, and the
presets use several of them **both ways round**. Swapping the palette wholesale got two cases
backwards, both badly rather than subtly, and both were caught by the dark contrast checks
during development rather than by eye:

- **An ink colour used as a background.** The Promotional hero paints its panel with
  `brand.secondary` (near-black). Mapped as "strong text" it flipped to `#E5E7EB` — a dark
  panel turning white. Now an ink colour used as a panel simply stays.
- **A surface colour used as a foreground.** `brand.content_bg` is how the presets write
  "white text on the brand colour". Following the surface down turned button labels near-black
  on a dark fill. Now it becomes whatever actually reads on the background that label sits on
  — the button's own fill for a button, the block's panel otherwise.

The second one is why the Newsletter preset's orange CTA keeps a readable label in dark mode.

### Class names

Six shared classes (`.dm-page`, `.dm-content`, `.dm-text`, `.dm-link`, `.dm-border`,
`.dm-btn`) cover the common cases; anything else mints a deterministic per-colour class from
the hex itself (`.dm-t1a1a1a`). Every rule carries `!important`, or the inline style would
win. Rules are pruned against the rendered HTML before they ship, because a class is minted
while a colour is being considered — slightly before the element is known to render at all,
as an empty hero eyebrow proves.

Each rule is written three times: inside `@media (prefers-color-scheme: dark)`, behind
Outlook.com's `[data-ogsc]` / `[data-ogsb]`, and — **in the preview only** — behind
`[data-eb-dark]`.

### The preview

The preview iframe is already the real exported HTML, and it is sandboxed without
`allow-same-origin` or `allow-scripts`, so nothing can reach into it after the fact. The dark
preview therefore bakes `data-eb-dark="1"` onto `<html>` at render time and ships the same
rules a third time behind that attribute. One renderer, one stylesheet.

The canvas is **not** an iframe — it sanitises block HTML into divs, and DOMPurify strips
`<style>` — so the Light/Dark toggle drives the Preview window, and says so in its tooltip.
The dark preview carries the note that Gmail's apps invert colours themselves and ignore
these rules, while Apple Mail, Outlook (Mac/iOS) and Outlook.com follow them.

### The brand dark palette

Eight fields: `page_bg`, `content_bg`, `text`, `muted`, `link`, `border`, `button_bg`,
`button_text`. Null on every brand saved before 3B and on any brand nobody has filled in, and
derived in that case: a `#121212` page, a `#1E1E1E` content panel (pure black makes text
ring), `#E5E7EB` text, the brand link lightened until it clears 4.5:1 on the content
background, and the brand primary as the button with whichever of black or white reads on it.
A half-filled palette falls back key by key, so one blank field cannot produce an invisible
email.

The Brands page gets a **Dark mode** section with the eight fields, a **Derive from light**
button, a **Reset to derived**, a live sample painted with the palette itself, and a readout
of the measured text and link ratios.

### Checks

The 3A engine runs its contrast rules a second time over the dark design, as
`CONTRAST_TEXT_DARK` / `CONTRAST_BUTTON_DARK` / `CONTRAST_LINK_DARK` errors with the same
stable-id scheme, so a dark issue can be ignored and stay ignored. Plus `DARK_NO_LOGO` (info,
only when the email actually uses a logo), `DARK_IMAGE_MANUAL` (info, a hero background image
dark mode cannot restyle) and `SIZE_DARK_OVERHEAD` (warning above 3 KB, measured by rendering
both ways rather than estimated).

### Known gaps

- **Gmail's apps ignore all of this.** They apply their own inversion. Nothing in this feature
  changes that; the note in the preview is the honest answer.
- **The canvas stays light.** It is not an iframe, so it cannot host the stylesheet.
- **The role mapping is heuristic.** `secondary`/`accent`/`primary` are mapped by the role the
  presets use them for, with the two corrections above. A brand that uses one of them a third
  way wants an explicit per-block dark override — and the dark contrast check will say so.
- **Dark overrides are two fields per block** (background and text), driving a fixed list of
  colour fields per block type. A block with several text colours moves them together.
- **Background images and text over images** cannot be restyled; `DARK_IMAGE_MANUAL` flags it.

### Tests

`src/test/dark.test.ts` (89) plus a `dark mode` block in `src/test/app.test.tsx` (4).
Suite: **639 passing** (was 546), `tsc --noEmit` clean.

Covered: the per-preset byte-identity snapshot with dark off, and that it is the flag rather
than the caller that decides; both meta tags, the media query and both Outlook.com selectors
with it on; no `brand.`, no flex/grid/`position:`; every dark rule carrying `!important`;
every minted class having a rule and every rule being used; the preview-only selector never
shipping; the logo pair appearing only with `logo_dark_url` and never with dark off; the
derived palette clearing 4.5:1 for text and link across five brand link colours and the button
label clearing 3:1 across four primaries; key-by-key fallback; a hand-typed hex staying put
while a brand colour moves, and a per-block or per-row override beating both; the
surface-as-label correction; dark contrast errors with stable ids that survive an unrelated
edit and vanish when the toggle goes off; `DARK_NO_LOGO` appearing and then not; the 3 KB
overhead threshold; every preset free of dark contrast errors on the Vee brand; and a pre-3B
brand and email loading unchanged.

Verified in a real browser: the Newsletter preset on the Vee brand previewing with a `#121212`
page, a `#1E1E1E` content panel, light heading text, the orange CTA with a readable dark
label and orange links; switching back to Light giving byte-for-byte the same 19,657-character
document as before; the export carrying both meta tags and `[data-ogsc]` with dark on and
**none** of it with dark off (17,626 characters, no `dm-` anywhere); and a brand with a light
logo and no dark one raising `DARK_NO_LOGO` in the drawer with its hint.

## Feature 5A — AI image generation (bring-your-own key) — done (2026-11-02)

### The gate, checked before anything was written

The brief said to verify browser-callability and stop rather than build a proxy. An
unauthenticated CORS preflight against the real endpoint settled it:

```
OPTIONS https://api.openai.com/v1/images/generations
access-control-allow-origin: *
access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
access-control-allow-headers: authorization,content-type
```

`GET /v1/models` answers the same way, which is what makes a free **Test connection**
possible without generating a billable image. Two consequences the adapter is built around:
the allow-list is *exactly* `authorization,content-type`, so an `OpenAI-Organization` or any
telemetry header would fail the preflight and none is sent; and the GPT image models always
return base64 (`data[].b64_json`), so there is no second cross-origin fetch of a returned URL.

**`gpt-image-1` no longer exists.** The current spec-generated SDK enumerates
`gpt-image-1-mini`, `gpt-image-1.5`, `gpt-image-2`, `gpt-image-2.5-sunburst`,
`gpt-image-2.5-flare` and `chatgpt-image-latest`. The dropdown ships that list and defaults to
`gpt-image-1-mini`, the cheapest, because the panel invites regeneration on someone's own card.

### Where the key lives, and where it provably does not

Module memory by default; it dies with the tab. **Remember on this device** is opt-in and
writes `email-builder:aikey:v1` through 2B's `writeSafe()` — one key, so there is one place to
look and one thing for **Remove key** to clear. Unticking the box deletes the stored copy
rather than leaving it behind.

The key is deliberately **not in the zustand store**. Everything in that store is a candidate
for serialisation — designs, brands, saved blocks, version snapshots all round-trip through
JSON — so a key that is never in the store cannot be written out by a future feature that
forgets this rule exists. A test sweeps every surface (design, brands, saved blocks, image
library, issues, rendered export, every localStorage entry, and `document.body.textContent`)
after a full generate-and-use run.

Provider error bodies are read for classification only. A provider is free to echo the request
back in an error, so nothing from the body reaches a message — there is a test that feeds back
`key sk-… is invalid` and asserts neither `message` nor `detail` contains it.

### The response is untrusted input

`validate.ts` is the only path bytes may take in: PNG, JPEG or WebP by **magic bytes**, never
by the declared content-type, under 10 MB, and SVG refused outright — it is a document that
can carry script, not an image. HTML served with a 200 and JSON where an image was promised
are both rejected with a reason.

### Drafts, and the three rules that follow

There is no image hosting, so `ImageHosting` is declared and `configured: false`. A generated
image therefore becomes a **local draft**: bytes in IndexedDB, and the design carries only
`aiDraftId`.

- the design, saved blocks and every JSON export carry the **id only**
- at the export boundary the id is swapped for `https://placehold.co/600x400?…`, which the 3A
  engine already recognises, so the existing placeholder warning fires on its own
- a draft is local to one browser, so **a missing one is a normal state** — an imported design
  or a saved block from another machine arrives exactly that way

That last point is `AI_IMAGE_MISSING_DRAFT` (error, quick action **Replace image**) beside
`AI_IMAGE_NOT_HOSTED` (error, quick action **Replace with hosted URL**). Following 2C-1's rule
that an unexamined thing is never accused, the engine only reports *missing* once
`refreshDrafts()` has actually read the store. The canvas shows an **AI draft (not hosted)**
badge, or **Draft image missing**, instead of a broken image.

Typing a real URL into the field clears `aiDraftId`, which is also what the quick action drives.

### Two defects found while building

- **The throttle had a hole.** `setBusy(true)` ran *after* the 2-second gap sleep, so between
  the click and the request the Regenerate button stayed enabled and a second generation could
  be queued — breaking "one generation at a time". Busy now goes up first, and `send()` guards
  on it as well as the button's disabled state.
- **A test of mine was pathological**, not the code: building a 10 MB base64 payload one
  `String.fromCharCode` at a time took 5.5 s and tripped the timeout. It allocates directly now.

### Scope

Entry points are the five fields the decision named: Image block, Hero image, Hero cards,
Article list items, Header logo. They go through the shared `ImageFields` component, so a 4A
block picks the button up by passing one prop. The Footer logo shares that component and is
deliberately **not** passed the prop, per "only the image fields that exist now".

### Known gaps

- **No hosting adapter**, so every generated image is a draft and every export of one ships a
  placeholder. That is the designed end state of 5A, not an omission.
- **Drafts do not sync.** They are per browser by construction. Sharing a design means hosting
  the image first.
- **16:9 and 4:3 have no documented size**, so they are requested as custom `WIDTHxHEIGHT` with
  a single retry at the nearest documented size if the model refuses. 1:1 and 3:2 map exactly.
- **The natural size is read from PNG headers only**; JPEG and WebP report 0 and the resolution
  note stays quiet rather than guessing.
- **Exposing an API key to a browser is a real trade-off**, which is why the key is
  session-only by default and the Remember checkbox carries an explicit warning.

### Tests

`src/test/ai.test.ts` (39) and `src/test/ai-ui.test.tsx` (16). Suite: **694 passing**
(was 639), `tsc --noEmit` clean. No test makes a real API call — `fetch` is stubbed and the
real adapter runs against it, so the request shape is covered rather than mocked away.

Covered: magic-byte acceptance and the SVG/HTML/JSON/oversize/empty refusals; base64 decode
and PNG header parsing; the key in memory vs one storage key, unticking Remember, Remove key,
masking; exactly two headers and never the key in a URL or body; the size map per aspect
including the custom-size fallback; every error status mapped to its kind; cancel at both the
provider and the UI; a free key test; the composer gated until saved **and** tested; all four
result actions, session history, Edit prompt; alt required before use; the brand toggle sending
only palette hex and never the logo or footer; an id in the design and never bytes; the export
free of `data:` and `blob:`; `AI_IMAGE_NOT_HOSTED`, `AI_IMAGE_MISSING_DRAFT` on both a design
import and a saved-block insert, stable ids, and the never-accuse-before-looking rule.

## Feature 5A — amendment: AI settings and per-provider keys — done (2026-11-03)

### The bug

`AiImagePanel` chose between setup and chat with one expression — `!configured || !tested`
— and both flags were seeded **once** from `loadKey()` on mount. A saved key therefore put
the panel straight into chat with no route back, and the only **Remove key** button lived
inside the setup view it could no longer reach. Once configured, the key was unchangeable
short of clearing site data.

### What changed

**Settings are now a view, not a state.** `view: 'chat' | 'settings'` is independent of
whether a key exists, and a ⚙ in the panel header toggles it from either side. Returning to
chat keeps `turns`, because the session has always lived in panel state. Configuring the
*active* provider still lands on the chat, which is the first-run path; configuring any other
leaves you in settings, where you were.

**One key per provider.** `key-store.ts` moves from a single global slot to
`email-builder:aikeys:v2`, holding `{ activeProviderId, byProvider: { [id]: { model, key } } }`
— still one storage key, so there remains exactly one place a secret can be and one thing a
wipe has to clear. Remember-on-device is per provider: remembering OpenAI does not quietly
remember another. A v1 record migrates into its provider's slot on first read and the old key
is deleted, so an existing configuration keeps working.

**Status and actions per provider.** `Not configured` / `Configured` / `Connected`, where
*Connected* comes only from a passing Test connection **this session** — a remembered key is
`Configured` until proven, rather than trusted because it is on disk. Each provider offers
Add/Replace key, Test connection, Set as active and Remove key.

**A replacement must prove itself.** The draft key lives in component state and
`saveKey()` is only called after `testKey()` resolves. A failed replacement leaves the stored
key untouched and nothing is written — there is a test that asserts the rejected key never
reaches localStorage.

**Switching or removing cancels, but does not forget.** Both abort any in-flight generation
through the existing `AbortController`, keep the session messages, and gate the composer on
the active provider being Connected. Removing the active provider's key falls back to the
first other Connected provider, else leaves none active and the composer disabled with a
message saying why. The chat header always reads `Provider: <name> / <model>`.

### A real bug the tests caught

The first version set the active provider **only through the persisted record**. A key saved
without *Remember on this device* persists nothing, so `activeProvider()` returned null, the
composer never unlocked, and every UI test timed out. The active pointer is now set in memory
as well as on disk, so a session-only key works exactly like a remembered one.

### Not done

The brief's item 3 — a second real provider — is **not built**. `<NEW PROVIDER>` arrived as an
unfilled placeholder, and the adapter cannot be written without the real model names, auth
header and request shape, nor can the browser CORS check that decides whether it is possible
at all. The multi-provider behaviour is nonetheless proven: `ai-providers.test.tsx` mocks the
registry with two fake adapters built on the unchanged `ImageProvider` interface. Adding a
real one remains one file plus one registry entry.

### Tests

`src/test/ai-providers.test.tsx` (8, new) plus rewrites of the key-store block in
`ai.test.ts` and the setup flow in `ai-ui.test.tsx`. Suite: **710 passing** (was 694),
`tsc --noEmit` clean. No real API calls.

Covered: settings reachable from the chat once configured; the provider list with per-provider
status; two keys side by side with independent remember flags; removing one leaving the other;
the active pointer surviving a reload and clearing when its provider is removed; v1 migration;
a failed replacement keeping the old key and storing nothing; removing the active key disabling
the composer; switching the active provider cancelling an in-flight generation while keeping
the messages; and a sweep proving **two** providers' keys appear in no design, brand, saved
block, library record, issue, export, error string, DOM text, or any storage key but the one.

## Feature 5A — amendment: OpenAI error mapping — done (2026-11-03)

Errors were classified by HTTP status alone, so every 401 and 403 collapsed into one
"That API key was rejected" — which is wrong advice for a 403 about an unverified
organization, and actively misleading for a 429 that means "no credit" rather than
"slow down". Mapping is now by status **and** `error.code`:

| Response | Result |
|---|---|
| 401 (any code) | `invalid-key` — "OpenAI rejected the key. Check for typos or extra spaces, or create a new key." |
| 403 | `forbidden` — OpenAI's own `error.message`, with the hint "This key or organization may not be allowed to use this image model." |
| 429 `insufficient_quota` | `no-credit` — "No API credits. Add billing credit in your OpenAI account." |
| 429 otherwise | `rate-limit` — unchanged |
| `content_policy*` at any 4xx | `content-policy` — unchanged |
| 5xx | `network` |
| anything else | `bad-response` — "OpenAI error (404): The model does not exist" |

`AiError` gained an optional message override and the two new kinds; the panel now renders
`detail` as a second line, which is how the 403 hint reaches the screen.

### Showing a provider's words without showing a secret

Two of those cases surface OpenAI's own `error.message`, which reverses a deliberate earlier
decision never to show provider body text — there was a passing test proving an echoed key
could not reach the user. Rather than drop that guarantee, provider text now goes through
`redactKeys(message, key)` before it is shown: the exact key just sent is replaced, and so is
anything else key-shaped (`sk-`/`rk-`/`org-`/`proj-` prefixes, and any `Bearer <token>`). The
leak test was widened to cover all six statuses rather than removed.

Keys are also normalised with `normalizeKey()` — every whitespace character stripped, not just
the ends — before saving and before every request. A pasted key with a trailing newline used
to fail with no useful explanation; an internal newline would have survived `.trim()`.

### A dead regex, caught by its own test

The first version of `redactKeys` had `\b` written into the file as a literal **backspace
byte** (0x08) rather than a word boundary, courtesy of shell escaping. The generic pass
therefore matched nothing and was silently dead — only the exact-key replacement worked. The
redaction test caught it. `src/` was then swept for other stray control bytes; there are none.

A second regression was caught the same way: narrowing the content-policy match from
`content_policy` to `content_policy_violation` dropped a case the previous code handled, and
an existing UI test failed on it. The looser match is restored.

### Tests

Suite: **715 passing** (was 710), `tsc --noEmit` clean. Nine new cases in `ai.test.ts`: one
per mapping, 403 with an empty message, the same classification from `testKey`, the widened
key-leak sweep across all six statuses, redaction of a key-shaped string that is *not* the one
sent, and an echoed `Authorization: Bearer` header.

## Feature 5A — amendment: draft rendering, composer keys, style presets — done (2026-11-03)

### 1. The draft image never rendered

**Root cause, one line:** `safeUrl()` (`src/lib/util.ts`) permits `http(s)`, `mailto:`,
`tel:`, `//`, merge tags and `data:image/...;base64,` — and returns `''` for every other
scheme. The canvas was handing it a `blob:` object URL, so `renderBlockInner` took its
`if (!src) return placeholder(...)` branch and drew "Image — select this block and add an
image" next to a badge claiming a draft was there.

What was *not* wrong, checked before changing anything: the `aiDraftId` is written to the
block correctly, and the blob is read back out of IndexedDB correctly. The canvas is also not
an iframe, so no sandbox was involved there.

Two further layers would have blocked `blob:` even with `safeUrl` widened, which is why the
fix is `data:` rather than admitting `blob:`:

- DOMPurify's `IS_ALLOWED_URI` has no `blob:`, so it strips the attribute (`purify.cjs.js:956`).
- The Preview iframe is sandboxed **without** `allow-same-origin`, so a parent-origin `blob:`
  can never load inside it at all.

Both layers already accept `data:` unchanged — `safeUrl` whitelists it, and DOMPurify allows
`data:` on an `img src` because `img` is in its default `DATA_URI_TAGS` (`purify.cjs.js:2165`).
Two tests now pin exactly this, so the next person does not have to rediscover it.

**The fix.** `draftDataUrl(id)` in `src/lib/drafts.ts` converts a draft once and caches it by
id; `useDraftImages` (`src/components/useDraftImages.ts`) is the single loader shared by the
canvas and the preview. `OutputOpts.draftImages` carries the result into `substituteDraft()`,
which writes the bytes when a map is supplied and `AI_DRAFT_PLACEHOLDER_URL` when it is not.
**Only the canvas and the preview ever supply one**, so an exported document cannot carry
image bytes by construction rather than by anyone remembering the rule. Removing a draft
evicts its cached copy.

All five holders — Image, Hero image, Hero card, Article item, Header logo — failed for that
one reason and are fixed by that one change; each has its own test.

The Preview caption now reads *"…except AI drafts, shown here locally. The export ships a
placeholder until you host them."* and only when the design actually holds one, because
showing the draft there would otherwise make the old caption a lie.

*Cost accepted:* a 1024px PNG is ~1–2 MB, so its base64 is ~1.4–2.7 MB held per draft. One
conversion per id, one splice per change.

### 2. Composer keys

Enter sends, Shift+Enter inserts a newline, and `event.isComposing` returns early so the
keystroke that commits an IME candidate is never a send. `send()` returns whether it
dispatched, and the composer is cleared only then — a blocked validation leaves the text
alone. The 2 s floor, the one-in-flight guard, **Edit prompt** and **Regenerate** are
unchanged.

### 3. Style presets, model and quality

`src/lib/ai/styles.ts` holds None / Cinematic elegant (default) / Corporate clean / Minimal.
The suffix is appended at send time only, so the composer keeps the user's own words and
round-trips through Edit prompt; the result card names the style. Order is
`prompt + style + brand`, so **Brand colours** still stacks on top.

**Checked against the current OpenAI spec rather than assumed:** `gpt-image-2` is already a
listed model id, so it simply becomes the first entry and therefore the default;
`quality` is documented as supporting `low`/`medium`/`high` across the GPT image models, which
is exactly the selector offered (low labelled **Draft**, default **high**); there is no
gpt-image-2-specific parameter, and `size` / `output_format` are unchanged. `quality` is
omitted from the body entirely when unset.

*Note:* `gpt-image-2` costs more per image than the previous `gpt-image-1-mini` default. Draft
quality is the cheap path for iterating.

### Two test assertions that were wrong

- `expect(prompt).not.toContain('logo')` was a sloppy proxy for "no brand asset is sent" — the
  Cinematic suffix legitimately contains "no logos". It now asserts no URL and no brand name.
- A cancel test asserted the Generate button was enabled afterwards; clearing the composer on
  send correctly disables it. It now asserts the composer is enabled and empty.

### Tests

`src/test/ai-draft-render.test.tsx` (17, new) plus composer and style blocks in
`ai-ui.test.tsx`. Suite: **741 passing** (was 715), `tsc --noEmit` clean.

Verified in a real browser with a byte-checked 16×16 red PNG seeded into IndexedDB: the image
renders on the canvas with the AI-draft badge and no placeholder text, the Preview carries the
bytes and the amended caption, and the same design exports at 3,957 characters with
`placehold.co` present and **no** `data:`, `blob:` or draft id. Console clean.

## Feature 5A — amendment: failure diagnostics and the gpt-image-2 request — done (2026-11-03)

### "reply was not JSON" told you nothing

A non-JSON or unusable reply now reports what was asked and what came back: HTTP status,
`Content-Type`, elapsed seconds, and the model / quality / size that were sent, followed by
the first 200 characters of the body as plain text — tags stripped, `<script>` and `<style>`
contents dropped, whitespace collapsed, and keys redacted on the way through. The friendly
sentence is the message; the facts are the detail line beneath it.

Three cases are named rather than left generic:

| Response | Message |
|---|---|
| 502 / 503 / 504 / 524 | "OpenAI gateway timed out. The image may still have been generated and billed; check your OpenAI usage before retrying. Try medium quality or a smaller size." |
| `Content-Type: text/html` (any status) | "A proxy or firewall returned a web page instead of the API reply." |
| empty body | "The API returned an empty reply." |

HTML is detected by content type *or* by a leading `<!doctype`/`<html>`, because a captive
portal is perfectly capable of answering 200 with a login page.

**The elapsed counter** now ticks in the loading card — "Generating… 12s" — which is the
difference between a slow model and a hung one.

### The retry had to go, and the docs said why

`generate()` carried an auto-retry: a 400 re-issued the request at a fallback size. That is
exactly the double-bill risk this amendment forbids, and checking the current spec showed it
was papering over a real bug rather than being defensive.

**What the spec says:** `gpt-image-2`, its dated snapshot and the 2.5 variants accept an
arbitrary `WIDTHxHEIGHT`, *"for example 1536x864"*, with both sides divisible by 16, a ratio
between 1:3 and 3:1, and a 3840x2160 ceiling. Other models take the documented set only.

**What was wrong:** the 4:3 map emitted **`1365x1024`**, and 1365 is not divisible by 16. So
4:3 was rejected on every model and the retry silently downgraded it to 3:2 — the feature
appeared to work while never once producing a 4:3 image.

**Fixed:** 4:3 is now `1360x1024` (the nearest multiple of 16), a custom size is sent only to
models that document one, everything else gets the nearest documented size, and the retry is
deleted. One request per generation, always. A test walks every model × every aspect × three
block widths and asserts each size satisfies all three documented constraints.

Also checked and found already correct: `response_format` is never sent (deprecated and
unsupported for GPT image models), `output_compression` is never sent (valid only with
webp/jpeg, and we ask for png), `n: 1` and `output_format: 'png'` are supported, and `quality`
is omitted entirely when unset so the model picks its own default.

### Security

The diagnostic never contains the key, the `Authorization` header or any request header — only
the status, content type, timing, the three request parameters and the body snippet. The
snippet goes through `redactKeys()`, whose `{8,}` pattern is stricter than the `sk-[A-Za-z0-9_-]{10,}`
asked for and also covers `rk-`/`org-`/`proj-` and any `Bearer` token. A test feeds back both
the key in use and an unrelated `sk-` string and asserts neither survives.

### Tests

Suite: **751 passing** (was 741), `tsc --noEmit` clean. New: an HTML page at 200 and at each
gateway status, an empty body, a non-JSON body truncated at exactly 200 characters, a
well-formed JSON error, a valid image, the model/quality/size/elapsed facts in every
diagnostic, redaction of two different keys, no-retry-on-failure, the per-model size mapping,
the all-models size-constraint sweep, and the exact request-body key set with and without
quality.

## Feature 6A — Generate email from a brief — done (2026-11-05)

### Three corrections to the brief, found during research

**"5C" does not exist** — only 5A plus its four amendments. Every "5A/5C" reference in the
brief is read as 5A. **There are 8 presets, not 5** (`newsletter`, `promotional`,
`product-launch`, `welcome`, `cold-outreach`, `event`, `order`, `digest`) — the slot system
below is generic (a classification table keyed by block *type*, not per-preset hand-written
paths), so supporting all 8 cost nothing extra. **`gpt-4.1-mini` is a generation behind.** The
live `openai-node` SDK's current small/fast tier is `gpt-5.4-mini` / `gpt-5.4-nano` /
`gpt-5.1-mini`; `gpt-4.1-mini` stays selectable but isn't the default. Default is
**`gpt-5.4-mini`**, deliberately non-reasoning — a reasoning model (`o3-mini` etc.) can spend
its whole output budget on hidden reasoning and return an empty message, which a
strict-JSON-schema call cannot recover from.

### The gate, checked rather than assumed

```
OPTIONS https://api.openai.com/v1/chat/completions
access-control-allow-headers: authorization,content-type
access-control-allow-methods: GET, OPTIONS, POST
```

Same two-header budget the image adapter already uses. `response_format: { type: 'json_schema',
json_schema: { name, schema, strict: true } }` on `POST /v1/chat/completions`, `max_completion_tokens`
(not the deprecated `max_tokens`). Verified against the SDK source, not guessed.

### Slots: derived, not hand-written per preset

`slots.ts` walks whatever `preset.build(brand)` actually produced and classifies each block by
**type** against a small lookup table (`heading.text`, `text.html`, `button.label`,
`hero.{eyebrow,heading,subtext,ctaLabel}`, the `hero.cards[]` and `articles.items[]` repeaters).
A field is **required** exactly when the preset's own default copy for it is non-empty — a
preset author filling in placeholder text is itself the signal "this field matters here." AI
never touches `footer`, `divider`, `social`, `menu`, `video`, `html`, logos, or `hero.bgImage`.

**A bug found by testing, not by reading the code**: `createBlock('hero')` always populates a
default two-item `cards` array, but `render.ts` only ever draws it when `layout` is
`cards-2`/`cards-3` — every other layout (which is 7 of the 8 presets) silently ignores it. The
first version of `buildSlotSchema` exposed that dead array as an AI slot whenever it was
non-empty, which is always, so AI would have been asked to write hero-card copy that could
never appear in the email for `newsletter`, `promotional`, `welcome`, `event`, `order`,
`digest` and `cold-outreach` (no hero at all). Fixed with an `appliesIf` predicate on the
repeater table entry, gated on the same `layout` check `render.ts` uses; `product-launch` (the
one `cards-3` preset) is the only one that now exposes it. A regression test asserts every
preset's hero repeater (if any) has `layout` matching `cards-2`/`cards-3`.

A user-supplied CTA label (or URL) removes the matching `cta_label` slots from the schema sent
to the model entirely — `writeBriefDraftOntoDesign` re-derives the schema with
`ctaLabelProvided: false` against the same design afterward, purely to find which blocks those
fields live on, and writes the user's own text/URL there directly. AI is never asked for a CTA
it wasn't going to use.

### Safety: validation is a separate, offline-testable pass

`brief-validate.ts` runs after `JSON.parse`, independent of the provider call. HTML tags
stripped, markdown tokens stripped, bare URLs stripped, merge tags dropped unless on the
3-tag allow-list (`first_name`, `last_name`, `company`), bracket placeholders (`[add date]`)
left alone on purpose — that's the intended missing-fact signal. Any field over its budget
**rejects the whole response**; there is no partial-repair and no auto-retry anywhere in this
path, matching 5A's own precedent.

**A real bug found empirically**: the first sanitizer stripped bare `_`/`__` as markdown
italics, which turned `{{first_name}}` into `{{firstname}}` *before* the allow-list check ran —
so a legitimate merge tag silently vanished. Fixed two ways: bare underscores are no longer
treated as markdown at all, and allowed merge tags are now swapped for a placeholder marker
*before* any other stripping pass runs, then restored at the end — so nothing later in the
pipeline (now or added later) can corrupt one while cleaning up everything else around it.

Prompt-injection defence is two-layered: the brief and source text are wrapped in named
`===== BEGIN/END =====` delimiters with an explicit "this is data, not instructions" system
prompt clause, and — the mechanical backstop — `strict: true` JSON-schema mode constrains the
model's output at the token level to the declared shape, so injected text cannot add fields or
escape the schema regardless of what it asks for.

### What's sent, and what never is

Brand name, brand voice (`description`/`wordsToUse`/`wordsToAvoid`), the brief's own fields,
and the slot guide (ids and character limits). Never the API key, logos, footer/address data,
or any other saved email content. First use shows a consent line — "Your brief and `<brand>`'s
brand voice are sent to OpenAI" — gated per provider by `text-consent.ts`, independent of any
image-generation consent.

### Review, Create, and what persists

`generateBriefDraft` builds a **fresh** `preset.build(brand)`, resizes the first `articles`
block to the brief's item count, and returns a draft the review screen reads from without
writing anything yet — so "Regenerate" costs one model call, not a design mutation plus a
rollback. `writeBriefDraftOntoDesign` only runs once "Create email" is pressed, writing onto
that same fresh design; the preset catalog object itself is never touched (a test rebuilds the
preset afterward and asserts its defaults are unchanged).

The generated `BriefRecord` rides on `SaveOptions.brief` through `saveEmail()` exactly like
`name`/`autoSaved` already do, so it sticks to the record from the first autosave onward without
a special first-save path. `SavedTemplate.brief` drives the Templates list's **AI draft** badge.

### Checks

Two new rules in the 3A engine, same `Issue`/`id()`/`add()` shape as everything else there:
`AI_DRAFT_UNREVIEWED` (warning, quick action **Mark as reviewed**, clears via `markReviewed()`
in the store) and `BRIEF_PLACEHOLDER_LEFT` (warning, one issue per distinct `[bracket]` found
by walking every block's text fields — excluding `href`/`src`/`id` fields and the `[% tag %]`
merge-tag bracket format, so a real merge tag is never mistaken for a missing fact).

### Known gaps

- **Tone and brand voice both reach the prompt, but tone is never auto-picked from voice.**
  `brand.voice.description` is freeform text, not one of the 5 tone values, so there's no clean
  mapping — the form shows the brand's voice description as context next to the tone picker
  instead of guessing an enum value from prose.
- **No "Open in AI image panel" handoff** from a suggested image prompt — Copy is there, the
  cross-panel handoff was explicitly deferred by the plan as non-blocking.
- **The text-model choice is session-only** (component state, not persisted) — unlike the image
  provider's stored `model` field, which was deliberately *not* reused here so one panel's
  choice can't silently clobber the other's.
- **CTA URL applies to every `cta_label`-kind slot the preset exposes** (e.g. both a hero CTA
  and a separate CTA-band button), not to a single named "the" CTA field — the brief only gives
  one URL, and the alternative (asking which button it belongs to) seemed like more friction
  than the feature is worth for emails that mostly have one real call to action anyway.

### Tests

New: `brief-slots.test.ts` (24), `brief-validate.test.ts` (18), `brief-generate.test.ts` (13),
`brief-misc.test.ts` (6), `brief-storage.test.ts` (8), `brief-store.test.ts` (6),
`brief-checks.test.ts` (10), `brief-orchestrate.test.ts` (12) — **97 new**. Suite: **848
passing** (was 751), `tsc --noEmit` clean. No real API calls anywhere — the provider adapter is
tested against a stubbed `fetch`, and the orchestration layer against a stubbed `TextProvider`.

Covered: slot/schema derivation across all 8 presets with every field's `maxChars` budget
respected and the hero-cards gating bug above; the full JSON-schema shape OpenAI's `strict`
mode requires; oversized and malformed responses rejected without retrying; HTML/markdown/URL
stripping; the merge-tag allow-list including the underscore bug above; a prompt-injection
string in the brief leaves the parsed shape unchanged; the exact chat-completions request body
(model, messages, `response_format`, `max_completion_tokens`, never `max_tokens`); every error
status mapped the same way the image adapter's is; the key never appearing in a thrown error
even when the provider echoes it back; `Create` producing fresh ids with the preset catalog
untouched; the brief persisting through `saveEmail`/`findTemplate` and tolerating a corrupted
stored record; `AI_DRAFT_UNREVIEWED` firing and clearing through the real store action;
`BRIEF_PLACEHOLDER_LEFT` detecting a bracket per block while ignoring href/src/id fields and
`[% tag %]`; the Auto preset picker resolving every goal to a real preset id; and the text
consent flag being per-provider and tolerant of corrupt storage.

## Feature 7A — Profile bar and Settings hub — done (2026-11-05)

### What this replaces

Every "settings" in the app was scattered: brand management only reachable from the top bar,
AI keys buried inside the AI image panel's own gear icon, merge-tag/UTM/dark-mode defaults
living as per-email fields with no global default, no single place to see storage usage or
back up data, and no concept of "who did this" at all — `createdBy`/`updatedBy` on
`SavedTemplate`/`Brand` were permanently-`null` stubs from 1A. 7A adds one consolidated,
internal (no login, no roles) home: a profile bar fixed to the bottom of the left panel, and a
Settings hub that takes over the left panel's content area when open.

### Identity, finally real

`src/lib/user.ts` is new — `getCurrentUser()`/`setDisplayName()`, one namespaced storage key,
default display name `"Guest"`. `storage.ts`'s `saveEmail()` and `brand.ts`'s `emptyBrand()`
(the real creation path; the `veeBrand()` seed and `normalizeBrand()`'s reading logic are left
untouched, so an old record's `createdBy` is read exactly as stored, never silently
overwritten) now stamp the current display name instead of `null`. Deliberately does **not**
import `storage.ts`'s `writeSafe` — `storage.ts` itself now calls `getCurrentUser()`, and a
two-way import between the two would be a real circular dependency, not a theoretical one; a
profile record is a few dozen bytes, not worth pulling in the quota-pruning machinery to avoid.

### The panel restructure

The left panel's single scrolling `<aside>` splits into a fixed-width shell (`w-64`, widening
to `w-[360px]` with a CSS transition while Settings is open) containing either the existing
tabs+content in their own scroll region, or the new `SettingsHub`, plus a `ProfileBar` as a
non-scrolling sibling pinned to the bottom by flexbox — visible on every tab and while Settings
is open. Opening Settings snapshots `{ tab, scrollTop }` in a ref; closing restores both.
Narrow viewports get the hub as a `fixed inset-0` sheet via a `max-md:` Tailwind variant — the
first responsive behaviour anywhere in the app's own chrome, since none existed to reuse.

`SettingsHub.tsx` is a two-level list/section stack: Escape inside a section goes back to the
list; Escape at the list closes the whole hub. Seven sections, each a thin wrapper around
existing logic rather than a second implementation: **Profile** (new), **AI** (wraps
`AiImagePanel.tsx`'s own `SettingsView` — exported, zero logic change, so the AI panel's own ⚙
and this section show literally the same component and the same `key-store.ts` state — see 6B
below for what was added on top), **Brands** (the existing `BrandsModal`, launched as a button,
plus a new "default brand for new emails" picker), **Email defaults** (new —
`src/lib/email-defaults.ts`), **Checks** (new bulk-reset UI over the existing
`ignoredIssues`/`unignoreIssue`/`listIgnored`/`saveIgnored`), **Data & storage** (new —
`src/lib/backup.ts` / `src/lib/clear-all.ts`), **About** (new).

### Email defaults apply once, at creation, never to what already exists

`applyEmailDefaults(design, defaults)` is a pure overlay, called only at `NewEmailModal.tsx`'s
three design-creation call sites (preset pick, blank, and 6A's brief "Create") — never inside
`defaults.ts`/`presets.ts`. Before any customisation, the stored defaults are exactly
`defaultBody()`'s own baked-in values, so a brand-new email behaves identically to before 7A
until someone actually changes something in the Email defaults section. An already-open or
already-saved email is never touched, by construction rather than by a special case.

### Full backup, and what it will never contain

`exportBackup()` gathers brands/templates/saved blocks/image library/versions into one JSON
object via the existing `list*()` readers. It never imports `key-store.ts` or `drafts.ts` at
all — a reviewer can confirm the key can't leak from its export path by reading its import
list alone — which is why "clear all local data" (the one place allowed to touch both) lives
in a separate file, `clear-all.ts`, instead. Import validates shape by re-running each record
through the same `normalize*()` functions a normal app load already uses — a malformed
individual brand or email is dropped, not a reason to fail the whole restore — and only writes
after the caller shows a summary and the user confirms. The danger zone requires literally
typing `DELETE` before "Clear all local data" is enabled, and that action also clears the
remembered AI key and every IndexedDB draft, then reloads.

### Cross-component navigation, 5A's own pattern reused

Nothing new here, but worth noting since 6B's "Open AI settings" button depends on it: 5A
already solved "a deeply nested component needs to open a top-level panel" with
`registerAiPanel` (a module-level callback registry in `fields.tsx`). 6B's
`src/components/settings/settings-nav.ts` is the same pattern applied to the Settings hub —
see the 6B entry below.

### Known gaps

- **"Default brand for new emails"** only pre-selects in the New email dialog's own brand
  selector (via the same `setBrandId` mechanism the dropdown already used) — it does not change
  `useActiveBrand()`'s continuity-based behaviour for the currently open email.
- **No mobile testing beyond the CSS breakpoint itself** — the `max-md:` sheet is implemented
  and type-checks, but hasn't been driven through an actual narrow-viewport browser session.

### Tests

New: `user.test.ts` (10), `email-defaults.test.ts` (8), `backup.test.ts` (13),
`profile-settings.test.tsx` (14) — **45 new**. No real API calls, no real file I/O beyond what
`writeSafe`/`localStorage` already do in-memory under jsdom.

Covered: the bottom bar's initials/colour/truncation/tooltip and the one-time name hint;
display name persisting across a reload and feeding `createdBy`/`updatedBy`; Settings
open/close restoring the exact tab and scroll position; Escape stepping back one level at a
time, not closing the whole hub from inside a section; every section rendering; email defaults
applying only to a freshly built design and never touching one already built; a full backup
round-tripping through JSON, containing zero key material and tolerating a malformed individual
record; import never writing without a confirm step; clear-all wiping every `email-builder:*`
key plus IndexedDB drafts.

## Feature 6B — per-task model routing — done (2026-11-05)

### What existed before this, precisely

One global "active provider" plus one model string stored *per provider* (never per feature)
in `key-store.ts`. 5A's image panel read that stored model; 6A's brief generator ignored it
entirely and hardcoded `OPENAI_TEXT_MODELS[0]` straight into `NewEmailModal.tsx`. Nothing
distinguished "the model text generation should use" from "the model image generation should
use," and nothing let either change without touching the other. There was also no fallback-
chain code anywhere — "5C," which the brief asked to reuse the chain UI/rules from, does not
exist in this codebase, the same non-existent feature 6A and 7A's own research already found.

### Both requested defaults were stale enough to be non-functional

Checked live against OpenAI's current docs rather than guessed, per the brief's own
instruction. `gpt-4.1-mini` and `gpt-image-2` are both gone from the current lineup — not
merely outdated, genuinely invalid model ids today. Current: **`gpt-6-luna`** (the non-
reasoning small/fast tier recommended for structured-output work — `gpt-6.1-terra`/`6.1-sol`
are reasoning models, exactly the empty-reply failure mode 6A already designed around) and
**`gpt-image-2.6-flare`**/`-sunburst` (the `2.6` generation; plain `gpt-image-2` isn't
documented as a current id at all). Confirmed with the user before defaulting
`text.brief`/`image.generate` to these instead of the literal (non-working) ids named in the
brief. `OPENAI_TEXT_MODELS` and `OPENAI_MODELS` both gained the new entries as their new first
(default) position, with every older generation kept selectable — nothing already configured
breaks. `openai.ts`'s `ARBITRARY_SIZE` regex (which decides whether a model takes a custom
`WIDTHxHEIGHT`) needed widening from matching only `2`/`2.5` to any `2.x`, or the new `2.6`
models would have silently been sent the wrong image sizes.

### The task registry and the one function every call goes through

`src/lib/ai/tasks.ts`: `AiTaskId = 'text.brief' | 'image.generate'`, a plain string union —
adding a third task later is one new id and one new `AiTaskDef` entry, nothing else.
`providersFor(capability)` derives the capability-filtered provider/model list straight from
the existing `PROVIDERS`/`TEXT_PROVIDERS` arrays and their own `models` lists — no change to
the `ImageProvider`/`TextProvider` interfaces was needed for "providers declare which
capabilities/models they support," since that already fell out of which registry a provider is
in. `src/lib/ai/task-settings.ts` stores one `TaskRoute` (provider, model, options, an ordered
fallback chain) per task, under its own storage key, with the same normalize-on-read defensive
pattern `email-defaults.ts` established — and the same reason it skips `writeSafe`: a routing
record is tiny, and importing `storage.ts` here would risk the same circular-dependency shape
`user.ts` already avoided.

`src/lib/ai/run-task.ts`'s `runTask<T>(taskId, input)` is genuinely one function, typed per
task via a small lookup so each call site gets the right input/output shape with no `any` at
the boundary. It enforces a **per-task** (not global) one-in-flight guard and the existing 2s
floor via a module-level map keyed by task id — centralised here rather than duplicated as a
ref in every consuming component, which is what makes "a brief generation in flight never
blocks an image generation" true by construction. On a `network`/`timeout`/`rate-limit`-
classified failure it tries the next entry in the task's fallback chain, skipping any candidate
with no configured key; on anything else — a bad response, a content-policy refusal, an
invalid key, no credit — it stops immediately, since trying a different model on the same
account wouldn't fix any of those. This is a deliberate, user-configured fallback *sequence*,
never the blind same-request retry 5A already ruled out.

`create-from-brief.ts`'s `generateBriefDraft` no longer takes `provider`/`key`/`model` at all —
it calls `runTask('text.brief', …)` internally. `AiImagePanel.tsx`'s `run()` does the same for
`'image.generate'`, with the per-generation Quality selector (Draft/Medium/High) now passed
through as an explicit per-call override that wins over the task's configured default quality
when given — a real regression caught before it shipped: routing options are task-level
*defaults*, not a replacement for a choice the UI already exposed per generation.

### Test connection, split exactly as asked

Text: a real, tiny, cheap probe (`testTextModel` in `openai-text.ts`) — a one-field schema, a
~20-token budget — through the exact same request path and error classification the real calls
use, so it proves the *specific model id* is callable, not just that the key works. Image:
`verifyModelListed` in `openai.ts` reuses the existing key-only `GET /v1/models` check (already
how `testKey` worked — confirmed it never touches the generation endpoint) and additionally
checks whether the selected model id is in the returned list; a key that works but doesn't list
the model reads as "Not verified until first use," never a hard failure and never a generation.

### The UI

`AiSection.tsx` keeps the existing `SettingsView` for raw key entry/Test/remove exactly as it
was, and adds "Models per task" beneath it: one row per task with a capability-filtered
Provider select, a Model select plus the "Other model id" free-text toggle (this didn't exist
anywhere before 6B either — added as the small new control the capability-filtered dropdown
description implied was already there), the task's own quality/temperature option, a status
chip, its own fallback-chain editor, and — for the text task only — the existing consent flag
from 6A.

**Two controls had to come out of `SettingsView`, for the same reason.** Once
`task-settings.ts` is authoritative for routing, its old per-provider Model `<select>` and its
**"Set as active" button / ACTIVE badge** both stopped affecting anything a real call used.
The Model select was obvious and removed up front; "Set as active" was caught later, by the
full suite — `ai-providers.test.tsx` has a two-provider mock and a test that switched the
active provider mid-generation and expected the in-flight call to reroute. Under per-task
routing that can't happen by design: which provider a task uses comes from its own route, not
from a global "currently active" pointer a user could swap underneath a running generation.
Leaving the button would have been a second, now-misleading place to pick a provider — exactly
the problem the Model select had. `activeProvider()`/`setActiveProvider()` stay in
`key-store.ts`: they're now purely an upgrade-path artifact, read once by the migration above.

`BriefForm`/`BriefReview`
(the brief form footer and review screen) and `AiImagePanel`'s header all show "Text model: …"
/ "Image model: …" read from the task's current route, never a local constant. When a task
isn't ready (no key, or not Connected this session), the brief form and the image composer
show an inline message with an **Open AI settings** button instead of enabling Generate.

That button is `src/components/settings/settings-nav.ts` — the same "a nested component needs
to open a top-level panel" hole 5A already solved with `registerAiPanel` in `fields.tsx`,
applied to 7A's `SettingsHub`: `LeftPanel.tsx` registers itself once on mount (re-registering
whenever its active tab changes, so a later external open always restores the *current* tab,
not one captured at mount), and the button just calls `openAiSettings()`. For the brief form —
mounted inside a full-screen modal that covers the left panel — the handler also closes the
modal first, or the hub opening underneath would be invisible.

### Security

Unchanged in substance, extended in reach: keys still never leave `key-store.ts`, still never
appear in a URL, a thrown error, or an export — now proven specifically through `runTask`'s own
error path (a provider echoing the key back in an error body still gets redacted) and through
`task-settings.ts`'s stored routes (provider id and model string only, migration never copies
the key itself).

### Known gaps

- **Task settings aren't reactive across components.** `AiSection` (left panel) and
  `AiImagePanel` (right panel) are separate trees with no shared subscription, so changing a
  task's model in Settings while the image panel is open won't update that panel's header until
  it re-renders for some other reason. `ready`/`model` are deliberately *not* memoized so every
  render re-reads fresh — which closes the correctness hole (a generation never fires on a
  stale route the user has already changed) and leaves only a cosmetic one. A proper fix is a
  zustand slice or a pub-sub for task settings; disproportionate to one rare both-panels-open
  case, so it's a documented gap rather than a built abstraction.
- **The 2.6 image models inherit 2.5's size rules.** `ARBITRARY_SIZE` was widened to any `2.x`
  so `gpt-image-2.6-*` is treated as custom-size-capable like its predecessors, but 6B did not
  re-certify every size/quality parameter of the new generation against the docs — that's 5A's
  adapter surface, not per-task routing, and re-verifying it would have been scope creep.
- **"Other model id" is unvalidated by design.** A typed model id is sent as-is; the capability
  filter only governs the dropdown. Text tasks will surface a bad id on Test connection (a real
  call); image tasks will read "Not verified until first use," which is the honest answer.
- **The fallback chain is only as useful as the provider roster.** With one registered provider
  today, a chain is really "same key, different model." The data model holds multiple providers
  for when a second one is added; nothing about it is provider-specific.

### Tests

New: `ai-tasks.test.ts` (10), `ai-task-settings.test.ts` (10), `ai-run-task.test.ts` (17),
`ai-task-ui.test.tsx` (9) — **46 new**, on top of 7A's 45. Combined with the 6A baseline (848)
and one test deleted below (now obsolete by design, not broken), the full suite stands at
**935 passing**, `tsc --noEmit` clean. Existing `ai.test.ts`, `brief-generate.test.ts`,
`brief-orchestrate.test.ts` and `ai-ui.test.tsx` updated for the new defaults and the
`provider`/`model`-param removal from `generateBriefDraft`; `ai-ui.test.tsx` also needed
`resetGuardsForTests()` added to its `beforeEach` — `run-task.ts`'s per-task guard is
module-level, so without an explicit reset one test's throttle/in-flight state was leaking into
the next, which is exactly the kind of thing that would have been invisible without actually
running the suite rather than assuming the refactor was safe. No real API calls anywhere —
mocked `fetch`, same as every existing AI test file.

`ai-providers.test.tsx` (the two-provider mock) needed the most rework, and was worth keeping:
its real subject — two keys, independently stored, neither ever leaking — is unchanged, but
every test that drove a *generation* had to learn the new two-step reality, since a configured
key alone no longer makes a task ready. A `routeImageTaskTo(providerId, model)` helper points
`image.generate` at a mocked provider first, which is exactly the extra step a real user now
takes in Settings > AI. One test was deleted rather than repaired (mid-flight active-provider
switching, which no longer exists as a user action), and one assertion flipped into a better
one: configuring a key and seeing the task *stay* not-ready is now the correct, documented
behaviour.

Covered: `runTask` resolving the right model per task and changing one task's route leaving the
other untouched; a text-only model structurally unable to appear in the image task's dropdown
and vice versa; `runTask` always dispatching to the capability-matching endpoint even given a
deliberately misconfigured route; migration seeding `image.generate` from the old active
provider/model as a one-time, persisted snapshot (not a live mirror — a later key-store change
doesn't retroactively move it) while `text.brief` takes its coded default; a missing/
unconnected key calling `fetch` zero times; the fallback chain triggering only on network/
timeout/rate-limit and never on a validation-class failure; a fallback candidate with no key
skipped silently; one-in-flight exclusivity per task, proven by two different tasks running
concurrently without blocking each other; the image test-connection path never touching the
generation endpoint; the key absent from a thrown error even when the provider echoes it back;
every Settings-hub task row rendering with the right default and status; and the live, manual
cross-component check (New email's "Generate from brief" → Open AI settings → lands on Settings
> AI with the right section open).

## Feature 6B — amendment: fixed defaults and a model-access status chip — done (2026-11-05)

### The defaults were overridden without being asked to be

6B's own research found `gpt-6-luna`/`gpt-image-2.6-flare` to be the current, verified-working
model ids and defaulted to them instead of the brief's literal `gpt-4.1-mini`/`gpt-image-2` —
flagged and confirmed with the user at the time. This amendment reverses that: **a default must
only ever be a model the user actually chose**, newest-available or not. `AI_TASKS['text.brief']
.defaultModel` is `'gpt-4.1-mini'`, `AI_TASKS['image.generate'].defaultModel` is `'gpt-image-2'`
— both still fully selectable models in `OPENAI_TEXT_MODELS`/`OPENAI_MODELS`, neither removed,
just no longer what a fresh install or "Reset to defaults" lands on. The newer ids stay listed
in the dropdown; a task's own route (never array position) has been the one thing that decides
"the default" since 6B, so this was a one-line change per task, not a redesign.

### A task now tells you when its model, specifically, is the problem

Previously every refusal just surfaced as a generic error in the chat/composer. Now
`src/lib/ai/model-access.ts` keeps a small session-only, per-task record of "this model was
just refused," and `run-task.ts`'s `isModelAccessError()` recognizes it from either signal the
brief named: a `403`, classified as `'forbidden'` already, or — since OpenAI answers an
inaccessible model with a `404` "model_not_found"-style body just as often, which `classify()`
has nowhere better to put than the generic `'bad-response'` kind — the message text itself
(`"do not have access"`/`"does not have access"`, matched for both of OpenAI's own phrasings,
plus `"access to model"`/`model_not_found`). `runTask()` records the denial on a matching
failure and clears it on the next success, for **both** capabilities — the same shared loop
already runs regardless of text or image, so this needed no capability-specific wiring.

Settings > AI's status chip reads `deniedModelFor(taskId, route.model)` on every render (same
"don't memoize, this is cheap and staleness is a correctness bug" rule the rest of 6B's UI
already follows) and swaps **"Connected"** for **"No access to `<model>`"** plus the hint
*"Choose another model or enable this one in your OpenAI project's Allowed models."* the moment
it matches. "Clear it when the model is changed" needed no explicit clear call at all: the
record is keyed to a specific model string, so switching away just stops it matching — and
switching back re-shows it, which is the more honest behaviour (a model denied five minutes ago
is probably still denied, not a blank slate).

### Test connection, tightened to match the brief's own split

Text already made a real, tiny, selected-model request (`testTextModel`, unchanged) — it now
also runs through the exact same `isModelAccessError`/record/clear logic a real generation
does, and a failure shows `message` **and** `detail` together rather than message alone, which
is what "show the exact error" meant here. Image still never generates — `verifyModelListed`
is unchanged — but its "model isn't listed" message is now the literal requested text: **"Key
OK, model access not verified until first use."**, replacing the looser "Not verified until
first use." from 6B's first pass.

### Security

Unchanged: `isModelAccessError` only ever inspects `AiError.message`/`.detail`, both of which
already passed through `redactKeys()` inside each adapter's `classify()` before the error was
constructed — this fix adds no new path a key could reach, only a new read of text that was
already safe.

### Tests

New: `ai-model-access.test.ts` (11 — the denial record's match/clear/switch-back behaviour,
`isModelAccessError` against both OpenAI phrasings and a `model_not_found` body, and `runTask`
recording/clearing a denial on a real mocked 403/success). Plus 4 more in the existing
`ai-tasks.test.ts` (the exact chosen defaults) and `ai-task-ui.test.tsx` (the image "Key OK…"
message, the text chip flipping to "No access to gpt-4.1-mini" with the hint visible, and the
chip clearing on a model change then recovering to "Connected" on a later successful test) —
**15 new**. One existing assertion per touched default (`ai-ui.test.tsx`, `ai-task-ui.test.tsx`
×6, `ai-run-task.test.ts` ×2) updated to the restored literal ids; `ai.test.ts`'s and
`brief-generate.test.ts`'s own model-*list* assertions (`OPENAI_MODELS[0]`/
`OPENAI_TEXT_MODELS[0]`) were untouched, since array order was never the default and this fix
didn't reorder either list. Full suite: **950 passing**, `tsc --noEmit` clean — no dedicated
lint script exists in this repo, `tsc --noEmit` is the only static-analysis gate and was run
throughout, not just at the end. No real API calls anywhere — mocked `fetch`, same as every
other AI test file.
