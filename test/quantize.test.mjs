import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createQuantizer, INK_HEX } from '../src/quantize.mjs';
import { rgb } from '../src/inks.mjs';
import { render } from '../src/render.mjs';
import { geometryFor } from '../src/geometry.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const INKS = new Set(INK_HEX.map((h) => rgb(h).join(',')));

const model = {
  now: new Date('2026-04-05T16:00:00Z'), today: '2026-04-05', from: '2026-03-29', to: '2026-05-02',
  calendars: [{ id: 'a', name: 'Home', color: 'blue', ok: true }],
  shopping: { items: [{ text: 'Milk', done: false }] },
  events: [
    { id: '1', cal: { name: 'Home', color: 'blue' }, title: 'Brunch with the whole family', start: new Date('2026-04-05T15:00:00Z'), end: new Date('2026-04-05T17:00:00Z'), allDay: false, startDay: '2026-04-05', endDay: '2026-04-05', multiDay: false, location: 'Park', attendeeNames: [], description: '', status: '' },
    { id: '2', cal: { name: 'Home', color: 'red' }, title: 'Easter Sunday', start: new Date('2026-04-05T04:00:00Z'), end: new Date('2026-04-06T04:00:00Z'), allDay: true, startDay: '2026-04-05', endDay: '2026-04-05', multiDay: false, location: '', attendeeNames: [], description: '', status: '' },
  ],
};

async function pixels(png) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = new Map();
  for (let i = 0; i < data.length; i += 3) { const k = `${data[i]},${data[i + 1]},${data[i + 2]}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
  return { counts, info };
}

test('the quantizer writes only the six inks, snaps content and dithers art', () => {
  const q = createQuantizer();
  const w = 64, h = 8;
  const art = new Uint8Array(w * h * 4), content = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) { // art: a pastel pink everywhere
    art.set([255, 190, 215, 255], p * 4);
  }
  content.set([0, 0, 0, 255], 5 * 4); // one black content pixel
  content.set([10, 10, 10, 90], 6 * 4); // faint edge: below the cut, ignored
  content.set([255, 255, 255, 255], 7 * 4); // white content
  const out = q.compose(art, content, w, h);
  const seen = new Set();
  for (let i = 0; i < out.length; i += 3) seen.add(`${out[i]},${out[i + 1]},${out[i + 2]}`);
  for (const c of seen) assert.ok(INKS.has(c), `${c} is an ink`);
  assert.ok(seen.size >= 2, 'the pink is mixed from several inks');
  assert.deepEqual([...out.subarray(15, 18)], [0, 0, 0], 'content pixel snapped to black');
  assert.deepEqual([...out.subarray(21, 24)], [255, 255, 255], 'white content covers the art');
  assert.notDeepEqual([...out.subarray(18, 21)], [0, 0, 0], 'a faint content pixel is not drawn');
});

test('a pastel mixes light inks and is not just white', () => {
  const q = createQuantizer();
  const art = new Uint8Array(32 * 32 * 4); for (let p = 0; p < 32 * 32; p++) art.set([255, 190, 215, 255], p * 4);
  const out = q.compose(art, null, 32, 32);
  let whites = 0, others = 0;
  for (let i = 0; i < out.length; i += 3) (out[i] === 255 && out[i + 1] === 255 && out[i + 2] === 255 ? whites++ : others++);
  assert.ok(whites > others, 'mostly white');
  assert.ok(others > 0, 'with some ink in it');
});

test('art is full color: purple, brown and teal mix the right inks and never clash', () => {
  const NAME = { '0,0,0': 'black', '255,255,255': 'white', '255,0,0': 'red', '255,255,0': 'yellow', '0,255,0': 'green', '0,0,255': 'blue' };
  const mixOf = ([r, g, b]) => {
    const art = new Uint8Array(32 * 32 * 4); for (let p = 0; p < 32 * 32; p++) art.set([r, g, b, 255], p * 4);
    const out = createQuantizer().compose(art, null, 32, 32), used = new Set();
    for (let i = 0; i < out.length; i += 3) used.add(NAME[`${out[i]},${out[i + 1]},${out[i + 2]}`]);
    return used;
  };
  const purple = mixOf([126, 87, 194]), brown = mixOf([122, 75, 36]), teal = mixOf([42, 169, 232]);
  assert.ok(purple.has('blue') && purple.has('red'), 'purple is blue with red');
  assert.ok(brown.has('red') && brown.has('black'), 'brown is red with black');
  assert.ok(teal.has('blue') && !teal.has('red'), 'teal is blue (and green, white), not red');
  for (const mix of [purple, brown, teal, mixOf([93, 184, 74]), mixOf([255, 140, 31])]) {
    assert.ok(!(mix.has('red') && mix.has('green')) && !(mix.has('yellow') && mix.has('blue')), 'no complementary inks mixed');
  }
});

test('error diffusion also writes only inks and keeps content crisp', () => {
  const q = createQuantizer({ art: 'diffusion' });
  const w = 32, h = 8, art = new Uint8Array(w * h * 4), content = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) art.set([126, 87, 194, 255], p * 4);
  content.set([0, 0, 0, 255], 5 * 4);
  const out = q.compose(art, content, w, h);
  for (let i = 0; i < out.length; i += 3) assert.ok(INKS.has(`${out[i]},${out[i + 1]},${out[i + 2]}`));
  assert.deepEqual([...out.subarray(15, 18)], [0, 0, 0]);
});

test('a frame is a PNG of exactly the six inks, in every layout, themed or not', async () => {
  const geometry = geometryFor({ width: 480, height: 854, rotation: 0 });
  for (const [layout, theme] of [['paper', 'none'], ['paper', 'easter'], ['timeline', 'halloween'], ['paper', 'christmas']]) {
    const png = await render(model, { geometry, layout, theme });
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    const { counts, info } = await pixels(png);
    assert.equal(info.width, 480); assert.equal(info.height, 854);
    for (const c of counts.keys()) assert.ok(INKS.has(c), `${layout}/${theme}: ${c} is not an ink`);
  }
});

test('an unthemed frame uses no dithering at all: text and lines are flat inks', async () => {
  const geometry = geometryFor({ width: 480, height: 854, rotation: 0 });
  const { counts } = await pixels(await render(model, { geometry, layout: 'paper', theme: 'none' }));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  assert.ok((counts.get('255,255,255') ?? 0) / total > 0.5, 'mostly white paper');
  assert.ok((counts.get('0,0,0') ?? 0) > 0 && (counts.get('0,0,255') ?? 0) > 0);
});

test('a frame drawn for a rotated panel is rotated into the panel image and still only the six inks', async () => {
  const geometry = geometryFor({ width: 480, height: 854, rotation: 90 });
  const { counts, info } = await pixels(await render(model, { geometry, layout: 'paper', theme: 'easter' }));
  // The canvas is 854x480; the image sent to the panel is turned 90 degrees to 480x854.
  assert.equal(info.width, 480); assert.equal(info.height, 854);
  for (const c of counts.keys()) assert.ok(INKS.has(c), c);
});
