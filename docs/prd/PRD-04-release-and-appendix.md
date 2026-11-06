# Newsletter Builder — Product Requirements Document
## Part 4 of 4 — Sections 11–16: Release Scope, Risks, Analytics, QA, Traceability, Glossary

> Continues from `PRD-03-flows-and-requirements.md`. Uses the same `F-xxx`/`PR-xxx`/`BR-xx` ids established in Parts 1–3, not renumbered.

---

## 11. Release Scope

There is no versioned release history beyond a single `package.json` version (`0.1.0`) and an incrementing feature log in `docs/PROGRESS.md` — **Not Found in Codebase: any tagged release, changelog with version numbers, or release-branch strategy.** "v1" below means "the product as it exists at the commit this PRD was written against" (`9abc092`, confirmed via `git log`).

### v1 includes (as built — all 23 features from Part 1 §4)
Canvas & editing core; row layouts; atomic blocks; composite blocks; starter presets; brand kit & switcher; dark mode; merge tags; UTM tagging; plain-text export; HTML export & preview; Checks quality engine; saved blocks library; auto-save; version history; image library; AI image generation; AI brief generation; per-task AI model routing; provider fallback chains; AI key management; Settings hub & profile; import/export & backup.

### Known gaps and limitations (Fact — each explicitly acknowledged in the codebase/docs, not inferred)
| Gap | Why it exists | Evidence |
|---|---|---|
| No backend | By design — client-only SPA | `vite.config.ts` has no `server.proxy`/`server` key |
| No image hosting | Deliberately out of scope so far | `imageHosting.configured === false` |
| No test-send | No ESP integration of any kind exists | README: "No sending" |
| No multi-user / cross-device sync | No backend, no accounts | README "Known limitations" |
| No AI usage cap or cost estimator | Not built | Confirmed by exhaustive grep across `src/lib/ai/*` |
| Only one AI provider registered | A second provider slot exists in the data model but is unfilled | `src/lib/ai/openai.ts`, `PROVIDERS` array |
| Checks don't verify link liveness | Classification only, not a fetch | `checks.ts` comment: "Links are classified, not fetched" |
| No CI pipeline evidence found | Not confirmed either way within this review's scope | No CI config file found in the repository |

### Backlog candidates (Inference — priority and rationale are this PRD's own judgment; items themselves are drawn from `README.md`'s own "Ideas for next versions" plus gaps above, not invented)
| Candidate | Priority (Inference) | Rationale |
|---|---|---|
| Image hosting (so generated/uploaded images can ship as real bytes) | High | Directly closes the single biggest "doesn't fully work yet" gap in F-016/F-017 |
| Supabase persistence (auth + a `templates` table, design JSON in `jsonb`) | High | Named explicitly in the README; the only path to real multi-user/cross-device use without a from-scratch backend |
| Test-email sending | Medium | Closes the loop between "export" and "verify it renders," without leaving the tool |
| A second real AI provider | Medium | Makes the already-built fallback chain (F-020) meaningfully useful, not just same-provider-different-model |
| AI usage/cost visibility | Medium | Directly addresses the "no cost control" risk (§12) |
| Merge-tag picker with groups/display conditions | Medium | Scales personalization sophistication beyond the current 6 built-in tags |
| AI "generate section" (targeted regeneration of one block, not a whole-email brief) | Medium | A smaller, faster-feedback alternative to full brief regeneration |
| Countdown-timer block | Low | A common promotional pattern not currently supported |
| Template-gallery thumbnails | Low | Browsing improvement for the Templates modal |

---

## 12. Risks and Open Questions

### Risks
| Risk | Category | Note |
|---|---|---|
| Total data loss on a lost/corrupted browser profile | Data | No automatic off-device backup exists; only a manual "Export all data" action |
| `localStorage` quota exhaustion | Operational | Only version history is auto-pruned; templates/brands/images/saved blocks are unbounded with no automated relief |
| Unreviewed AI content shipping in a real send | Process | `AI_DRAFT_UNREVIEWED` is a warning, never a block (BR-05 applies even to AI output) |
| AI hallucination in brief-generated copy | Process | The system prompt forbids inventing facts and requires a bracket placeholder instead, but compliance is not mechanically enforced beyond the strict-schema shape |
| AI model deprecation breaking a feature silently | Integration | Already happened once in this project's own history (`gpt-image-1` stopped existing) — model lists are hardcoded and need a manual update |
| Direct, uncapped AI billing exposure per user | Operational | No usage cap or cost estimator exists anywhere in the app |
| Single point of failure: one browser, one person | Business continuity | If that person/browser is unavailable, the team's brand kits/templates are inaccessible without a prior backup export |

### Open questions (Inference — these are genuinely unresolved in the codebase, not rhetorical)
| # | Question |
|---|---|
| Q1 | Should the unreviewed-AI-content warning (`AI_DRAFT_UNREVIEWED`) ever become a hard block before export, or stay purely advisory forever, consistent with the product's "never block" philosophy? |
| Q2 | Is image hosting intended to be built in-house (e.g., a small upload API) or delegated to a third-party CDN the user configures themselves? |
| Q3 | Is multi-user/cross-device support actually on a roadmap, or are the `createdBy`/`canEditBrand` seams permanent unused scaffolding? |
| Q4 | Should AI cost visibility be a per-call estimate, a running session counter, or left entirely to the user's own OpenAI dashboard? |
| Q5 | Is a second AI provider planned, or is the fallback-chain feature (F-020) intentionally future-proofing for a scenario with no current timeline? |

---

## 13. Analytics and Telemetry

**Not Found in Codebase.** Exhaustive — no event tracking, no error-reporting SDK (e.g. Sentry), no usage-metrics collection, no A/B testing framework, and no first-party or third-party analytics script anywhere in `src/` or `index.html`. Confirmed by grep across the full source tree for common analytics identifiers (`analytics`, `gtag`, `segment`, `mixpanel`, `amplitude`, `sentry`, `posthog`) — no hits outside this document and the BRD's own prose discussing their absence.

This means: the product has no way to know, from within itself, how many emails are created, how often AI features are used, which Checks rules fire most often in practice, or whether any user has ever completed a given flow. Every "metric" discussed in §2 is a point-in-time UI readout, not telemetry.

---

## 14. QA and Acceptance — Manual Verification Checklist

A practical, per-feature-area manual regression checklist, derived directly from the acceptance criteria in Part 2 §5. Intended for a human tester running through the app; it does not replace (and in fact is already covered by) the automated suite in §15.

- [ ] **Canvas/editing (F-001, F-002):** Add, drag-reorder, duplicate, and delete a block and a row; confirm Ctrl+Z/Ctrl+Shift+Z undo/redo across a coalesced text edit and a structural change.
- [ ] **Blocks (F-003, F-004):** Add one of each of the 9 atomic + 4 composite block types; confirm a Hero layout change pads/trims cards correctly; confirm hiding the Footer removes it from Preview but not from the dimmed canvas.
- [ ] **Presets (F-005):** Apply two different presets back-to-back; confirm each is a fresh, non-aliased copy (edit one, confirm the preset picker's thumbnail for the same preset is unaffected).
- [ ] **Brand kit (F-006):** Create a brand, set a manual hex override on one field, switch to another brand, confirm the override survives while token-sourced fields re-theme.
- [ ] **Dark mode (F-007):** Toggle dark mode off, export, and diff against a dark-mode-on export of the identical design — confirm the off-export has no `dm-` classes or meta tags.
- [ ] **Merge tags (F-008):** Insert `{{first_name}}`, switch format to Mailchimp, confirm the export shows `*|FNAME|*` and the stored design is unchanged.
- [ ] **UTM (F-009):** Enable UTM, add a link that already has a `utm_source`, confirm it is not duplicated; confirm the unsubscribe link is skipped but counted.
- [ ] **Plain text (F-010):** Export plain text for an email containing a long URL; confirm it is not split mid-URL.
- [ ] **Export/Preview (F-011):** With at least one Checks error present, confirm Copy/Download remain enabled in the Export dialog.
- [ ] **Checks (F-012):** Ignore an issue, reload the app, reopen the same email, confirm it is still ignored; press "Check images load" and confirm only probed images can show as broken.
- [ ] **Saved blocks (F-013):** Save a block containing a brand-token color, insert it under a different brand, confirm it re-themes.
- [ ] **Auto-save (F-014):** Make an edit on a brand-new email, wait ~2s, confirm a record appears under "Drafts (auto-saved)" in Templates.
- [ ] **Version history (F-015):** Restore an older version, then confirm the pre-restore state is itself available to restore back to.
- [ ] **Image library (F-016):** Attempt "Upload from device" on an Image block and confirm the explicit refusal message; add a valid https URL and confirm it probes successfully.
- [ ] **AI image (F-017):** With no key configured, confirm the AI image panel opens directly into Settings; after generating, confirm "Add to email" is disabled until alt text is entered.
- [ ] **Brief generation (F-018):** Submit a brief with a CTA label filled in; confirm the created email uses that exact label, not an AI-authored one; confirm the "unreviewed" Checks warning appears and clears on "Mark as reviewed."
- [ ] **Model routing & fallback (F-019, F-020):** Configure a fallback model for one task; simulate/observe a rate-limit failure and confirm the fallback is attempted (vs. an invalid-key failure, which should not trigger a fallback).
- [ ] **AI key management (F-021):** Enter a deliberately invalid replacement key, confirm "Test and save" fails and the previously working key still shows as Connected.
- [ ] **Settings hub & profile (F-022):** Set a display name, create a new brand, confirm the brand's "created by" reflects that name; change an "Email defaults" setting and confirm an already-open email is unaffected.
- [ ] **Import/export/backup (F-023):** Export a full backup, then "Clear all local data" (confirming the typed-`DELETE` gate), then import the backup and confirm brands/templates/saved blocks/images/versions are all restored while the AI key remains unset (never backed up).

---

## 15. Traceability Matrix

BR id (from `docs/brd/BRD-02.md` §13) → PR id (Part 3 §8) → Feature → primary Screen → primary automated test file(s), confirmed to exist and pass in the test run at the top of Part 1.

| BR id | PR id | Feature | Screen | Test file(s) |
|---|---|---|---|---|
| BR-01 | PR-070 | F-006 | BrandsModal, TopBar (switcher) | `src/test/brand.test.ts` |
| BR-02 | PR-014 | F-006 | TopBar (switcher) | `src/test/brand.test.ts` |
| BR-03 | PR-015 | F-006 | BrandsModal | `src/test/brand.test.ts` |
| BR-04 | PR-016 | F-006 | BrandsModal | `src/test/brand.test.ts` |
| BR-05 | PR-028 | F-011, F-012 | ExportHtmlModal, ChecksPanel | `src/test/checks.test.ts`, `src/test/app.test.tsx` |
| BR-06 | PR-046 | F-017 | AiImagePanel | `src/test/ai.test.ts`, `src/test/ai-ui.test.tsx` |
| BR-07 | PR-031, PR-043 | F-012, F-016 | ChecksPanel, ImageLibrary | `src/test/checks.test.ts`, `src/test/image-audit.test.ts`, `src/test/image-library.test.ts` |
| BR-08 | PR-056, PR-058 | F-021 | AI settings view | `src/test/ai.test.ts`, `src/test/ai-providers.test.tsx` |
| BR-09 | (no single Must PR — governs F-006/F-013/F-016/F-023 jointly) | F-006, F-013, F-016, F-023 | — | `src/test/backup.test.ts`, `src/test/storage.test.ts` |
| BR-10 | PR-060 | F-022 | Settings → Profile | `src/test/user.test.ts` |
| BR-11 | PR-035 | F-014 | TopBar (save status) | `src/test/storage.test.ts`, `src/test/app.test.tsx` |
| BR-12 | PR-039, PR-040 | F-015 | HistoryModal | `src/test/versions.test.ts` |
| BR-13 | PR-037, PR-038 | F-014, F-015 | TopBar, HistoryModal | `src/test/storage.test.ts`, `src/test/versions.test.ts` |
| BR-14 | PR-061 | F-022 | Settings → Email defaults | `src/test/email-defaults.test.ts` |
| BR-15 | PR-064 | F-023 | Settings → Data & storage | `src/test/backup.test.ts` |
| BR-16 | PR-065 | F-023 | Settings → Data & storage | `src/test/backup.test.ts` |
| BR-17 | PR-042 | F-016 | ImageLibrary | `src/test/image-library.test.ts` |
| BR-18 | PR-071 | F-003, F-004, F-018 | RightPanel (ArticleListEditor/HeroEditor) | `src/test/blocks.test.ts`, `src/test/brief-slots.test.ts` |
| BR-19 | PR-023 | F-009 | RightPanel (Body/Email settings) | `src/test/utm.test.ts` |
| BR-20 | PR-024 | F-009 | ExportHtmlModal | `src/test/utm.test.ts` |
| BR-21 | PR-020 | F-008 | RightPanel (Body/Email settings) | `src/test/merge.test.ts` |
| BR-22 | PR-018 | F-007 | BrandsModal, PreviewModal | `src/test/dark.test.ts` |
| BR-23 | PR-019 | F-007 | BrandsModal | `src/test/dark.test.ts` |
| BR-24 | PR-010 | F-005 | NewEmailModal | `src/test/presets.test.ts` |
| BR-25 | PR-011, PR-034 | F-005, F-013 | NewEmailModal, SaveBlockDialog | `src/test/presets.test.ts`, `src/test/saved-blocks.test.ts` |
| BR-26 | PR-048 | F-018 | BriefForm, BriefReview | `src/test/brief-slots.test.ts` |
| BR-27 | PR-049 | F-018 | BriefForm | `src/test/brief-generate.test.ts`, `src/test/brief-orchestrate.test.ts` |
| BR-28 | PR-050 | F-018 | BriefReview | `src/test/brief-validate.test.ts` |
| BR-29 | PR-055 | F-020 | Settings → AI | `src/test/ai-run-task.test.ts` |
| BR-30 | PR-057 | F-021 | AI settings view | `src/test/ai-providers.test.tsx` |

**Features with no BRD-cited business rule** (F-001, F-002, F-003 beyond BR-18, F-004 beyond BR-18, F-010, F-011 beyond BR-05, F-019): these are real, tested, shipped capabilities that the BRD simply did not formalize as a numbered business *rule* (a constraint whose violation would break a guarantee) — they are covered by their own test files (`render.test.ts`, `plaintext.test.ts`, `dnd.test.ts`, `rte.test.tsx`, `ai-tasks.test.ts`, `ai-task-settings.test.ts`, `ai-task-ui.test.tsx`) and by their PR rows in Part 3 §8, just with "no BRD link."

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **F-xxx** | A feature id from the inventory in Part 1 §4, stable across all 4 PRD parts |
| **PR-xxx** | A functional requirement id from Part 3 §8, stable across all 4 PRD parts |
| **BR-xx** | A business-rule id from `docs/brd/BRD-02.md` §13 |
| **MoSCoW** | Must/Should/Could/Won't prioritization scheme used in Part 3 §8 (Inference-tagged, since no prioritization document exists in the codebase) |
| **Slot** | One AI-fillable text field in the brief-generation feature (F-018), derived automatically by walking a preset's real block tree |
| **Task (AI)** | One of the product's two AI capabilities — `text.brief` or `image.generate` — independently routed to a provider/model (F-019) |
| **Draft (AI image)** | A locally generated image's bytes, held in this browser's IndexedDB; the design only ever stores its id |
| **Resolve at the boundary** | The rule that brand color/font tokens become literal values exactly once, immediately before render/export (BR-01) |
| **Checks** | The non-blocking email-quality engine (F-012); an "issue" is one finding with a severity, message, and stable id |
| **Preset** | One of 8 fixed, brand-neutral starter structures (F-005) |
| **Saved block** | A frozen, reusable copy of a block or row (F-013) |
| **Auto-saved draft** | A `SavedTemplate` record not yet given an explicit name |
| **Fallback chain** | An ordered, user-configured list of alternate AI provider/model choices (F-020) |
| **BYOK** | Bring-your-own-key — the user supplies their own OpenAI API key, billed directly to them, no backend proxy |
| **Profile (display name)** | A local, unauthenticated label used only for `createdBy`/`updatedBy` attribution (F-022) — not a login |
| **Backup** | A one-file JSON export of brands, templates, saved blocks, images, and versions, deliberately excluding AI keys and drafts (F-023) |
