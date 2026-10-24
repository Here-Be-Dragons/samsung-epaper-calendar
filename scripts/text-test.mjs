#!/usr/bin/env node
/**
 * Builds a test sheet for choosing how text edges are rendered (TEXT_AA / TEXT_CUT, see src/quantize.mjs): the same
 * excerpts of your real calendar drawn each way, stacked on one panel-sized picture, to push to the panel.
 *
 *   node --env-file=.env scripts/text-test.mjs [--out text-test.png] [--demo]
 *
 * The crop positions assume the 1440x2560 portrait paper layout.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const out = path.resolve(arg('--out') ?? 'text-test.png');

if (process.argv.includes('--demo')) {
  for (const key of Object.keys(process.env)) if (/^(CALENDAR|CONFIG|SHOPPING)/.test(key)) delete process.env[key];
  Object.assign(process.env, { CONFIG_FILE: path.join(root, 'examples', 'config.yaml'), SHOPPING_SOURCE: 'file', SHOPPING_FILE: path.join(root, 'examples', 'shopping.json') });
}

const { getModel } = await import('../src/calendar.mjs');
const { render, ensureFonts } = await import('../src/render.mjs');
const { geometryFor } = await import('../src/geometry.mjs');
const { createQuantizer } = await import('../src/quantize.mjs');

const VARIANTS = [
  { label: '1. threshold 0.40 (current)', text: 'threshold', textCut: 0.4 },
  { label: '2. threshold 0.25 (bolder)', text: 'threshold', textCut: 0.25 },
  { label: '3. halftone edges (inks only)', text: 'dither' },
  { label: '4. true antialiasing (panel dithers)', text: 'panel' },
];

ensureFonts();
const W = 1440, H = 2560, LABEL = 40;
const geometry = geometryFor({ width: W, height: H, rotation: 0 });
const model = await getModel({});
const crops = [[292, 229], [982, 230], [1466, 141]]; // the first week, the week holding today, the TODAY header and first entry
const quantizer = createQuantizer({ art: 'pattern' });
const label = (text) => {
  const c = createCanvas(W, LABEL), ctx = c.getContext('2d');
  ctx.font = 'bold 24px "DejaVu Sans Bold"'; ctx.fillStyle = '#000'; ctx.fillText(text, 14, 29);
  ctx.fillRect(0, LABEL - 3, W, 3);
  return sharp(quantizer.compose(null, ctx.getImageData(0, 0, W, LABEL).data, W, LABEL), { raw: { width: W, height: LABEL, channels: 3 } }).png().toBuffer();
};

const layers = [];
let y = 0;
for (const v of VARIANTS) {
  const full = await render(model, { geometry, layout: 'paper', text: v.text, ...(v.textCut ? { textCut: v.textCut } : {}) });
  layers.push({ input: await label(v.label), top: y, left: 0 });
  y += LABEL;
  for (const [top, height] of crops) {
    layers.push({ input: await sharp(full).extract({ left: 0, top, width: W, height }).png().toBuffer(), top: y, left: 0 });
    y += height;
  }
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(layers).png().toFile(out);
console.log(`wrote ${out}`);
