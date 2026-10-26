#!/usr/bin/env node
/**
 * Writes guide pictures to draw your theme art over: the exact size of header.png and footer.png at your panel size, with the
 * parts the date and the legend will cover marked. Open them in any image editor, draw on a new layer above, and save the
 * result (without the guide layer) as themes/<theme>/header.png and footer.png (see themes/README.md).
 *
 *   node scripts/art-template.mjs [--out themes/guides] [--width 1440] [--height 2560]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { geometryFor, useGeometry } from '../src/geometry.mjs';
import { px } from '../src/scale.mjs';
import { headerH, footerH, WIDE_OUTLINE, styleFor } from '../src/draw.mjs';

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const out = path.resolve(arg('--out', 'themes/guides'));
const geometry = geometryFor({ width: Number(arg('--width', 1440)), height: Number(arg('--height', 2560)), rotation: 0 });
useGeometry(geometry);
const S = styleFor({}); // a themed frame: the sizes below are the themed ones
const W = geometry.width, HEADER = Math.round(px(headerH(S))), FOOTER = Math.round(px(footerH(S)));

function guide(width, height, zones, title) {
  const c = createCanvas(width, height), ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#d0d0d0'; ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 100) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, height); ctx.stroke(); }
  for (let y = 0; y <= height; y += 100) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(width, y + 0.5); ctx.stroke(); }
  for (const [x, y, w, h, label] of zones) {
    ctx.fillStyle = 'rgba(230, 40, 120, 0.22)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgb(230, 40, 120)'; ctx.lineWidth = 2; ctx.setLineDash([10, 6]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    ctx.fillStyle = 'rgb(160, 20, 80)'; ctx.font = '16px sans-serif'; ctx.fillText(label, x + 8, y + 22);
  }
  ctx.fillStyle = '#333'; ctx.font = '16px sans-serif'; ctx.fillText(`${title}: ${width} x ${height} px (grid every 100 px)`, 8, height - 8);
  return c.toBuffer('image/png');
}

// Where text will sit: the date, centered with a white outline (as wide as the longest date, about 76% of the width) and,
// along the bottom edge, a thin band the theme's colored line covers.
const dateW = Math.round(W - 2 * px(16) - px(34) - px(130) + px(WIDE_OUTLINE)), dateH = Math.round(px(60));
const header = guide(W, HEADER, [
  [Math.round((W - dateW) / 2), Math.round((HEADER - px(4) - dateH) / 2), dateW, dateH, 'the date: centered, black with a white outline (its width follows the date, up to about this)'],
  [0, HEADER - Math.round(px(4)), W, Math.round(px(4)), 'theme line'],
], 'header.png');
const legendW = Math.round(W * 0.72 + px(30));
const footer = guide(W, FOOTER, [
  [Math.round((W - legendW) / 2), Math.round(px(10)), legendW, Math.round(px(30)), 'legend plate (centered; its width follows the calendar names, up to about this)'],
  [0, 0, W, Math.round(px(4)), 'theme line'],
], 'footer.png');

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'header-guide.png'), header);
fs.writeFileSync(path.join(out, 'footer-guide.png'), footer);
console.log(`wrote ${path.join(out, 'header-guide.png')} (${W} x ${HEADER}) and ${path.join(out, 'footer-guide.png')} (${W} x ${FOOTER})`);
