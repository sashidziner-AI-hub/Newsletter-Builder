# Newsletter Builder — Business Requirements Document

Reverse-engineered from the codebase at `newsletter-builder` (a client-only React/TypeScript/Vite single-page app — no backend, no database, no login) plus its own `docs/PROGRESS.md` feature history, covering git history `0094008`…`9abc092` on branch `feature/6a-brief-generation`.

**How this BRD is organized:** it is split into 4 parts (39 sections total) plus this index and a verification log. Every claim in every part is **Fact** unless explicitly tagged **Inference** (a conclusion drawn from behavior, not stated verbatim) or **Not Found in Codebase** (looked for, confirmed absent). See [`VERIFICATION_NOTES.md`](./VERIFICATION_NOTES.md) for the complete, section-by-section list of every Inference and Not-Found item in this document.

## Table of Contents

### [Part 1 — BRD-01.md](./BRD-01.md)
1. [Executive Summary](./BRD-01.md#1-executive-summary)
2. [Business Overview](./BRD-01.md#2-business-overview)
3. [Business Objectives](./BRD-01.md#3-business-objectives)
4. [Stakeholders](./BRD-01.md#4-stakeholders)
5. [User Roles](./BRD-01.md#5-user-roles)
6. [Functional Scope](./BRD-01.md#6-functional-scope)
7. [Complete Business Process](./BRD-01.md#7-complete-business-process)
8. [Module Documentation](./BRD-01.md#8-module-documentation)
9. [Feature Documentation](./BRD-01.md#9-feature-documentation)
10. [Screen Documentation](./BRD-01.md#10-screen-documentation)

### [Part 2 — BRD-02.md](./BRD-02.md)
11. [Navigation Flow](./BRD-02.md#11-navigation-flow)
12. [User Journey](./BRD-02.md#12-user-journey)
13. [Business Rules](./BRD-02.md#13-business-rules)
14. [Workflow States](./BRD-02.md#14-workflow-states)
15. [Data Requirements](./BRD-02.md#15-data-requirements)
16. [Business Data Dictionary](./BRD-02.md#16-business-data-dictionary)
17. [Validation Rules](./BRD-02.md#17-validation-rules)
18. [Notifications](./BRD-02.md#18-notifications)
19. [Reports](./BRD-02.md#19-reports)
20. [Dashboards](./BRD-02.md#20-dashboards)

### [Part 3 — BRD-03.md](./BRD-03.md)
21. [Integrations](./BRD-03.md#21-integrations)
22. [External Systems](./BRD-03.md#22-external-systems)
23. [Security Requirements](./BRD-03.md#23-security-requirements)
24. [Audit Trail](./BRD-03.md#24-audit-trail)
25. [Non-Functional Requirements](./BRD-03.md#25-non-functional-requirements)
26. [Assumptions](./BRD-03.md#26-assumptions)
27. [Constraints](./BRD-03.md#27-constraints)
28. [Risks](./BRD-03.md#28-risks)
29. [Gap Analysis](./BRD-03.md#29-gap-analysis)
30. [Future Enhancements](./BRD-03.md#30-future-enhancements)

### [Part 4 — BRD-04.md](./BRD-04.md)
31. [Acceptance Criteria](./BRD-04.md#31-acceptance-criteria)
32. [User Stories](./BRD-04.md#32-user-stories)
33. [Business Glossary](./BRD-04.md#33-business-glossary)
34. [Frequently Asked Questions](./BRD-04.md#34-frequently-asked-questions)
35. [Business Process Diagrams](./BRD-04.md#35-business-process-diagrams)
36. [End-to-End Business Scenario](./BRD-04.md#36-end-to-end-business-scenario)
37. [Traceability Matrix](./BRD-04.md#37-traceability-matrix)
38. [Production Readiness (Business Perspective)](./BRD-04.md#38-production-readiness-business-perspective)
39. [Final Business Knowledge Validation](./BRD-04.md#39-final-business-knowledge-validation)

### [Verification Notes](./VERIFICATION_NOTES.md)
Every Inference and Not-Found-in-Codebase item in this BRD, listed by section, with its reasoning — so a reviewer can check this document's honesty without re-reading the whole thing.

---

## One-paragraph orientation

Newsletter Builder is a **single-user, browser-only** drag-and-drop email template builder: no server, no database, no login — every brand kit, saved email, image, and AI key lives in one browser's local storage. It produces email-client-safe HTML and plain text for a human to paste into their own ESP (SES, SendGrid, Mailchimp, HubSpot, …); it never sends anything itself. Two AI features (image generation and "generate an email from a brief") call OpenAI directly from the browser with a user-supplied API key, always behind a non-blocking quality-check engine and (for briefs) a human-review step. If a BRD section below reads "Not Found in Codebase" for something a typical enterprise BRD would expect (roles, SSO, approval chains, integrations, audit logs, dashboards), that is because this product genuinely does not have one — not because the research missed it.
