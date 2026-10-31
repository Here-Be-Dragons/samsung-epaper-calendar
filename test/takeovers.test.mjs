import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildThemePlan, resolveTakeover, BUILTIN_TAKEOVERS } from '../src/themes.mjs';
import { POSTER_SCENES, POSTER_GREETINGS } from '../src/scenes.mjs';
import { render } from '../src/render.mjs';
import { geometryFor } from '../src/geometry.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-'));
process.env.THEMES_DIR = dir; // read again at every render: none of your own art, only what a test puts here

const modelFor = (day, title = 'Lunch') => ({
  now: new Date(`${day}T16:00:00Z`), today: day, from: day, to: day,
  calendars: [{ id: 'a', name: 'Home', color: 'blue', ok: true }], shopping: null,
  events: [{ id: '1', cal: { name: 'Home', color: 'blue' }, title, start: new Date(`${day}T17:00:00Z`), end: new Date(`${day}T18:00:00Z`), allDay: false, startDay: day, endDay: day, multiDay: false, location: '', attendeeNames: [], description: '', status: '' }],
});
const geometry = geometryFor({ width: 480, height: 854, rotation: 0 });
const pixel = async (png, x, y) => { const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true }); const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };

test('every built-in holiday takes over on its day only, including the ones that move and the one that spans new year', () => {
  const scene = (day) => resolveTakeover(day)?.scene ?? null;
  assert.equal(scene('2026-02-14'), 'valentine');
  assert.equal(scene('2026-02-13'), null);
  assert.equal(scene('2026-03-17'), 'shamrock');
  assert.equal(scene('2026-04-05'), 'easter'); assert.equal(scene('2026-04-04'), null); assert.equal(scene('2026-04-06'), null);
  assert.equal(scene('2027-03-28'), 'easter', 'Easter in March');
  assert.equal(scene('2026-07-04'), 'patriotic');
  assert.equal(scene('2026-10-31'), 'halloween'); assert.equal(scene('2026-10-30'), null);
  assert.equal(scene('2026-11-26'), 'thanksgiving'); assert.equal(scene('2026-11-25'), null);
  assert.equal(scene('2026-12-25'), 'christmas');
  assert.equal(scene('2026-12-30'), null);
  assert.equal(scene('2026-12-31'), 'newyear'); assert.equal(scene('2027-01-01'), 'newyear'); assert.equal(scene('2027-01-02'), null);
  assert.ok(BUILTIN_TAKEOVERS.every((t) => POSTER_SCENES[t.scene] && POSTER_GREETINGS[t.scene]), 'every built-in takeover has a scene and a greeting');
});

test('your takeovers come before the built-in ones, and builtin_takeovers: false drops those', () => {
  const plan = buildThemePlan({ takeovers: [{ from: '12-24', to: '12-26', scene: 'christmas' }, { from: '06-14', scene: 'birthday', greeting: ['happy', 'birthday'] }] });
  assert.equal(resolveTakeover('2026-12-24', plan).scene, 'christmas');
  assert.deepEqual(resolveTakeover('2026-06-14', plan), { scene: 'birthday', greeting: ['HAPPY', 'BIRTHDAY'] });
  assert.equal(resolveTakeover('2026-10-31', plan).scene, 'halloween', 'built-in ones remain');
  const only = buildThemePlan({ builtin_takeovers: false, takeovers: [{ from: 'easter-1', to: 'easter+1', scene: 'easter', greeting: false }] });
  assert.equal(resolveTakeover('2026-10-31', only), null);
  assert.deepEqual(resolveTakeover('2026-04-04', only), { scene: 'easter', greeting: [] });
  assert.equal(resolveTakeover('2026-04-07', only), null);
});

test('bad takeovers are refused with a message that names the entry', () => {
  const bad = (t, re) => assert.throws(() => buildThemePlan({ takeovers: t }), re);
  bad('x', /themes\.takeovers must be a list/);
  bad([{ from: '13-40', scene: 'a' }], /takeovers\[0\]\.from/);
  bad([{ from: '10-31', scene: 'Not A Name' }], /takeovers\[0\]\.scene/);
  bad([{ from: '10-31' }], /scene/);
  bad([{ from: '10-31', scene: 'a', wat: 1 }], /unknown key "wat"/);
  bad([{ from: '10-31', scene: 'a', greeting: ['a', 'b', 'c'] }], /one or two lines/);
});

test('on a holiday the poster replaces the calendar, but only for theme auto, and never when switched off', async () => {
  const day = '2026-10-31', model = modelFor(day);
  const poster = await render(model, { geometry, layout: 'paper', theme: 'auto' });
  const calendar = await render(model, { geometry, layout: 'paper', theme: 'auto', takeover: false });
  assert.notDeepEqual(poster, calendar);
  assert.deepEqual(await render(model, { geometry, layout: 'timeline', theme: 'auto' }), poster, 'whatever layout was chosen');
  assert.deepEqual(await render(model, { geometry, layout: 'paper', theme: 'halloween' }), await render(model, { geometry, layout: 'paper', theme: 'halloween', takeover: false }), 'a theme fixed by hand keeps its calendar');
  assert.deepEqual(await render(modelFor('2026-10-30'), { geometry, layout: 'paper', theme: 'auto' }), await render(modelFor('2026-10-30'), { geometry, layout: 'paper', theme: 'auto', takeover: false }), 'the day before is an ordinary day');
});

test('every built-in scene renders, and each looks different', async () => {
  const seen = new Set();
  for (const scene of Object.keys(POSTER_SCENES)) {
    const plan = buildThemePlan({ builtin_takeovers: false, takeovers: [{ from: '04-09', scene }] });
    const img = await render(modelFor('2026-04-09'), { geometry, layout: 'paper', theme: 'auto', plan });
    assert.ok(img.length > 5000, scene);
    seen.add(img.toString('base64'));
  }
  assert.equal(seen.size, Object.keys(POSTER_SCENES).length);
});

test('your own poster.png replaces the scene, is left bare, and a scene with neither picture nor drawing is ignored', async () => {
  const day = '2026-06-14', model = modelFor(day);
  const plan = buildThemePlan({ builtin_takeovers: false, takeovers: [{ from: '06-14', scene: 'birthday' }] });
  const calendar = await render(model, { geometry, layout: 'paper', theme: 'auto', plan, takeover: false });
  assert.deepEqual(await render(model, { geometry, layout: 'paper', theme: 'auto', plan }), calendar, 'no birthday scene and no picture: the calendar');

  fs.mkdirSync(path.join(dir, 'birthday'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'birthday', 'poster.png'), await sharp({ create: { width: 1440, height: 2560, channels: 3, background: '#ff0000' } }).png().toBuffer());
  const bare = await render(model, { geometry, layout: 'paper', theme: 'auto', plan });
  assert.notDeepEqual(bare, calendar);
  assert.deepEqual(await pixel(bare, 240, 60), [255, 0, 0], 'your red fills the top: no lettering over it');
  assert.deepEqual(await pixel(bare, 5, 5), [255, 0, 0]);

  const withGreeting = buildThemePlan({ builtin_takeovers: false, takeovers: [{ from: '06-14', scene: 'birthday', greeting: ['HAPPY', 'BIRTHDAY'] }] });
  const lettered = await render(model, { geometry, layout: 'paper', theme: 'auto', plan: withGreeting });
  assert.notDeepEqual(lettered, bare, 'a greeting is printed over it');
});

test('a poster.png for a built-in scene replaces the generated one', async () => {
  const model = modelFor('2026-10-31');
  const generated = await render(model, { geometry, layout: 'paper', theme: 'auto' });
  fs.mkdirSync(path.join(dir, 'halloween'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'halloween', 'poster.png'), await sharp({ create: { width: 1440, height: 2560, channels: 3, background: '#0000ff' } }).png().toBuffer());
  const mine = await render(model, { geometry, layout: 'paper', theme: 'auto' });
  assert.deepEqual(await pixel(mine, 5, 5), [0, 0, 255]);
  assert.notDeepEqual(mine, generated);
});
