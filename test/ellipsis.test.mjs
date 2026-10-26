import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { ensureFonts, fit, drawText, wrap, F } from '../src/draw.mjs';
import { assignLanes } from '../src/layouts.mjs';
import { useGeometry, geometryFor } from '../src/geometry.mjs';

ensureFonts();
useGeometry(geometryFor({ width: 1440, height: 2560, rotation: 0 }));
const LONG = 'Elias conference with the whole school about the autumn fair';

function inkColumns(text, x, maxW, font = F.regular(14)) {
  const c = createCanvas(700, 60), ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 700, 60); ctx.fillStyle = '#000'; ctx.font = font;
  drawText(ctx, fit(ctx, text, font, maxW), x, 40);
  const { data } = ctx.getImageData(0, 0, 700, 60);
  const cols = new Set();
  for (let y = 0; y < 60; y++) for (let px = 0; px < 700; px++) if (data[(y * 700 + px) * 4] < 128) cols.add(px);
  return { cols, shown: fit(ctx, text, font, maxW) };
}

test('a cut text ends in one "…" character, drawn as a compact set of dots inside the width', () => {
  const { cols, shown } = inkColumns(LONG, 10, 300);
  assert.ok(shown.endsWith('…') && !shown.includes('...'), shown);
  assert.ok(Math.max(...cols) <= 10 + 300, 'nothing past the width');
  assert.ok(Math.max(...cols) > 10 + 300 - 14, 'the dots sit at the end of the space');
});

test('the compact ellipsis leaves room for more letters than the font\'s own "…"', () => {
  const c = createCanvas(10, 10), ctx = c.getContext('2d'), font = F.regular(14);
  const compact = fit(ctx, LONG, font, 300).length - 1;
  ctx.font = font;
  let t = LONG; while (t.length > 1 && ctx.measureText(`${t}…`).width > 300) t = t.slice(0, -1);
  assert.ok(compact >= t.length + 1, `${compact} letters vs ${t.length} with the font's ellipsis`);
});

test('text that fits is unchanged, and wrap keeps the same ellipsis on its last line', () => {
  const c = createCanvas(10, 10), ctx = c.getContext('2d');
  assert.equal(fit(ctx, 'Church', F.regular(14), 400), 'Church');
  const lines = wrap(ctx, LONG, F.bold(19), 300, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'));
});

test('the timeline puts events that overlap on the page side by side, even if their times only touch', () => {
  // Niran 3:00-3:15, Ava 3:15-4:15, Meeting 3:30-4:15. A block is never drawn shorter than ~24 minutes here, so Niran's block
  // reaches into Ava's.
  const span = [{ s: 900, e: 915, n: 'niran' }, { s: 915, e: 975, n: 'ava' }, { s: 930, e: 975, n: 'meeting' }];
  const byName = (laid) => Object.fromEntries(laid.map((t) => [t.n, [t.lane, t.lanes]]));
  assert.deepEqual(byName(assignLanes(span, 0)), { niran: [0, 1], ava: [0, 2], meeting: [1, 2] }, 'by true times Niran stands alone');
  assert.deepEqual(byName(assignLanes(span, 24)), { niran: [0, 2], ava: [1, 2], meeting: [0, 2] }, 'by drawn extent they share the width, Meeting under Niran');
});
