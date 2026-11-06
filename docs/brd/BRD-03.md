# Newsletter Builder — Business Requirements Document
## Part 3 of 4 — Sections 21–30

> Continues from `BRD-02.md`. See `docs/brd/README.md` for the table of contents and `docs/brd/VERIFICATION_NOTES.md` for the consolidated Inference / Not Found list.

---

## 21. Integrations

**Exactly one real, live integration exists: OpenAI**, called **directly from the browser** with a user-supplied API key. There is no backend, so there is no server-to-server integration of any kind. (Fact, confirmed by `vite.config.ts` having no `server.proxy`/`server` key at all, and by the AI adapters' own CORS-preflight-driven design.)

| Integration | Business purpose | Data exchanged | Trigger | Frequency | Direction | Dependencies | Error handling | Fallback |
|---|---|---|---|---|---|---|---|---|
| **OpenAI Images API** (`POST /v1/images/generations`) | Generate an on-brand image from a text prompt | Sent: prompt (+ style suffix + optional brand color names/hex), size, quality, model, `n:1`, `output_format:'png'`. Received: base64 PNG/JPEG/WebP bytes. **Never sent:** the app's own API key storage format, logos, footer data, other saved content. | User clicks Send in the AI image panel | On demand, one request per click, manually retried (no auto-retry) | Outbound request / inbound image bytes | A user-held, user-entered API key; a live internet connection | Closed-set error classification (`invalid-key`, `forbidden`, `no-credit`, `rate-limit`, `content-policy`, `network`/`timeout` via gateway statuses, `bad-response`, `cancelled`); all provider-echoed text passed through key-redaction before display | A user-configured fallback model/provider chain (6B), triggered only for `network`/`timeout`/`rate-limit` failures |
| **OpenAI Chat Completions API** (`POST /v1/chat/completions`, strict JSON-schema mode) | Generate brief-driven email copy (subject/preheader/slot text/image-prompt suggestions) | Sent: brand name + brand voice guidance + the brief's own fields + a "slot guide" (field ids and character limits). **Never sent:** the API key itself, logos, footer/address data, any other saved email content. Received: a strict-schema JSON object. | User clicks "Generate"/"Agree and generate"/"Regenerate" | On demand, one request per click | Outbound request / inbound JSON | A user-held API key; one-time per-provider consent (separate from image-generation consent) | Same closed-set classification as above, plus a model-access-denial signal (`model_not_found`/403-style responses) | Same 6B fallback-chain mechanism |
| **OpenAI `GET /v1/models`** | Cheap "does this key work" / "is this model listed" check | Sent: the API key only. Received: a model-id list. | "Test connection" (image tasks); "Add/Replace key" save flow | On demand | Outbound/inbound | A user-held API key | `ok` / `unverified` ("Key OK, model access not verified until first use") / `error` | None needed — this call never bills |

**Not an integration, but worth stating explicitly:** the app's own "Export" is **not an integration with any ESP**. The README states plainly: *"No sending: export the HTML and send it through your ESP (SES, SendGrid, ...)."* There is no SMTP, no ESP API call, no webhook, anywhere in the codebase.

---

## 22. External Systems

| External system | Role | Business dependency | Integrated? |
|---|---|---|---|
| **OpenAI** | AI text + image generation provider | Core to Features 5A/6A/6B; the product is functionally a design tool without it (every other feature works with no AI configured) | Yes — direct browser-to-API, BYO key (see §21) |
| **ESP** (e.g., Amazon SES, SendGrid, Mailchimp, HubSpot) | Where the exported HTML is actually sent from | The entire reason the export/merge-tag/UTM features exist — but the ESP itself is never called by this app | **No** — manual copy/paste or file download is the handoff; this is a deliberate, explicit, current-state limitation, not a bug |
| **Identity Provider / SSO** | Would authenticate users | None — no login exists | **No** — Not Found in Codebase |
| **ERP / CRM / HRMS / Payroll** | Typical enterprise systems | None referenced anywhere | **No** — Not Found in Codebase |
| **Email/SMS gateway** | Would send notifications | None — all "notifications" are in-app UI only (§18) | **No** — Not Found in Codebase |
| **Cloud image hosting / CDN** | Would host AI-generated images for real sends | Explicitly **absent by design** — `ImageHosting.configured === false`; this is the reason AI-generated images always export as a placeholder until the user manually hosts and re-pastes a URL | **No**, and the absence is itself a documented, deliberate architectural fact, not an oversight |
| **Payment gateway** | Billing | None — the app has no billing of its own; OpenAI bills the user directly for their own API usage, entirely outside this app's visibility | **No** |

---

## 23. Security Requirements

**Authentication: Not Found in Codebase.** There is no login, no session, no password, no OAuth, no JWT, no server-side identity of any kind. `src/lib/user.ts`'s own header comment states this is "an internal tool's substitute for an account" — a free-text local display name, never verified, never required, never transmitted anywhere. (Fact, corroborated by an exhaustive grep for `auth|login|password|session` across `src/` turning up only AI-provider-key and in-tab AI-session terminology — see `data-model-and-persistence.md` research sheet.)

**Authorization/RBAC: Not Found in Codebase as functioning logic.** `canEditBrand(user, brand)` and `getAccessibleBrands(user, brands)` exist as **explicit future-proofing stubs** (1A) that currently return `true`/"every active brand" unconditionally — they are documented in-code as seams for a role system that does not exist today, not as a partially-built feature.

**Role management: Not Found in Codebase.** Exactly one functional role (§5).

**Approval hierarchy:** the only approval-like gate is the human "Mark as reviewed" step on an AI-generated brief draft (§13, BR — the closest the product gets to a sign-off), performed by the same single role that generated the draft. **Not Found in Codebase:** any second-person or hierarchical approval.

**Sensitive data — the API key** is the one genuinely sensitive artifact in this product, and its handling is the most security-engineered part of the codebase:
- Defaults to **in-memory only** (dies when the tab closes); persistence to `localStorage` is strictly opt-in ("Remember on this device"), per provider.
- **Deliberately excluded from the zustand store** specifically so no future feature that serializes app state (export, backup, saved blocks) can accidentally leak it — enforced by dedicated tests sweeping every such surface (design, brands, saved blocks, image library, issues, rendered export, every localStorage entry, `document.body.textContent`).
- **Deliberately excluded from `backup.ts`'s export**, enforced structurally (that file never imports the key-store module at all) rather than by a runtime filter.
- Displayed only in masked form (`maskKey()`); never rendered into an input the app itself controls once saved.
- Provider error text is passed through `redactKeys()` before ever reaching the UI — strips the exact key, any `sk-`/`rk-`/`org-`/`proj-`-prefixed token, and any `Bearer <token>` pattern, because "a provider is free to echo the request, including the key, back at us."
- **Stated plainly to the user, unencrypted:** the "Remember on this device" checkbox's own copy reads *"Stored unencrypted in this browser, for this provider only."* — **Fact**, and a real, disclosed risk rather than a hidden one.
- No outbound header beyond `Authorization: Bearer <key>` and `Content-Type: application/json` is ever sent — confirmed deliberate, because the live CORS preflight only allows exactly those two headers; sending an org/telemetry header would fail the request outright.

**Audit requirements / compliance: Not Found in Codebase.** No audit log, no compliance framework reference (GDPR/SOC2/HIPAA etc.), no data-residency statement. See §24 for the (much smaller) "audit trail" that does exist.

**Password policy: Not Found in Codebase** (no passwords exist).

**Session policy:** the only "session" concept is the in-memory lifetime of an AI provider API key and its "Connected" status, both of which end when the tab/browser closes. **Not Found in Codebase:** any app-level session timeout/expiry.

**Access restrictions:** none beyond "only someone with physical/browser access to this machine's profile can see or edit anything," since all data is local and unauthenticated.

**Prompt-injection defense (AI brief generation, 6A) — a genuine, two-layered security control worth calling out as such:**
1. The brief and any pasted source text are wrapped in explicit `===== BEGIN/END (untrusted data) =====` delimiters with a system-prompt instruction to treat their contents as data, never instructions, even if they contain apparent commands.
2. A mechanical backstop: the model's response is constrained to a strict JSON Schema (`additionalProperties: false`, every field required-or-nullable) — injected text cannot smuggle extra fields into the response regardless of what it asks for.

**Response-content validation (both AI pipelines) is itself a security boundary:** AI image bytes are sniffed by magic number, never trusted declared content-type, and SVG is refused outright specifically because "it is a document that can carry script, not an image." AI text output passes through `brief-validate.ts`'s sanitizer (HTML tags stripped, markdown stripped, bare URLs stripped) before ever being written into a design that will later be rendered as HTML.

---

## 24. Audit Trail

**What is tracked (Fact):**
| Tracked fact | Where | Granularity |
|---|---|---|
| `createdAt` / `updatedAt` timestamps | `Brand`, `SavedTemplate` | Per record |
| `createdBy` / `updatedBy` display-name label | `Brand`, `SavedTemplate` | Per record, stamped from the local Profile name at the moment of the write |
| Full design-state history | `VersionRecord` (version history) | Up to 20 snapshots per email, with a reason (`manual`/`auto`/`pre-restore`/`pre-replace`) and an optional free-text note |
| Undo/redo history | In-memory `past`/`future` stacks | Up to 100 steps, cleared on reload (not persisted) |
| Which AI brief a given email came from, and whether it has been reviewed | `BriefRecord` on the `SavedTemplate` | Per email |

**What is NOT tracked (Not Found in Codebase):** a changelog of *what specifically changed* between versions (version history stores full snapshots, not diffs); who approved what (no second-person approval exists); any log of AI prompts/responses actually sent (the brief's own fields are stored, but the raw request/response payload to OpenAI is not persisted anywhere); any login/access log (no login exists); any export/send log (the app never sends anything itself).

**Compliance requirements:** **Not Found in Codebase.** No regulatory framework is referenced.

---

## 25. Non-Functional Requirements

| Category | Finding | Source |
|---|---|---|
| **Performance** | Checks re-run debounced at 500ms; auto-save debounced at 2s; AI calls self-throttled with a 2-second minimum gap between calls for the same task and a per-task one-in-flight guard; a 90-second client-side timeout on AI image requests. **Not Found in Codebase:** any load-testing artifact, performance budget beyond the ~90/102KB email-size checks (which are an *output quality* rule, not an app-performance one). | `checks.ts`, `output.ts`, `provider.ts` |
| **Availability** | Entirely client-side — availability equals "the user's own browser works and `api.openai.com` is reachable when AI features are used." No server uptime to manage. **Inference.** | Architecture |
| **Scalability** | Single-browser, single-user by design; there is no concept of "more users" to scale to. Internally, the one acknowledged scale concern is storage: `localStorage` is a fixed ~5MB budget per origin, with version-history pruning as the only automatic relief valve — templates/brands/images/saved blocks are explicitly **unbounded in count** with no automated pruning (**Inference**, confirmed by the absence of any cap in the quota-recovery code path for those categories). | `storage.ts` |
| **Security** | See §23 in full. | — |
| **Reliability** | Every storage write failure is surfaced to the user, never silent (`writeSafe()`'s `'ok'/'pruned'/'full'` contract, consistently checked at every call site). AI calls never silently retry (to avoid double-billing). A malformed individual record on import/load is dropped rather than failing the whole load. | `storage.ts`, `design-ops.ts`, `backup.ts` |
| **Maintainability** | `tsconfig.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` — directly relevant to `render.ts`'s large block-type switch statement. 39 test files cover rendering, business rules, AI pipelines, and UI integration; `tsc --noEmit` is the only static-analysis gate (**no dedicated lint script exists in the repo**, per the 6B amendment's own closing note). | `tsconfig.json`, `src/test/*`, `docs/PROGRESS.md` |
| **Extensibility** | Deliberately designed seams: the AI task registry ("adding a task is one new id and one new `AI_TASKS` entry"); the slot-derivation pattern (a 9th preset is supported automatically); the brand permission functions (`canEditBrand`/`getAccessibleBrands`) as a pre-built seam for a future role system. | `tasks.ts`, `slots.ts`, `brand.ts` |
| **Accessibility** | WCAG 2.1 AA contrast checking (text/button/link, light and dark) is a first-class, tested quality rule; `alt` text is enforced as required in the editor for image-bearing composite blocks; tap-target (44px) and minimum text-size (12px) checks exist. **Not Found in Codebase:** any accessibility statement/audit for the *builder UI itself* (keyboard-nav, screen-reader support of the editor) — the accessibility engineering found is entirely about the **output email's** accessibility, not the app's own. | `contrast.ts`, `checks.ts` |
| **Localization** | The AI brief generator supports 3 output languages (English, Tamil, Hindi) for generated **content**. **Not Found in Codebase:** any localization of the **application UI itself** (no i18n framework, all UI strings are hardcoded English JSX). | `brief-types.ts` |
| **Usability** | Debounced auto-save with a persistent, honest status line; non-blocking quality checks with "Go to block" jump-to; a single two-level Settings hub; keyboard shortcuts (Ctrl+Z/Shift+Z/Y, Ctrl+D, Delete, Escape) documented in-app under About. | `TopBar.tsx`, `AboutSection.tsx` |
| **Backup** | A one-click full-data export (brands, templates, saved blocks, images, versions) as a single JSON file. | `backup.ts` |
| **Recovery** | Version history (20/email) + undo/redo (100 steps, in-memory) + auto-save + a pre-restore/pre-replace snapshot rule that makes every restore itself reversible. | `versions.ts`, `store.ts` |
| **Monitoring** | **Not Found in Codebase.** No telemetry, error reporting, or usage analytics of any kind exists in `src/`. | — |

---

## 26. Assumptions

| # | Assumption | Status |
|---|---|---|
| 1 | The product is intended for a single internal team (named "Vee MARCOM") rather than a multi-tenant external audience | Fact (1A quote) + Inference (extrapolated scope) |
| 2 | A team sharing brand kits/templates across people does so by physically sharing a browser profile or by manual JSON export/import, not by any live sync | Fact (README "Known limitations") |
| 3 | The organization has its own OpenAI account/billing and accepts that costs are incurred directly, outside this app's visibility | Inference (architecture + explicit no-cost-estimator finding) |
| 4 | Sending the finished email through an ESP is a separate, already-existing process the team owns | Fact (README: "No sending") |
| 5 | Users are trusted individually — there is no need to prevent one browser's user from seeing/editing any other data in that same browser | Fact (no RBAC exists) |
| 6 | The quality-check thresholds (90/102KB, WCAG AA, 12px/44px) reflect real inbox-client behavior (Gmail clipping, accessibility standards) rather than arbitrary numbers | Inference, consistent with how each is described in-code (e.g., "modeled on Gmail's clipping behavior") |
| 7 | A future multi-user/role system is plausible enough to be worth leaving seams for (`createdBy`/`updatedBy`, `canEditBrand`) even though none exists today | Fact (explicit in-code "future-proofing" comments, 1A) |

---

## 27. Constraints

| Constraint | Type | Detail |
|---|---|---|
| No backend | Technical | Every feature must work from a static SPA; AI calls must be browser-callable directly (verified via CORS preflight before 5A was even built) |
| ~5MB `localStorage` budget | Technical | Shared across every persisted category except AI image drafts (IndexedDB) and AI keys (also localStorage, but excluded from the quota-recovery conversation in practice since keys are tiny) |
| Email-client HTML constraints | Technical/business | No flexbox, no grid, no CSS `position`, table-based layout, inline styles, Outlook conditional markup required — because the output must render in real inboxes, not just browsers |
| Email clients strip `data:` URIs | Technical | Drives the entire "logo preview vs. hosted URL" split (1A) and the entire "no file upload" policy (2C-1) |
| No image hosting exists | Business/operational | AI-generated images can never ship as real bytes in an export — only as a placeholder — until the team stands up or adopts hosting themselves |
| BYO API key, no backend proxy | Business | The app can never meter, cap, or centrally bill AI usage; each individual user bears their own OpenAI cost directly |
| CORS header allow-list is exactly `authorization,content-type` | Technical | No organization/telemetry header can ever be sent to OpenAI from this app, by the provider's own enforcement |
| OpenAI model lifecycle (models deprecate/rename) | Operational | Already observed twice in the project's own history — `gpt-image-1` stopped existing; `gpt-4.1-mini` momentarily considered stale — model lists must be kept current by whoever maintains the code |
| No dedicated lint tooling | Technical/process | `tsc --noEmit` is the only static-analysis gate (explicitly noted as a fact, not treated as a problem, in the project's own history) |

---

## 28. Risks

| Risk | Category | Description | Mitigation present today |
|---|---|---|---|
| Total data loss on a lost/wiped/corrupted browser profile | Data | Everything lives in one browser's local storage with no automatic cloud backup | Manual "Export all data" backup exists, but is **not automatic or scheduled** — a user who never exports loses everything if the browser profile is lost |
| `localStorage` quota exhaustion | Data/Operational | A heavy user (many large templates/images) can hit the ~5MB ceiling | Automatic version-history pruning is the only automated relief; templates/brands/images/saved blocks have no automated pruning — a user must manually delete things once genuinely full |
| API key exposure | Security | The key is BYO, unencrypted if remembered, and lives in a browser that could be compromised by other means (malware, shared machine) | In-memory default, explicit "unencrypted" disclosure, redaction in error paths, exclusion from every serialization surface — residual risk is accepted and disclosed, not eliminated |
| Unreviewed AI content shipping in a real send | Process | `AI_DRAFT_UNREVIEWED` is a **warning, not a block** — a user can export and send an AI-generated draft without ever clicking "Mark as reviewed" | The warning is visible in both the badge and the Export dialog's summary line, but nothing technically prevents ignoring it (consistent with the product-wide "never block" philosophy, §13 BR-05) |
| AI hallucination / factual error in brief-generated copy | Process | The system prompt forbids inventing facts and requires a bracket placeholder instead, but nothing guarantees the model complies | `BRIEF_PLACEHOLDER_LEFT` surfaces leftover placeholders; human review is strongly encouraged via the unreviewed-warning, but is not enforced |
| Sending a preset with placeholder art/copy by mistake | Process | Every preset ships `picsum.photos` images and fictional copy on purpose | `IMAGE_PLACEHOLDER`/`LINK_PLACEHOLDER_DOMAIN` checks exist precisely to surface this, but export is never blocked |
| Model deprecation breaking AI features silently | Integration | OpenAI can rename/retire a model id (already happened once in this project's history) | Hardcoded model lists require a code update when this happens; "Other model id" free-text and the model-access-denial chip provide a partial, reactive safety net, not prevention |
| Cost overrun from AI usage | Operational | No usage cap, budget, or cost estimator exists anywhere in the app | None — explicitly absent (§3) |
| Email rendering differences across clients the engine cannot fully model | Output quality | Contrast over a background image is unmeasurable; Outlook-on-Windows ignores certain background techniques; Gmail's own apps ignore all dark-mode CSS | The engine is honest about its limits (`CONTRAST_UNKNOWN`, documented Outlook/Gmail caveats in the Preview UI) rather than guessing |
| Single point of failure: one browser, one person | Business continuity | If the one person with the browser profile is unavailable, the team's brand kits/templates are inaccessible without a prior backup export | None beyond the manual backup feature |

---

## 29. Gap Analysis

| Gap | Category | Detail |
|---|---|---|
| No image hosting | Missing requirement (acknowledged) | AI-generated images can never ship for real without a manual download-and-rehost step; the README's own "Ideas for next versions" lists this |
| No sending integration | Missing requirement (acknowledged) | The product stops at HTML/plain-text export; no ESP is ever called |
| No multi-user collaboration or sync | Missing requirement (acknowledged) | Everything is per-browser; the seams (`createdBy`/`canEditBrand`) exist but nothing is built on them |
| No cost/usage controls for AI | Missing requirement | No cap, estimate, or visibility into OpenAI spend from within the app |
| No Checks re-run on image-library re-probe | Partially implemented | Editing a brand re-runs Checks automatically; re-probing or adding a library image does not — the next unrelated design edit picks it up (explicitly documented as a known gap in Feature 3A) |
| No CTA-field targeting in brief generation | Partially implemented / accepted limitation | A user-supplied CTA label/URL applies to **every** `cta_label`-kind slot a preset exposes, not to one specifically chosen button (6A, explicitly documented trade-off) |
| No cross-panel "use this AI image prompt" handoff | Partially implemented | The brief review screen only offers "Copy" for a suggested image prompt — no one-click "open in AI image panel" (6A, explicitly deferred as non-blocking) |
| Task-settings staleness across open panels | Technical limitation affecting UX | Changing a task's model in Settings while the AI image panel is simultaneously open does not live-update that panel's visible model name until an unrelated re-render — deliberately not fixed with a shared subscription, as "disproportionate to one rare case" (6B, explicitly documented) |
| No automated pruning for templates/brands/images/saved blocks | Technical limitation | Only version history is auto-pruned under quota pressure; everything else requires manual deletion once storage is genuinely full |
| No accessibility audit of the builder UI itself | Missing requirement | All accessibility engineering targets the **output email**, not the editor application |
| No localization of the application UI | Missing requirement | Only AI-generated **content** supports multiple languages; the UI itself is English-only, hardcoded |
| No automated/CI pipeline evidence | Not Found in Codebase | No CI config file was found in the directories read for this document; `npm test`/`npm run build` exist as scripts but whether they run automatically on push is **Not Found in Codebase** within this review's scope |

---

## 30. Future Enhancements

Sourced primarily from the README's own **"Ideas for next versions"** section, supplemented with Inference drawn from the gaps above.

| Enhancement | Priority (Inference) | Business value |
|---|---|---|
| Image hosting (so AI-generated and uploaded images can ship as real bytes, not placeholders) | **High** | Removes the single biggest "doesn't actually work yet" gap in the AI-image feature; directly unblocks real sends using AI-generated art |
| Supabase persistence (auth + a `templates` table with the design JSON in a `jsonb` column) — named explicitly in the README | **High** | Would be the foundation for real multi-user collaboration, cross-device sync, and finally giving the existing `createdBy`/`canEditBrand` seams something real to do |
| Test-email sending | **Medium** | Closes the loop between "export" and "verify it actually renders correctly" without leaving the tool |
| Merge-tag picker with groups and display conditions | **Medium** | Improves personalization sophistication for larger contact-field sets |
| Countdown-timer block | **Low** | A common promotional-email pattern not currently supported |
| Template-gallery thumbnails | **Low** | Visual browsing improvement for the Templates modal |
| AI "generate section" (targeted regeneration using the design JSON schema, rather than whole-email brief generation) | **Medium** | Lets a user ask AI to redo just one section of an otherwise-finished email, instead of regenerating or hand-editing |
| A second real AI provider (the current registry has one unfilled placeholder slot) | **Medium** | Makes the already-built fallback-chain feature (6B) actually useful across providers, not just across models within one provider |
| Usage/cost visibility for AI calls | **Medium** | Directly addresses the "no cost control" risk in §28 |
| Automated pruning or clearer warnings for templates/brands/images approaching quota | **Low–Medium** | Reduces the risk of an unrecoverable "storage full" moment for a heavy user |

