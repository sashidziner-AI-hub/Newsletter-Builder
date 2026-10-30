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
