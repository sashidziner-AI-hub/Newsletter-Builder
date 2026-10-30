import { useMemo } from 'react';
import type { SavedBlock } from '../lib/blocks-library';
import { previewRow } from '../lib/blocks-library';
import { emptyDesign } from '../lib/defaults';
import { resolvedDesign } from '../lib/output';
import { renderDesign } from '../lib/render';
import { useActiveBrand } from '../store';

/**
 * A scaled, inert preview of a saved item, rendered with the **active** brand so
 * the library shows what inserting it would actually look like right now. Same
 * iframe + CSS transform approach as the preset thumbnails; the transform is
 * builder chrome and never reaches an email.
 */
export function SavedBlockThumb({
  saved,
  width,
  height,
}: {
  saved: SavedBlock;
  width: number;
  height: number;
}) {
  const brand = useActiveBrand();
  const DESIGN_WIDTH = 600;

  const html = useMemo(() => {
    const design = emptyDesign();
    design.rows = [previewRow(saved)];
    return renderDesign(resolvedDesign(design, brand, 'preview'));
    // the payload is immutable in the library, so its id is a safe key
  }, [saved.id, saved.updatedAt, brand]);

  const scale = width / DESIGN_WIDTH;

  return (
    <div
      className="overflow-hidden rounded border border-slate-200 bg-white"
      style={{ width, height }}
    >
      <iframe
        title=""
        aria-hidden="true"
        tabIndex={-1}
        sandbox=""
        scrolling="no"
        srcDoc={html}
        style={{
          width: DESIGN_WIDTH,
          height: height / scale,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
