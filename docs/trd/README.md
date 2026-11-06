# Newsletter Builder — Technical Requirements Document

Reverse-engineered, read-only, from source code, config files, the automated test suite, `docs/PROGRESS.md`, and the existing `docs/brd/`/`docs/prd/`. No source file was changed to produce this document. Tagging convention: **Fact** (default — stated directly in code/config/tests), **Inference:** (a conclusion drawn from behavior, not stated verbatim), **Not Found in Codebase** (looked for, confirmed absent). See [`VERIFICATION_NOTES.md`](./VERIFICATION_NOTES.md) for every Inference/Not-Found item.

**Verified at write time:** `npx tsc --noEmit` → 0 errors. `npm test` → 41 test files, 950 tests, all passing.

## Table of Contents

### [Part 1 — TRD-01-architecture.md](./TRD-01-architecture.md)
1. [System Architecture Overview](./TRD-01-architecture.md#1-system-architecture-overview)
2. [Technology Stack & Dependencies](./TRD-01-architecture.md#2-technology-stack--dependencies)
3. [Project & Module Structure](./TRD-01-architecture.md#3-project--module-structure)
4. [Data Model & Type System](./TRD-01-architecture.md#4-data-model--type-system)

### [Part 2 — TRD-02-runtime-and-persistence.md](./TRD-02-runtime-and-persistence.md)
5. [State Management (Zustand Store)](./TRD-02-runtime-and-persistence.md#5-state-management-zustand-store)
6. [Rendering & Export Pipeline](./TRD-02-runtime-and-persistence.md#6-rendering--export-pipeline)
7. [Persistence Layer](./TRD-02-runtime-and-persistence.md#7-persistence-layer)
8. [Business Rule / Quality Engine](./TRD-02-runtime-and-persistence.md#8-business-rule--quality-engine)

### [Part 3 — TRD-03-ai-and-components.md](./TRD-03-ai-and-components.md)
9. [AI Integration Architecture](./TRD-03-ai-and-components.md#9-ai-integration-architecture)
10. [Component Architecture](./TRD-03-ai-and-components.md#10-component-architecture)
11. [Build, Test & Tooling](./TRD-03-ai-and-components.md#11-build-test--tooling)

### [Part 4 — TRD-04-security-risks-and-appendix.md](./TRD-04-security-risks-and-appendix.md)
12. [Security Architecture](./TRD-04-security-risks-and-appendix.md#12-security-architecture)
13. [Performance Characteristics](./TRD-04-security-risks-and-appendix.md#13-performance-characteristics)
14. [Technical Risks, Debt & Constraints](./TRD-04-security-risks-and-appendix.md#14-technical-risks-debt--constraints)
15. [Developer Environment & Workflow](./TRD-04-security-risks-and-appendix.md#15-developer-environment--workflow)
16. [Glossary](./TRD-04-security-risks-and-appendix.md#16-glossary)

### [Verification Notes](./VERIFICATION_NOTES.md)
Every Inference and Not-Found-in-Codebase item, by section, with reasoning.

---

## One-paragraph orientation

Newsletter Builder is a client-only React/TypeScript SPA (Vite, Zustand+Immer, no backend) with a bring-your-own-key AI subsystem calling OpenAI directly from the browser. This TRD covers its architecture, exact data model (quoted from `src/types.ts`), state-management and rendering pipeline, the complete `localStorage`/IndexedDB key inventory, the AI integration's security boundaries (CORS constraints, key redaction, structural secret-exclusion from backups), component patterns, and the build/test tooling — including this repository's own `scripts/docs-to-pdf/` documentation-build tool (§15.2), which is what turns this TRD into `docs/trd/pdf/TRD.pdf`.
