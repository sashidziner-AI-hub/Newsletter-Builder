import {
  Code,
  Heading,
  Image as ImageIcon,
  Menu,
  Minus,
  MousePointerClick,
  Newspaper,
  PanelBottom,
  PanelTop,
  Share2,
  Sparkles,
  Type,
  Video,
} from 'lucide-react';
import type { BlockType } from '../types';

export function BlockIcon({ type, size = 20 }: { type: BlockType; size?: number }) {
  const props = { size, strokeWidth: 1.8 };
  switch (type) {
    case 'heading':
      return <Heading {...props} />;
    case 'text':
      return <Type {...props} />;
    case 'image':
      return <ImageIcon {...props} />;
    case 'button':
      return <MousePointerClick {...props} />;
    case 'divider':
      return <Minus {...props} />;
    case 'menu':
      return <Menu {...props} />;
    case 'social':
      return <Share2 {...props} />;
    case 'video':
      return <Video {...props} />;
    case 'html':
      return <Code {...props} />;
    case 'header':
      return <PanelTop {...props} />;
    case 'hero':
      return <Sparkles {...props} />;
    case 'footer':
      return <PanelBottom {...props} />;
    case 'articles':
      return <Newspaper {...props} />;
  }
}
