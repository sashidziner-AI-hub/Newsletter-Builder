export type Align = 'left' | 'center' | 'right';

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type BlockType =
  | 'heading'
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'menu'
  | 'social'
  | 'video'
  | 'html';

export interface HeadingValues {
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold';
  lineHeight: number; // percent
  fontFamily: string; // '' = inherit from body
  align: Align;
  padding: Padding;
}

export interface TextValues {
  html: string;
  fontSize: number;
  color: string;
  lineHeight: number; // percent
  fontFamily: string;
  align: Align;
  padding: Padding;
}

export interface ImageValues {
  src: string;
  alt: string;
  href: string;
  width: number; // percent of the available width
  align: Align;
  borderRadius: number;
  padding: Padding;
}

export interface ButtonValues {
  label: string;
  href: string;
  bgColor: string;
  color: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontFamily: string;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  innerPaddingV: number;
  innerPaddingH: number;
  fullWidth: boolean;
  align: Align;
  padding: Padding;
}

export interface DividerValues {
  color: string;
  thickness: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  width: number; // percent
  align: Align;
  padding: Padding;
}

export interface MenuItem {
  id: string;
  label: string;
  href: string;
}

export interface MenuValues {
  items: MenuItem[];
  layout: 'horizontal' | 'vertical';
  fontSize: number;
  color: string;
  fontWeight: 'normal' | 'bold';
  fontFamily: string;
  separator: string; // '' for none
  itemPadding: number;
  align: Align;
  padding: Padding;
}

export type SocialNetwork =
  | 'facebook'
  | 'instagram'
  | 'x'
  | 'linkedin'
  | 'youtube'
  | 'whatsapp'
  | 'telegram'
  | 'pinterest'
  | 'tiktok'
  | 'github'
  | 'email';

export interface SocialItem {
  id: string;
  network: SocialNetwork;
  href: string;
  iconUrl: string; // optional custom hosted PNG
}

export interface SocialValues {
  items: SocialItem[];
  size: number;
  shape: 'circle' | 'rounded' | 'square';
  colorMode: 'brand' | 'mono';
  monoColor: string;
  gap: number;
  align: Align;
  padding: Padding;
}

export interface VideoValues {
  url: string;
  thumbnail: string; // optional override (needed for Vimeo)
  alt: string;
  width: number;
  align: Align;
  borderRadius: number;
  showCaption: boolean;
  caption: string;
  captionColor: string;
  padding: Padding;
}

export interface HtmlValues {
  html: string;
  padding: Padding;
}

export type Block =
  | { id: string; type: 'heading'; values: HeadingValues }
  | { id: string; type: 'text'; values: TextValues }
  | { id: string; type: 'image'; values: ImageValues }
  | { id: string; type: 'button'; values: ButtonValues }
  | { id: string; type: 'divider'; values: DividerValues }
  | { id: string; type: 'menu'; values: MenuValues }
  | { id: string; type: 'social'; values: SocialValues }
  | { id: string; type: 'video'; values: VideoValues }
  | { id: string; type: 'html'; values: HtmlValues };

export interface Column {
  id: string;
  blocks: Block[];
}

export interface Row {
  id: string;
  layout: number[]; // column ratios, e.g. [1,2]
  bgColor: string; // full-width background ('' = transparent)
  contentBgColor: string; // background of the content area ('' = use body content color)
  padding: Padding;
  stackOnMobile: boolean;
  columns: Column[];
}

export interface BodySettings {
  bgColor: string;
  contentBgColor: string;
  width: number;
  fontFamily: string;
  textColor: string;
  linkColor: string;
  preheader: string;
  title: string;
}

export interface Design {
  version: 1;
  /** null (or an unknown/archived id) falls back to the default brand */
  brandId: string | null;
  body: BodySettings;
  rows: Row[];
}

export type Selection =
  | { kind: 'body' }
  | { kind: 'row'; id: string }
  | { kind: 'block'; id: string };

export type Device = 'desktop' | 'mobile';

/* ---------------------------------------------------------------- brand kit */

/**
 * A brand token is a string of the form `brand.<path>` stored in place of a hex
 * colour or a font stack. Tokens are resolved to literal values by
 * `resolveDesign()` just before rendering, so a design can be re-themed by
 * swapping `Design.brandId` without rewriting any block. Values that are not
 * tokens (plain hex, a font stack, a URL) are manual overrides and are left
 * untouched by a brand switch.
 */
export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  muted: string;
  link: string;
  page_bg: string;
  content_bg: string;
  border: string;
}

export interface BrandFonts {
  heading: string;
  body: string;
}

export interface BrandButton {
  radius: number;
  /** inner padding, vertical / horizontal, in px */
  paddingV: number;
  paddingH: number;
  weight: 'normal' | 'bold';
  uppercase: boolean;
}

export interface BrandTokens {
  colors: BrandColors;
  fonts: BrandFonts;
  button: BrandButton;
}

export interface BrandFooter {
  address: string;
  legal_text: string;
  unsubscribe_text: string;
}

export interface BrandSocialLink {
  id: string;
  network: SocialNetwork;
  url: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  /** downscaled upload, canvas preview only — never used in exported HTML */
  logo: string;
  logo_dark: string;
  /** absolute https URL — this is what the exported HTML uses */
  logo_url: string;
  logo_dark_url: string;
  website_url: string;
  tokens: BrandTokens;
  footer: BrandFooter;
  social_links: BrandSocialLink[];
  is_active: boolean;
  createdAt: number;
  updatedAt: number;
  /** nullable today; becomes a user reference when accounts exist */
  createdBy: string | null;
  updatedBy: string | null;
}
