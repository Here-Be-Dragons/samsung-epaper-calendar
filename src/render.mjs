/**
 * Renders one frame: picks the layout, draws it on two layers (content and decoration), turns them into
 * the panel's six exact inks (quantize.mjs) and encodes the result as PNG.
 * The parts live in draw.mjs and the layouts in layouts.mjs.
 */
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import * as config from './config.mjs';
import { useGeometry } from './geometry.mjs';
import { serial } from './queue.mjs';
import { ensureFonts, styleFor, drawFooter } from './draw.mjs';
import { resolveTheme } from './themes.mjs';
import { createQuantizer } from './quantize.mjs';
import { LAYOUTS, DEFAULT_LAYOUT } from './layouts.mjs';

export { ensureFonts };

const renderQueue = serial();
const quantizer = createQuantizer({ perceived: config.PANEL_PALETTE, art: config.ART_DITHER });

/**
 * Renders one frame from `model` ({ now, today, events, calendars, shopping }) at `geometry`
 * (see geometry.mjs) in the named `layout`, dressed in the theme `theme` resolves to for the month
 * of `model.today` (auto, none, or a theme name; `themeMonths` overrides auto per month). Frames
 * render one at a time because px() reads the current geometry.
 */
export function render(model, { geometry, layout = DEFAULT_LAYOUT, theme = config.THEME, themeMonths = config.THEME_MONTHS }) {
  const draw = LAYOUTS[layout];
  if (!draw) throw new Error(`Unknown layout "${layout}"`);
  return renderQueue(async () => {
    ensureFonts();
    useGeometry(geometry);
    const w = geometry.width, h = geometry.height;
    const contentCanvas = createCanvas(w, h), artCanvas = createCanvas(w, h);
    const ctx = contentCanvas.getContext('2d'), art = artCanvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    const S = styleFor(resolveTheme(theme, Number(model.today.slice(5, 7)), themeMonths), art);
    draw(ctx, model, { w, h, S });
    drawFooter(ctx, model, w, h, S);
    const rgb = quantizer.compose(art.getImageData(0, 0, w, h).data, ctx.getImageData(0, 0, w, h).data, w, h);
    return encodeFrame(rgb, w, h, geometry.rotation);
  });
}

/** Rotates a frame of exact-ink RGB bytes into the panel's image orientation and encodes it. */
export async function encodeFrame(rgb, width, height, rotation = config.OUTPUT_ROTATION) {
  const r = ((rotation % 360) + 360) % 360;
  let pipeline = sharp(rgb, { raw: { width, height, channels: 3 } });
  if (r !== 0) pipeline = pipeline.rotate(r);
  // Only six colors exist, so a palette PNG is exact and about a third of the size. (JPEG would blur
  // the exact inks; it is kept only as an option.)
  if (config.IMAGE_FORMAT === 'jpeg') return pipeline.jpeg({ quality: config.JPEG_QUALITY, chromaSubsampling: '4:4:4' }).toBuffer();
  return pipeline.png({ palette: true, colours: 8, dither: 0, effort: 7, compressionLevel: 9 }).toBuffer();
}
