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
  body: BodySettings;
  rows: Row[];
}

export type Selection =
  | { kind: 'body' }
  | { kind: 'row'; id: string }
  | { kind: 'block'; id: string };

export type Device = 'desktop' | 'mobile';
