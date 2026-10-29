import type { Block, BlockType, Design, Padding } from '../types';
import { createBlock, createRow, defaultBody, pad } from './defaults';

type Patch = Record<string, unknown>;

function mk(type: BlockType, values: Patch = {}): Block {
  const b = createBlock(type);
  Object.assign(b.values, values);
  return b;
}

function row(layout: number[], cols: Block[][], opts: { bg?: string; content?: string; padding?: Padding } = {}) {
  const r = createRow(layout);
  r.columns.forEach((c, i) => {
    c.blocks = cols[i] ?? [];
  });
  if (opts.bg !== undefined) r.bgColor = opts.bg;
  if (opts.content !== undefined) r.contentBgColor = opts.content;
  if (opts.padding) r.padding = opts.padding;
  return r;
}

const IMG = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

export interface Starter {
  id: string;
  name: string;
  description: string;
  build: () => Design;
}

export const STARTERS: Starter[] = [
  {
    id: 'welcome',
    name: 'Welcome email',
    description: 'Hero image, greeting, call-to-action and footer.',
    build: () => ({
      version: 1,
      body: { ...defaultBody(), title: 'Welcome aboard', preheader: 'Thanks for joining us — here is how to get started.' },
      rows: [
        row([1], [[mk('image', { src: IMG('welcome', 600, 260), alt: 'Welcome', padding: pad(0) })]]),
        row([1], [[
          mk('heading', { text: 'Welcome, {{first_name}}!', align: 'center', padding: pad(28, 32, 8) }),
          mk('text', {
            html: '<p style="text-align: center">We are thrilled to have you with us. Your account is ready — take a minute to explore and set things up the way you like.</p>',
            padding: pad(4, 40, 8),
          }),
          mk('button', { label: 'Get started', padding: pad(12, 20, 32) }),
        ]]),
        row([1, 1, 1], [
          [mk('heading', { text: 'Create', level: 3, fontSize: 18, align: 'center', padding: pad(16, 12, 4) }), mk('text', { html: '<p style="text-align: center">Build your first project in minutes.</p>', fontSize: 14, padding: pad(0, 12, 20) })],
          [mk('heading', { text: 'Share', level: 3, fontSize: 18, align: 'center', padding: pad(16, 12, 4) }), mk('text', { html: '<p style="text-align: center">Invite your team and collaborate.</p>', fontSize: 14, padding: pad(0, 12, 20) })],
          [mk('heading', { text: 'Grow', level: 3, fontSize: 18, align: 'center', padding: pad(16, 12, 4) }), mk('text', { html: '<p style="text-align: center">Track results and improve.</p>', fontSize: 14, padding: pad(0, 12, 20) })],
        ]),
        row([1], [[
          mk('divider'),
          mk('social', { padding: pad(10, 20, 4) }),
          mk('text', {
            html: '<p style="text-align: center">You are receiving this email because you signed up.<br>Company Name · 123 Street, City</p>',
            fontSize: 12,
            color: '#6B7280',
            padding: pad(8, 20, 24),
          }),
        ]]),
      ],
    }),
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    description: 'Masthead, featured story, two-column articles, footer.',
    build: () => ({
      version: 1,
      body: { ...defaultBody(), title: 'Monthly newsletter', preheader: 'This month: highlights, stories and what is coming next.' },
      rows: [
        row([1], [[
          mk('heading', { text: 'THE MONTHLY', level: 1, fontSize: 30, color: '#FFFFFF', align: 'center', padding: pad(24, 20, 4) }),
          mk('text', { html: '<p style="text-align: center">Issue #12 · October</p>', color: '#BFDBFE', fontSize: 13, padding: pad(0, 20, 24) }),
        ]], { content: '#1E3A8A' }),
        row([1], [[
          mk('image', { src: IMG('newsletter-hero', 600, 300), alt: 'Featured story', padding: pad(0) }),
          mk('heading', { text: 'The story of the month', padding: pad(20, 24, 4) }),
          mk('text', { html: '<p>A short teaser paragraph that makes the reader want to continue. Keep it to two or three sentences and link to the full article.</p>', padding: pad(4, 24, 4) }),
          mk('button', { label: 'Read the story', align: 'left', padding: pad(8, 24, 24) }),
        ]]),
        row([1, 1], [
          [mk('image', { src: IMG('news-a', 280, 180), alt: 'Article', padding: pad(0, 20, 0, 24) }), mk('heading', { text: 'Second story', level: 3, fontSize: 18, padding: pad(10, 20, 2, 24) }), mk('text', { html: '<p>One or two lines about this article.</p>', fontSize: 14, padding: pad(0, 20, 20, 24) })],
          [mk('image', { src: IMG('news-b', 280, 180), alt: 'Article', padding: pad(0, 24, 0, 20) }), mk('heading', { text: 'Third story', level: 3, fontSize: 18, padding: pad(10, 24, 2, 20) }), mk('text', { html: '<p>One or two lines about this article.</p>', fontSize: 14, padding: pad(0, 24, 20, 20) })],
        ]),
        row([1], [[
          mk('menu', { padding: pad(16, 20, 4) }),
          mk('text', { html: '<p style="text-align: center"><a href="https://example.com/unsubscribe">Unsubscribe</a> · <a href="https://example.com/preferences">Preferences</a></p>', fontSize: 12, color: '#6B7280', padding: pad(4, 20, 20) }),
        ]]),
      ],
    }),
  },
  {
    id: 'promo',
    name: 'Promotional offer',
    description: 'Bold offer banner, product video thumbnail and CTA.',
    build: () => ({
      version: 1,
      body: { ...defaultBody(), bgColor: '#FEF3C7', title: 'Limited-time offer', preheader: 'Save 30% this week only.' },
      rows: [
        row([1], [[
          mk('heading', { text: 'SAVE 30%', level: 1, fontSize: 48, color: '#B45309', align: 'center', padding: pad(32, 20, 0) }),
          mk('text', { html: '<p style="text-align: center">this week only, on everything in store</p>', fontSize: 18, padding: pad(0, 20, 8) }),
          mk('button', { label: 'Shop the sale', bgColor: '#B45309', borderColor: '#B45309', fontSize: 18, innerPaddingH: 36, innerPaddingV: 14, padding: pad(8, 20, 28) }),
        ]]),
        row([1], [[
          mk('video', { url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', padding: pad(20, 24, 8) }),
          mk('text', { html: '<p style="text-align: center">Offer ends Sunday at midnight. Use code <strong>SAVE30</strong> at checkout.</p>', fontSize: 14, padding: pad(4, 24, 24) }),
        ]]),
      ],
    }),
  },
];
