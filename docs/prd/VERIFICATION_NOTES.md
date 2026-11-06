# Verification Notes

Every **Inference** and **Not Found in Codebase** statement across `PRD-01-overview.md`–`PRD-04-release-and-appendix.md`, by section, with the reasoning behind each tag. Anything not listed here is a **Fact** — stated directly in source code, tests, `docs/PROGRESS.md`, or `docs/brd/`. Real counts in this PRD (test suite, type check) were run fresh at write time, not quoted from memory or from `docs/PROGRESS.md`'s own log — see the verification block at the top of `PRD-01-overview.md`.

---

## Part 1 (PRD-01-overview.md)

### §1 Product Overview
- **Not Found in Codebase** — a written vision statement, mission statement, or product-strategy document. *Reasoning:* none exists; the "Vision" line is an **Inference**, synthesized from `README.md`'s and `docs/PROGRESS.md`'s own framing of each feature's purpose, presented as a quote of this document's own synthesis (not a quote found verbatim anywhere).
- **Inference** — "Positioning" (the ESP-editor/Canva-alternative comparison). *Reasoning:* no competitive-positioning document exists; this is a reasonable, clearly-labeled analyst judgment based on the product's actual architecture (client-only, BYOK AI, built-in quality engine), not a stated claim.
- **Inference** — "Not a general page-builder." *Reasoning:* no explicit statement rules this out; drawn from every rendering constraint (table layout, no flex/grid, inline styles) being specifically email-oriented.

### §2 Goals, Non-Goals, Success Metrics
- **Inference** — All 7 goals (G1–G7). *Reasoning:* no OKR/goals document exists; each is derived from the stated purpose of the feature(s) that implement it, per `docs/PROGRESS.md`'s own framing.
- **Fact, with Inference labeling kept visible for honesty** — the 7 non-goals are each backed by a direct code/doc citation (README, `imageHosting.configured`, `user.ts` comment, exhaustive grep results, `checks.ts` comment, absence of i18n framework) — these are Facts, not inferences, despite living in a "goals" section; flagged here only so a reviewer doesn't need to re-derive that distinction.
- **Not Found in Codebase** — Any analytics, telemetry, or usage-metrics instrumentation. *Reasoning:* exhaustive, re-confirmed independently for this PRD (see Part 4 §13's separate grep pass).
- **Inference** — The entire "observable in-app counter" framing as a success-metrics substitute. *Reasoning:* these are real UI elements (Fact), but calling them "success metrics" is this document's own interpretive framing, since the product itself never calls them that and never aggregates them.

### §3 Personas and Use Cases
- **Not Found in Codebase** — A brand-owner-only, approver, viewer-only, or admin role. *Reasoning:* `canEditBrand()`/`getAccessibleBrands()` are documented in-code as future seams that currently grant unconditional access; no second role is ever checked against.
- **Inference** — The persona label "Marketing/Communications editor" itself. *Reasoning:* the code never names a role; "Vee MARCOM team" (Fact, from `docs/PROGRESS.md`) is generalized into a persona label for this document's structure.

### §4 Feature Inventory
- **Inference** — The specific grouping of 23 features (F-001–F-023), their Area labels, and the Status column's Complete/Partial judgment for F-016/F-017. *Reasoning:* no feature-list document exists; the grouping/status judgment is this PRD's own organization of Facts already established (e.g., "URL-only by design" for F-016 is a direct quote/fact from the code comments, but calling that "Partial" rather than "Complete" is this document's classification choice).

---

## Part 2 (PRD-02-feature-specs.md)

### General
- **Inference** — Every Given/When/Then acceptance-criteria block, across all 23 feature specs. *Reasoning:* no formal acceptance-criteria or user-story document exists in the repository; every block is phrased from tested/documented behavior and cross-checked against source, not copied from an existing artifact.
- **Inference** — Every "User story" line (the "As the editor, I want... so that..." framing). *Reasoning:* same basis — these are this document's restatement of a real capability in user-story form, not a quote of an existing user story (none exist in the repo).

### F-018 (Generate email from a brief)
- **Not Found in Codebase** — "5B," "5C," and a standalone "4A" feature. *Reasoning:* `docs/PROGRESS.md` itself explicitly states these do not exist as separate features (only 5A plus its 4 amendments); this PRD repeats that finding rather than inventing or silently dropping the reference.

---

## Part 3 (PRD-03-flows-and-requirements.md)

### §8 Functional Requirements
- **Inference** — Every MoSCoW priority (Must/Should/Could/Won't) across all 71 PR ids. *Reasoning:* no prioritization document exists; the rule used (Must = breaks a BR-cited guarantee or a core authoring workflow if removed; Should = documented deliberate behavior, not load-bearing for correctness; Could = UX nicety; Won't = explicitly out of scope) is stated plainly in the section so a reviewer can disagree with a specific call without needing to guess the method.
- **Inference** — The PR-001...PR-071 wording itself (requirement phrasing). *Reasoning:* no requirements-document predates this PRD; each requirement is this document's restatement of tested/documented behavior as a "shall" statement.

### §9 Non-Functional Requirements
- **Not Found in Codebase** — Accessibility engineering for the *builder UI itself* (as opposed to its output email, which is extensively engineered and a Fact). *Reasoning:* no ARIA audit, accessibility statement, or keyboard-navigation test suite targeting the editor application was found.
- **Not Found in Codebase** — Any load-testing artifact or app-level performance budget (distinct from the email-size Checks rules, which govern *output* quality, not app performance). *Reasoning:* none found in `src/` or `docs/`.
- **Not Found in Codebase** — Any privacy-policy document. *Reasoning:* none exists; the privacy-relevant *engineering* (key handling, redaction) is a Fact and is cited separately from this specific absence.

### §10 Data From the User's Perspective
- No new Inference/Not-Found tags — this section restates Facts (storage key names, what leaves the browser) already established in `docs/brd/BRD-02.md` §15–16 and re-verified against source for this PRD.

---

## Part 4 (PRD-04-release-and-appendix.md)

### §11 Release Scope
- **Not Found in Codebase** — Any tagged release, changelog with version numbers, or release-branch strategy. *Reasoning:* only a single `package.json` version (`0.1.0`) and an incrementing prose feature log (`docs/PROGRESS.md`) exist; "v1" in this PRD is this document's own label for "the product at the commit this PRD was written against," not a label the product uses itself.
- **Inference** — Every backlog-candidate priority and rationale. *Reasoning:* the candidates themselves are drawn directly from `README.md`'s own "Ideas for next versions" list (a Fact) plus the gaps already established elsewhere in this PRD; the priority ranking and the one-line rationale per item are this document's own judgment, explicitly labeled as such in the section heading.

### §12 Risks and Open Questions
- **Inference** — All 5 open questions. *Reasoning:* by definition genuinely unresolved in the codebase (that is the point of listing them) — each is grounded in a real, cited ambiguity or seam (e.g., Q3 cites the real `createdBy`/`canEditBrand` seams) rather than a speculative question with no basis.
- The risks table itself largely restates Facts already established and cited elsewhere in this PRD and in the BRD; no new Inference/Not-Found tags beyond the open questions.

### §13 Analytics and Telemetry
- **Not Found in Codebase.** *Reasoning:* exhaustive grep across the full source tree for common analytics identifiers (`analytics`, `gtag`, `segment`, `mixpanel`, `amplitude`, `sentry`, `posthog`), re-run independently for this PRD rather than solely relying on the equivalent finding already made for the BRD — same result, now double-confirmed.

### §14 QA and Acceptance Checklist
- **Inference** — The checklist itself (phrasing, grouping, and the specific steps chosen). *Reasoning:* no QA/test-plan document exists in the repository; every line is derived directly from an acceptance-criteria block already established in Part 2 §5, restated as a manual-tester action rather than an automated assertion.

### §15 Traceability Matrix
- **Fact** — Every BR/PR/Feature/Screen mapping restates ids and files already established earlier in this PRD and in the BRD.
- **Note, not a tag:** BR-09 has no single "Must"-priority PR directly citing it (it is cited as "no single Must PR — governs jointly" across F-006/F-013/F-016/F-023) because it describes a cross-cutting architectural absence (no sync mechanism) rather than one feature's behavior — this is accurately represented as a joint governance relationship rather than forced into one artificial PR row.
- **Fact** — Every test file name in this matrix was confirmed to exist via `ls src/test/*.test.*` and to be part of the passing 41-file / 950-test run reported at the top of Part 1; none were quoted from memory.

### §16 Glossary
- No new Inference/Not-Found tags — restates terms already defined and sourced earlier in this PRD and in the BRD's own glossary.

---

## Summary count

| Tag | Approximate count across all 4 parts |
|---|---|
| **Inference** | ~20 distinct statements/sections |
| **Not Found in Codebase** | ~12 distinct statements/sections |

Consistent with the BRD's own finding: the concentrations are in sections a product-management template assumes exist for any product (a written **vision statement**, a **goals/OKR document**, **analytics/telemetry**, a **prioritization document**, a **release/changelog process**) — none of which this single-developer-history, no-backend, no-analytics internal tool actually has. That mismatch, not a gap in this research, is what drives nearly every tag in this file.
