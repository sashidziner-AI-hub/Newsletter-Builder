import type { Block, BlockType, BodySettings, Brand, Design, Padding } from '../types';
import { createBlock, createRow, defaultBody, pad } from './defaults';

/**
 * Starter presets.
 *
 * Every preset is brand-neutral: colours and fonts are stored as `brand.*`
 * tokens, so a preset re-themes with the active brand and keeps doing so after
 * a later brand switch. The brand *name* is different — it is interpolated into
 * the copy once, when the preset is applied, because from then on it is ordinary
 * editable prose.
 *
 * `build()` goes through `createBlock` / `createRow`, which mint ids via
 * `uid()`, so every call returns a fresh copy. Applying a preset twice can
 * never alias, and editing the result cannot mutate the preset.
 *
 * Prose must never *start* with `brand.` — `resolveDesign()` substitutes a value
 * only when the whole string is a token, and would blank the string.
 */

type Patch = Record<string, unknown>;

function mk(type: BlockType, values: Patch = {}): Block {
  const b = createBlock(type);
  Object.assign(b.values, values);
  return b;
}

function row(
  layout: number[],
  cols: Block[][],
  opts: { bg?: string; content?: string; padding?: Padding } = {},
) {
  const r = createRow(layout);
  r.columns.forEach((c, i) => {
    c.blocks = cols[i] ?? [];
  });
  if (opts.bg !== undefined) r.bgColor = opts.bg;
  if (opts.content !== undefined) r.contentBgColor = opts.content;
  if (opts.padding) r.padding = opts.padding;
  return r;
}

/** Placeholder art. The export dialog warns while any of these survive. */
const IMG = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const body = (title: string, preheader: string, extra: Partial<BodySettings> = {}): BodySettings => ({
  ...defaultBody(),
  title,
  preheader,
  ...extra,
});

export interface Preset {
  id: string;
  name: string;
  description: string;
  /** Returns a fresh design themed for `brand`. Never returns shared state. */
  build: (brand: Brand) => Design;
}

export const PRESETS: Preset[] = [
  /* ------------------------------------------------------------ newsletter */
  {
    id: 'newsletter',
    name: 'Newsletter',
    description: 'Masthead, lead story, three articles and a call-to-action band.',
    build: (brand) => ({
      version: 1,
      brandId: null,
      body: body('This month at ' + brand.name, 'The lead story, three quick reads and what is next.'),
      rows: [
        row([1], [[mk('header', { layout: 'logo-left' })]]),
        row([1], [[
          mk('hero', {
            layout: 'image-right',
            eyebrow: 'THIS MONTH',
            heading: 'The one change that cut our response time in half',
            subtext:
              'A short look at what we changed, what it cost us, and what we would do differently.',
            imageSrc: IMG('nl-lead', 560, 420),
            imageAlt: 'Two colleagues reviewing a dashboard together',
            ctaLabel: 'Read the full story',
            ctaHref: 'https://example.com/lead-story',
          }),
        ]]),
        row([1], [[
          mk('text', {
            html:
              '<p>Hello {{first_name}},</p><p>Here is what the team at ' +
              brand.name +
              ' has been working on this month — one longer read, three shorter ones, and a date for your diary at the bottom.</p>',
            padding: pad(4, 20, 12),
          }),
        ]]),
        row([1], [[
          mk('articles', {
            layout: 'thumb-left',
            items: [
              {
                id: 'na1',
                imageSrc: IMG('nl-a1', 360, 270),
                imageAlt: 'A clinician using a tablet at a standing desk',
                title: 'What the new intake form changed',
                excerpt: 'Fewer fields, clearer labels, and a 22% drop in abandoned submissions.',
                readMoreLabel: 'Read more',
                readMoreHref: 'https://example.com/intake-form',
              },
              {
                id: 'na2',
                imageSrc: IMG('nl-a2', 360, 270),
                imageAlt: 'Close-up of a printed report with handwritten notes',
                title: 'Three questions we now ask every new client',
                excerpt: 'They take four minutes and have saved us weeks of rework.',
                readMoreLabel: 'Read more',
                readMoreHref: 'https://example.com/three-questions',
              },
              {
                id: 'na3',
                imageSrc: IMG('nl-a3', 360, 270),
                imageAlt: 'A small team gathered around a whiteboard',
                title: 'Behind the scenes: how we plan a quarter',
                excerpt: 'Our planning doc, the arguments it starts, and why we keep doing it.',
                readMoreLabel: 'Read more',
                readMoreHref: 'https://example.com/planning',
              },
            ],
          }),
        ]]),
        // CTA band: the row carries the colour so it reaches the full width
        row(
          [1],
          [[
            mk('heading', {
              text: 'Want this as a monthly briefing?',
              level: 2,
              fontSize: 22,
              color: 'brand.content_bg',
              fontFamily: 'brand.font.heading',
              align: 'center',
              padding: pad(26, 24, 6),
            }),
            mk('text', {
              html: '<p style="text-align: center">One email a month. No more than that.</p>',
              fontSize: 14,
              color: 'brand.content_bg',
              padding: pad(0, 24, 14),
            }),
            mk('button', {
              label: 'Subscribe to the briefing',
              href: 'https://example.com/subscribe',
              bgColor: 'brand.content_bg',
              color: 'brand.primary',
              fontFamily: 'brand.font.body',
              padding: pad(0, 20, 28),
            }),
          ]],
          { bg: 'brand.primary', content: 'brand.primary' },
        ),
        row([1], [[mk('footer', {})]]),
      ],
    }),
  },

  /* ----------------------------------------------------------- promotional */
  {
    id: 'promotional',
    name: 'Promotional',
    description: 'Centred logo, bold offer banner, two feature cards and a single CTA.',
    build: (brand) => ({
      version: 1,
      brandId: null,
      body: body('A limited offer from ' + brand.name, 'Save 20% on your first three months — ends 31 March.'),
      rows: [
        row([1], [[mk('header', { layout: 'logo-center', showNav: false, borderWidth: 0 })]]),
        row([1], [[
          mk('hero', {
            layout: 'centered',
            eyebrow: 'LIMITED TIME',
            heading: 'Save 20% on your first three months',
            subtext: 'New plans only. Offer ends 31 March, no code needed.',
            imageSrc: '',
            imageAlt: '',
            bgColor: 'brand.secondary',
            headingColor: 'brand.content_bg',
            subtextColor: 'brand.content_bg',
            eyebrowColor: 'brand.primary',
            ctaLabel: 'Claim the offer',
            ctaHref: 'https://example.com/offer',
            ctaColor: 'brand.primary',
            ctaTextColor: 'brand.content_bg',
          }),
        ]]),
        row([1], [[
          mk('heading', {
            text: 'Everything in the plan, nothing held back',
            level: 2,
            fontSize: 24,
            color: 'brand.secondary',
            fontFamily: 'brand.font.heading',
            align: 'center',
            padding: pad(28, 28, 8),
          }),
          mk('text', {
            html:
              '<p style="text-align: center">Every plan includes the full product, unlimited seats and support from a real person. The discount applies to your first three invoices and then your plan continues at the standard rate.</p>',
            padding: pad(0, 32, 18),
          }),
        ]]),
        row([1, 1], [
          [
            mk('image', {
              src: IMG('promo-f1', 420, 280),
              alt: 'A support specialist on a video call',
              padding: pad(0, 10, 10, 24),
            }),
            mk('heading', {
              text: 'Support that answers',
              level: 3,
              fontSize: 17,
              color: 'brand.secondary',
              fontFamily: 'brand.font.heading',
              padding: pad(0, 10, 4, 24),
            }),
            mk('text', {
              html: '<p>A named contact, not a queue. Median first reply under two hours.</p>',
              fontSize: 14,
              padding: pad(0, 10, 16, 24),
            }),
          ],
          [
            mk('image', {
              src: IMG('promo-f2', 420, 280),
              alt: 'A laptop showing a reporting dashboard',
              padding: pad(0, 24, 10, 10),
            }),
            mk('heading', {
              text: 'Reporting built in',
              level: 3,
              fontSize: 17,
              color: 'brand.secondary',
              fontFamily: 'brand.font.heading',
              padding: pad(0, 24, 4, 10),
            }),
            mk('text', {
              html: '<p>The numbers your board asks for, exportable the way they want them.</p>',
              fontSize: 14,
              padding: pad(0, 24, 16, 10),
            }),
          ],
        ]),
        row([1], [[
          mk('button', {
            label: 'Start with 20% off',
            href: 'https://example.com/offer',
            fontSize: 17,
            innerPaddingH: 34,
            innerPaddingV: 14,
            bgColor: 'brand.primary',
            color: 'brand.content_bg',
            fontFamily: 'brand.font.body',
            padding: pad(4, 20, 8),
          }),
          mk('text', {
            html: '<p style="text-align: center">Offer ends 31 March. Cancel any time.</p>',
            fontSize: 12,
            color: 'brand.muted',
            padding: pad(0, 20, 18),
          }),
          mk('divider', { color: 'brand.border', padding: pad(0, 28, 4) }),
        ]]),
        row([1], [[mk('footer', {})]]),
      ],
    }),
  },

  /* --------------------------------------------------------- product launch */
  {
    id: 'product-launch',
    name: 'Product launch',
    description: 'Announcement hero, three feature cards, a full-width shot and a strong CTA.',
    build: (brand) => ({
      version: 1,
      brandId: null,
      body: body('Introducing Orbit', 'Orbit is here — scheduling, reporting and handover in one place.'),
      rows: [
        row([1], [[mk('header', { layout: 'logo-left' })]]),
        row([1], [[
          mk('hero', {
            layout: 'cards-3',
            eyebrow: 'NEW FROM ' + brand.name.toUpperCase(),
            heading: 'Introducing Orbit',
            subtext: '',
            cards: [
              {
                id: 'pc1',
                imageSrc: IMG('orbit-f1', 400, 260),
                imageAlt: 'A weekly schedule laid out in a planning view',
                title: 'Scheduling that holds',
                text: 'Build a rota once and let Orbit handle the swaps and the cover.',
                linkLabel: 'See scheduling',
                linkHref: 'https://example.com/orbit/scheduling',
              },
              {
                id: 'pc2',
                imageSrc: IMG('orbit-f2', 400, 260),
                imageAlt: 'A monthly report with trend lines',
                title: 'Reporting on tap',
                text: 'The monthly pack builds itself. Export it or share a live link.',
                linkLabel: 'See reporting',
                linkHref: 'https://example.com/orbit/reporting',
              },
              {
                id: 'pc3',
                imageSrc: IMG('orbit-f3', 400, 260),
                imageAlt: 'Two people reviewing notes during a shift handover',
                title: 'Handover in one place',
                text: 'Notes, flags and follow-ups travel with the shift, not in someone inbox.',
                linkLabel: 'See handover',
                linkHref: 'https://example.com/orbit/handover',
              },
            ],
          }),
        ]]),
        row([1], [[
          mk('text', {
            html:
              '<p>Orbit replaces the three tools most teams are already paying for, and it imports from all of them. Existing ' +
              brand.name +
              ' customers can switch on Orbit today at no extra cost for the first month.</p>',
            padding: pad(6, 28, 14),
          }),
        ]]),
        row([1], [[
          mk('image', {
            src: IMG('orbit-shot', 600, 340),
            alt: 'The Orbit dashboard showing this week at a glance',
            padding: pad(0, 20, 16),
          }),
        ]]),
        row([1], [[
          mk('button', {
            label: 'Try Orbit free for a month',
            href: 'https://example.com/orbit/trial',
            fontSize: 17,
            innerPaddingH: 32,
            innerPaddingV: 14,
            bgColor: 'brand.primary',
            color: 'brand.content_bg',
            fontFamily: 'brand.font.body',
            padding: pad(0, 20, 8),
          }),
          mk('text', {
            html:
              '<p style="text-align: center">No card needed. <a href="https://example.com/orbit/demo">Book a walkthrough</a> if you would rather be shown around.</p>',
            fontSize: 13,
            color: 'brand.muted',
            padding: pad(0, 20, 22),
          }),
        ]]),
        row([1], [[mk('footer', {})]]),
      ],
    }),
  },

  /* --------------------------------------------------------------- welcome */
  {
    id: 'welcome',
    name: 'Welcome',
    description: 'Centred masthead, warm greeting, three next steps and a single action.',
    build: (brand) => ({
      version: 1,
      brandId: null,
      body: body('Welcome to ' + brand.name, 'You are in — here are the three things worth doing first.'),
      rows: [
        row([1], [[mk('header', { layout: 'logo-center', showNav: false })]]),
        row([1], [[
          mk('hero', {
            layout: 'centered',
            eyebrow: '',
            heading: 'Welcome to ' + brand.name,
            subtext: 'We are glad you are here. Your account is ready to use.',
            imageSrc: IMG('welcome-hero', 560, 300),
            imageAlt: 'A team welcoming a new colleague',
            ctaLabel: '',
            ctaHref: '',
          }),
        ]]),
        row([1], [[
          mk('text', {
            html:
              '<p>Hi {{first_name}},</p><p>Thanks for joining ' +
              brand.name +
              '. Everything is set up and waiting for you — if you only have five minutes today, the three steps below are the ones that make the rest easier.</p>',
            padding: pad(6, 28, 10),
          }),
        ]]),
        row([1], [[
          mk('articles', {
            layout: 'text-only',
            showDivider: true,
            items: [
              {
                id: 'wa1',
                imageSrc: '',
                imageAlt: '',
                title: '1 · Finish your profile',
                excerpt:
                  'Two fields and a photo. It is what your teammates see when you comment or assign them something.',
                readMoreLabel: 'Complete profile',
                readMoreHref: 'https://example.com/profile',
              },
              {
                id: 'wa2',
                imageSrc: '',
                imageAlt: '',
                title: '2 · Invite one teammate',
                excerpt:
                  'Most of this gets more useful with someone else in it. Start with whoever you work with most.',
                readMoreLabel: 'Send an invite',
                readMoreHref: 'https://example.com/invite',
              },
              {
                id: 'wa3',
                imageSrc: '',
                imageAlt: '',
                title: '3 · Import your first list',
                excerpt: 'Bring a CSV or connect a tool you already use. It takes about a minute.',
                readMoreLabel: 'Start an import',
                readMoreHref: 'https://example.com/import',
              },
            ],
          }),
        ]]),
        row([1], [[
          mk('button', {
            label: 'Open your dashboard',
            href: 'https://example.com/dashboard',
            fontSize: 17,
            innerPaddingH: 32,
            innerPaddingV: 14,
            bgColor: 'brand.primary',
            color: 'brand.content_bg',
            fontFamily: 'brand.font.body',
            padding: pad(10, 20, 6),
          }),
          mk('text', {
            html:
              '<p style="text-align: center">Stuck on anything? Reply to this email — a real person reads it.</p>',
            fontSize: 13,
            color: 'brand.muted',
            padding: pad(0, 24, 14),
          }),
        ]]),
        row([1], [[
          mk('text', {
            html: '<p style="text-align: center">Come and say hello</p>',
            fontSize: 12,
            color: 'brand.muted',
            padding: pad(4, 20, 2),
          }),
          mk('social', {
            colorMode: 'mono',
            monoColor: 'brand.muted',
            size: 28,
            padding: pad(0, 20, 16),
          }),
        ]]),
        row([1], [[mk('footer', {})]]),
      ],
    }),
  },

  /* -------------------------------------------------------- cold outreach */
  {
    id: 'cold-outreach',
    name: 'Cold outreach',
    description: 'Deliberately plain — reads like a personal email, not a campaign.',
    build: (brand) => ({
      version: 1,
      brandId: null,
      // no grey frame: a personal email has no masthead and no page background
      body: body('Quick question about your intake process', 'One question, and I will keep it short.', {
        bgColor: 'brand.content_bg',
        width: 560,
      }),
      rows: [
        row([1], [[
          mk('text', {
            html:
              '<p>Hi {{first_name}},</p>' +
              '<p>I noticed your team handles patient intake across three different systems. Most groups your size tell us the handover between them is where the time goes — usually a couple of hours a week per coordinator.</p>' +
              '<p>We built something for exactly that, and two clinics near you switched last quarter. One of them cut their intake handling time by about a third; I am happy to share what they did either way.</p>' +
              '<p>Would a short call next week be useful? If it is not a priority right now, just say so and I will leave you alone.</p>',
            fontSize: 15,
            lineHeight: 160,
            padding: pad(28, 28, 8),
          }),
        ]]),
        row([1], [[
          mk('button', {
            label: 'Book 15 minutes',
            href: 'https://example.com/book-a-call',
            fontSize: 15,
            innerPaddingV: 11,
            innerPaddingH: 22,
            borderRadius: 4,
            bgColor: 'brand.primary',
            color: 'brand.content_bg',
            fontFamily: 'brand.font.body',
            align: 'left',
            padding: pad(2, 28, 16),
          }),
        ]]),
        row([1], [[
          mk('text', {
            html:
              '<p>Best,<br>Priya Raman<br>' +
              brand.name +
              '<br><a href="https://example.com">example.com</a></p>',
            fontSize: 14,
            color: 'brand.muted',
            lineHeight: 150,
            padding: pad(4, 28, 20),
          }),
        ]]),
        row([1], [[
          mk('footer', {
            logoSrc: '',
            showSocial: false,
            fontSize: 11,
            align: 'left',
            borderWidth: 1,
            padding: pad(14, 28, 20),
          }),
        ]]),
      ],
    }),
  },

  /* --------------------------------------- ported from the 1A-era starters */
  {
    id: 'event',
    name: 'Event invitation',
    description: 'Date banner, agenda in two columns, RSVP button and venue details.',
    build: (brand) => ({
      version: 1,
      brandId: null,
      body: body('You are invited', 'Join us on 12 March for a morning of talks and coffee.'),
      rows: [
        row([1], [[
          mk('image', {
            src: IMG('event-hero', 600, 240),
            alt: 'The venue entrance on a bright morning',
            padding: pad(0),
          }),
        ]]),
        row([1], [[
          mk('text', {
            html: '<p style="text-align: center">YOU ARE INVITED</p>',
            fontSize: 12,
            color: 'brand.content_bg',
            padding: pad(18, 20, 4),
          }),
          mk('heading', {
            text: 'Thursday, 12 March · 9:30am',
            level: 2,
            fontSize: 24,
            color: 'brand.content_bg',
            fontFamily: 'brand.font.heading',
            align: 'center',
            padding: pad(0, 20, 18),
          }),
        ]], { content: 'brand.secondary' }),
        row([1], [[
          mk('heading', {
            text: 'A morning of talks and coffee',
            color: 'brand.secondary',
            fontFamily: 'brand.font.heading',
            align: 'center',
            padding: pad(24, 32, 6),
          }),
          mk('text', {
            html:
              '<p style="text-align: center">Spend the morning with ' +
              brand.name +
              ' for four short talks, an open Q&amp;A, and plenty of time to meet the rest of the community.</p>',
            padding: pad(0, 36, 10),
          }),
          mk('button', {
            label: 'Save my seat',
            href: 'https://example.com/rsvp',
            fontSize: 17,
            innerPaddingH: 34,
            innerPaddingV: 14,
            bgColor: 'brand.primary',
            color: 'brand.content_bg',
            fontFamily: 'brand.font.body',
            padding: pad(6, 20, 8),
          }),
          mk('text', {
            html:
              '<p style="text-align: center"><a href="https://example.com/calendar">Add to calendar</a></p>',
            fontSize: 13,
            padding: pad(0, 20, 22),
          }),
        ]]),
        row([1], [[
          mk('divider', { color: 'brand.border', padding: pad(0, 24, 12) }),
          mk('heading', {
            text: 'Agenda',
            level: 3,
            fontSize: 18,
            color: 'brand.secondary',
            fontFamily: 'brand.font.heading',
            align: 'center',
            padding: pad(0, 20, 10),
          }),
        ]]),
        ...[
          ['9:30', 'Doors and coffee', 'Pick up a badge and say hello.', pad(4, 28, 4, 4)],
          ['10:00', 'Four short talks', 'Fifteen minutes each, no slides required.', pad(4, 28, 4, 4)],
          ['11:30', 'Open Q&amp;A and lunch', 'Bring your questions.', pad(4, 28, 16, 4)],
        ].map(([time, title, note, textPad]) =>
          row([1, 2], [
            [
              mk('text', {
                html: '<p><strong>' + time + '</strong></p>',
                fontSize: 14,
                color: 'brand.primary',
                padding: pad(4, 8, 4, 28),
              }),
            ],
            [
              mk('text', {
                html: '<p><strong>' + title + '</strong><br>' + note + '</p>',
                fontSize: 14,
                padding: textPad as Padding,
              }),
            ],
          ]),
        ),
        row([1], [[
          mk('divider', { color: 'brand.border', padding: pad(0, 24, 14) }),
          mk('heading', {
            text: 'Where',
            level: 3,
            fontSize: 16,
            color: 'brand.secondary',
            fontFamily: 'brand.font.heading',
            align: 'center',
            padding: pad(0, 20, 4),
          }),
          mk('text', {
            html:
              '<p style="text-align: center">The Assembly Rooms, 123 Street, City<br><a href="https://example.com/map">Open in maps</a></p>',
            fontSize: 14,
            padding: pad(0, 20, 16),
          }),
          mk('text', {
            html:
              '<p style="text-align: center">Cannot make it? <a href="https://example.com/rsvp">Let us know</a> and we will send the recordings.</p>',
            fontSize: 12,
            color: 'brand.muted',
            padding: pad(6, 20, 24),
          }),
        ]]),
        row([1], [[mk('footer', {})]]),
      ],
    }),
  },
  {
    id: 'order',
    name: 'Order confirmation',
    description: 'Transactional receipt: order number, line items, totals and tracking.',
    build: (brand) => ({
      version: 1,
      brandId: null,
      body: body('Your order is confirmed', 'Order #10492 is confirmed and being packed.'),
      rows: [
        row([1], [[
          mk('heading', {
            text: 'Thanks, {{first_name}} — your order is confirmed',
            level: 2,
            fontSize: 24,
            color: 'brand.secondary',
            fontFamily: 'brand.font.heading',
            padding: pad(28, 32, 6),
          }),
          mk('text', {
            html:
              '<p>Order <strong>#10492</strong> · placed 12 March<br>' +
              brand.name +
              ' will email you again as soon as it ships.</p>',
            fontSize: 14,
            color: 'brand.muted',
            padding: pad(0, 32, 14),
          }),
          mk('button', {
            label: 'Track your order',
            href: 'https://example.com/track',
            bgColor: 'brand.primary',
            color: 'brand.content_bg',
            fontFamily: 'brand.font.body',
            align: 'left',
            padding: pad(0, 32, 22),
          }),
        ]]),
        row([1], [[
          mk('divider', { color: 'brand.border', padding: pad(0, 32, 12) }),
          mk('heading', {
            text: 'What you ordered',
            level: 3,
            fontSize: 16,
            color: 'brand.secondary',
            fontFamily: 'brand.font.heading',
            padding: pad(0, 32, 8),
          }),
        ]]),
        ...[
          ['order-i1', 'Merino wool scarf', 'Charcoal · Qty 1', '£48.00', 'A charcoal merino wool scarf'],
          ['order-i2', 'Leather card holder', 'Tan · Qty 2', '£64.00', 'A tan leather card holder'],
        ].map(([seed, name, variant, price, alt]) =>
          row([1, 3, 1], [
            [mk('image', { src: IMG(seed, 120, 120), alt, borderRadius: 6, padding: pad(0, 4, 0, 32) })],
            [
              mk('text', {
                html: '<p><strong>' + name + '</strong><br>' + variant + '</p>',
                fontSize: 14,
                padding: pad(2, 8, 10, 12),
              }),
            ],
            [
              mk('text', {
                html: '<p style="text-align: right">' + price + '</p>',
                fontSize: 14,
                padding: pad(2, 32, 10, 0),
              }),
            ],
          ]),
        ),
        row([1], [[mk('divider', { color: 'brand.border', padding: pad(4, 32, 10) })]]),
        row([2, 1], [
          [
            mk('text', {
              html: '<p>Subtotal<br>Shipping<br><strong>Total</strong></p>',
              fontSize: 14,
              color: 'brand.muted',
              padding: pad(0, 8, 14, 32),
            }),
          ],
          [
            mk('text', {
              html: '<p style="text-align: right">£112.00<br>£4.95<br><strong>£116.95</strong></p>',
              fontSize: 14,
              padding: pad(0, 32, 14, 0),
            }),
          ],
        ]),
        row([1, 1], [
          [
            mk('heading', {
              text: 'Shipping to',
              level: 3,
              fontSize: 14,
              color: 'brand.secondary',
              fontFamily: 'brand.font.heading',
              padding: pad(12, 10, 4, 32),
            }),
            mk('text', {
              html: '<p>{{first_name}} {{last_name}}<br>123 Street<br>City, AB1 2CD</p>',
              fontSize: 13,
              color: 'brand.muted',
              padding: pad(0, 10, 20, 32),
            }),
          ],
          [
            mk('heading', {
              text: 'Delivery',
              level: 3,
              fontSize: 14,
              color: 'brand.secondary',
              fontFamily: 'brand.font.heading',
              padding: pad(12, 32, 4, 10),
            }),
            mk('text', {
              html: '<p>Standard · 3–5 working days<br>Estimated 17 March</p>',
              fontSize: 13,
              color: 'brand.muted',
              padding: pad(0, 32, 20, 10),
            }),
          ],
        ]),
        row([1], [[mk('footer', { showSocial: false })]]),
      ],
    }),
  },
  {
    id: 'digest',
    name: 'Weekly digest',
    description: 'Numbered link roundup with blurbs and read times. Dense and mostly text.',
    build: () => ({
      version: 1,
      brandId: null,
      body: body('The weekly five', 'Five things worth your time this week.'),
      rows: [
        row([1], [[
          mk('heading', {
            text: 'THE WEEKLY FIVE',
            level: 1,
            fontSize: 26,
            color: 'brand.secondary',
            fontFamily: 'brand.font.heading',
            align: 'center',
            padding: pad(26, 20, 2),
          }),
          mk('text', {
            html: '<p style="text-align: center">Week 11 · five things worth your time</p>',
            fontSize: 13,
            color: 'brand.muted',
            padding: pad(0, 20, 16),
          }),
          mk('divider', { color: 'brand.border', padding: pad(0, 32, 4) }),
        ]]),
        ...[
          [
            '01 · The case for smaller teams',
            'Why four people ship more than twelve, and what happens when you stop adding headcount to a late project.',
            'https://example.com/1',
            '6 min',
            pad(18, 32, 4),
          ],
          [
            '02 · What we got wrong about remote',
            'Three years of data from a fully distributed company, and the two habits that mattered more than any tool.',
            'https://example.com/2',
            '9 min',
            pad(10, 32, 4),
          ],
          [
            '03 · A short history of the spreadsheet',
            'From VisiCalc to today: how one piece of software quietly became the most used programming environment on earth.',
            'https://example.com/3',
            '12 min',
            pad(10, 32, 4),
          ],
          [
            '04 · Designing for the first five minutes',
            'Most people decide whether to keep using a product before they finish signing up. Here is what to do about it.',
            'https://example.com/4',
            '5 min',
            pad(10, 32, 4),
          ],
          [
            '05 · The quiet cost of a meeting',
            'A back-of-the-envelope model for what an hour with eight people actually costs, and when it is still worth it.',
            'https://example.com/5',
            '4 min',
            pad(10, 32, 4),
          ],
        ].map(([title, blurb, href, mins, headPad]) =>
          row([1], [[
            mk('heading', {
              text: title,
              level: 3,
              fontSize: 18,
              color: 'brand.secondary',
              fontFamily: 'brand.font.heading',
              padding: headPad as Padding,
            }),
            mk('text', { html: '<p>' + blurb + '</p>', fontSize: 14, padding: pad(0, 32, 4) }),
            mk('text', {
              html: '<p><a href="' + href + '">Read it</a> · ' + mins + '</p>',
              fontSize: 13,
              color: 'brand.muted',
              padding: pad(0, 32, 10),
            }),
          ]]),
        ),
        row([1], [[mk('footer', {})]]),
      ],
    }),
  },
];

/** The preset the app opens with on a brand-new browser. */
export const FIRST_RUN_PRESET = 'welcome';
