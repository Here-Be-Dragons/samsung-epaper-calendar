import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { THEMES, THEME_NAMES, MONTH_THEMES, MOTIF_NAMES, resolveTheme, isThemeSetting, stampsFor, easterSunday, nthWeekday, drawMotif } from '../src/themes.mjs';
import { render } from '../src/render.mjs';
import { geometryFor } from '../src/geometry.mjs';
import { LAYOUT_NAMES } from '../src/layouts.mjs';

test('Easter Sunday and Thanksgiving fall on the right dates', () => {
  assert.equal(easterSunday(2025), '2025-04-20');
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28'); // Easter can land in March
  assert.equal(easterSunday(2038), '2038-04-25'); // the latest Easter
  assert.equal(nthWeekday(2026, 11, 4, 4), '2026-11-26'); // fourth Thursday of November
  assert.equal(nthWeekday(2025, 5, 0, 2), '2025-05-11'); // Mother's Day
});

test('theme resolution: auto follows the month, overrides win, none turns it off', () => {
  assert.equal(resolveTheme('auto', 4).name, 'easter');
  assert.equal(resolveTheme('auto', 10).name, 'halloween');
  assert.equal(resolveTheme('auto', 12).name, 'christmas');
  const overrides = Array(12).fill(''); overrides[3] = 'spring'; overrides[9] = 'none';
  assert.equal(resolveTheme('auto', 4, overrides).name, 'spring', 'April overridden');
  assert.equal(resolveTheme('auto', 10, overrides), null, 'October switched off');
  assert.equal(resolveTheme('auto', 5, overrides).name, MONTH_THEMES[4], 'other months keep their default');
  assert.equal(resolveTheme('none', 4), null);
  assert.equal(resolveTheme('christmas', 6).name, 'christmas', 'a name forces the theme all year');
  assert.ok(isThemeSetting('auto') && isThemeSetting('none') && isThemeSetting('easter') && !isThemeSetting('nope'));
  assert.equal(MONTH_THEMES.length, 12);
  for (const name of MONTH_THEMES) assert.ok(THEMES[name], name);
});

test('every theme uses only motifs that exist, and a chrome that reads on white', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    assert.match(t.chrome, /^#[0-9A-F]{6}$/i, `${name} chrome`);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(t.chrome.slice(i, i + 2), 16));
    assert.ok(0.299 * r + 0.587 * g + 0.114 * b < 150, `${name} chrome is dark enough for white text`);
    assert.equal(t.bg.length, 2);
    assert.ok(t.strip.length > 0);
    for (const [motif] of t.strip) assert.ok(MOTIF_NAMES.includes(motif), `${name}: ${motif}`);
    for (const m of Object.values(t.marks(2026))) { assert.ok(MOTIF_NAMES.includes(m.motif), `${name} mark: ${m.motif}`); assert.ok(m.bg && m.deco.length, `${name} mark colors`); }
  }
});

test('marks land on the holiday only when it is on the grid', () => {
  const easter = { ...THEMES.easter };
  const grid = ['2026-04-04', '2026-04-05', '2026-04-06'];
  assert.deepEqual([...stampsFor(easter, grid).keys()], ['2026-04-05']);
  assert.equal(stampsFor(easter, ['2026-04-12']).size, 0);
  assert.equal(stampsFor(null, grid).size, 0);
});

test('every motif draws without throwing, in every variant', () => {
  const ctx = createCanvas(80, 80).getContext('2d');
  for (const name of MOTIF_NAMES) for (let v = 0; v < 4; v++) drawMotif(ctx, name, 40, 40, 40, v);
});

test('every theme renders in every layout', async () => {
  const day = '2026-04-05';
  const model = {
    now: new Date('2026-04-05T16:00:00Z'), today: day, from: '2026-03-29', to: '2026-05-02',
    calendars: [{ id: 'a', name: 'Home', color: 'blue', ok: true }, { id: 'h', name: 'Holidays', color: 'black', ok: true, markDays: true }],
    shopping: { items: [{ text: 'Milk', done: false }] },
    events: [
      { id: '1', cal: { name: 'Home', color: 'blue' }, title: 'Brunch', start: new Date('2026-04-05T15:00:00Z'), end: new Date('2026-04-05T17:00:00Z'), allDay: false, startDay: day, endDay: day, multiDay: false, location: 'Park', attendeeNames: [], description: '', status: '' },
      { id: '2', cal: { name: 'Holidays', color: 'black', markDays: true }, title: 'Easter', start: new Date('2026-04-05T04:00:00Z'), end: new Date('2026-04-06T04:00:00Z'), allDay: true, startDay: day, endDay: day, multiDay: false, location: '', attendeeNames: [], description: '', status: '' },
    ],
  };
  const geometry = geometryFor({ width: 480, height: 854, rotation: 0 });
  const seen = new Set();
  for (const layout of LAYOUT_NAMES) for (const theme of ['none', 'auto', ...THEME_NAMES]) {
    const img = await render(model, { geometry, layout, theme });
    assert.ok(img.length > 1000, `${layout}/${theme}`);
    seen.add(img.length);
  }
  assert.ok(seen.size > 6, 'themes change the picture');
});

test('the same inputs always give the same picture (nothing depends on the clock)', async () => {
  const model = { now: new Date('2026-10-20T14:00:00Z'), today: '2026-10-20', from: '2026-09-27', to: '2026-11-07', calendars: [{ id: 'a', name: 'Home', color: 'blue', ok: true }], shopping: null, events: [] };
  const geometry = geometryFor({ width: 480, height: 854, rotation: 0 });
  const a = await render(model, { geometry, layout: 'timeline', theme: 'auto' });
  const b = await render({ ...model, now: new Date('2026-10-20T23:30:00Z') }, { geometry, layout: 'timeline', theme: 'auto' });
  assert.ok(a.equals(b));
});
