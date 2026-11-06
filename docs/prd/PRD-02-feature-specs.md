# Newsletter Builder — Product Requirements Document
## Part 2 of 4 — Section 5: Detailed Feature Specifications

> One spec per feature from the inventory in `PRD-01-overview.md` §4. Same `F-xxx` ids, not renumbered. Acceptance criteria are **Inference** (phrased from tested behavior; no formal Given/When/Then document exists in the repo) unless noted otherwise.

---

### F-001 — Canvas & editing core
**User story:** As the editor, I want to add, arrange, and edit blocks on a live preview canvas, so that what I see is exactly what will be exported.
**Trigger:** Any click/drag on the canvas or left-panel tiles; any keyboard shortcut.
**Flow:** Click/drag a tile from LeftPanel → `addBlock`/`insertBlock` (store action) → `commit()` pushes an undo step → canvas re-renders via the same `renderBlock()` used by export.
**UI behaviour:** Selecting a block/row shows its editor in RightPanel; a hidden Footer (showFooter off) still renders on canvas at reduced opacity with a "Hidden on send" badge, still selectable/deletable.
**Rules:** `commit()` is the single mutation gateway; rapid same-field edits (slider drag, typing) coalesce into one undo step within a 900ms window; undo/redo clears a stale selection if the selected block/row no longer exists; history capped at 100 steps (in-memory, not persisted).
**Edge cases:** Deleting the last block in the last row leaves an empty canvas (not a crash); undo past the start or redo past the end is a no-op (`canUndo`/`canRedo` guard the toolbar buttons).
**Error states:** None surfaced to the user — structural edits cannot fail (no network/storage call in the mutation path itself; persistence failures are handled separately by F-014).
**Dependencies:** F-002 (rows), F-003/F-004 (blocks), F-006 (brand resolution for live preview).
**Acceptance criteria:**
```
Given a block is selected
When Ctrl+D is pressed
Then a duplicate is inserted immediately after it and selected

Given 5 rapid edits to the same text field within under 900ms of each other
When Ctrl+Z is pressed once
Then all 5 edits are undone together, not one at a time
```

---

### F-002 — Row layouts & columns
**User story:** As the editor, I want multi-column rows with different ratios, so that I can lay out content side by side.
**Trigger:** Picking a layout tile in LeftPanel's Rows tab, or changing layout on an existing row in RightPanel.
**Flow:** `addRow(layout)` or `setRowLayout(rowId, layout)` → `applyRowLayout()` resizes the `columns` array.
**UI behaviour:** A visual ratio preview (proportional bars) on each layout tile; the row's content/background color fields distinguish "row background" (can bleed full width) from "content background" (confined to the content container).
**Rules:** Resizing to fewer columns merges the removed columns' blocks into the last kept column — content is never deleted by a layout change; `stackOnMobile` (default true) drives the exported mobile media query.
**Edge cases:** Resizing a 4-column row to 1 column concatenates all 4 columns' blocks into one, which can create a very long single column — accepted behavior, not flagged by Checks.
**Error states:** None.
**Dependencies:** F-001.
**Acceptance criteria:**
```
Given a row with 3 columns each containing 1 block
When the layout is changed to 1 column
Then the resulting single column contains all 3 original blocks, in order, none lost
```

---

### F-003 — Atomic content blocks
**User story:** As the editor, I want basic content primitives (heading, text, image, button, divider, menu, social, video, HTML), so that I can build any email layout from simple parts.
**Trigger:** Drag or click-to-add from LeftPanel's Content tab.
**Flow:** `addBlockSmart(type)` places the block near the current selection (or at the end of the last row, or creates a new row if the canvas is empty) → `createBlock(type)` applies type defaults.
**UI behaviour:** Each type has its own RightPanel editor (`HeadingEditor`, `TextEditor` using TipTap rich text, `ImageEditor` with the library picker, `ButtonEditor`, `DividerEditor`, `MenuEditor`/`SocialEditor` repeaters, `VideoEditor`, `HtmlEditor` raw-HTML textarea).
**Rules:** Image `alt` text is encouraged but not hard-blocked at the editor level (Checks flags a missing one as a warning, not an error, unless the field is required by a composite block — see F-004); all hrefs pass through `safeUrl()` sanitization at render time (only `https?:`, `mailto:`, `tel:`, `#`, `//`, `{{`, `*|`, or a `data:image/...;base64` pass; everything else is stripped to `''`).
**Edge cases:** A Video block's thumbnail auto-derives for YouTube URLs; other platforms require a manually supplied thumbnail URL or the block renders with no preview image.
**Error states:** None at the editor level; a malformed href is silently stripped by `safeUrl()` rather than erroring.
**Dependencies:** F-016 (image picker), F-012 (Checks validates these fields).
**Acceptance criteria:**
```
Given an Image block's href field contains "javascript:alert(1)"
When the email is rendered (canvas or export)
Then the href is stripped to an empty string — the script-URL never reaches the output
```

---

### F-004 — Composite blocks
**User story:** As the editor, I want ready-made sections (header, hero, footer, article list) instead of hand-assembling them from atomic blocks every time.
**Trigger:** Drag/click-to-add like any block; frequently arrive pre-populated via a preset (F-005).
**Flow:** Each composite block builds a throwaway sub-block internally (e.g. a `menu` block for Header's nav) and calls the real atomic renderer on it — no duplicated HTML logic.
**UI behaviour:** `HeaderEditor` offers logo-left/logo-center layouts and an "Extend background full width" switch (writes color onto the parent row); `HeroEditor` offers 5 layouts with card count following the layout (2 for `cards-2`, 3 for `cards-3`, auto-padded/trimmed on layout change); `FooterEditor` defaults address/legal/unsubscribe/social from the active brand with a per-email override and a "Use brand social" toggle; `ArticleListEditor` is a repeater (add/remove/move) capped at 10 items.
**Rules:** A block can never paint edge-to-edge (confined to the content container) except via the Header/Footer "extend background" switch, which is last-writer-wins if two such blocks share a row; Hero's centered background image renders as `<td background>` with no VML, so Outlook on Windows shows the fallback color only; `alt` is a hard-enforced (red-asterisk, warned) field on composite-block images because inboxes block images by default.
**Edge cases:** `showFooter` off (Email settings) drops Footer blocks from preview/export entirely while keeping them visible-but-dimmed on canvas for editing.
**Error states:** None.
**Dependencies:** F-003 (reused renderers), F-006 (brand pull-through for Header/Footer).
**Acceptance criteria:**
```
Given a Hero block's layout is "cards-2" with 2 cards configured
When the layout is changed to "cards-3"
Then a 3rd card is added with default content, and the first 2 cards' content is preserved

Given Email settings → Show footer is off
When the email is exported
Then no Footer block's HTML appears in the output, while the canvas still shows it dimmed
```

---

### F-005 — Starter presets
**User story:** As the editor, I want ready-made starting structures, so "New email" isn't a blank page.
**Trigger:** TopBar "New" → NewEmailModal → Presets tab → pick a card.
**Flow:** `preset.build(brand)` mints a fresh `Design` with new ids throughout → `applyEmailDefaults()` overlays org-wide defaults → `startNewEmail()` makes it the active document.
**UI behaviour:** Each preset card shows a live thumbnail — the preset's real exported HTML rendered in a sandboxed, inert iframe at 600px, scaled down via CSS transform, themed with whichever brand is selected in the dialog header.
**Rules:** Colors/fonts are brand tokens (re-theme on a later brand switch); the brand **name** is interpolated into prose once, at apply time, then becomes ordinary editable text; every preset ships placeholder art (`picsum.photos`) and placeholder/fictional copy **on purpose**, specifically so Checks' `IMAGE_PLACEHOLDER`/`LINK_PLACEHOLDER_DOMAIN` rules flag it until replaced.
**Edge cases:** "Cold outreach" deliberately has zero images and no header/hero, reading as a personal email rather than a campaign.
**Error states:** None — applying a preset cannot fail.
**Dependencies:** F-004 (presets are built from composite + atomic blocks), F-006 (brand theming), F-012 (placeholder warnings).
**Acceptance criteria:**
```
Given the Newsletter preset is applied twice in a row (as two separate new emails)
When their block ids are compared
Then every id is distinct between the two applications — neither aliases the preset's own stored definition
```

---

### F-006 — Brand kit & brand switcher
**User story:** As the editor, I want to theme any email instantly for a given brand, without touching its content.
**Trigger:** Brands modal (create/edit/duplicate/archive); brand selector in TopBar or NewEmailModal.
**Flow:** `upsertBrand()` saves kit fields → `setBrandId()` changes only `design.brandId` → `resolveDesign(design, brand, mode)` replaces every `brand.*` token with a literal value immediately before render/export.
**UI behaviour:** BrandsModal: Identity, Logos (upload-preview pair + hosted-URL-export pair), Colors (9 named roles), Dark mode (derive/override), Fonts, Buttons, Footer, Social links, Voice (free-text guidance consumed only by F-018); a live kit preview panel.
**Rules:** Switching brands never touches content or manual hex overrides (BR-02); exports always use the hosted `logo_url`, never the upload preview (BR-04); a `brandId` pointing at an archived/deleted brand silently falls back to the default brand (BR-03); resolution order for a blank field is active brand → seed brand → `''` ("inherit").
**Edge cases:** Archiving a brand (`is_active: false`) is a soft-delete — existing emails using it still resolve correctly; only active brands appear in pickers.
**Error states:** "Give the brand a name first" if saving with an empty name.
**Dependencies:** F-007 (dark palette lives on the brand), F-005/F-018 (consume brand tokens/voice).
**Acceptance criteria:**
```
Given an email has a manually-typed hex override on its heading color
When the active brand is switched
Then the heading color is unchanged, while every brand.*-token-sourced color re-themes
```

---

### F-007 — Dark mode support
**User story:** As the editor, I want the export to look correct in dark-mode-aware inboxes, without maintaining two separate emails.
**Trigger:** "Dark mode support" toggle (Email settings, default on); brand-level dark palette fields.
**Flow:** `output.ts` resolves the design twice — once against the real brand, once against `darkBrand()` (dark-palette-swapped) — and diffs the two; a value that moved came from a token (gets a CSS class), a value that stayed was hand-typed (left untouched).
**UI behaviour:** BrandsModal's Dark mode section: 8 fields, "Derive from light," "Reset to derived," a live sample, and a readable-contrast readout; TopBar/PreviewModal Light/Dark toggle (disabled when the email's dark mode is off).
**Rules:** With the toggle off, export is byte-identical to a pre-dark-mode export (BR-22); a manual per-block/row dark override beats both the token-following rule and the derived palette; two hand-corrected role-mapping cases exist for ink-as-background and surface-as-foreground colors (BR-23).
**Edge cases:** Gmail's own mail apps ignore all of this and apply their own automatic inversion (disclosed in the Preview UI, not something the app can override); a hero background image cannot be restyled for dark mode at all.
**Error states:** None.
**Dependencies:** F-006, F-012 (dark-specific contrast checks).
**Acceptance criteria:**
```
Given Dark mode support is off
When the email is exported
Then the output contains no color-scheme meta tags, no dm- class names, and is byte-identical to the same email with dark mode never having existed
```

---

### F-008 — Merge tags
**User story:** As the editor, I want ESP-correct personalization placeholders, so the same design works regardless of which ESP sends it.
**Trigger:** Insert-tag menu on the Text toolbar, Heading, Button label, Subject, Preheader.
**Flow:** Content always stores canonical `{{tag}}`; `formatMergeTags()` rewrites the spelling only at export, per the chosen `mergeFormat`.
**UI behaviour:** "Preview with sample data" swaps in sample values on canvas only (stored separately, never in the design); Email settings offers curly/Mailchimp/HubSpot/custom format choice with custom prefix/suffix fields.
**Rules:** 6 built-ins (`first_name`, `last_name`, `company`, `email`, `unsubscribe_url`, `view_in_browser_url`) map to real ESP field syntax, not a naive transform; an unknown hand-typed tag falls back generically (uppercase for Mailchimp, `contact.<tag>` for HubSpot).
**Edge cases:** Switching format never edits stored content, only the export.
**Error states:** None.
**Dependencies:** F-011 (export boundary).
**Acceptance criteria:**
```
Given Email settings → Merge tag format is "Mailchimp"
When the email is exported
Then {{first_name}} in the design becomes *|FNAME|* in the output, and the stored design is unchanged
```

---

### F-009 — UTM link tagging
**User story:** As the editor, I want outbound links tagged for campaign tracking, applied consistently without manual editing of every link.
**Trigger:** Email settings → UTM toggle; per-link "Don't add tracking" opt-out.
**Flow:** `addUtm()` runs at export only, after brand resolution, while tags are still canonical (so "is this URL just a merge tag" stays one regex).
**UI behaviour:** Email settings exposes source/medium/campaign/content/term fields (medium defaults to `email`; campaign defaults to a slug of the email title on first enable); the rich-text Link dialog has a "Don't add tracking" checkbox.
**Rules:** Never overwrites an existing `utm_*` parameter; skips non-http(s) links, merge-tag-only URLs, and the unsubscribe/view-in-browser links (still counted in the "skipped" total); the opt-out attribute is stripped from the export regardless of whether UTM is globally on or off.
**Edge cases:** A link containing both a merge tag and a real path is still evaluated for UTM eligibility correctly since UTM runs before tag reformatting.
**Error states:** None.
**Dependencies:** F-011.
**Acceptance criteria:**
```
Given a link already has ?utm_source=newsletter on it
When UTM tagging runs at export
Then that parameter is left exactly as it is, not duplicated or overwritten
```

---

### F-010 — Plain-text export
**User story:** As the editor, I want a text-only version alongside the HTML, for clients/recipients that need it.
**Trigger:** Export dialog's "Plain text" tab.
**Flow:** `toPlainText()` runs on the already-resolved design (post-UTM, post-merge-format).
**UI behaviour:** Export dialog tabs (HTML | Plain text), each with its own Copy/Download.
**Rules:** 72-character wrap; a URL longer than the wrap width is never split onto two lines; per-block-type rendering (headings on their own line, links as `text (url)`, buttons as `Label: url`, dividers as a dashed rule, Footer only if `showFooter` is on).
**Edge cases:** An image with no alt text contributes nothing to the plain-text output (silently skipped, not an error).
**Error states:** None.
**Dependencies:** F-008, F-009 (shares the resolved pipeline).
**Acceptance criteria:**
```
Given a Button block with label "Shop now" and href "https://example.com/shop"
When plain text is generated
Then the output line reads "Shop now: https://example.com/shop"
```

---

### F-011 — HTML export & live preview
**User story:** As the editor, I want to produce the final HTML and see exactly what will ship before I export it.
**Trigger:** TopBar "Export" / "Preview."
**Flow:** `resolveForOutput(design, brand, mode)` → `renderDesign()` → the string shown/downloaded; Preview renders the SAME string in a sandboxed iframe.
**UI behaviour:** Export dialog shows size in KB, the UTM tagged/skipped count, and a one-line Checks summary with an "Open checks →" hand-off; Preview offers Desktop/Mobile and Light/Dark toggles.
**Rules:** The canvas, Preview, and the final export are driven by the **same** renderer — "what you see is what is exported" is enforced by construction, not convention; Copy/Download are never disabled by outstanding Checks issues (BR-05).
**Edge cases:** When the email contains unhosted AI drafts, Preview shows their real local bytes (something the export itself cannot do) and says so in a caption.
**Error states:** "Copy failed — select the text and copy manually" if the clipboard API throws.
**Dependencies:** F-006, F-007, F-008, F-009, F-012.
**Acceptance criteria:**
```
Given an email with 1 outstanding Checks error
When the Export dialog is opened
Then Copy and Download remain clickable, and the dialog states "1 error" with a link to the Checks drawer
```

---

### F-012 — Checks panel (quality engine)
**User story:** As the editor, I want to know what an inbox will do with this email before I send it, without being blocked from exporting anyway.
**Trigger:** Automatic (debounced 500ms on every design/brand change, and on a whole-design load); manual "Check images load."
**Flow:** `checkDesign(resolvedDesign, exportedHtml, brand, opts)` returns `Issue[]`, grouped by severity.
**UI behaviour:** TopBar badge (worst severity, or a green tick); drawer overlaying (not replacing) the RightPanel, with per-issue message/hint/"Go to block"/"Ignore"; an "Ignored (n)" section.
**Rules:** Never blocks anything (BR-05); an image/draft is never called broken/missing until it has actually been checked (BR-07); issue ids are stable (`code#blockId#discriminator`) so "Ignore" persists meaningfully across unrelated edits and reloads.
**Edge cases:** Text over a hero background image is reported `CONTRAST_UNKNOWN` rather than guessed at.
**Error states:** None — the engine itself cannot fail the UI (a caller handing it an unresolved design is documented as a caller bug, not a runtime guard).
**Dependencies:** Every content/export feature feeds this engine.
**Acceptance criteria:**
```
Given an issue has been Ignored on a specific email
When the browser is reloaded and that email reopened
Then the issue stays hidden from the active list and appears under "Ignored"
```

---

### F-013 — Saved blocks library
**User story:** As the editor, I want to save a block/row I built once and reuse it in any future email.
**Trigger:** "Save as block" (RightPanel header on a selected block/row).
**Flow:** `addSavedBlock(name, category, kind, payload)` freezes a JSON snapshot; `insertSavedBlock()` always clones with fresh ids before placing a copy on canvas.
**UI behaviour:** LeftPanel's Saved tab: search, category grouping, per-item thumbnails rendered with the active brand, rename, delete, drag-or-click-to-insert; Export/Import JSON.
**Rules:** A `data:` image embedded in the payload triggers a save-time warning (won't survive a real inbox); import skips exact-id duplicates silently and asks before overwriting a name clash.
**Edge cases:** Deleting a library entry never affects emails that already used it (payload was copied at insert time).
**Error states:** "Could not read that file" / "That file is not a saved-blocks JSON" on a malformed import.
**Dependencies:** F-001, F-023 (export/import mechanics).
**Acceptance criteria:**
```
Given a saved block containing brand.primary as a color token
When it is inserted into an email themed with a different brand than the one it was saved under
Then the block renders in the new brand's primary color, not the original brand's
```

---

### F-014 — Auto-save
**User story:** As the editor, I never want to lose work by closing a tab.
**Trigger:** Any design edit (2s debounce); tab close (`beforeunload` flush).
**Flow:** First edit creates a `SavedTemplate` record (`autoSaved: true`); subsequent edits update it.
**UI behaviour:** TopBar status: "Saving…" → "Saved just now" → "Saved 5 min ago" (30s tick) → "Not saved: storage full" on failure.
**Rules:** A whole-design **load** (open/restore/undo) never marks the email dirty — only a real edit does (BR-11); on quota pressure, the 10 globally-oldest version snapshots are pruned and the write retried before reporting failure (BR-13).
**Edge cases:** Picking a preset or starting blank never auto-saves over the email just left (`startNewEmail` leaves `currentEmailId: null` until the next edit).
**Error states:** "Not saved: storage full" is never silent.
**Dependencies:** F-015 (shares the storage quota-recovery path).
**Acceptance criteria:**
```
Given a brand-new, never-saved email
When 2 seconds pass after the very first edit
Then a SavedTemplate record exists, grouped under "Drafts (auto-saved)" until explicitly renamed
```

---

### F-015 — Version history
**User story:** As the editor, I want to go back to an earlier version of this email without losing my current state.
**Trigger:** Automatic (≤1/5min of active editing); manual "Save version"; pre-restore/pre-replace.
**Flow:** `shouldSnapshot()` decides whether to snapshot (never if identical to the latest); `pruneToCap()` keeps the newest 20 per email.
**UI behaviour:** HistoryModal: optional note field, "Save version," a list with relative time + row/block counts, Preview (read-only iframe), Restore.
**Rules:** Restoring snapshots the present design first, so a restore is itself always reversible (BR-12); versions store the design only — never brand definitions.
**Edge cases:** "Save version" right after an auto-save can be a no-op ("No changes since the last version").
**Error states:** "Version not saved: storage full."
**Dependencies:** F-014.
**Acceptance criteria:**
```
Given a version is restored
When the restore completes
Then the design present immediately before the restore now exists as its own version, restorable forward again
```

---

### F-016 — Image library (URL-based)
**User story:** As the editor, I want a vetted, reusable library of image URLs instead of re-typing/re-finding the same image every time.
**Trigger:** LeftPanel Images tab "Add"; any image field's picker button.
**Flow:** `validateImageUrl()` (https-only) → `probeImage()` (does it actually load) → `makeLibraryImage()` stores name/alt/tags/brand scope/measured size.
**UI behaviour:** Grid of thumbnails with a "Could not load" badge when broken; search; This brand/Shared/All filter; Export/Import JSON.
**Rules:** File "Upload from device" is **categorically refused** with an explicit message (BR-17) — it never falls back to an embedded `data:` URI; resolution notes ("Low resolution"/"Very large image") are advisory only and require the image to already be in the library (where its measured size lives).
**Edge cases:** The library re-probes every item on open (fine for tens of images; would need batching at hundreds — a stated known gap).
**Error states:** A pasted URL that fails validation shows the specific rejection reason inline (not https / malformed / empty).
**Dependencies:** F-012 (shares the audit/classification logic).
**Acceptance criteria:**
```
Given a user pastes an http:// (not https) image URL
When they attempt to add it to the library
Then it is rejected with a reason, and nothing is added
```

---

### F-017 — AI image generation
**User story:** As the editor, I want to generate an on-brand image from a text prompt, without leaving the editor or using a separate tool.
**Trigger:** Any image field's "Generate with AI" entry point.
**Flow:** One request to OpenAI's image endpoint (`openai.ts`) → magic-byte response validation (`validate.ts`) → bytes stored in IndexedDB as a `DraftImage`; the design field stores only an `aiDraftId`.
**UI behaviour:** AiImagePanel: prompt composer, aspect/style/quality selectors, a "Brand colours" toggle, a chat-like turn history, Cancel/Regenerate/Edit prompt/Download PNG per result; alt text required before "Add to email."
**Rules:** Exactly one request per generation, never auto-retried (BR-06); the API key defaults to in-memory-only and is never serialized into any exportable state (BR-08); because no image hosting exists, every export of a generated image ships a visible placeholder URL until manually rehosted.
**Edge cases:** `AI_IMAGE_MISSING_DRAFT` (bytes not in this browser — e.g. an imported design) vs. `AI_IMAGE_NOT_HOSTED` (bytes present locally but nowhere public) are distinct, mutually exclusive Checks rules, both reported only after the app has actually looked.
**Error states:** Classified, redacted error cards (invalid key, forbidden, no credit, rate-limited, content-policy refusal, network/gateway timeout with a "may have already been billed" warning, or a generic bad response) — the raw provider error text is never shown un-redacted.
**Dependencies:** F-019/F-020/F-021 (routing, fallback, key management), F-012 (drafts-specific checks).
**Acceptance criteria:**
```
Given a generation request fails with a 503 status
When the error is shown
Then the message warns the image may already have been produced and billed, and no automatic retry occurs
```

---

### F-018 — Generate email from a brief (AI)
**User story:** As the editor, I want to turn a short content brief into a first-draft email, reviewed by me before anything is finalized.
**Trigger:** NewEmailModal → "Generate from brief" tab.
**Flow:** `buildSlotSchema()` walks the resolved preset's real block tree and classifies each block's fields by type (the "slot-derivation pattern") → one strict-JSON-schema request → `brief-validate.ts` binary accept/reject → `BriefReview` (no design mutation yet) → "Create email" writes onto a fresh design copy.
**UI behaviour:** BriefForm: topic*, audience, goal, up to 8 key points, tone, length, CTA label/URL, article count, language, preset (or Auto), optional source text (≤3000 chars), a one-time data-use consent notice per provider; BriefReview: subject-option buttons + editable subject, read-only preheader, copyable image-prompt suggestions, leftover-`[bracket]`-placeholder warnings, Create/Regenerate/Edit-brief.
**Rules:** A field is AI-fillable exactly when the preset's own placeholder copy for it is non-empty; AI is categorically excluded from footer/legal copy, structural blocks, logos, and the hero background image; a slot is exposed only if the preset's actual **rendering** of that field would be true (hero-card slots only on `cards-2`/`cards-3` layouts) — this is the fix for a real bug found during development (BR-26); a user-supplied CTA removes the corresponding AI slot(s) entirely (BR-27); validation is binary — the whole response is accepted or rejected, never partially repaired (BR-28).
**Edge cases:** "5B"/"5C" and a literal "4A" feature referenced in early planning notes do not exist anywhere in this codebase — any requirement citing them should be treated as referring to 5A's own amendments (Not Found in Codebase as standalone features).
**Error states:** A rejected AI response surfaces its reason with a "Regenerate" affordance; nothing is written to any design until "Create email."
**Dependencies:** F-005 (the structural target), F-006 (brand voice input), F-012 (`AI_DRAFT_UNREVIEWED`, `BRIEF_PLACEHOLDER_LEFT`), F-019/F-020/F-021.
**Acceptance criteria:**
```
Given a brief with a non-empty CTA label
When the AI schema is built
Then every cta_label-kind slot is absent from it, and the user's own label/URL are written directly after Create

Given an email was created from a brief
When it is opened
Then the Checks drawer shows AI_DRAFT_UNREVIEWED until "Mark as reviewed" is clicked
```

---

### F-019 — Per-task AI model routing
**User story:** As the editor, I want text generation and image generation to use independently chosen models.
**Trigger:** Settings → AI → "Models per task."
**Flow:** `runTask(taskId, input)` reads the task's configured route (provider, model, options) rather than any global "active provider."
**UI behaviour:** One row per task (`text.brief`, `image.generate`): Provider select, Model select or a free-text "Other model id," the task's own quality/temperature option, a status chip, "Test connection," its own fallback-chain editor.
**Rules:** A per-generation Quality selector in the AI image composer always wins over the task's configured default quality — routing options are defaults, not a replacement for a choice the UI already exposes per generation; "Reset to defaults" restores a deliberately-chosen model (`gpt-4.1-mini` / `gpt-image-2`), not whichever is newest in the list.
**Edge cases:** On first-ever use, `image.generate`'s route is seeded from whatever the pre-6B single "active provider" held (one-time migration, then frozen — not a live mirror thereafter).
**Error states:** "No access to `<model>`" status chip with a hint to choose another model or adjust OpenAI project settings.
**Dependencies:** F-017, F-018, F-020, F-021.
**Acceptance criteria:**
```
Given a task's configured default quality is "High"
When the user picks "Draft" for one specific generation
Then that one generation uses "Draft" — the task's stored default is not changed
```

---

### F-020 — Provider/model fallback chains
**User story:** As the editor, I want a configured backup model so one provider hiccup doesn't block my work.
**Trigger:** "Add fallback" in a task's routing row.
**Flow:** On a failed primary call, `run-task.ts` tries each fallback entry in order, skipping any with no configured/connected key.
**UI behaviour:** An ordered list of Provider+Model pickers per task, each removable.
**Rules:** A fallback is tried **only** for `network`/`timeout`/`rate-limit`-classified failures; any other failure (bad key, no credit, content-policy, malformed response) stops immediately — "a different model on the same account wouldn't fix any of those" (BR-29).
**Edge cases:** Today there is exactly one registered AI provider, so the fallback chain is "same provider, different model" in practice; the data model supports multiple providers for when a second exists.
**Error states:** If every candidate (primary + all fallbacks) fails or is skipped, the original failure is surfaced.
**Dependencies:** F-017, F-018, F-019.
**Acceptance criteria:**
```
Given a task has one fallback entry with a connected key
When the primary call fails with a network timeout
Then the fallback entry is tried automatically, with no user action required
```

---

### F-021 — AI provider & API key management
**User story:** As the editor, I want to connect my own OpenAI key safely, and know whether it's actually working.
**Trigger:** AiImagePanel gear icon, or Settings → AI (same underlying component).
**Flow:** "Test and save" only persists a key after a passing connection test; a failed attempt leaves the previously working key untouched (BR-30).
**UI behaviour:** Masked key display; show/hide toggle; "Remember on this device" checkbox (explicitly labeled "Stored unencrypted in this browser, for this provider only"); status badge (Not configured / Configured / Connected).
**Rules:** The key defaults to in-memory-only (dies with the tab); it is deliberately excluded from the app's state store and from backups, both structurally (the relevant files never import the key-store module) and by dedicated tests sweeping every export/backup/saved-block surface (BR-08); provider error text is redacted (`redactKeys()`) before ever reaching the UI.
**Edge cases:** Removing the active provider's key falls back to the first other Connected provider, else no provider is active and dependent composers show a setup prompt instead of being usable.
**Error states:** Connection-test failures surface the provider's own (redacted) message plus a compact diagnostic (status/content-type/timing), never the key itself.
**Dependencies:** F-017, F-018, F-019, F-020.
**Acceptance criteria:**
```
Given a stored, working key
When a replacement key is entered and fails Test connection
Then the original key remains the active, stored one — nothing is overwritten
```

---

### F-022 — Settings hub & profile
**User story:** As the editor, I want one place to manage my profile, AI setup, brand defaults, and local data, instead of hunting across the app.
**Trigger:** LeftPanel's Settings gear or Profile row.
**Flow:** A two-level navigation (section list → section detail); Escape backs up one level at a time.
**UI behaviour:** 7 sections (Profile, AI, Brands, Email defaults, Checks, Data & storage, About); on narrow viewports the hub becomes a full-screen sheet (the only responsive behavior in the app's own chrome).
**Rules:** "Email defaults" apply only to a brand-new email at the moment of creation, never to an already-open/saved email (BR-14); the Profile display name is a local, unauthenticated label used only for `createdBy`/`updatedBy` attribution (BR-10) — not a login.
**Edge cases:** Opening the hub snapshots the previously active left-panel tab and scroll position, restoring both on close.
**Error states:** "A display name is required" if the Profile field is emptied and saved.
**Dependencies:** Surfaces F-006, F-008, F-009, F-007, F-012, F-019–F-021, F-023 — it is a shell over those, not independent logic.
**Acceptance criteria:**
```
Given the left panel was on the "Saved" tab, scrolled partway down
When Settings is opened and then closed without changing tabs
Then the left panel returns to "Saved," at the same scroll position
```

---

### F-023 — Import / export & backup
**User story:** As the editor, I want to move my brands/templates/blocks to another browser, and recover or wipe my local data deliberately.
**Trigger:** TopBar Import/Download JSON (per-email design); BrandsModal Export/Import; Saved-blocks/Image-library Export/Import; Settings → Data & storage (full backup/restore, clear-all).
**Flow:** `normalizeDesign()` is the single gate for loading any JSON (missing fields filled from current defaults; unknown block types dropped; never crashes on malformed input); `exportBackup()`/`importBackup()` cover brands+templates+saved blocks+images+versions as one JSON file.
**UI behaviour:** Backup import shows a record-count summary before anything is overwritten; "Clear all local data" requires literally typing `DELETE` before the button enables.
**Rules:** Backup structurally excludes the AI key store and IndexedDB drafts (the file never imports either module) (BR-15); a malformed individual record within an import is dropped, not a reason to fail the whole import; "Clear all local data" is the one action allowed to touch both the AI key store and drafts, specifically to delete them (BR-16).
**Edge cases:** A design imported from another browser that references an AI draft will show `AI_IMAGE_MISSING_DRAFT` — a normal state, not an error, since drafts never travel with a design.
**Error states:** "That file is not a valid email design JSON" / "...brand kit JSON" / "...saved-blocks JSON" / "...image library JSON" on malformed input; "Could not read that backup: `<reason>`" on a malformed backup file.
**Dependencies:** F-006, F-013, F-016, F-017 (interaction with drafts on import), F-021 (explicitly excluded from this feature's scope).
**Acceptance criteria:**
```
Given a backup JSON file with a corrupted single template record but valid brands/images
When it is imported
Then the corrupted template is dropped and everything else imports successfully — the whole import is not rejected

Given the "Clear all local data" field does not contain exactly the word DELETE
When the user attempts to click "Clear all local data"
Then the action is disabled
```
