# Verification Notes

Every **Inference** and **Not Found in Codebase** statement across `TRD-01-architecture.md`–`TRD-04-security-risks-and-appendix.md`, by section, with the reasoning behind each tag. Anything not listed here is a **Fact** — stated directly in source code, config files, tests, or the existing `docs/brd/`/`docs/prd/`. The test/type-check numbers quoted in this TRD (Part 3 §11.2) were run fresh, not copied from the BRD or PRD.

---

## Part 1 (TRD-01-architecture.md)

### §1 System Architecture Overview
- **Inference** — "Why this shape" (§1.2). *Reasoning:* the CORS-preflight fact itself is a direct quote/restatement of `docs/PROGRESS.md`'s own Feature 5A notes (a Fact); concluding that this is *why* the no-backend architecture was chosen is this document's own interpretive connection, clearly labeled as such.
- **Not Found in Codebase** — Any CI/CD config, Dockerfile, infrastructure-as-code, hosting config, or deployment script, and specifically which host (if any) serves the built `dist/` bundle in practice. *Reasoning:* none of these artifacts exist in the repository; a static build output existing is a Fact, but its actual deployment destination is unconfirmable from the repo alone.

### §2 Technology Stack & Dependencies
- **Inference** — "Why each major dependency exists" (§2.2). *Reasoning:* `package.json` lists the dependency (Fact); the stated purpose for each is drawn from how it is actually used elsewhere in the codebase (confirmed during the BRD/PRD research passes), not from a dependency-rationale comment in the code itself (none exists).
- **Not Found in Codebase** — A split `tsconfig.node.json`/`tsconfig.app.json`; a `lint` script. *Reasoning:* one unified `tsconfig.json` was confirmed; `package.json`'s `scripts` object has no `lint` key.

### §3 Project & Module Structure
- **Inference** — The module dependency-direction diagram (§3.4). *Reasoning:* no dependency graph is generated or documented anywhere in the repo; this is a reconstruction from the responsibility map and the known, explicit `backup.ts`-never-imports-`key-store.ts`/`drafts.ts` guarantee (a Fact, confirmed by reading that file's own imports).

### §4 Data Model & Type System
- No new Inference/Not-Found tags — every interface quoted is a direct restatement of `src/types.ts`, cross-checked against the same data model already verified during the BRD's research pass (field names/types unchanged, confirmed by the matching test-suite results at the top of this TRD's Part 3).

---

## Part 2 (TRD-02-runtime-and-persistence.md)

- No new Inference/Not-Found tags. Every code excerpt (store shape, `resolveForOutput` order, `writeSafe` logic, the Checks rule table, the contrast math description) restates logic already directly read from source during this TRD's and the BRD's research, not inferred from indirect evidence.

---

## Part 3 (TRD-03-ai-and-components.md)

### §9 AI Integration Architecture
- No new Inference/Not-Found tags beyond those already carried over from the BRD's own AI research pass (e.g., the CORS-preflight fact, the error-classification table) — all restated as Facts with their original sourcing intact.

### §10 Component Architecture
- No new Inference/Not-Found tags — the "no router" finding, the callback-registry pattern, and the shared-`SettingsView`-component fact are all direct code observations, cross-confirmed during the BRD's screen-inventory research.

### §11 Build, Test & Tooling
- **Not Found in Codebase** — A `lint`/`format` script, or any pre-commit hook configuration (`.husky/`, `lint-staged`). *Reasoning:* none found by direct inspection of `package.json` and the repository root for this document.
- **Fact, called out for emphasis rather than tagged as Inference:** the 41-file/950-test/0-type-error numbers in §11.2 were obtained by running `npm test` and `npx tsc --noEmit` fresh, specifically for this TRD, not copied from the BRD/PRD's own (matching) numbers — stated explicitly so a reviewer doesn't need to assume staleness.

---

## Part 4 (TRD-04-security-risks-and-appendix.md)

### §12 Security Architecture
- **Not Found in Codebase** — Any authentication/authorization mechanism (restated from the BRD/PRD's own prior finding, re-verified for this document via the same `src/lib/user.ts` comment and grep sweep).

### §13 Performance Characteristics
- **Not Found in Codebase** — Any load-testing artifact, Lighthouse/Web-Vitals budget, bundle-size budget, or non-default code-splitting configuration. *Reasoning:* none found in `vite.config.ts` or elsewhere in the repository.

### §14 Technical Risks, Debt & Constraints
- **Inference** — Labeling the duplicate "1600px" constants (`MAX_IMAGE_WIDTH` in `checks.ts`, `VERY_LARGE_WIDTH` in `image-audit.ts`) as "likely unintentional duplication." *Reasoning:* both constants and their numeric equality are Facts (directly read from source); whether the duplication was ever a deliberate choice vs. an oversight is not stated anywhere in code comments, so the characterization is explicitly hedged as Inference.
- **Not Found in Codebase** — Any CI pipeline evidence, or any dependency-vulnerability-scanning configuration (Dependabot, `npm audit` in CI, Snyk, or equivalent). *Reasoning:* no such file or config found in the repository; explicitly stated as "unconfirmed either way," not as "does not exist in any environment," since a CI pipeline could in principle be configured entirely outside the repository (e.g., in a hosting platform's dashboard) with no trace in the codebase.

### §15 Developer Environment & Workflow
- **Not Found in Codebase** — Any `.env`/`.env.example` file or `import.meta.env.VITE_*` usage. *Reasoning:* confirmed by grep across `src/`; the AI key is entered at runtime through the UI, never read from a build-time or environment variable.

### §16 Glossary
- No new Inference/Not-Found tags — restates terms already defined and sourced earlier in this document.

---

## Summary count

| Tag | Approximate count across all 4 parts |
|---|---|
| **Inference** | ~7 distinct statements/sections |
| **Not Found in Codebase** | ~9 distinct statements/sections |

Lower absolute counts than the BRD or PRD, consistent with a TRD's narrower scope: most of what a TRD covers (architecture, types, storage keys, rule tables) is directly readable from source with no inference required. The genuine gaps cluster exactly where you'd expect for a project with no deployment/ops artifacts committed to the repository: **deployment destination, CI/CD, dependency scanning, and environment-variable configuration** — all absent, and stated as such rather than assumed either way.
