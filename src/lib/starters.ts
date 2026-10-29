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
      // starters carry no brand of their own; loading one keeps the active brand
      brandId: null,
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
      // starters carry no brand of their own; loading one keeps the active brand
      brandId: null,
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
      // starters carry no brand of their own; loading one keeps the active brand
      brandId: null,
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
  {
    id: 'product-launch',
    name: 'Product launch',
    description: 'Announcement hero, feature highlights, spec list and a strong CTA.',
    build: () => ({
      version: 1,
      // starters carry no brand of their own; loading one keeps the active brand
      brandId: null,
      body: { ...defaultBody(), title: 'Introducing Orbit', preheader: 'The thing you have been waiting for is here.' },
      rows: [
        row([1], [[
          mk('text', { html: '<p style="text-align: center">NEW RELEASE</p>', fontSize: 12, color: '#BFDBFE', padding: pad(20, 20, 4) }),
          mk('heading', { text: 'Introducing Orbit', level: 1, fontSize: 36, color: '#FFFFFF', align: 'center', padding: pad(0, 20, 6) }),
          mk('text', { html: '<p style="text-align: center">Everything your team needs, in one place.</p>', color: '#BFDBFE', fontSize: 16, padding: pad(0, 20, 26) }),
        ]], { content: '#1E3A8A' }),
        row([1], [[
          mk('image', { src: IMG('orbit-hero', 600, 320), alt: 'Orbit product shot', padding: pad(0) }),
          mk('text', { html: '<p>We rebuilt Orbit from the ground up. It is faster, simpler, and finally does the one thing you kept asking for.</p>', padding: pad(22, 32, 6) }),
          mk('button', { label: 'See what is new', padding: pad(10, 20, 26) }),
        ]]),
        row([1, 2], [
          [mk('image', { src: IMG('orbit-f1', 200, 200), alt: 'Faster', borderRadius: 8, padding: pad(0, 10, 0, 24) })],
          [mk('heading', { text: 'Three times faster', level: 3, fontSize: 19, padding: pad(2, 24, 2, 14) }), mk('text', { html: '<p>Pages that used to take seconds now open instantly, even on large projects.</p>', fontSize: 14, padding: pad(0, 24, 18, 14) })],
        ]),
        row([1, 2], [
          [mk('image', { src: IMG('orbit-f2', 200, 200), alt: 'Collaborative', borderRadius: 8, padding: pad(0, 10, 0, 24) })],
          [mk('heading', { text: 'Built for teams', level: 3, fontSize: 19, padding: pad(2, 24, 2, 14) }), mk('text', { html: '<p>Share a workspace, leave comments, and see changes as they happen.</p>', fontSize: 14, padding: pad(0, 24, 22, 14) })],
        ]),
        row([1], [[
          mk('divider', { padding: pad(0, 24, 14) }),
          mk('heading', { text: 'What is in the box', level: 3, fontSize: 17, padding: pad(0, 24, 4) }),
          mk('text', { html: '<ul><li>Unlimited projects on every plan</li><li>Offline mode with automatic sync</li><li>Export to PDF, CSV and JSON</li><li>Single sign-on for business accounts</li></ul>', fontSize: 14, padding: pad(0, 24, 18) }),
          mk('button', { label: 'Start your free trial', fontSize: 17, innerPaddingH: 32, innerPaddingV: 14, padding: pad(4, 20, 28) }),
        ]]),
        row([1], [[
          mk('social', { padding: pad(16, 20, 4) }),
          mk('text', { html: '<p style="text-align: center">You are receiving this because you use Orbit.<br>Company Name · 123 Street, City · <a href="https://example.com/unsubscribe">Unsubscribe</a></p>', fontSize: 12, color: '#6B7280', padding: pad(6, 20, 24) }),
        ]]),
      ],
    }),
  },
  {
    id: 'event',
    name: 'Event invitation',
    description: 'Date banner, agenda in two columns, RSVP button and venue details.',
    build: () => ({
      version: 1,
      // starters carry no brand of their own; loading one keeps the active brand
      brandId: null,
      body: { ...defaultBody(), title: 'You are invited', preheader: 'Join us on 12 March for a morning of talks and coffee.' },
      rows: [
        row([1], [[
          mk('image', { src: IMG('event-hero', 600, 240), alt: 'Event', padding: pad(0) }),
        ]]),
        row([1], [[
          mk('text', { html: '<p style="text-align: center">YOU ARE INVITED</p>', fontSize: 12, color: '#FFFFFF', padding: pad(18, 20, 4) }),
          mk('heading', { text: 'Thursday, 12 March · 9:30am', level: 2, fontSize: 24, color: '#FFFFFF', align: 'center', padding: pad(0, 20, 18) }),
        ]], { content: '#1E3A8A' }),
        row([1], [[
          mk('heading', { text: 'A morning of talks and coffee', align: 'center', padding: pad(24, 32, 6) }),
          mk('text', { html: '<p style="text-align: center">Spend the morning with us for four short talks, an open Q&amp;A, and plenty of time to meet the rest of the community.</p>', padding: pad(0, 36, 10) }),
          mk('button', { label: 'Save my seat', fontSize: 17, innerPaddingH: 34, innerPaddingV: 14, padding: pad(6, 20, 8) }),
          mk('text', { html: '<p style="text-align: center"><a href="https://example.com/calendar">Add to calendar</a></p>', fontSize: 13, padding: pad(0, 20, 22) }),
        ]]),
        row([1], [[
          mk('divider', { padding: pad(0, 24, 12) }),
          mk('heading', { text: 'Agenda', level: 3, fontSize: 18, align: 'center', padding: pad(0, 20, 10) }),
        ]]),
        row([1, 2], [
          [mk('text', { html: '<p><strong>9:30</strong></p>', fontSize: 14, color: '#B45309', padding: pad(4, 8, 4, 28) })],
          [mk('text', { html: '<p><strong>Doors and coffee</strong><br>Pick up a badge and say hello.</p>', fontSize: 14, padding: pad(4, 28, 4, 4) })],
        ]),
        row([1, 2], [
          [mk('text', { html: '<p><strong>10:00</strong></p>', fontSize: 14, color: '#B45309', padding: pad(4, 8, 4, 28) })],
          [mk('text', { html: '<p><strong>Four short talks</strong><br>Fifteen minutes each, no slides required.</p>', fontSize: 14, padding: pad(4, 28, 4, 4) })],
        ]),
        row([1, 2], [
          [mk('text', { html: '<p><strong>11:30</strong></p>', fontSize: 14, color: '#B45309', padding: pad(4, 8, 4, 28) })],
          [mk('text', { html: '<p><strong>Open Q&amp;A and lunch</strong><br>Bring your questions.</p>', fontSize: 14, padding: pad(4, 28, 16, 4) })],
        ]),
        row([1], [[
          mk('divider', { padding: pad(0, 24, 14) }),
          mk('heading', { text: 'Where', level: 3, fontSize: 16, align: 'center', padding: pad(0, 20, 4) }),
          mk('text', { html: '<p style="text-align: center">The Assembly Rooms, 123 Street, City<br><a href="https://example.com/map">Open in maps</a></p>', fontSize: 14, padding: pad(0, 20, 16) }),
          mk('text', { html: '<p style="text-align: center">Cannot make it? <a href="https://example.com/rsvp">Let us know</a> and we will send the recordings.</p>', fontSize: 12, color: '#6B7280', padding: pad(6, 20, 24) }),
        ]]),
      ],
    }),
  },
  {
    id: 'order',
    name: 'Order confirmation',
    description: 'Transactional receipt: order number, line items, totals and tracking.',
    build: () => ({
      version: 1,
      // starters carry no brand of their own; loading one keeps the active brand
      brandId: null,
      body: { ...defaultBody(), bgColor: '#F9FAFB', title: 'Your order is confirmed', preheader: 'Order #10492 is confirmed and being packed.' },
      rows: [
        row([1], [[
          mk('heading', { text: 'Thanks, {{first_name}} — your order is confirmed', level: 2, fontSize: 24, padding: pad(28, 32, 6) }),
          mk('text', { html: '<p>Order <strong>#10492</strong> · placed 12 March<br>We will email you again as soon as it ships.</p>', fontSize: 14, color: '#6B7280', padding: pad(0, 32, 14) }),
          mk('button', { label: 'Track your order', align: 'left', padding: pad(0, 32, 22) }),
        ]]),
        row([1], [[
          mk('divider', { padding: pad(0, 32, 12) }),
          mk('heading', { text: 'What you ordered', level: 3, fontSize: 16, padding: pad(0, 32, 8) }),
        ]]),
        row([1, 3, 1], [
          [mk('image', { src: IMG('order-i1', 120, 120), alt: 'Item', borderRadius: 6, padding: pad(0, 4, 0, 32) })],
          [mk('text', { html: '<p><strong>Merino wool scarf</strong><br>Charcoal · Qty 1</p>', fontSize: 14, padding: pad(2, 8, 10, 12) })],
          [mk('text', { html: '<p style="text-align: right">£48.00</p>', fontSize: 14, padding: pad(2, 32, 10, 0) })],
        ]),
        row([1, 3, 1], [
          [mk('image', { src: IMG('order-i2', 120, 120), alt: 'Item', borderRadius: 6, padding: pad(0, 4, 0, 32) })],
          [mk('text', { html: '<p><strong>Leather card holder</strong><br>Tan · Qty 2</p>', fontSize: 14, padding: pad(2, 8, 10, 12) })],
          [mk('text', { html: '<p style="text-align: right">£64.00</p>', fontSize: 14, padding: pad(2, 32, 10, 0) })],
        ]),
        row([1], [[
          mk('divider', { padding: pad(4, 32, 10) }),
        ]]),
        row([2, 1], [
          [mk('text', { html: '<p>Subtotal<br>Shipping<br><strong>Total</strong></p>', fontSize: 14, color: '#6B7280', padding: pad(0, 8, 14, 32) })],
          [mk('text', { html: '<p style="text-align: right">£112.00<br>£4.95<br><strong>£116.95</strong></p>', fontSize: 14, padding: pad(0, 32, 14, 0) })],
        ]),
        row([1, 1], [
          [mk('heading', { text: 'Shipping to', level: 3, fontSize: 14, padding: pad(12, 10, 4, 32) }), mk('text', { html: '<p>{{first_name}} {{last_name}}<br>123 Street<br>City, AB1 2CD</p>', fontSize: 13, color: '#6B7280', padding: pad(0, 10, 20, 32) })],
          [mk('heading', { text: 'Delivery', level: 3, fontSize: 14, padding: pad(12, 32, 4, 10) }), mk('text', { html: '<p>Standard · 3–5 working days<br>Estimated 17 March</p>', fontSize: 13, color: '#6B7280', padding: pad(0, 32, 20, 10) })],
        ]),
        row([1], [[
          mk('divider', { padding: pad(0, 32, 12) }),
          mk('text', { html: '<p style="text-align: center">Questions about this order? <a href="https://example.com/help">Contact support</a><br>Company Name · 123 Street, City</p>', fontSize: 12, color: '#6B7280', padding: pad(0, 20, 26) }),
        ]]),
      ],
    }),
  },
  {
    id: 'digest',
    name: 'Weekly digest',
    description: 'Numbered link roundup with blurbs and read times. Dense and mostly text.',
    build: () => ({
      version: 1,
      // starters carry no brand of their own; loading one keeps the active brand
      brandId: null,
      body: { ...defaultBody(), title: 'The weekly five', preheader: 'Five things worth your time this week.' },
      rows: [
        row([1], [[
          mk('heading', { text: 'THE WEEKLY FIVE', level: 1, fontSize: 26, align: 'center', padding: pad(26, 20, 2) }),
          mk('text', { html: '<p style="text-align: center">Week 11 · five things worth your time</p>', fontSize: 13, color: '#6B7280', padding: pad(0, 20, 16) }),
          mk('divider', { padding: pad(0, 32, 4) }),
        ]]),
        row([1], [[
          mk('heading', { text: '01 · The case for smaller teams', level: 3, fontSize: 18, padding: pad(18, 32, 4) }),
          mk('text', { html: '<p>Why four people ship more than twelve, and what happens when you stop adding headcount to a late project.</p>', fontSize: 14, padding: pad(0, 32, 4) }),
          mk('text', { html: '<p><a href="https://example.com/1">Read it</a> · 6 min</p>', fontSize: 13, color: '#6B7280', padding: pad(0, 32, 10) }),
        ]]),
        row([1], [[
          mk('heading', { text: '02 · What we got wrong about remote', level: 3, fontSize: 18, padding: pad(10, 32, 4) }),
          mk('text', { html: '<p>Three years of data from a fully distributed company, and the two habits that mattered more than any tool.</p>', fontSize: 14, padding: pad(0, 32, 4) }),
          mk('text', { html: '<p><a href="https://example.com/2">Read it</a> · 9 min</p>', fontSize: 13, color: '#6B7280', padding: pad(0, 32, 10) }),
        ]]),
        row([1], [[
          mk('heading', { text: '03 · A short history of the spreadsheet', level: 3, fontSize: 18, padding: pad(10, 32, 4) }),
          mk('text', { html: '<p>From VisiCalc to today: how one piece of software quietly became the most used programming environment on earth.</p>', fontSize: 14, padding: pad(0, 32, 4) }),
          mk('text', { html: '<p><a href="https://example.com/3">Read it</a> · 12 min</p>', fontSize: 13, color: '#6B7280', padding: pad(0, 32, 10) }),
        ]]),
        row([1], [[
          mk('heading', { text: '04 · Designing for the first five minutes', level: 3, fontSize: 18, padding: pad(10, 32, 4) }),
          mk('text', { html: '<p>Most people decide whether to keep using a product before they finish signing up. Here is what to do about it.</p>', fontSize: 14, padding: pad(0, 32, 4) }),
          mk('text', { html: '<p><a href="https://example.com/4">Read it</a> · 5 min</p>', fontSize: 13, color: '#6B7280', padding: pad(0, 32, 10) }),
        ]]),
        row([1], [[
          mk('heading', { text: '05 · The quiet cost of a meeting', level: 3, fontSize: 18, padding: pad(10, 32, 4) }),
          mk('text', { html: '<p>A back-of-the-envelope model for what an hour with eight people actually costs, and when it is still worth it.</p>', fontSize: 14, padding: pad(0, 32, 4) }),
          mk('text', { html: '<p><a href="https://example.com/5">Read it</a> · 4 min</p>', fontSize: 13, color: '#6B7280', padding: pad(0, 32, 16) }),
        ]]),
        row([1], [[
          mk('text', { html: '<p style="text-align: center">Forwarded this? <a href="https://example.com/subscribe" style="color:#FFFFFF">Subscribe here</a></p>', fontSize: 14, color: '#FFFFFF', padding: pad(18, 20, 18) }),
        ]], { content: '#1E3A8A' }),
        row([1], [[
          mk('menu', { fontSize: 13, padding: pad(14, 20, 2) }),
          mk('text', { html: '<p style="text-align: center">Company Name · 123 Street, City<br><a href="https://example.com/unsubscribe">Unsubscribe</a> · <a href="https://example.com/preferences">Preferences</a></p>', fontSize: 12, color: '#6B7280', padding: pad(2, 20, 22) }),
        ]]),
      ],
    }),
  },
];
