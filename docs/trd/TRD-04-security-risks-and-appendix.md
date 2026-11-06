# Newsletter Builder — Technical Requirements Document
## Part 4 of 4 — Sections 12–16: Security, Performance, Risks, Developer Workflow, Glossary

> Continues from `TRD-03-ai-and-components.md`.

---

## 12. Security Architecture

### 12.1 Authentication/authorization: Not Found in Codebase
No login, session, password, OAuth, or JWT exists anywhere in `src/`. `src/lib/user.ts`'s own header comment: *"no login, no roles, an internal tool's substitute for an account."* `canEditBrand(user, brand)` / `getAccessibleBrands(user, brands)` are present as **named future seams** (`src/lib/brand.ts`) that currently return `true` / every active brand unconditionally.

### 12.2 Input sanitization
```ts
// src/lib/util.ts — safeUrl(): the one scheme gate every href/src passes through at render time
// Allowed: https?:, mailto:, tel:, #, //, {{, *|, or data:image/(png|jpe?g|gif|webp);base64,
// Everything else -> ''
```
Canvas content is sanitized via DOMPurify before being painted into the DOM (not an iframe); the Preview/export iframe is sandboxed **without** `allow-same-origin`/`allow-scripts`.

### 12.3 AI response validation as a security boundary
```ts
// src/lib/ai/validate.ts — magic-byte sniffing, never trusting declared content-type
// PNG: 89 50 4E 47 0D 0A 1A 0A   JPEG: FF D8 FF   WebP: RIFF....WEBP
// SVG refused outright, regardless of bytes — "a document that can carry script, not an image"
// Size cap: MAX_IMAGE_BYTES = 10 * 1024 * 1024
```
The AI brief response passes through a dedicated sanitizer (`brief-validate.ts`) — HTML tags stripped, markdown tokens stripped, bare URLs stripped — **before** any of that text is ever handed to the HTML renderer.

### 12.4 Key exposure boundary
```ts
// src/lib/ai/provider.ts
function redactKeys(text: string, key: string): string {
  // strips the exact key (>= 8 chars), plus any sk-/rk-/org-/proj- prefixed
  // token, plus any "Bearer <token>" pattern, from provider-echoed error text
}
```
Applied inside every adapter's `classify()` before an error object is constructed — there is no code path where raw provider text reaches the UI unredacted. `maskKey()` renders a key for display as first-3 + bullets + last-4 characters (or all-bullets under 8 chars); nothing that writes to disk ever uses the unmasked value for display.

### 12.5 CORS as an architectural constraint, not an afterthought
The entire BYOK architecture rests on one empirically verified fact: `OPTIONS https://api.openai.com/v1/images/generations` (and the chat-completions equivalent) answers with `access-control-allow-headers: authorization,content-type` and `access-control-allow-origin: *`. Two direct engineering consequences: no `OpenAI-Organization` or telemetry header can ever be sent (it would fail the real preflight, not just this app's own validation), and the request/response shape is designed around exactly those two headers.

### 12.6 Privacy-relevant data flows
| Data | Sent to | Trigger | Consent gate |
|---|---|---|---|
| Image generation prompt + style + optional brand color hex values | `api.openai.com` | "Send" in the AI image panel | None beyond having configured a key (no separate consent toggle for images) |
| Brief fields + brand name + brand voice guidance | `api.openai.com` | "Agree and generate" / "Generate" | Explicit, per-provider, one-time consent notice (`text-consent.ts`) — distinct from image-generation's lack of one |
| API key | `api.openai.com` only, as `Authorization: Bearer` | Every AI call | N/A — never sent anywhere else |
| Everything else (designs, brands, saved blocks, images) | Nowhere, unless the user explicitly exports/backs up a file | Manual export action only | N/A |

---

## 13. Performance Characteristics

| Mechanism | Value | Where |
|---|---|---|
| Checks re-run debounce | 500ms, also forced on a whole-design load | `App.tsx` |
| Auto-save debounce | 2000ms, plus a `beforeunload` flush | `App.tsx` |
| Undo coalescing window | 900ms (`COALESCE_MS`) | `store.ts` |
| Undo/redo stack cap | 100 steps, in-memory only (not persisted) | `store.ts` (`HISTORY_LIMIT`) |
| AI minimum request gap | 2000ms between calls for the same task | `src/lib/ai/provider.ts` |
| AI request timeout | 90,000ms, honoring both an internal timer and the caller's `AbortSignal` | `src/lib/ai/provider.ts` |
| Version-history cap | 20 per email; quota-pressure pruning removes 10 globally-oldest at a time | `versions.ts`, `storage.ts` |
| Image-library re-probe | Every item, on every library open (no batching) | `ImageLibrary.tsx` — documented as a known scaling limit "at hundreds of images" |

**Not Found in Codebase:** any load-testing artifact, Lighthouse/Web-Vitals budget, bundle-size budget, or code-splitting/lazy-loading configuration beyond Vite's own defaults.

---

## 14. Technical Risks, Debt & Constraints

| Item | Category | Detail |
|---|---|---|
| Hardcoded AI model lists | Technical debt | Model ids (`gpt-image-1-mini`, `gpt-4.1-mini`, etc.) are literal string arrays in `src/lib/ai/openai.ts`/`openai-text.ts`/`tasks.ts`; a provider renaming or retiring a model (already happened once — `gpt-image-1` stopped existing) requires a manual code change, with no automated detection |
| No automated pruning for templates/brands/images/saved blocks | Technical debt | Only version history is auto-pruned under `localStorage` quota pressure; everything else requires the user to manually delete something once genuinely full |
| Two independent "1600px" constants | Technical debt (Inference — likely unintentional duplication) | `MAX_IMAGE_WIDTH` (`checks.ts`) and `VERY_LARGE_WIDTH` (`image-audit.ts`) are the same number, defined separately — a latent risk if one is ever tuned without the other |
| Single registered AI provider | Constraint | The fallback-chain feature's data model supports multiple providers, but only one (OpenAI) is implemented — the "fallback" today is always same-provider, different-model |
| No image-hosting adapter | Constraint (deliberate) | `ImageHosting.configured === false`; every AI-generated image exports as a placeholder until manually rehosted externally |
| No CI pipeline evidence | Not Found in Codebase | No CI config file was found in the repository; whether `npm test`/`npm run build` run automatically on any event is unconfirmed either way within this review's scope |
| No dependency-vulnerability scanning configuration found | Not Found in Codebase | No `.github/dependabot.yml`, no `npm audit` CI step, no equivalent found |
| Task-settings staleness across simultaneously open panels | Documented, accepted limitation | Changing a task's model in Settings while the AI image panel is also open does not live-update that panel's header until an unrelated re-render — deliberately not fixed with a shared subscription, per the code's own comment, as "disproportionate to one rare case" |

---

## 15. Developer Environment & Workflow

### 15.1 Getting started (Fact — `README.md`)
```
npm install
npm run dev        # http://localhost:5173
npm test           # unit + component tests (vitest)
npm run build      # type-check + production build into dist/
```

### 15.2 This repository's own documentation-build tooling
A second, independent piece of tooling lives in `scripts/docs-to-pdf/` — a reusable script (not part of the application bundle, not shipped in `dist/`) that renders a folder of numbered Markdown doc parts (such as `docs/brd/`, `docs/prd/`, or this TRD) into one PDF, with Mermaid diagrams rendered to inline SVG via `@mermaid-js/mermaid-cli` and the page printed via `puppeteer` — both sharing one Chromium install (`puppeteer` is `@mermaid-js/mermaid-cli`'s own peer dependency, so only one browser is ever downloaded). Usage:
```
node scripts/docs-to-pdf/index.mjs <folder> [--no-appendix] [--out <path>] [--html <debug-path>]
npm run docs:pdf   # shorthand for the docs/brd folder specifically
```
It is read-only with respect to its Markdown inputs — it never writes back to any `.md` file — and performs a key-shaped-string scan over the merged text before producing any output, aborting rather than embedding a possible secret.

### 15.3 Environment variables
**Not Found in Codebase:** any `.env` file, `.env.example`, or `import.meta.env.VITE_*` usage in `src/` — confirmed by grep. The AI API key is entered through the UI at runtime and is never read from an environment variable or build-time constant.

---

## 16. Glossary (technical terms)

| Term | Meaning |
|---|---|
| **`commit()`** | The one internal function through which every structural/value design mutation flows (`store.ts`), pushing an undo step and clearing redo |
| **Coalescing** | Merging rapid same-field edits within a 900ms window into a single undo step |
| **`resolveDesign()` / resolve at the boundary** | Converting every `brand.*` token in a design to its literal value, exactly once, immediately before render/export |
| **`normalizeDesign()`** | The single gate through which any untrusted/stored JSON becomes a valid `Design`, used by every load path (draft, template, version, backup) |
| **`writeSafe()`** | The sole `localStorage` writer outside `storage.ts`'s own internals; implements prune-then-retry quota recovery |
| **Slot** | An AI-fillable text field in the brief-generation pipeline, derived by walking a preset's actual rendered block tree rather than hand-maintained per preset |
| **`runTask()`** | The single call-site function for any AI request; owns per-task routing, in-flight guarding, and fallback-on-error |
| **`redactKeys()`** | Strips key-shaped substrings from provider-echoed error text before it can reach the UI |
| **Draft (AI image)** | An IndexedDB-held `DraftImage` record; the `Design` object only ever stores its id (`aiDraftId`), never its bytes |
| **Schema version** | A per-category (not global) integer stamped on persisted records, letting `normalize*()` fill gaps in older records rather than rejecting them |
| **CORS preflight** | The `OPTIONS` request browsers send before a cross-origin call with custom headers; its allow-list (`authorization,content-type` only) is the architectural reason no backend proxy exists for AI calls |
