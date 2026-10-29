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
