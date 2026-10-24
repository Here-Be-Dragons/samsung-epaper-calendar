#!/usr/bin/env node
/**
 * Builds a test sheet for choosing a typeface: the same excerpts of your real calendar (the first week of the month
 * grid, today's week, the start of the TODAY agenda) drawn in each font, stacked on one panel-sized picture, so you can
 * push it to the panel and judge the letters where they will be read. Text is drawn exactly as in a real frame
 * (no antialiasing, exact inks).
 *
 *   node --env-file=.env scripts/font-test.mjs --fonts DIR [--out font-test.png] [--demo]
 *
 * DIR holds font files named <Name>-Regular.ttf, each optionally with a <Name>-Bold.ttf (the bundled DejaVu Sans is always
 * the first block). A pixel font is described in DIR/pixel.json as { "<name>": { "em": 27, "cap": 15 } }: the size in px at
 * which one font pixel is one screen pixel, and the capital height in font pixels (see addFontSet in src/draw.mjs).
 * `--only a,b,c` picks fonts by (lowercase) name. `--demo` uses the synthetic calendars in examples/ instead of your own.
 * The crop positions assume the 1440x2560 portrait paper layout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const fontsDir = arg('--fonts');
const out = path.resolve(arg('--out') ?? 'font-test.png');
if (!fontsDir) { console.error('usage: node --env-file=.env scripts/font-test.mjs --fonts DIR [--out file.png] [--demo]'); process.exit(2); }

if (process.argv.includes('--demo')) {
  for (const key of Object.keys(process.env)) if (/^(CALENDAR|CONFIG|SHOPPING)/.test(key)) delete process.env[key];
  Object.assign(process.env, { CONFIG_FILE: path.join(root, 'examples', 'config.yaml'), SHOPPING_SOURCE: 'file', SHOPPING_FILE: path.join(root, 'examples', 'shopping.json') });
}

const { getModel } = await import('../src/calendar.mjs');
const { render, ensureFonts, addFontSet, fontSetNames } = await import('../src/render.mjs');
const { geometryFor } = await import('../src/geometry.mjs');
const { createQuantizer } = await import('../src/quantize.mjs');

ensureFonts();
const files = fs.readdirSync(fontsDir);
const pixel = files.includes('pixel.json') ? JSON.parse(fs.readFileSync(path.join(fontsDir, 'pixel.json'), 'utf8')) : {};
const only = arg('--only')?.split(',').map((s) => s.trim().toLowerCase());
for (const regular of files.filter((f) => /-Regular\.ttf$/i.test(f)).sort()) {
  const name = regular.replace(/-Regular\.ttf$/i, '').toLowerCase(), bold = regular.replace(/-Regular\.ttf$/i, '-Bold.ttf');
  if (only && !only.includes(name)) continue;
  addFontSet(name, path.join(fontsDir, regular), files.includes(bold) ? path.join(fontsDir, bold) : null, { pixel: pixel[name] ?? null });
}
const names = fontSetNames();
if (names.length < 2) { console.error(`no <Name>-Regular.ttf / <Name>-Bold.ttf pairs found in ${fontsDir}`); process.exit(2); }

const W = 1440, H = 2560, LABEL = 40;
const geometry = geometryFor({ width: W, height: H, rotation: 0 });
const model = await getModel({});
// Excerpts of the paper layout at 1440x2560, as [top, height]: the first week of the grid, the week holding today, and the
// TODAY header with its first entry.
const crops = [[292, 229], [982, 230], [1466, 141]];
const blockH = LABEL + crops.reduce((n, [, h]) => n + h, 0);
const blocks = Math.min(names.length, Math.floor(H / blockH));
if (blocks < names.length) console.warn(`only the first ${blocks} of ${names.length} fonts fit on one sheet`);

const quantizer = createQuantizer({ art: 'pattern' });
const label = (text) => { // a label strip in exact inks, drawn like any other text
  const c = createCanvas(W, LABEL), ctx = c.getContext('2d');
  ctx.font = 'bold 24px "DejaVu Sans Bold"'; ctx.fillStyle = '#000'; ctx.fillText(text, 14, 29);
  ctx.fillRect(0, LABEL - 3, W, 3);
  return sharp(quantizer.compose(null, ctx.getImageData(0, 0, W, LABEL).data, W, LABEL), { raw: { width: W, height: LABEL, channels: 3 } }).png().toBuffer();
};

const layers = [];
let y = 0;
for (const [i, name] of names.slice(0, blocks).entries()) {
  const full = await render(model, { geometry, layout: 'paper', font: name });
  layers.push({ input: await label(`${i + 1}. ${name}${name === 'dejavu' ? ' (current)' : ''}`), top: y, left: 0 });
  y += LABEL;
  for (const [top, height] of crops) {
    layers.push({ input: await sharp(full).extract({ left: 0, top, width: W, height }).png().toBuffer(), top: y, left: 0 });
    y += height;
  }
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(layers).png().toFile(out);
console.log(`wrote ${out} (${blocks} fonts: ${names.slice(0, blocks).join(', ')})`);
