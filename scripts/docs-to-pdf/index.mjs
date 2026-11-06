#!/usr/bin/env node
/**
 * Turn a folder of numbered Markdown doc parts (README.md + PREFIX-NN.md parts,
 * optionally a VERIFICATION_NOTES.md appendix) into one PDF with Mermaid diagrams
 * rendered as real images.
 *
 * Usage:
 *   node scripts/docs-to-pdf/index.mjs <folder> [--no-appendix] [--out <path>]
 *
 * Example:
 *   node scripts/docs-to-pdf/index.mjs docs/brd
 *   node scripts/docs-to-pdf/index.mjs docs/prd --no-appendix
 *
 * Reusable: it does not assume the "BRD" name — it derives the folder's numbered
 * part files generically, and reads the document/app title from README.md's own
 * top-level heading. It never writes to any of the source .md files.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { renderMermaid } from '@mermaid-js/mermaid-cli';
import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import taskLists from 'markdown-it-task-lists';
import GithubSlugger from 'github-slugger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ------------------------------------------------------------------ CLI args

function parseArgs(argv) {
  const out = { folder: null, noAppendix: false, outPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-appendix') out.noAppendix = true;
    else if (a === '--out') out.outPath = argv[++i];
    else if (a.startsWith('--out=')) out.outPath = a.slice('--out='.length);
    else if (a === '--html') out.htmlDebugPath = argv[++i];
    else if (a.startsWith('--html=')) out.htmlDebugPath = a.slice('--html='.length);
    else if (!a.startsWith('--') && !out.folder) out.folder = a;
  }
  if (!out.folder) {
    console.error('Usage: node scripts/docs-to-pdf/index.mjs <folder> [--no-appendix] [--out <path>]');
    process.exit(1);
  }
  return out;
}

// ------------------------------------------------------------ file discovery

/** Matches a leading "PREFIX-NN" at the start of a filename, whether followed
 *  directly by ".md" (e.g. "BRD-01.md") or by more slug text before ".md"
 *  (e.g. "PRD-01-overview.md"). Captures the number for sorting. */
const NUMBERED_PART_RE = /^[A-Za-z]+-(\d+)(?:[-.]|$)/;

/** Finds README.md, numbered "PREFIX-NN[-slug].md" parts (sorted numerically),
 *  any other leftover .md files, and VERIFICATION_NOTES.md (kept for last, as
 *  the optional appendix) inside `folderAbs`. Generic — no hardcoded prefix. */
async function discoverFiles(folderAbs) {
  const entries = (await readdir(folderAbs)).filter((f) => f.toLowerCase().endsWith('.md'));
  const readme = entries.find((f) => f.toLowerCase() === 'readme.md') || null;
  const verification = entries.find((f) => f.toLowerCase() === 'verification_notes.md') || null;

  const numbered = entries
    .filter((f) => f !== readme && f !== verification && NUMBERED_PART_RE.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(NUMBERED_PART_RE)[1], 10);
      const nb = parseInt(b.match(NUMBERED_PART_RE)[1], 10);
      return na - nb;
    });

  const rest = entries
    .filter((f) => f !== readme && f !== verification && !numbered.includes(f))
    .sort();

  const bodyOrder = [...numbered, ...rest];
  return { readme, verification, bodyOrder };
}

// --------------------------------------------------------- content transforms

/** Strips lines that would duplicate the cover title (lone "# Heading") and
 *  blockquote lines that are pure cross-file navigation notices (they contain
 *  this folder's own repo-relative path, e.g. "docs/brd/README.md"), while
 *  leaving everything inside fenced code blocks untouched. */
function stripFrontMatter(text, folderTag) {
  const lines = text.split('\n');
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (!inFence) {
      if (/^#\s/.test(line)) continue; // a lone top-level "# Title" line
      if (/^\s{0,3}>/.test(line) && line.includes(folderTag)) continue; // self-referential nav blockquote
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Rewrites markdown links that point at a sibling file in this same folder
 *  (e.g. "./BRD-01.md#1-executive-summary" or "./VERIFICATION_NOTES.md") into
 *  in-document anchors, since after merging there is only one document. Links
 *  elsewhere (external URLs, other repo paths) are left untouched. */
function rewriteSiblingLinks(text, siblingMap) {
  return text.replace(
    /\]\(\s*\.?\/?([A-Za-z0-9_.-]+\.md)(#[^\s)]+)?\s*\)/gi,
    (whole, file, frag) => {
      const key = file.toLowerCase();
      if (!siblingMap.has(key)) return whole;
      if (frag) return `](${frag})`;
      const fallback = siblingMap.get(key);
      return fallback ? `](#${fallback})` : whole;
    },
  );
}

/** Parses "# App Name — Document Title" (em dash or hyphen separated) from a
 *  file's first H1. Falls back to using the whole heading as the doc title. */
function parseTitle(rawText, fallback) {
  const m = rawText.match(/^#\s+(.+)$/m);
  if (!m) return { appName: '', docTitle: fallback };
  const full = m[1].trim();
  const parts = full.split(/\s+—\s+|\s+-\s+/);
  if (parts.length >= 2) {
    return { appName: parts[0].trim(), docTitle: parts.slice(1).join(' - ').trim() };
  }
  return { appName: '', docTitle: full };
}

// --------------------------------------------------------------- secret scan

const SECRET_PATTERNS = [
  { name: 'OpenAI-style secret key', re: /\bsk-[A-Za-z0-9]{10,}/ },
  { name: 'OpenAI-style restricted key', re: /\brk-[A-Za-z0-9]{10,}/ },
  { name: 'Bearer token', re: /\bBearer\s+[A-Za-z0-9._-]{16,}/ },
  { name: 'key/secret/token assignment', re: /\b(?:api[_-]?key|secret|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
];

function scanForSecrets(mergedText) {
  const hits = [];
  const lines = mergedText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(lines[i])) hits.push({ line: i + 1, pattern: name });
    }
  }
  return hits;
}

// ---------------------------------------------------------- mermaid handling

/** Best-effort, non-destructive syntax fixes for a FAILED diagram, tried only
 *  against an in-memory copy — never written back to any .md file. */
function attemptAutoFix(source) {
  let fixed = source;
  // Curly quotes/dashes from a paste are a common, silent Mermaid parse-breaker.
  fixed = fixed.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  // Strip a BOM and trailing whitespace per line.
  fixed = fixed.replace(/^﻿/, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n');
  // A node-label bracket containing an internal double quote (e.g. a quoted
  // phrase inside A[Confirm: "like this"]) breaks Mermaid's parser — it is
  // not a wrapping quote, just text that happens to contain one. Swapping it
  // for a single quote is the simplest change that is always valid Mermaid.
  fixed = fixed.replace(/\[([^\]\n]*)\]/g, (whole, inner) => {
    if (!inner.includes('"')) return whole;
    return `[${inner.replace(/"/g, "'")}]`;
  });
  // Quote node-label brackets that contain unescaped ()/ characters, e.g.
  // A[Some (text)] -> A["Some (text)"], which is the single most common
  // real-world Mermaid syntax error.
  fixed = fixed.replace(/(\[)([^"[\]\n]*[()/][^"[\]\n]*)(\])/g, (whole, open, inner, close) => {
    if (inner.trim().startsWith('"')) return whole;
    return `${open}"${inner.replace(/"/g, '\\"')}"${close}`;
  });
  return fixed === source ? null : fixed;
}

/** The text of the first "## Heading" line in a file (after H1 stripping),
 *  used as the fallback link target for a bare file-only sibling link (one
 *  with no "#fragment" already). Skips fenced code blocks. */
function firstH2Text(strippedText) {
  const lines = strippedText.split('\n');
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^##\s+(.+)$/);
    if (m) return m[1].trim();
  }
  return null;
}

/** Scans the ORIGINAL (untransformed) file text for every ```mermaid fence and
 *  records its 1-indexed starting line, for honest file+line failure reports. */
function locateMermaidBlocks(fileLabel, rawText) {
  const locations = [];
  const lines = rawText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^```mermaid\s*$/.test(lines[i].trim())) {
      locations.push({ file: fileLabel, line: i + 1 });
    }
  }
  return locations;
}

// ------------------------------------------------------------------- main

async function main() {
  const { folder, noAppendix, outPath, htmlDebugPath } = parseArgs(process.argv.slice(2));
  const folderAbs = path.resolve(process.cwd(), folder);
  const folderTag = path.relative(REPO_ROOT, folderAbs).split(path.sep).join('/');
  const folderName = path.basename(folderAbs);

  const outDir = path.join(folderAbs, 'pdf');
  const finalOut = outPath
    ? path.resolve(process.cwd(), outPath)
    : path.join(outDir, `${folderName.toUpperCase()}.pdf`);

  console.log(`[docs-to-pdf] folder: ${folderTag}`);

  const { readme, verification, bodyOrder } = await discoverFiles(folderAbs);
  if (!readme) throw new Error(`No README.md found in ${folderTag}`);

  const order = [readme, ...bodyOrder];
  if (verification && !noAppendix) order.push(verification);

  // ---- read raw files, locate mermaid blocks against the UNTOUCHED text ----
  const raw = new Map();
  const mermaidLocations = [];
  for (const file of order) {
    const text = await readFile(path.join(folderAbs, file), 'utf8');
    raw.set(file, text);
    mermaidLocations.push(...locateMermaidBlocks(`${folderTag}/${file}`, text));
  }

  const { appName, docTitle } = parseTitle(raw.get(readme), folderName.toUpperCase());

  // ---- sibling-link map: filename -> fallback anchor for a BARE link (no
  // "#fragment" already) to that file. A link that already has its own
  // #fragment is rewritten as-is elsewhere and never needs this map; this is
  // only the safety net for a TOC entry that links to a whole file (e.g. a
  // part with no further internal numbering). The fallback is that file's
  // own first "## Heading" text, slugged the same way the real render will.
  // (A fresh slugger per lookup, not the one shared across the full
  // document — a theoretical mismatch only if that exact heading text
  // happens to collide with an earlier heading elsewhere in the merged doc,
  // which is easy to spot — a dead link — if it ever occurs.)
  const siblingMap = new Map();
  for (const file of bodyOrder) {
    const stripped = stripFrontMatter(raw.get(file), folderTag);
    const heading = firstH2Text(stripped);
    siblingMap.set(file.toLowerCase(), heading ? new GithubSlugger().slug(heading) : null);
  }
  if (verification) {
    siblingMap.set(
      verification.toLowerCase(),
      noAppendix ? null : new GithubSlugger().slug('Appendix A: Verification Notes'),
    );
  }

  // ---- transform + merge ----
  const bodyParts = [];
  for (const file of order) {
    if (file === verification) continue; // handled separately below, with a retitled heading
    let text = raw.get(file);
    text = stripFrontMatter(text, folderTag);
    text = rewriteSiblingLinks(text, siblingMap);
    bodyParts.push(text.trim());
  }

  if (verification && !noAppendix) {
    let vText = raw.get(verification);
    vText = stripFrontMatter(vText, folderTag);
    vText = rewriteSiblingLinks(vText, siblingMap);
    bodyParts.push(`## Appendix A: Verification Notes\n\n${vText.trim()}`);
  } else if (verification && noAppendix) {
    console.log('[docs-to-pdf] --no-appendix: skipping VERIFICATION_NOTES.md; any link to it is left as plain text.');
  }

  let merged = bodyParts.join('\n\n---\n\n');

  // if the appendix was skipped, any link that used to point at it should not
  // render as a dead clickable link — drop the link wrapper, keep the text.
  if (noAppendix && verification) {
    const key = verification.toLowerCase();
    merged = merged.replace(
      /\[([^\]]+)\]\(\s*\.?\/?([A-Za-z0-9_.-]+\.md)(#[^\s)]+)?\s*\)/gi,
      (whole, text, file) => (file.toLowerCase() === key ? text : whole),
    );
  }

  // ---------------------------------------------------------- safety scan
  const secretHits = scanForSecrets(merged);
  if (secretHits.length > 0) {
    console.error('\n[docs-to-pdf] STOPPED: possible secret/API key found in the merged source.');
    console.error('No HTML/PDF was generated. Matches (value redacted):');
    for (const hit of secretHits) console.error(`  - line ${hit.line}: looks like a ${hit.pattern}`);
    console.error('\nRemove or confirm this is not a real credential, then re-run.');
    process.exit(2);
  }
  console.log('[docs-to-pdf] secret scan: clean — no key-shaped strings found.');

  // ----------------------------------------------------- markdown -> tokens
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  const slugger = new GithubSlugger();
  md.use(markdownItAnchor, { slugify: (s) => slugger.slug(s) });
  md.use(taskLists, { enabled: true, label: true });

  // "Top-level section" = a numbered "## N. Title" heading, or the inserted
  // appendix heading — not every H2 (structural dividers like "## Part 1 of 4"
  // or README's "## Table of Contents" shouldn't each force a fresh page).
  md.core.ruler.push('flag-top-level-h2', (state) => {
    const toks = state.tokens;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type !== 'heading_open' || t.tag !== 'h2') continue;
      const inline = toks[i + 1];
      const text = inline && inline.type === 'inline' ? inline.content : '';
      if (/^\d+\.\s/.test(text) || text.trim() === 'Appendix A: Verification Notes') {
        const existing = t.attrGet('class');
        t.attrSet('class', existing ? `${existing} section-start` : 'section-start');
      }
    }
  });

  const env = {};
  const tokens = md.parse(merged, env);

  const mermaidFenceIdx = [];
  tokens.forEach((t, i) => {
    if (t.type === 'fence' && t.info.trim().toLowerCase() === 'mermaid') mermaidFenceIdx.push(i);
  });

  console.log(`[docs-to-pdf] found ${mermaidFenceIdx.length} mermaid diagram(s).`);

  // --------------------------------------------------- render mermaid diagrams
  const browser = await puppeteer.launch();
  const mermaidResults = new Map(); // fence token index -> { ok, svg } | { ok:false, error }
  const failures = [];
  const autofixes = [];

  try {
    for (let n = 0; n < mermaidFenceIdx.length; n++) {
      const tokenIdx = mermaidFenceIdx[n];
      const source = tokens[tokenIdx].content;
      const loc = mermaidLocations[n] || { file: '(unknown)', line: 0 };
      try {
        const { data } = await renderMermaid(browser, source, 'svg', {
          backgroundColor: 'white',
          mermaidConfig: { theme: 'default' },
        });
        mermaidResults.set(tokenIdx, { ok: true, svg: Buffer.from(data).toString('utf8') });
      } catch (err) {
        const message = String(err && err.message ? err.message : err).split('\n')[0];
        mermaidResults.set(tokenIdx, { ok: false, error: message });
        failures.push({ file: loc.file, line: loc.line, error: message });

        const fixed = attemptAutoFix(source);
        if (fixed) {
          try {
            await renderMermaid(browser, fixed, 'svg', {
              backgroundColor: 'white',
              mermaidConfig: { theme: 'default' },
            });
            autofixes.push({ file: loc.file, line: loc.line, original: source, fixed });
          } catch {
            // auto-fix did not help either; nothing to report beyond the original failure
          }
        }
      }
    }

    // ------------------------------------------------------- final HTML render
    const defaultFence =
      md.renderer.rules.fence || ((tks, idx, opts, env2, self) => self.renderToken(tks, idx, opts));

    md.renderer.rules.fence = (tks, idx, opts, env2, self) => {
      const token = tks[idx];
      if (token.info.trim().toLowerCase() !== 'mermaid') return defaultFence(tks, idx, opts, env2, self);
      const result = mermaidResults.get(idx);
      if (result && result.ok) {
        return `<figure class="diagram-page">${result.svg}</figure>`;
      }
      const escaped = md.utils.escapeHtml(token.content);
      const noteSuffix = result && result.error ? ` (${md.utils.escapeHtml(result.error)})` : '';
      return (
        `<div class="diagram-page diagram-failed">` +
        `<p class="diagram-note">Diagram could not be rendered${noteSuffix}.</p>` +
        `<pre><code class="language-mermaid">${escaped}</code></pre>` +
        `</div>`
      );
    };

    const bodyHtml = md.renderer.render(tokens, md.options, env);

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const version = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
    let sha = '';
    try {
      sha = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT }).toString().trim();
    } catch {
      /* not a git repo, or git unavailable — omit */
    }

    const css = await readFile(path.join(__dirname, 'print.css'), 'utf8');
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(docTitle)}</title>
<style>${css}</style>
</head>
<body>
<section class="cover-page">
  <div class="cover-inner">
    <p class="cover-kicker">Generated Document</p>
    <h1 class="cover-doctitle">${esc(docTitle)}</h1>
    <h2 class="cover-appname">${esc(appName)}</h2>
    <p class="cover-meta">Version ${esc(version)}${sha ? ` &middot; commit ${esc(sha)}` : ''}</p>
    <p class="cover-meta">${esc(dateStr)}</p>
    <p class="cover-generated">Generated from source code</p>
  </div>
</section>
${bodyHtml}
</body>
</html>`;

    if (htmlDebugPath) {
      const debugAbs = path.resolve(process.cwd(), htmlDebugPath);
      await mkdir(path.dirname(debugAbs), { recursive: true });
      await writeFile(debugAbs, html, 'utf8');
      console.log(`[docs-to-pdf] intermediate HTML written to ${path.relative(REPO_ROOT, debugAbs)}`);
    }

    // ------------------------------------------------------------- print to PDF
    await mkdir(path.dirname(finalOut), { recursive: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: finalOut,
      format: 'A4',
      margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#666;font-family:Arial,sans-serif;">${esc(docTitle)}</div>`,
      footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#666;font-family:Arial,sans-serif;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
    });
    await page.close();

    // ------------------------------------------------------------------ report
    const pdfBuf = await readFile(finalOut);
    const pageCount = (pdfBuf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;

    const reportLines = [];
    reportLines.push(`docs-to-pdf report — ${new Date().toISOString()}`);
    reportLines.push(`Source folder: ${folderTag}`);
    reportLines.push(`Output: ${path.relative(REPO_ROOT, finalOut)}`);
    reportLines.push(`Pages: ${pageCount}`);
    reportLines.push(`Mermaid diagrams found: ${mermaidFenceIdx.length}`);
    reportLines.push(`Rendered: ${mermaidFenceIdx.length - failures.length}`);
    reportLines.push(`Failed: ${failures.length}`);
    for (const f of failures) reportLines.push(`  - ${f.file}:${f.line} — ${f.error}`);
    if (autofixes.length > 0) {
      reportLines.push(`Auto-fix succeeded on ${autofixes.length} of the failed diagram(s) (NOT applied to the PDF or any .md file):`);
      for (const fx of autofixes) {
        reportLines.push(`  - ${fx.file}:${fx.line}`);
        reportLines.push(`    original: ${JSON.stringify(fx.original)}`);
        reportLines.push(`    fixed:    ${JSON.stringify(fx.fixed)}`);
      }
    }
    reportLines.push(`Rebuild with: node scripts/docs-to-pdf/index.mjs ${folder}${noAppendix ? ' --no-appendix' : ''}`);

    const reportPath = path.join(outDir, 'build-report.txt');
    await writeFile(reportPath, reportLines.join('\n') + '\n', 'utf8');

    console.log('\n' + reportLines.join('\n'));
    console.log(`\n[docs-to-pdf] report written to ${path.relative(REPO_ROOT, reportPath)}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[docs-to-pdf] FAILED:', err);
  process.exit(1);
});
