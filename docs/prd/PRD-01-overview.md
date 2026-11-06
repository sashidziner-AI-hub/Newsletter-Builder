# Newsletter Builder — Product Requirements Document
## Part 1 of 4 — Sections 1–4: Overview, Goals, Personas, Feature Inventory

> Reverse-engineered, read-only, from source code, tests, `docs/PROGRESS.md`, and `docs/brd/` — no source file was modified to produce this document. Every feature/requirement cites a BRD business-rule id (`BR-xx`, from `docs/brd/BRD-02.md` §13) where one applies, or states "no BRD link." See `docs/prd/README.md` for ID conventions and `docs/prd/VERIFICATION_NOTES.md` for every Inference/Not-Found item.
>
> **Verified-now facts used throughout this PRD** (run at the time of writing, not quoted from memory or from `docs/PROGRESS.md`'s own log): `npx tsc --noEmit` — **0 errors**. `npm test` (vitest) — **41 test files, 950 tests, all passing**, 70.46s. These numbers match `docs/PROGRESS.md`'s final entry exactly, confirming this PRD describes the same codebase state as the BRD.

---

## 1. Product Overview

### What it is
Newsletter Builder is a **browser-only, single-user, drag-and-drop email template builder** (React 19 + TypeScript + Vite + Tailwind CSS). A marketing/communications user assembles an HTML newsletter visually and exports email-client-safe HTML plus a plain-text alternative. (Fact — `README.md` lines 1–5.)

### Vision
**Not Found in Codebase** as a written vision statement (no `VISION.md`, no product-strategy doc, no mission statement anywhere in the repo). **Inference**, synthesized from the product's own framing across `README.md` and `docs/PROGRESS.md`: *"Let a marketing/communications team produce polished, on-brand, email-client-safe newsletters without a developer, a designer, or hand-written HTML in the loop — and, increasingly, without writing the first draft of the copy or sourcing the first image by hand either."*

### The problem
| Problem (as framed in the product's own history) | Evidence |
|---|---|
| Hand-coded HTML email is fragile across clients (Outlook/Gmail/Apple Mail render differently) | Fact — the entire renderer (`src/lib/render.ts`) exists specifically to emit table-based, inline-styled, Outlook-safe markup |
| Re-theming an email for a different brand meant rebuilding it | Fact — `docs/PROGRESS.md` Feature 1A |
| Common sections (header, hero, article list, footer) were rebuilt by hand every time | Fact — Feature 1B |
| No visibility into whether an email would actually work in an inbox before sending | Fact — Feature 3A ("one engine that reads what is actually sent and says what an inbox will do with it") |
| Starting a draft from scratch is slow | Fact — Feature 6A's own framing |
| On-brand imagery required a separate tool | Fact — Feature 5A |

### Positioning
**Inference** (no competitive-positioning document exists): a lightweight, **internal, no-backend** alternative to a hosted ESP's own drag-and-drop editor (e.g., Mailchimp's/HubSpot's builder) or a general design tool (Canva/Figma) repurposed for email — differentiated specifically by (a) running entirely client-side with zero account/hosting cost, (b) a built-in, non-blocking email-quality engine, and (c) bring-your-own-key AI assistance for both copy and imagery, inline in the same editor.

### What the product is NOT
| Not | Evidence |
|---|---|
| Not an ESP / sending tool | Fact — `README.md`: "No sending: export the HTML and send it through your ESP (SES, SendGrid, ...)" |
| Not a multi-user / collaborative tool | Fact — everything is per-browser `localStorage`/`IndexedDB`; no sync of any kind (§10) |
| Not an accounts/auth product | Fact — `src/lib/user.ts`'s own header comment: "no login, no roles, an internal tool's substitute for an account" |
| Not an image-hosting service | Fact — `imageHosting.configured === false`; AI-generated images always export as a placeholder until manually rehosted elsewhere |
| Not a test-send or inbox-preview service (e.g., Litmus/Email on Acid) | Fact — README: "Always test final HTML in the clients you care about (Litmus / Email on Acid / real inboxes)" |
| Not a managed/metered AI product | Fact — the user's own OpenAI key is billed directly by OpenAI; the app has no cost visibility or usage caps (confirmed by exhaustive grep across `src/lib/ai/*`, no cost/quota/pricing code found) |
| Not a CMS or content-approval workflow tool | Fact — exactly one functional role exists (§3); the only "approval" is a single non-blocking Checks warning (`AI_DRAFT_UNREVIEWED`) |
| Not a general page-builder (web pages, landing pages) | Inference — every renderer constraint (table layout, no flex/grid, inline styles) is email-specific; nothing in the product targets a browser-rendered destination |

---

## 2. Goals, Non-Goals, and Success Metrics

### Goals (Inference — derived from the pattern of shipped features; no OKR/goals document exists)
| # | Goal |
|---|---|
| G1 | Let a non-developer produce email-client-safe HTML without hand-coding |
| G2 | Keep every email visually on-brand with minimal per-email effort |
| G3 | Catch inbox-breaking mistakes before a human sends, without ever blocking the export |
| G4 | Reduce first-draft effort via AI assistance for copy and imagery, always behind a human-visible review signal |
| G5 | Protect against data loss (auto-save, version history, undo/redo) |
| G6 | Make content reuse cheap (saved blocks, image library, presets) |
| G7 | Keep AI usage safe and auditable (keys never serialized; redacted errors; no silent double-billing retries) |

### Non-goals (Fact, each explicitly evidenced — not merely unplanned)
| # | Non-goal | Evidence |
|---|---|---|
| NG1 | Sending email | README "No sending" |
| NG2 | Hosting images | `imageHosting.configured: false` (`image-storage.ts`) |
| NG3 | Multi-user collaboration / cross-device sync | No backend; `localStorage`/`IndexedDB` only |
| NG4 | Authentication / roles / permissions | `user.ts` header comment; `canEditBrand()`/`getAccessibleBrands()` always return "true"/"everything" |
| NG5 | AI usage metering or cost control | No cost/quota code found anywhere in `src/lib/ai/*` |
| NG6 | Link-liveness checking | `checks.ts` comment: "Links are classified, not fetched" |
| NG7 | Localizing the *application* UI (as opposed to AI-generated *content*, which does support 3 languages) | No i18n framework in `src/`; all UI strings are hardcoded English JSX |

### Success metrics
**Not Found in Codebase: any analytics, telemetry, or usage-metrics instrumentation of any kind.** Exhaustive — no event tracking, no error-reporting SDK, no aggregation, no dashboard (confirmed again for this PRD; see §13). There is therefore **no metric that is "measured" by the product over time or across sessions.**

What follows instead is the closest honest substitute: **in-the-moment, per-document counters the UI itself displays**, which a user could read off the screen as a manual proxy — these are not KPIs, have no history, and are never aggregated.

| Observable in-app counter | Where shown | What it is a proxy for |
|---|---|---|
| Checks severity counts (errors/warnings/info) | Top-bar badge, Checks drawer, Export dialog | "Is this specific email currently inbox-safe?" |
| Export size in KB | Export dialog | "Will Gmail clip this specific email?" (soft cap 90KB, hard cap 102KB) |
| UTM "tagged N, skipped M" | Export dialog | "Did link tracking apply where expected, for this specific email?" |
| Storage usage (bytes of ~5MB budget) | Templates modal, Settings → Data & storage | "How close is this browser to running out of local storage?" |
| Test-suite pass count | `npm test` (developer-facing, not in-product) | Engineering health, not a product/business metric |

---

## 3. Personas and Use Cases

This is confirmed, per `docs/PROGRESS.md` Feature 1A and `src/lib/user.ts`, an **internal tool with exactly one functional role and no authentication.** The persona table below documents what actually exists, not a hypothetical multi-role model.

| Persona | Who (Fact) | Goals | What they can do | What they cannot do |
|---|---|---|---|---|
| **Marketing/Communications editor** | The one role that exists — `docs/PROGRESS.md` names the user base "the Vee MARCOM team" | Produce an on-brand, inbox-safe newsletter quickly | Everything — every screen, every action, with no restriction | Nothing is restricted; there is no second role to compare against |

**Not Found in Codebase:** a brand-owner-only role, an approver role, a viewer-only role, or an admin role — `canEditBrand()`/`getAccessibleBrands()` exist as **named, in-code future seams** (1A) that currently grant full access unconditionally.

### Use cases (what the one persona actually does, each traceable to a feature in §4)
| Use case | Primary feature(s) |
|---|---|
| Build a newsletter from a blank canvas | F-001, F-002, F-003, F-004 |
| Start from a ready-made layout | F-005 |
| Re-theme an email for a different brand | F-006 |
| Make the email look correct in dark-mode inboxes | F-007 |
| Personalize an email per-recipient without a second file per ESP | F-008 |
| Track link clicks via campaign parameters | F-009 |
| Produce a text-only fallback for the HTML | F-010 |
| Produce the final deliverable to paste into an ESP | F-011 |
| Catch inbox-breaking problems before sending | F-012 |
| Reuse a block/row built once across many emails | F-013 |
| Not lose work when a tab closes unexpectedly | F-014 |
| Recover an earlier version of an email | F-015 |
| Maintain a vetted library of image URLs | F-016 |
| Generate an on-brand image without leaving the editor | F-017 |
| Turn a short brief into a first-draft email | F-018 |
| Choose which AI model handles which task | F-019 |
| Keep AI working if one model/provider is briefly unavailable | F-020 |
| Connect and manage an OpenAI API key | F-021 |
| Manage profile, defaults, and local data from one place | F-022 |
| Move brands/templates/blocks to another browser, or back up/wipe local data | F-023 |

---

## 4. Feature Inventory

**Status legend:** Complete = fully implemented, tested, documented as shipped in `docs/PROGRESS.md`. Partial = implemented but with a stated, deliberate gap (e.g., no hosting). Not built = referenced as a future idea only, nothing implemented.

| ID | Feature | Area | Description | Status | Screens | Source files (key) | BR link |
|---|---|---|---|---|---|---|---|
| F-001 | Canvas & editing core | Editor | Selection model, drag-and-drop (dnd-kit), undo/redo (100-step history with edit-coalescing), keyboard shortcuts (Ctrl+Z/Shift+Z/Y, Ctrl+D, Delete, Escape); the same `renderBlock()` drives canvas and export | Complete | Canvas, TopBar | `src/components/Canvas.tsx`, `src/components/dnd.tsx`, `src/store.ts`, `src/App.tsx` | no BRD link |
| F-002 | Row layouts & columns | Editor | 1–4 column rows with ratio layouts (e.g. 1:2, 2:1, 1:2:1), row/content background, padding, stack-on-mobile toggle; resizing a row merges overflow blocks into the last kept column (never deletes) | Complete | LeftPanel (Rows tab), RightPanel (Row editor) | `src/lib/design-ops.ts: applyRowLayout`, `src/lib/defaults.ts: ROW_LAYOUTS` | no BRD link |
| F-003 | Atomic content blocks | Editor | 9 block types: Heading (H1–H6), Text (rich text via TipTap), Image, Button, Divider, Menu, Social, Video (thumbnail only), HTML (raw escape hatch) | Complete | LeftPanel (Content tab), RightPanel editors | `src/lib/defaults.ts: BLOCK_META`, `src/components/editors.tsx`, `src/lib/render.ts` | BR-18 (Article-list cap, related repeater discipline) |
| F-004 | Composite blocks | Editor | 4 composite types built by reusing atomic renderers internally: Header (logo+nav), Hero (5 layouts incl. 2/3-card variants), Footer (brand-sourced address/legal/unsubscribe/social), Article list (3 layouts, ≤10 items) | Complete | RightPanel editors (`HeaderEditor`, `HeroEditor`, `FooterEditor`, `ArticleListEditor`) | `src/lib/defaults.ts`, `src/lib/render.ts` (composite cases) | BR-18 |
| F-005 | Starter presets | Editor / Onboarding | 8 brand-neutral presets (Newsletter, Promotional, Product launch, Welcome, Cold outreach, Event invitation, Order confirmation, Weekly digest) + Blank, each with a live real-HTML thumbnail | Complete | NewEmailModal (Presets tab) | `src/lib/presets.ts`, `src/components/NewEmailModal.tsx` | BR-24, BR-25 |
| F-006 | Brand kit & brand switcher | Branding | Named brand kits (colors, fonts, button style, logo pairs, footer, social links, voice guidance); color/font fields are tokens resolved at render time; switching brands re-themes without touching content | Complete | BrandsModal, TopBar (switcher), NewEmailModal (brand picker) | `src/lib/brand.ts`, `src/components/BrandsModal.tsx`, `src/store.ts: setBrandId` | BR-01, BR-02, BR-03, BR-04 |
| F-007 | Dark mode support | Branding / Export | Per-brand dark palette (or derived); additive-only export (byte-identical with the toggle off); token-vs-literal color rule; dark-specific contrast checks | Complete | BrandsModal (Dark mode section), TopBar/PreviewModal (scheme toggle) | `src/lib/dark.ts`, `src/lib/output.ts: darkRenderOpts` | BR-22, BR-23 |
| F-008 | Merge tags | Export / Personalization | Canonical `{{tag}}` storage; 6 built-ins; 4 output formats (curly/Mailchimp/HubSpot/custom) applied only at export | Complete | RightPanel (Body/Email settings), Export dialog | `src/lib/merge.ts` | BR-21 |
| F-009 | UTM link tagging | Export / Tracking | Off by default; applies at export only; preserves existing query/hash; never double-tags; per-link opt-out; unsubscribe/view-in-browser links never tagged but still counted | Complete | RightPanel (Body/Email settings), Export dialog | `src/lib/utm.ts` | BR-19, BR-20 |
| F-010 | Plain-text export | Export | Generated from the already-resolved design (so UTM/merge formatting match); 72-char wrap; URLs never split | Complete | Export dialog (Plain text tab) | `src/lib/plaintext.ts` | no BRD link (governed by the same boundary as F-008/F-009) |
| F-011 | HTML export & live preview | Export | `resolveForOutput()` pipeline (brand → AI-draft placeholder swap → UTM → merge format) feeds one renderer for both the live canvas and the exported HTML; Preview modal shows the exact exported document in a sandboxed iframe | Complete | ExportHtmlModal, PreviewModal | `src/lib/output.ts`, `src/lib/render.ts`, `src/components/Modals.tsx` | BR-01, BR-05 |
| F-012 | Checks panel (quality engine) | Quality | Non-blocking engine covering size, links, unsubscribe, subject/preheader, WCAG AA contrast (light+dark), text/tap-target size, thin content, every image rule, AI-draft rules; stable per-issue ids enable persistent per-email "Ignore" | Complete | ChecksPanel (drawer), TopBar badge, Export dialog summary | `src/lib/checks.ts`, `src/lib/contrast.ts`, `src/components/ChecksPanel.tsx` | BR-05, BR-07 |
| F-013 | Saved blocks library | Reuse | Freeze a selected block/row into a named, categorized, searchable library; brand tokens stay tokens (re-theme on reuse); insert always mints fresh ids | Complete | LeftPanel (Saved tab), SaveBlockDialog | `src/lib/blocks-library.ts`, `src/components/SaveBlockDialog.tsx` | BR-25 |
| F-014 | Auto-save | Data / Reliability | 2-second debounce; creates the record on first edit; `beforeunload` flush; status always visible, including "Not saved: storage full" | Complete | TopBar (save status), Templates modal | `src/store.ts: saveNow`, `src/lib/storage.ts: writeSafe` | BR-11, BR-13 |
| F-015 | Version history | Data / Reliability | ≤20 snapshots per email; manual/auto(≤1/5min)/pre-restore/pre-replace reasons; dedup on identical design; restore snapshots the present first | Complete | HistoryModal | `src/lib/versions.ts`, `src/components/HistoryModal.tsx` | BR-12, BR-13 |
| F-016 | Image library (URL-based) | Assets | Vetted https-only image URLs with name/default-alt/tags/brand scope; picker on 12 image-bearing fields app-wide; on-demand load probing; file upload deliberately refused (no hosting) | Partial (URL-only by design; no upload/hosting) | LeftPanel (Images tab), ImagePickerModal | `src/lib/image-storage.ts`, `src/lib/image-audit.ts`, `src/components/ImageLibrary.tsx` | BR-17 |
| F-017 | AI image generation | AI | Bring-your-own-key OpenAI image generation; one request per generation (no auto-retry); magic-byte response validation; result is a local IndexedDB "draft," never hosted; export ships a placeholder until the user manually rehosts | Partial (generation complete; hosting explicitly out of scope) | AiImagePanel | `src/lib/ai/openai.ts`, `src/lib/ai/validate.ts`, `src/lib/drafts.ts`, `src/components/AiImagePanel.tsx` | BR-06, BR-08 |
| F-018 | Generate email from a brief (AI) | AI | Structured brief (topic/audience/goal/key points/tone/length/CTA/language/source text) → one AI text-generation call against a strict JSON schema, derived automatically from the chosen preset's own block tree → mandatory human review screen before anything is written to the design | Complete | NewEmailModal (Brief tab), BriefForm, BriefReview | `src/lib/ai/create-from-brief.ts`, `src/lib/ai/slots.ts`, `src/lib/ai/brief-validate.ts` | BR-26, BR-27, BR-28 |
| F-019 | Per-task AI model routing | AI / Settings | Independent provider/model/option choice for `text.brief` vs. `image.generate`; a per-generation Quality selector always wins over the task's configured default | Complete | Settings → AI ("Models per task") | `src/lib/ai/tasks.ts`, `src/lib/ai/task-settings.ts`, `src/lib/ai/run-task.ts` | BR-29 (fallback logic shared with F-020) |
| F-020 | Provider/model fallback chains | AI / Settings | Ordered, user-configured fallback list per task, tried only on network/timeout/rate-limit failures; a model-access denial ("No access to `<model>`") is a session-only, per-task signal | Complete | Settings → AI (fallback editor, status chip) | `src/lib/ai/run-task.ts`, `src/lib/ai/model-access.ts` | BR-29 |
| F-021 | AI provider & API key management | AI / Settings | One key per provider; default in-memory-only, opt-in "Remember on this device" (disclosed as unencrypted); key only persisted after a passing "Test and save"; never enters the app's state store or backups | Complete | AiImagePanel (gear icon) / Settings → AI (shared `SettingsView` component) | `src/lib/ai/key-store.ts`, `src/lib/ai/provider.ts: redactKeys` | BR-08, BR-30 |
| F-022 | Settings hub & profile | Settings | Two-level navigation hub (Profile, AI, Brands, Email defaults, Checks, Data & storage, About); a local, unauthenticated display-name "profile" used only for `createdBy`/`updatedBy` attribution | Complete | SettingsHub + 7 section components, ProfileBar | `src/components/settings/SettingsHub.tsx`, `src/lib/user.ts` | BR-10 |
| F-023 | Import / export & backup | Data governance | Per-email JSON export/import; brand JSON export/import; saved-block JSON export/import; image-library JSON export/import; one-file full backup/restore (brands+templates+saved blocks+images+versions, deliberately excluding AI keys/drafts); "Clear all local data" gated by typing `DELETE` | Complete | TopBar (JSON import/export), BrandsModal, LeftPanel (Saved/Images tabs), Settings → Data & storage | `src/lib/backup.ts`, `src/lib/clear-all.ts`, `src/lib/design-ops.ts: normalizeDesign` | BR-09, BR-15, BR-16 |

**Feature count:** 23 (F-001–F-023). **Status breakdown:** 21 Complete, 2 Partial (F-016 image library — URL-only by design; F-017 AI image generation — no hosting by design). **0 Not built** — every feature named in the task's required coverage list exists in the shipped product; "Not built" items (e.g., test-email sending, a second AI provider) are documented as backlog candidates in Part 4 §11, not as inventory rows, since they have no code to inventory.
