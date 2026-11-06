# Newsletter Builder — Product Requirements Document

Reverse-engineered, **read-only**, from source code, the automated test suite, `docs/PROGRESS.md`, and `docs/brd/` — no source file was changed to produce this document. Every requirement cites a BRD business-rule id (`BR-xx`) where one applies, or states "no BRD link." Every non-obvious statement is tagged **Fact** (default), **Inference:** (a conclusion drawn from behavior, not stated verbatim), or **Not Found in Codebase** (looked for, confirmed absent). See [`VERIFICATION_NOTES.md`](./VERIFICATION_NOTES.md) for the complete list of every Inference/Not-Found item.

**Verified at write time (not quoted from memory):** `npx tsc --noEmit` → 0 errors. `npm test` → 41 test files, 950 tests, all passing.

## ID conventions

| Prefix | Meaning | Defined in | Stable across parts? |
|---|---|---|---|
| `F-xxx` | A feature from the inventory | Part 1 §4 | Yes — same id used in Parts 2–4 |
| `PR-xxx` | A functional requirement | Part 3 §8 | Yes — same id used in Part 4 §15 |
| `BR-xx` | A business rule from the BRD | `docs/brd/BRD-02.md` §13 | Cited, never redefined, here |

No id is renumbered between parts. "No BRD link" means the BRD has no matching business rule for that item — it is a real, shipped capability, just not one the BRD formalized as a numbered rule.

## Table of Contents

### [Part 1 — PRD-01-overview.md](./PRD-01-overview.md)
1. [Product Overview](./PRD-01-overview.md#1-product-overview)
2. [Goals, Non-Goals, and Success Metrics](./PRD-01-overview.md#2-goals-non-goals-and-success-metrics)
3. [Personas and Use Cases](./PRD-01-overview.md#3-personas-and-use-cases)
4. [Feature Inventory](./PRD-01-overview.md#4-feature-inventory)

### [Part 2 — PRD-02-feature-specs.md](./PRD-02-feature-specs.md)
5. [Detailed Feature Specifications](./PRD-02-feature-specs.md) — one spec per feature, F-001 through F-023

### [Part 3 — PRD-03-flows-and-requirements.md](./PRD-03-flows-and-requirements.md)
6. [User Flows](./PRD-03-flows-and-requirements.md#6-user-flows)
7. [Screen and Panel Inventory](./PRD-03-flows-and-requirements.md#7-screen-and-panel-inventory)
8. [Functional Requirements (PR ids)](./PRD-03-flows-and-requirements.md#8-functional-requirements-pr-ids)
9. [Product-Level Non-Functional Requirements](./PRD-03-flows-and-requirements.md#9-product-level-non-functional-requirements)
10. [Data From the User's Perspective](./PRD-03-flows-and-requirements.md#10-data-from-the-users-perspective)

### [Part 4 — PRD-04-release-and-appendix.md](./PRD-04-release-and-appendix.md)
11. [Release Scope](./PRD-04-release-and-appendix.md#11-release-scope)
12. [Risks and Open Questions](./PRD-04-release-and-appendix.md#12-risks-and-open-questions)
13. [Analytics and Telemetry](./PRD-04-release-and-appendix.md#13-analytics-and-telemetry)
14. [QA and Acceptance — Manual Verification Checklist](./PRD-04-release-and-appendix.md#14-qa-and-acceptance--manual-verification-checklist)
15. [Traceability Matrix](./PRD-04-release-and-appendix.md#15-traceability-matrix)
16. [Glossary](./PRD-04-release-and-appendix.md#16-glossary)

### [Verification Notes](./VERIFICATION_NOTES.md)
Every Inference and Not-Found-in-Codebase item, listed by section, with reasoning.

---

## One-paragraph orientation

Newsletter Builder is a single-user, browser-only drag-and-drop email builder with no backend, no login, and no analytics. This PRD inventories 23 shipped features (`F-001`–`F-023`), 71 functional requirements (`PR-001`–`PR-071`, MoSCoW-prioritized as Inference), and cross-references every one against the 30 business rules already documented in `docs/brd/`. Where a typical PRD template expects a vision statement, a prioritization document, analytics, or a release process, this one says "Not Found in Codebase" rather than inventing one — the product genuinely does not have those artifacts today.
