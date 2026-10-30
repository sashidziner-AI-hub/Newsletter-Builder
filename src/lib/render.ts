import type {
  Align,
  ArticleListValues,
  Block,
  Design,
  FooterValues,
  HeaderValues,
  HeroValues,
  Padding,
  Row,
  SocialItem,
} from '../types';
import { createBlock, pad, SOCIAL_NETWORKS } from './defaults';
import { esc, safeUrl } from './util';

export interface RenderCtx {
  /** width in px of the column the block lives in */
  colWidth: number;
  /** editor mode renders friendly placeholders for empty blocks */
  editor?: boolean;
}

/** Strip characters that could break out of a style attribute. */
export function cssVal(v: string): string {
  return (v || '').replace(/[^#a-zA-Z0-9(),.%\s'_-]/g, '');
}

const padCss = (p: Padding) => `padding:${p.top}px ${p.right}px ${p.bottom}px ${p.left}px;`;

export function columnWidths(design: Design, row: Row): number[] {
  const inner = Math.max(40, design.body.width - row.padding.left - row.padding.right);
  const sum = row.layout.reduce((a, b) => a + b, 0) || 1;
  return row.layout.map((r) => Math.floor((inner * r) / sum));
}

export function youtubeId(url: string): string {
  const m =
    url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) ||
    null;
  return m ? m[1] : '';
}

export function videoThumb(url: string, override: string): string {
  if (override) return override;
  const id = youtubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}

function placeholder(text: string): string {
  return `<div style="border:2px dashed #cbd5e1;background:#f8fafc;color:#94a3b8;padding:28px 12px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:13px;">${esc(text)}</div>`;
}

const BLOCKED_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form'];

function sanitizeAndInline(
  html: string,
  opts: { linkColor: string; fontSize: number },
): string {
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const body = doc.body;

  BLOCKED_TAGS.forEach((t) => body.querySelectorAll(t).forEach((el) => el.remove()));
  body.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });

  const gap = Math.round(opts.fontSize * 0.8);
  const prepend = (el: Element, css: string) => {
    const existing = el.getAttribute('style');
    el.setAttribute('style', css + (existing ? existing : ''));
  };
  body.querySelectorAll('p').forEach((el) => prepend(el, `margin:0 0 ${gap}px 0;`));
  body.querySelectorAll('ul,ol').forEach((el) =>
    prepend(el, `margin:0 0 ${gap}px 0;padding-left:24px;`),
  );
  body.querySelectorAll('li').forEach((el) => prepend(el, 'margin:0 0 4px 0;'));
  body.querySelectorAll('a').forEach((el) => {
    prepend(el, `color:${cssVal(opts.linkColor)};text-decoration:underline;`);
    if (el.getAttribute('href')) el.setAttribute('target', '_blank');
  });
  const last = body.lastElementChild;
  if (last && ['P', 'UL', 'OL'].includes(last.tagName)) {
    const s = last.getAttribute('style') || '';
    last.setAttribute('style', s.replace(/margin:0 0 \d+px 0;/, 'margin:0;'));
  }
  return body.innerHTML;
}

/* ------------------------------------------------ composite block helpers */

/**
 * Build a throwaway sub-block so a composite block can render a part through
 * the existing Menu / Social / Button renderer instead of duplicating its HTML.
 * Anything not overridden comes from that block type's own defaults.
 */
function subBlock<T extends Block['type']>(
  type: T,
  values: Partial<Extract<Block, { type: T }>['values']>,
): Extract<Block, { type: T }> {
  const base = createBlock(type) as Extract<Block, { type: T }>;
  return { ...base, values: { ...base.values, ...values } };
}

/** An email-safe <img>: width attribute, alt, border="0", display:block. */
function imgTag(src: string, alt: string, width: number, extra = ''): string {
  const url = safeUrl(src);
  if (!url) return '';
  return `<img class="eb-img" src="${esc(url)}" alt="${esc(alt)}" width="${width}" border="0" style="display:block;border:0;outline:none;text-decoration:none;width:${width}px;max-width:100%;height:auto;${extra}" />`;
}

/** Wrap cells in a table row; each cell stacks on mobile via .eb-col. */
function colsTable(cells: string[], align: Align = 'left'): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="${align}"><tr>${cells.join('')}</tr></table>`;
}

const col = (
  content: string,
  opts: { width?: number; align?: string; classes?: string; style?: string; valign?: 'top' | 'middle' | 'bottom' } = {},
) => {
  const w = opts.width ? ` width="${opts.width}"` : '';
  const wCss = opts.width ? `width:${opts.width}px;` : '';
  const cls = `eb-col${opts.classes ? ` ${opts.classes}` : ''}`;
  const va = opts.valign ?? 'top';
  return `<td class="${cls}"${w} align="${opts.align ?? 'left'}" valign="${va}" style="${wCss}vertical-align:${va};${opts.style ?? ''}">${content}</td>`;
};

/** A text run with its own font/size/colour, used for every composite label. */
function textRun(
  text: string,
  o: { fontFamily: string; fontSize: number; color: string; weight?: string; align?: Align; lineHeight?: number; bodyFont: string; marginTop?: number },
): string {
  if (!text.trim()) return '';
  const mt = o.marginTop ? `padding-top:${o.marginTop}px;` : '';
  return `<div style="${mt}font-family:${cssVal(o.fontFamily || o.bodyFont)};font-size:${o.fontSize}px;font-weight:${o.weight ?? 'normal'};line-height:${o.lineHeight ?? 140}%;color:${cssVal(o.color)};text-align:${o.align ?? 'left'};">${esc(text).replace(/\n/g, '<br />')}</div>`;
}

/** An inline text link, used for "Read more" and card links. */
function linkRun(
  label: string,
  href: string,
  o: { fontFamily: string; fontSize: number; color: string; align?: Align; bodyFont: string; marginTop?: number },
): string {
  if (!label.trim()) return '';
  const url = safeUrl(href) || '#';
  const mt = o.marginTop ? `padding-top:${o.marginTop}px;` : '';
  return `<div style="${mt}font-family:${cssVal(o.fontFamily || o.bodyFont)};font-size:${o.fontSize}px;line-height:140%;text-align:${o.align ?? 'left'};"><a href="${esc(url)}" target="_blank" style="color:${cssVal(o.color)};text-decoration:underline;">${esc(label)}</a></div>`;
}

/** A horizontal rule as a table, for dividers between article items. */
function ruleRow(color: string, spacing: number): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:${spacing}px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${cssVal(color)};font-size:0;line-height:0;height:0;">&nbsp;</td></tr></table></td></tr></table>`;
}

/** The hero / card CTA, rendered through the bulletproof Button renderer. */
function ctaHtml(
  v: HeroValues,
  design: Design,
  ctx: RenderCtx,
  align: Align,
): string {
  if (!v.ctaLabel.trim()) return '';
  const outline = v.ctaStyle === 'outline';
  const btn = subBlock('button', {
    label: v.ctaLabel,
    href: v.ctaHref,
    bgColor: outline ? '' : v.ctaColor,
    color: outline ? v.ctaColor : v.ctaTextColor,
    borderWidth: outline ? 2 : 0,
    borderColor: v.ctaColor,
    align,
    padding: pad(0),
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="${align}" style="padding-top:18px;">${renderBlockInner(btn, design, ctx)}</td></tr></table>`;
}

function networkHref(item: SocialItem): string {
  const raw = (item.href || '').trim();
  if (item.network === 'email' && raw && !/^mailto:/i.test(raw) && /^[^\s@]+@[^\s@]+$/.test(raw)) {
    return `mailto:${raw}`;
  }
  return safeUrl(raw) || '#';
}

function renderBlockInner(block: Block, design: Design, ctx: RenderCtx): string {
  const body = design.body;
  switch (block.type) {
    case 'heading': {
      const v = block.values;
      const tag = `h${v.level}`;
      const text = esc(v.text).replace(/\n/g, '<br />');
      return `<${tag} style="margin:0;font-family:${cssVal(v.fontFamily || body.fontFamily)};font-size:${v.fontSize}px;font-weight:${v.fontWeight};line-height:${v.lineHeight}%;color:${cssVal(v.color)};text-align:${v.align};">${text || (ctx.editor ? '&nbsp;' : '')}</${tag}>`;
    }
    case 'text': {
      const v = block.values;
      const inner = sanitizeAndInline(v.html, { linkColor: body.linkColor, fontSize: v.fontSize });
      const empty = inner.replace(/<[^>]*>/g, '').trim() === '';
      const content =
        empty && ctx.editor
          ? '<p style="margin:0;color:#9ca3af;">Write something…</p>'
          : inner;
      return `<div style="font-family:${cssVal(v.fontFamily || body.fontFamily)};font-size:${v.fontSize}px;line-height:${v.lineHeight}%;color:${cssVal(v.color || body.textColor)};text-align:${v.align};">${content}</div>`;
    }
    case 'image': {
      const v = block.values;
      const src = safeUrl(v.src);
      if (!src) return ctx.editor ? placeholder('Image — select this block and add an image') : '';
      const cw = Math.max(20, ctx.colWidth - v.padding.left - v.padding.right);
      const w = Math.max(10, Math.round((cw * v.width) / 100));
      const margin =
        v.align === 'center' ? 'margin:0 auto;' : v.align === 'right' ? 'margin:0 0 0 auto;' : '';
      const radius = v.borderRadius ? `border-radius:${v.borderRadius}px;` : '';
      const img = `<img class="eb-img" src="${esc(src)}" alt="${esc(v.alt)}" width="${w}" style="display:block;border:0;outline:none;text-decoration:none;width:${w}px;max-width:100%;height:auto;${margin}${radius}" />`;
      const href = safeUrl(v.href);
      return href ? `<a href="${esc(href)}" target="_blank" style="text-decoration:none;">${img}</a>` : img;
    }
    case 'button': {
      const v = block.values;
      const href = safeUrl(v.href) || '#';
      const border =
        v.borderWidth > 0 ? `border:${v.borderWidth}px solid ${cssVal(v.borderColor)};` : '';
      const fam = cssVal(v.fontFamily || body.fontFamily);
      const widthAttr = v.fullWidth ? ' width="100%"' : '';
      const widthCss = v.fullWidth ? 'width:100%;' : '';
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${v.align}"${widthAttr} style="border-collapse:separate;${widthCss}"><tr><td align="center" bgcolor="${cssVal(v.bgColor)}" style="border-radius:${v.borderRadius}px;${border}mso-padding-alt:${v.innerPaddingV}px ${v.innerPaddingH}px;"><a href="${esc(href)}" target="_blank" style="display:${v.fullWidth ? 'block' : 'inline-block'};padding:${v.innerPaddingV}px ${v.innerPaddingH}px;font-family:${fam};font-size:${v.fontSize}px;font-weight:${v.fontWeight};line-height:1.2;color:${cssVal(v.color)};text-decoration:none;border-radius:${v.borderRadius}px;">${esc(v.label)}</a></td></tr></table>`;
    }
    case 'divider': {
      const v = block.values;
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${v.width}%" align="${v.align}" style="width:${v.width}%;"><tr><td style="border-top:${v.thickness}px ${v.lineStyle} ${cssVal(v.color)};font-size:0;line-height:0;height:0;">&nbsp;</td></tr></table>`;
    }
    case 'menu': {
      const v = block.values;
      const fam = cssVal(v.fontFamily || body.fontFamily);
      const linkStyle = `color:${cssVal(v.color)};text-decoration:none;`;
      const textStyle = `font-family:${fam};font-size:${v.fontSize}px;font-weight:${v.fontWeight};color:${cssVal(v.color)};`;
      if (v.layout === 'vertical') {
        const rows = v.items
          .map(
            (it) =>
              `<tr><td align="${v.align}" style="padding:${Math.round(v.itemPadding / 2)}px 0;${textStyle}"><a href="${esc(safeUrl(it.href) || '#')}" target="_blank" style="${linkStyle}">${esc(it.label)}</a></td></tr>`,
          )
          .join('');
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>`;
      }
      const cells = v.items
        .map((it, i) => {
          const sep =
            v.separator && i < v.items.length - 1
              ? `<td style="${textStyle}">${esc(v.separator)}</td>`
              : '';
          return `<td style="padding:0 ${v.itemPadding}px;${textStyle}"><a href="${esc(safeUrl(it.href) || '#')}" target="_blank" style="${linkStyle}">${esc(it.label)}</a></td>${sep}`;
        })
        .join('');
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${v.align}"><tr>${cells}</tr></table>`;
    }
    case 'social': {
      const v = block.values;
      const s = v.size;
      const radius = v.shape === 'circle' ? Math.round(s / 2) : v.shape === 'rounded' ? Math.round(s * 0.2) : 0;
      const cells = v.items
        .map((it) => {
          const meta = SOCIAL_NETWORKS[it.network];
          const href = esc(networkHref(it));
          const iconUrl = safeUrl(it.iconUrl);
          const cell = iconUrl
            ? `<a href="${href}" target="_blank"><img src="${esc(iconUrl)}" alt="${esc(meta.label)}" width="${s}" height="${s}" style="display:block;border:0;width:${s}px;height:${s}px;" /></a>`
            : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="${s}" height="${s}" align="center" valign="middle" bgcolor="${cssVal(v.colorMode === 'mono' ? v.monoColor : meta.color)}" style="width:${s}px;height:${s}px;border-radius:${radius}px;"><a href="${href}" target="_blank" style="display:block;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:${Math.round(s * 0.4)}px;font-weight:bold;line-height:${s}px;text-decoration:none;">${esc(meta.short)}</a></td></tr></table>`;
          return `<td style="padding:0 ${Math.round(v.gap / 2)}px;">${cell}</td>`;
        })
        .join('');
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${v.align}"><tr>${cells}</tr></table>`;
    }
    case 'video': {
      const v = block.values;
      const href = safeUrl(v.url);
      const thumb = safeUrl(videoThumb(v.url, v.thumbnail));
      if (!href && !thumb) return ctx.editor ? placeholder('Video — select this block and paste a YouTube URL') : '';
      if (!thumb) {
        return ctx.editor
          ? placeholder('Add a thumbnail URL for this video (needed for non-YouTube links)')
          : `<a href="${esc(href)}" target="_blank" style="color:${cssVal(v.captionColor)};font-family:${cssVal(body.fontFamily)};font-size:14px;">${esc(v.caption || 'Watch video')}</a>`;
      }
      const cw = Math.max(20, ctx.colWidth - v.padding.left - v.padding.right);
      const w = Math.max(10, Math.round((cw * v.width) / 100));
      const margin =
        v.align === 'center' ? 'margin:0 auto;' : v.align === 'right' ? 'margin:0 0 0 auto;' : '';
      const radius = v.borderRadius ? `border-radius:${v.borderRadius}px;` : '';
      const img = `<img class="eb-img" src="${esc(thumb)}" alt="${esc(v.alt)}" width="${w}" style="display:block;border:0;outline:none;width:${w}px;max-width:100%;height:auto;${margin}${radius}" />`;
      const linked = href ? `<a href="${esc(href)}" target="_blank" style="text-decoration:none;">${img}</a>` : img;
      const caption =
        v.showCaption && href
          ? `<div style="text-align:${v.align};padding-top:8px;"><a href="${esc(href)}" target="_blank" style="color:${cssVal(v.captionColor)};font-family:${cssVal(body.fontFamily)};font-size:14px;text-decoration:none;">${esc(v.caption)}</a></div>`
          : '';
      return linked + caption;
    }
    case 'html': {
      const v = block.values;
      if (!v.html.trim()) return ctx.editor ? placeholder('Custom HTML — select this block to edit the code') : '';
      return v.html;
    }

    /* ------------------------------------------------------------- header */
    case 'header': {
      const v: HeaderValues = block.values;
      const bodyFont = body.fontFamily;

      // the brand logo, or the brand name as text when there is no logo
      const logo = imgTag(v.logoSrc, v.logoAlt || v.fallbackText, v.logoWidth);
      const mark =
        logo ||
        textRun(v.fallbackText, {
          fontFamily: v.fallbackFontFamily,
          fontSize: v.fallbackFontSize,
          color: v.fallbackColor,
          weight: 'bold',
          bodyFont,
        }) ||
        (ctx.editor ? placeholder('Header — add a logo URL or a brand name') : '');

      const nav =
        v.showNav && v.navLinks.length
          ? renderBlockInner(
              subBlock('menu', {
                items: v.navLinks.map((l) => ({ id: l.id, label: l.label, href: l.href })),
                layout: 'horizontal',
                fontSize: v.navFontSize,
                color: v.navColor,
                fontFamily: v.navFontFamily,
                separator: v.navSeparator,
                itemPadding: 8,
                align: v.layout === 'logo-center' ? 'center' : 'right',
                padding: pad(0),
              }),
              design,
              ctx,
            )
          : '';

      const border =
        v.borderWidth > 0
          ? `border-bottom:${v.borderWidth}px solid ${cssVal(v.borderColor)};`
          : '';
      const navCls = v.hideNavOnMobile ? 'eb-hide-mobile' : 'eb-center-mobile';

      const inner =
        v.layout === 'logo-center'
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">${mark}</td></tr>${
              nav ? `<tr><td align="center" class="${v.hideNavOnMobile ? 'eb-hide-mobile' : ''}" style="padding-top:14px;">${nav}</td></tr>` : ''
            }</table>`
          : colsTable([
              col(mark, { align: 'left', classes: 'eb-center-mobile', valign: 'middle' }),
              nav ? col(nav, { align: 'right', classes: navCls, valign: 'middle' }) : '',
            ]);

      return border
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${border}">${inner}</td></tr></table>`
        : inner;
    }

    /* --------------------------------------------------------------- hero */
    case 'hero': {
      const v: HeroValues = block.values;
      const bodyFont = body.fontFamily;
      const centered = v.layout === 'centered';
      const textAlign: Align = centered ? 'center' : 'left';

      const copy = (align: Align) =>
        textRun(v.eyebrow, {
          fontFamily: v.headingFontFamily,
          fontSize: 12,
          color: v.eyebrowColor,
          weight: 'bold',
          align,
          bodyFont,
        }) +
        textRun(v.heading, {
          fontFamily: v.headingFontFamily,
          fontSize: v.headingFontSize,
          color: v.headingColor,
          weight: v.headingFontWeight,
          align,
          lineHeight: 125,
          bodyFont,
          marginTop: v.eyebrow.trim() ? 8 : 0,
        }) +
        textRun(v.subtext, {
          fontFamily: '',
          fontSize: v.subtextFontSize,
          color: v.subtextColor,
          align,
          lineHeight: 150,
          bodyFont,
          marginTop: 10,
        });

      if (v.layout === 'cards-2' || v.layout === 'cards-3') {
        const want = v.layout === 'cards-2' ? 2 : 3;
        const cards = v.cards.slice(0, want);
        const inner = Math.max(
          40,
          ctx.colWidth - v.padding.left - v.padding.right - (want - 1) * 12,
        );
        const cw = Math.floor(inner / want);
        const cells = cards.map((c, i) =>
          col(
            imgTag(c.imageSrc, c.imageAlt, cw) +
              textRun(c.title, {
                fontFamily: v.headingFontFamily,
                fontSize: 17,
                color: v.cardTitleColor,
                weight: 'bold',
                bodyFont,
                marginTop: 12,
              }) +
              textRun(c.text, {
                fontFamily: '',
                fontSize: 14,
                color: v.cardTextColor,
                lineHeight: 150,
                bodyFont,
                marginTop: 6,
              }) +
              linkRun(c.linkLabel, c.linkHref, {
                fontFamily: '',
                fontSize: 14,
                color: v.cardLinkColor,
                bodyFont,
                marginTop: 8,
              }),
            { width: cw, style: i < cards.length - 1 ? 'padding-right:12px;' : '' },
          ),
        );
        const head = v.heading.trim() || v.eyebrow.trim()
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="${textAlign}" style="padding-bottom:18px;">${copy(textAlign)}</td></tr></table>`
          : '';
        return head + colsTable(cells, v.align);
      }

      if (centered) {
        const bgImg = safeUrl(v.bgImage);
        // Outlook ignores background images, so bgColor is the fallback.
        const bgAttr = bgImg ? ` background="${esc(bgImg)}"` : '';
        const bgColor = v.bgColor ? ` bgcolor="${cssVal(v.bgColor)}"` : '';
        const bgCss = v.bgColor ? `background-color:${cssVal(v.bgColor)};` : '';
        // the shorthand first, then background-color, so the colour still wins
        // as the Outlook fallback. Written as a shorthand rather than
        // background-position so the export stays clean of any "position:".
        const imgCss = bgImg ? `background:url('${esc(bgImg)}') center / cover no-repeat;` : '';
        const art = imgTag(v.imageSrc, v.imageAlt, Math.max(40, ctx.colWidth - v.padding.left - v.padding.right), 'margin:0 auto;');
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td${bgAttr}${bgColor} align="center" style="${imgCss}${bgCss}padding:${bgImg || v.bgColor ? '28px 20px' : '0'};">${copy('center')}${ctaHtml(v, design, ctx, 'center')}${art ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding-top:20px;">${art}</td></tr></table>` : ''}</td></tr></table>`;
      }

      // image-left / image-right
      const inner = Math.max(80, ctx.colWidth - v.padding.left - v.padding.right - 16);
      const half = Math.floor(inner / 2);
      const textCell = col(copy('left') + ctaHtml(v, design, ctx, 'left'), {
        width: half,
        classes: 'eb-center-mobile',
        style: v.layout === 'image-right' ? 'padding-right:16px;' : 'padding-left:16px;',
      });
      const imageCell = col(imgTag(v.imageSrc, v.imageAlt, half), { width: half });
      return colsTable(
        v.layout === 'image-right' ? [textCell, imageCell] : [imageCell, textCell],
        v.align,
      );
    }

    /* ---------------------------------------------------------- articles */
    case 'articles': {
      const v: ArticleListValues = block.values;
      const bodyFont = body.fontFamily;
      const avail = Math.max(80, ctx.colWidth - v.padding.left - v.padding.right);
      const items = v.items.slice(0, 10);

      const textFor = (it: ArticleListValues['items'][number], align: Align = 'left') =>
        textRun(it.title, {
          fontFamily: v.titleFontFamily,
          fontSize: v.titleFontSize,
          color: v.titleColor,
          weight: v.titleFontWeight,
          align,
          lineHeight: 130,
          bodyFont,
        }) +
        textRun(it.excerpt, {
          fontFamily: '',
          fontSize: v.excerptFontSize,
          color: v.excerptColor,
          align,
          lineHeight: 150,
          bodyFont,
          marginTop: 6,
        }) +
        linkRun(it.readMoreLabel, it.readMoreHref, {
          fontFamily: '',
          fontSize: v.excerptFontSize,
          color: v.linkColor,
          align,
          bodyFont,
          marginTop: 8,
        });

      const rendered = items.map((it) => {
        if (v.layout === 'text-only') return textFor(it);
        if (v.layout === 'thumb-top') {
          const art = imgTag(it.imageSrc, it.imageAlt, avail);
          return (art
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-bottom:12px;">${art}</td></tr></table>`
            : '') + textFor(it);
        }
        // thumb-left: two cells, stacked on mobile by .eb-col
        const tw = Math.min(v.thumbWidth, avail - 80);
        const art = imgTag(it.imageSrc, it.imageAlt, tw);
        return colsTable([
          col(art, { width: tw, style: 'padding-right:16px;' }),
          col(textFor(it)),
        ]);
      });

      const joined = v.showDivider
        ? rendered.join(ruleRow(v.dividerColor, Math.round(v.itemSpacing / 2)))
        : rendered
            .map((h, i) => (i === 0 ? h : `<div style="height:${v.itemSpacing}px;line-height:${v.itemSpacing}px;font-size:0;">&nbsp;</div>${h}`))
            .join('');

      if (!items.length) {
        return ctx.editor ? placeholder('Article list — select this block and add items') : '';
      }
      return joined;
    }

    /* ------------------------------------------------------------- footer */
    case 'footer': {
      const v: FooterValues = block.values;
      const bodyFont = body.fontFamily;
      const align: Align = v.align;

      const logo = imgTag(
        v.logoSrc,
        v.logoAlt || 'Logo',
        v.logoWidth,
        align === 'center' ? 'margin:0 auto;' : align === 'right' ? 'margin:0 0 0 auto;' : '',
      );

      const social =
        v.showSocial && v.socialItems.length
          ? renderBlockInner(
              subBlock('social', {
                items: v.socialItems,
                size: v.socialSize,
                colorMode: v.socialColorMode,
                monoColor: v.socialMonoColor,
                align,
                padding: pad(0),
              }),
              design,
              ctx,
            )
          : '';

      const line = (text: string, marginTop: number) =>
        textRun(text, {
          fontFamily: v.fontFamily,
          fontSize: v.fontSize,
          color: v.textColor,
          align,
          lineHeight: 150,
          bodyFont,
          marginTop,
        });

      // the unsubscribe href is usually a merge tag, which safeUrl() preserves
      const unsub = linkRun(v.unsubscribeText, v.unsubscribeHref, {
        fontFamily: v.fontFamily,
        fontSize: v.fontSize,
        color: v.linkColor,
        align,
        bodyFont,
        marginTop: 12,
      });

      const border =
        v.borderWidth > 0 ? `border-top:${v.borderWidth}px solid ${cssVal(v.borderColor)};` : '';

      const rows = [
        logo ? `<tr><td align="${align}" style="padding-bottom:16px;">${logo}</td></tr>` : '',
        social ? `<tr><td align="${align}" style="padding-bottom:14px;">${social}</td></tr>` : '',
        `<tr><td align="${align}">${line(v.address, 0)}${line(v.legalText, 8)}${unsub}</td></tr>`,
      ].join('');

      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${border}${border ? 'padding-top:20px;' : ''}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
    }
  }
}

/**
 * Render one block's inner HTML through its own renderer. Composite blocks use
 * this to reuse the Menu / Social / Button markup instead of duplicating it.
 */
export function renderInlineBlock(block: Block, design: Design, ctx: RenderCtx): string {
  return renderBlockInner(block, design, ctx);
}

/** Composite blocks paint their own background behind the block padding. */
const SELF_BG: ReadonlySet<string> = new Set(['header', 'hero', 'footer', 'articles']);

export function renderBlock(block: Block, design: Design, ctx: RenderCtx): string {
  // The email-level "Show footer" switch hides footer blocks from preview and
  // export. The editor still draws them, dimmed, so they stay selectable.
  if (block.type === 'footer' && !design.body.showFooter && !ctx.editor) return '';

  const inner = renderBlockInner(block, design, ctx);
  const align = 'align' in block.values ? block.values.align : 'left';
  const bg = SELF_BG.has(block.type) ? (block.values as { bgColor: string }).bgColor : '';
  const bgAttr = bg ? ` bgcolor="${cssVal(bg)}"` : '';
  const bgCss = bg ? `background-color:${cssVal(bg)};` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="eb-block"${bgAttr}><tr><td align="${align}" style="${bgCss}${padCss(block.values.padding)}">${inner}</td></tr></table>`;
}

export function renderRow(row: Row, design: Design): string {
  const W = design.body.width;
  const widths = columnWidths(design, row);
  const contentBg = row.contentBgColor || design.body.contentBgColor;
  const cols = row.columns
    .map((c, i) => {
      const content = c.blocks.length
        ? c.blocks.map((b) => renderBlock(b, design, { colWidth: widths[i] })).join('')
        : '&nbsp;';
      return `<td class="${row.stackOnMobile ? 'eb-col' : 'eb-col-fixed'}" width="${widths[i]}" valign="top" style="width:${widths[i]}px;vertical-align:top;">${content}</td>`;
    })
    .join('');
  const outerBg = row.bgColor
    ? ` bgcolor="${cssVal(row.bgColor)}" style="background-color:${cssVal(row.bgColor)};"`
    : '';
  const innerBg = contentBg
    ? ` bgcolor="${cssVal(contentBg)}" style="background-color:${cssVal(contentBg)};${padCss(row.padding)}"`
    : ` style="${padCss(row.padding)}"`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${outerBg}><tr><td align="center">
<!--[if mso]><table role="presentation" width="${W}" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="eb-container" width="${W}" cellpadding="0" cellspacing="0" border="0" style="width:${W}px;max-width:100%;"><tr><td${innerBg}><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cols}</tr></table></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>`;
}

export function renderDesign(design: Design): string {
  const b = design.body;
  const W = b.width;
  const preheader = b.preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(b.preheader)}${'&#8199;&zwnj;'.repeat(40)}</div>`
    : '';
  const rows = design.rows.map((r) => renderRow(r, design)).join('\n');
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
<title>${esc(b.title)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  html,body{margin:0 !important;padding:0 !important;width:100% !important;}
  *{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  table{border-collapse:collapse;}
  img{-ms-interpolation-mode:bicubic;}
  a{color:${cssVal(b.linkColor)};}
  @media only screen and (max-width:${W}px){
    .eb-container{width:100% !important;max-width:100% !important;}
    .eb-col{display:block !important;width:100% !important;max-width:100% !important;}
    .eb-center-mobile{text-align:center !important;}
    .eb-hide-mobile{display:none !important;}
    .eb-img{height:auto !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${cssVal(b.bgColor)};font-family:${cssVal(b.fontFamily)};color:${cssVal(b.textColor)};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${cssVal(b.bgColor)}" style="background-color:${cssVal(b.bgColor)};"><tr><td align="center">
${rows}
</td></tr></table>
</body>
</html>`;
}
