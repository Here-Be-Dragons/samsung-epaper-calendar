import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { THEMES, THEME_NAMES, MONTH_THEMES, MOTIF_NAMES, resolveTheme, isThemeSetting, stampsFor, buildThemePlan, easterSunday, nthWeekday, drawMotif } from '../src/themes.mjs';
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

test('theme resolution: a holiday window beats the month, the month design is the default, none turns it off', () => {
  assert.equal(resolveTheme('auto', '2026-04-09').name, 'april', 'plain April is not Easter');
  assert.equal(resolveTheme('auto', '2026-04-05').name, 'easter', 'Easter Sunday');
  assert.equal(resolveTheme('auto', '2026-03-29').name, 'easter', 'a week before');
  assert.equal(resolveTheme('auto', '2026-04-06').name, 'easter', 'the day after');
  assert.equal(resolveTheme('auto', '2026-04-07').name, 'april', 'and then it is April again');
  assert.equal(resolveTheme('auto', '2027-03-28').name, 'easter', 'Easter in March');
  assert.equal(resolveTheme('auto', '2026-10-15').name, 'autumn');
  assert.equal(resolveTheme('auto', '2026-10-27').name, 'halloween');
  assert.equal(resolveTheme('auto', '2026-11-03').name, 'november');
  assert.equal(resolveTheme('auto', '2026-11-24').name, 'autumn', 'Thanksgiving week');
  assert.equal(resolveTheme('auto', '2026-12-03').name, 'december');
  assert.equal(resolveTheme('auto', '2026-12-20').name, 'christmas');
  assert.equal(resolveTheme('auto', '2026-02-10').name, 'valentine');
  assert.equal(resolveTheme('auto', '2026-02-20').name, 'february');
  assert.equal(resolveTheme('none', '2026-04-05'), null);
  assert.equal(resolveTheme('christmas', '2026-06-01').name, 'christmas', 'a name forces the theme all year');
  assert.ok(isThemeSetting('auto') && isThemeSetting('none') && isThemeSetting('easter') && isThemeSetting('april') && !isThemeSetting('nope'));
  assert.equal(MONTH_THEMES.length, 12);
  assert.equal(new Set(MONTH_THEMES).size, 12, 'a different design every month');
  for (const name of MONTH_THEMES) assert.ok(THEMES[name], name);
});

test('your settings: months, windows, built-in windows off, and none for a whole month', () => {
  const plan = buildThemePlan({ months: { apr: 'spring', oct: 'none' }, windows: [{ from: '04-20', to: '04-22', theme: 'christmas' }] });
  assert.equal(resolveTheme('auto', '2026-04-09', plan).name, 'spring', 'April overridden');
  assert.equal(resolveTheme('auto', '2026-04-21', plan).name, 'christmas', 'your window');
  assert.equal(resolveTheme('auto', '2026-04-05', plan).name, 'easter', 'the built-in windows still apply');
  assert.equal(resolveTheme('auto', '2026-10-15', plan), null, 'October switched off');
  assert.equal(resolveTheme('auto', '2026-10-30', plan), null, 'including its Halloween window');
  assert.equal(resolveTheme('auto', '2026-05-10', plan).name, 'spring', 'other months keep their default');
  const bare = buildThemePlan({ builtin_windows: false });
  assert.equal(resolveTheme('auto', '2026-04-05', bare).name, 'april', 'no built-in windows: April all month');
  const overNewYear = buildThemePlan({ windows: [{ from: '12-28', to: '01-03', theme: 'january' }] });
  assert.equal(resolveTheme('auto', '2026-12-30', overNewYear).name, 'january');
  assert.equal(resolveTheme('auto', '2027-01-02', overNewYear).name, 'january');
  assert.equal(resolveTheme('auto', '2027-01-05', overNewYear).name, 'january', 'January is January anyway');
  assert.notEqual(resolveTheme('auto', '2026-12-27', overNewYear).name, 'january');
});

test('custom themes: defined from scratch or extending one, checked, and usable everywhere', () => {
  const plan = buildThemePlan({
    custom: {
      'october-night': { extends: 'halloween', chrome: '#3b2a5a', sky: ['#1b1033', '#4a2d7a'], motifs: ['pumpkin', ['bat', 2]] },
      plain: { chrome: '#224466', sky: ['#ffffff', '#dddddd'], pattern: { kind: 'dots', colors: ['#ffffff'] }, ground: { kind: 'hills', colors: ['#88aa66', '#668844'] }, motifs: ['sun'], holidays: { '10-31': { motif: 'pumpkin', tint: '#ffe0b0' } } },
    },
    months: { oct: 'october-night' }, marks: { '11-05': { motif: 'star', tint: '#eeeeff', deco: ['#ffcc00'] } },
  });
  const night = resolveTheme('auto', '2026-10-10', plan);
  assert.equal(night.name, 'october-night');
  assert.equal(night.chrome, '#3b2a5a');
  assert.deepEqual(night.strip, [['pumpkin', 0], ['bat', 2]]);
  assert.equal(night.pattern.kind, 'stars', 'what it does not set comes from the theme it extends');
  assert.ok(plan.names.includes('plain') && isThemeSetting('plain', plan) && !isThemeSetting('plain'));
  const plain = plan.themes.plain;
  assert.deepEqual([...stampsFor(plain, ['2026-10-31', '2026-11-05'], plan).keys()].sort(), ['2026-10-31', '2026-11-05']);
});

test('custom theme mistakes name the key and the choices', () => {
  const bad = (settings) => { try { buildThemePlan(settings); } catch (e) { return e.message; } return ''; };
  assert.match(bad({ custom: { x: { chrome: '#abcdef', sky: ['#000000', '#111111'], motifs: ['sun'] } } }), /too light/);
  assert.match(bad({ custom: { x: { chrome: 'blue', sky: ['#000000', '#111111'], motifs: ['sun'] } } }), /chrome .* must be a color/);
  assert.match(bad({ custom: { x: { chrome: '#222222', sky: ['#000000'], motifs: ['sun'] } } }), /sky .* 2 colors/);
  assert.match(bad({ custom: { x: { chrome: '#222222', sky: ['#000000', '#111111'], motifs: ['spaceship'] } } }), /motifs\[0\]: "spaceship" is not one of/);
  assert.match(bad({ custom: { x: { chrome: '#222222', sky: ['#000000', '#111111'], motifs: ['sun'], colour: 1 } } }), /unknown key "colour"/);
  assert.match(bad({ custom: { x: { extends: 'nope', chrome: '#222222' } } }), /extends "nope"/);
  assert.match(bad({ custom: { x: { chrome: '#222222', sky: ['#000000', '#111111'], motifs: ['sun'], pattern: { kind: 'plaid', colors: ['#fff000'] } } } }), /pattern.kind must be one of/);
  assert.match(bad({ months: { sept: 'school' } }), /"sept" is not a month/);
  assert.match(bad({ months: { sep: 'nope' } }), /months.sep: "nope" is not a theme/);
  assert.match(bad({ windows: [{ from: '13-40', to: '01-01', theme: 'winter' }] }), /windows\[0\].from/);
  assert.match(bad({ windows: [{ from: '01-01', to: '01-05', theme: 'nope' }] }), /windows\[0\].theme: "nope"/);
  assert.match(bad({ windows: [{ from: 'easter-x', to: '01-05', theme: 'winter' }] }), /not a date/);
  assert.match(bad({ colour: 1 }), /unknown key "colour"/);
});

test('every theme uses only motifs that exist, and a chrome that reads on white', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    assert.match(t.chrome, /^#[0-9A-F]{6}$/i, `${name} chrome`);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(t.chrome.slice(i, i + 2), 16));
    assert.ok(0.299 * r + 0.587 * g + 0.114 * b < 150, `${name} chrome is dark enough for white text`);
    assert.equal(t.bg.length, 2);
    assert.ok(t.strip.length > 0);
    for (const [motif] of t.strip) assert.ok(MOTIF_NAMES.includes(motif), `${name}: ${motif}`);
    for (const m of Object.values(t.marks?.(2026) ?? {})) { assert.ok(MOTIF_NAMES.includes(m.motif), `${name} mark: ${m.motif}`); assert.ok(m.bg && m.deco.length, `${name} mark colors`); }
  }
});

test('marks land on the holiday only when it is on the grid', () => {
  const easter = { ...THEMES.easter };
  const grid = ['2026-04-04', '2026-04-05', '2026-04-06'];
  assert.deepEqual([...stampsFor(easter, grid).keys()], ['2026-04-05']);
  assert.equal(stampsFor(easter, ['2026-04-12']).size, 0);
  assert.equal(stampsFor(null, grid).size, 0);
});

test('a holiday cell is decorated in any design, not just the holiday theme', () => {
  const april = resolveTheme('auto', '2026-04-09');
  assert.equal(april.name, 'april');
  assert.deepEqual([...stampsFor(april, ['2026-04-04', '2026-04-05', '2026-04-06']).keys()], ['2026-04-05'], "Easter Sunday has its bunny in April's design");
  assert.equal(stampsFor(THEMES.autumn, ['2026-10-31']).get('2026-10-31').motif, 'pumpkin');
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
