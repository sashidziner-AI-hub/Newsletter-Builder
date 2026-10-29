import type {
  Block,
  BlockType,
  BodySettings,
  Design,
  Padding,
  Row,
  SocialNetwork,
} from '../types';
import { uid } from './util';

/**
 * Kanit is a Google web font. Gmail and Outlook ignore web fonts unless the
 * email links a stylesheet, which this builder deliberately does not do, so the
 * stack falls back to web-safe faces that have to look acceptable on their own.
 */
export const KANIT_STACK = 'Kanit, Arial, Helvetica, sans-serif';

export const FONT_STACKS: { label: string; value: string }[] = [
  { label: 'Kanit (falls back to Arial)', value: KANIT_STACK },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: 'Georgia', value: 'Georgia, Times, serif' },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Courier New', value: "'Courier New', Courier, monospace" },
];

export const ROW_LAYOUTS: { label: string; layout: number[] }[] = [
  { label: '1 column', layout: [1] },
  { label: '2 columns', layout: [1, 1] },
  { label: '3 columns', layout: [1, 1, 1] },
  { label: '4 columns', layout: [1, 1, 1, 1] },
  { label: '1 : 2', layout: [1, 2] },
  { label: '2 : 1', layout: [2, 1] },
  { label: '1 : 2 : 1', layout: [1, 2, 1] },
];

export const BLOCK_META: { type: BlockType; label: string }[] = [
  { type: 'heading', label: 'Heading' },
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'button', label: 'Button' },
  { type: 'divider', label: 'Divider' },
  { type: 'menu', label: 'Menu' },
  { type: 'social', label: 'Social' },
  { type: 'video', label: 'Video' },
  { type: 'html', label: 'HTML' },
  { type: 'header', label: 'Header' },
  { type: 'hero', label: 'Hero' },
  { type: 'articles', label: 'Article list' },
  { type: 'footer', label: 'Footer' },
];

/** Placeholder art for new composite blocks, so a fresh block looks like something. */
const STOCK = (seed: string, w: number, h: number) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const SOCIAL_NETWORKS: Record<
  SocialNetwork,
  { label: string; short: string; color: string }
> = {
  facebook: { label: 'Facebook', short: 'f', color: '#1877F2' },
  instagram: { label: 'Instagram', short: 'IG', color: '#E4405F' },
  x: { label: 'X (Twitter)', short: 'X', color: '#000000' },
  linkedin: { label: 'LinkedIn', short: 'in', color: '#0A66C2' },
  youtube: { label: 'YouTube', short: 'YT', color: '#FF0000' },
  whatsapp: { label: 'WhatsApp', short: 'WA', color: '#25D366' },
  telegram: { label: 'Telegram', short: 'TG', color: '#26A5E4' },
  pinterest: { label: 'Pinterest', short: 'P', color: '#E60023' },
  tiktok: { label: 'TikTok', short: 'TT', color: '#111111' },
  github: { label: 'GitHub', short: 'GH', color: '#181717' },
  email: { label: 'Email', short: '@', color: '#6B7280' },
};

export const pad = (top: number, right = top, bottom = top, left = right): Padding => ({
  top,
  right,
  bottom,
  left,
});

export function createBlock(type: BlockType): Block {
  const id = uid('blk');
  switch (type) {
    case 'heading':
      return {
        id,
        type,
        values: {
          text: 'Your heading here',
          level: 2,
          fontSize: 28,
          color: '#111827',
          fontWeight: 'bold',
          lineHeight: 130,
          fontFamily: '',
          align: 'left',
          padding: pad(10, 20),
        },
      };
    case 'text':
      return {
        id,
        type,
        values: {
          html: '<p>Write your message here. You can format the text, add links and lists.</p>',
          fontSize: 15,
          color: '',
          lineHeight: 150,
          fontFamily: '',
          align: 'left',
          padding: pad(10, 20),
        },
      };
    case 'image':
      return {
        id,
        type,
        values: {
          src: '',
          alt: '',
          href: '',
          width: 100,
          align: 'center',
          borderRadius: 0,
          padding: pad(10, 20),
        },
      };
    case 'button':
      return {
        id,
        type,
        values: {
          label: 'Click here',
          href: 'https://example.com',
          bgColor: '#2563EB',
          color: '#FFFFFF',
          fontSize: 16,
          fontWeight: 'bold',
          fontFamily: '',
          borderRadius: 6,
          borderWidth: 0,
          borderColor: '#2563EB',
          innerPaddingV: 12,
          innerPaddingH: 24,
          fullWidth: false,
          align: 'center',
          padding: pad(10, 20),
        },
      };
    case 'divider':
      return {
        id,
        type,
        values: {
          color: '#D1D5DB',
          thickness: 1,
          lineStyle: 'solid',
          width: 100,
          align: 'center',
          padding: pad(10, 20),
        },
      };
    case 'menu':
      return {
        id,
        type,
        values: {
          items: [
            { id: uid('mi'), label: 'Home', href: 'https://example.com' },
            { id: uid('mi'), label: 'About', href: 'https://example.com/about' },
            { id: uid('mi'), label: 'Contact', href: 'https://example.com/contact' },
          ],
          layout: 'horizontal',
          fontSize: 14,
          color: '#374151',
          fontWeight: 'normal',
          fontFamily: '',
          separator: '',
          itemPadding: 10,
          align: 'center',
          padding: pad(10, 20),
        },
      };
    case 'social':
      return {
        id,
        type,
        values: {
          items: [
            { id: uid('si'), network: 'facebook', href: 'https://facebook.com', iconUrl: '' },
            { id: uid('si'), network: 'instagram', href: 'https://instagram.com', iconUrl: '' },
            { id: uid('si'), network: 'linkedin', href: 'https://linkedin.com', iconUrl: '' },
          ],
          size: 32,
          shape: 'circle',
          colorMode: 'brand',
          monoColor: '#374151',
          gap: 8,
          align: 'center',
          padding: pad(10, 20),
        },
      };
    case 'video':
      return {
        id,
        type,
        values: {
          url: '',
          thumbnail: '',
          alt: 'Watch the video',
          width: 100,
          align: 'center',
          borderRadius: 0,
          showCaption: true,
          caption: '▶ Watch video',
          captionColor: '#2563EB',
          padding: pad(10, 20),
        },
      };
    case 'html':
      return {
        id,
        type,
        values: {
          html: '<div style="text-align:center;color:#6b7280;font-size:13px;">Custom HTML</div>',
          padding: pad(0),
        },
      };
    case 'header':
      return {
        id,
        type,
        values: {
          layout: 'logo-left',
          logoSrc: 'brand.logo',
          logoAlt: '',
          logoWidth: 140,
          fallbackText: 'brand.name',
          fallbackColor: 'brand.secondary',
          fallbackFontSize: 22,
          fallbackFontFamily: 'brand.font.heading',
          showNav: true,
          navLinks: [
            { id: uid('nv'), label: 'Services', href: 'https://example.com/services' },
            { id: uid('nv'), label: 'Insights', href: 'https://example.com/insights' },
            { id: uid('nv'), label: 'Contact', href: 'https://example.com/contact' },
          ],
          navColor: 'brand.text',
          navFontSize: 14,
          navFontFamily: 'brand.font.body',
          navSeparator: '',
          hideNavOnMobile: false,
          bgColor: '',
          fullWidthBg: false,
          borderColor: 'brand.border',
          borderWidth: 1,
          align: 'left',
          padding: pad(16, 20),
        },
      };
    case 'hero':
      return {
        id,
        type,
        values: {
          layout: 'image-right',
          eyebrow: 'NEWSLETTER',
          eyebrowColor: 'brand.primary',
          heading: 'A headline that earns the open',
          headingFontSize: 30,
          headingFontWeight: 'bold',
          headingFontFamily: 'brand.font.heading',
          headingColor: 'brand.secondary',
          subtext:
            'One or two lines of supporting copy that explain why this email is worth reading.',
          subtextColor: 'brand.text',
          subtextFontSize: 15,
          imageSrc: STOCK('hero', 560, 420),
          imageAlt: 'Replace this image and describe it here',
          ctaLabel: 'Read the story',
          ctaHref: 'https://example.com',
          ctaStyle: 'filled',
          ctaColor: 'brand.primary',
          ctaTextColor: 'brand.content_bg',
          cards: [
            {
              id: uid('hc'),
              imageSrc: STOCK('card1', 400, 260),
              imageAlt: 'Describe the first card image',
              title: 'First card',
              text: 'A short supporting sentence for this card.',
              linkLabel: 'Learn more',
              linkHref: 'https://example.com',
            },
            {
              id: uid('hc'),
              imageSrc: STOCK('card2', 400, 260),
              imageAlt: 'Describe the second card image',
              title: 'Second card',
              text: 'A short supporting sentence for this card.',
              linkLabel: 'Learn more',
              linkHref: 'https://example.com',
            },
          ],
          cardTitleColor: 'brand.secondary',
          cardTextColor: 'brand.text',
          cardLinkColor: 'brand.link',
          bgColor: '',
          bgImage: '',
          align: 'left',
          padding: pad(24, 20),
        },
      };
    case 'articles':
      return {
        id,
        type,
        values: {
          layout: 'thumb-left',
          items: [
            {
              id: uid('ai'),
              imageSrc: STOCK('article1', 320, 240),
              imageAlt: 'Describe the first article image',
              title: 'First article title',
              excerpt: 'A two-line summary that gives the reader a reason to click through.',
              readMoreLabel: 'Read more',
              readMoreHref: 'https://example.com/article-1',
            },
            {
              id: uid('ai'),
              imageSrc: STOCK('article2', 320, 240),
              imageAlt: 'Describe the second article image',
              title: 'Second article title',
              excerpt: 'A two-line summary that gives the reader a reason to click through.',
              readMoreLabel: 'Read more',
              readMoreHref: 'https://example.com/article-2',
            },
          ],
          thumbWidth: 180,
          showDivider: true,
          dividerColor: 'brand.border',
          titleFontSize: 18,
          titleFontWeight: 'bold',
          titleFontFamily: 'brand.font.heading',
          titleColor: 'brand.secondary',
          excerptColor: 'brand.text',
          excerptFontSize: 14,
          linkColor: 'brand.link',
          itemSpacing: 20,
          bgColor: '',
          align: 'left',
          padding: pad(16, 20),
        },
      };
    case 'footer':
      return {
        id,
        type,
        values: {
          logoSrc: 'brand.logo',
          logoAlt: '',
          logoWidth: 120,
          address: 'brand.footer.address',
          legalText: 'brand.footer.legal',
          unsubscribeText: 'brand.footer.unsubscribe',
          unsubscribeHref: '{{unsubscribe_url}}',
          showSocial: true,
          useBrandSocial: true,
          socialItems: [],
          socialSize: 28,
          socialColorMode: 'mono',
          socialMonoColor: 'brand.muted',
          textColor: 'brand.muted',
          linkColor: 'brand.link',
          fontSize: 12,
          fontFamily: 'brand.font.body',
          bgColor: '',
          fullWidthBg: false,
          borderColor: 'brand.border',
          borderWidth: 1,
          align: 'center',
          padding: pad(24, 20),
        },
      };
  }
}

export function createRow(layout: number[] = [1]): Row {
  return {
    id: uid('row'),
    layout: [...layout],
    bgColor: '',
    contentBgColor: '',
    padding: pad(0),
    stackOnMobile: true,
    columns: layout.map(() => ({ id: uid('col'), blocks: [] })),
  };
}

/**
 * New emails default to brand tokens, so they follow the active brand until a
 * field is overridden by hand. Designs saved before brands existed carry literal
 * hex values that override these defaults, and are left exactly as they were.
 */
export function defaultBody(): BodySettings {
  return {
    bgColor: 'brand.page_bg',
    contentBgColor: 'brand.content_bg',
    width: 600,
    fontFamily: 'brand.font.body',
    textColor: 'brand.text',
    linkColor: 'brand.link',
    preheader: '',
    title: 'Untitled email',
    showFooter: true,
    // curly is the canonical form, so the default export is an identity transform
    mergeFormat: 'curly',
    mergeCustom: { prefix: '{{', suffix: '}}' },
    utm: { enabled: false, source: '', medium: 'email', campaign: '', content: '', term: '' },
  };
}

export function emptyDesign(): Design {
  return { version: 1, brandId: null, body: defaultBody(), rows: [] };
}

export function cloneWithNewIds<T>(value: T): T {
  const json = JSON.stringify(value);
  const idMap = new Map<string, string>();
  const replaced = json.replace(
    /"id":"((?:blk|row|col|mi|si)_[a-z0-9]+)"/g,
    (_m, oldId: string) => {
      const prefix = oldId.split('_')[0];
      const next = idMap.get(oldId) ?? uid(prefix);
      idMap.set(oldId, next);
      return `"id":"${next}"`;
    },
  );
  return JSON.parse(replaced) as T;
}
