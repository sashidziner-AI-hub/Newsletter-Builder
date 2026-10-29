import type { Block, Design, Padding, Row, SocialItem } from '../types';
import { SOCIAL_NETWORKS } from './defaults';
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
  }
}

export function renderBlock(block: Block, design: Design, ctx: RenderCtx): string {
  const inner = renderBlockInner(block, design, ctx);
  const align = 'align' in block.values ? block.values.align : 'left';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="eb-block"><tr><td align="${align}" style="${padCss(block.values.padding)}">${inner}</td></tr></table>`;
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
