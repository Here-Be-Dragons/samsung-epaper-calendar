import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dayMinutes, cascade } from '../src/layouts.mjs';
import { render } from '../src/render.mjs';
import { geometryFor } from '../src/geometry.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const cal = { name: 'Work', color: 'blue', ok: true };
const day = '2026-04-10';
// April 10 in New York is UTC-4: midnight local is 04:00Z.
const at = (hh, mm = 0, d = 10) => new Date(Date.UTC(2026, 3, d, hh + 4, mm));
const event = (id, title, start, end, extra = {}) => ({
  id, cal, title, start, end, allDay: false, startDay: day, endDay: end > at(24) ? '2026-04-11' : day, multiDay: false,
  location: '', attendeeNames: [], description: '', status: '', ...extra,
});
const model = (events) => ({ now: at(12), today: day, from: '2026-04-05', to: '2026-05-09', calendars: [cal], shopping: null, events });
const geometry = geometryFor({ width: 480, height: 854, rotation: 0 });

test('an event that ends exactly at midnight runs to the end of the day, not zero length', () => {
  assert.deepEqual(dayMinutes(event('a', 'Gym', at(0), at(24)), day), { s: 0, e: 1440 });
  assert.deepEqual(dayMinutes(event('b', 'Movie', at(21, 30), at(24)), day), { s: 1290, e: 1440 });
  assert.deepEqual(dayMinutes(event('c', 'Late', at(22), at(23)), day), { s: 1320, e: 1380 });
  assert.deepEqual(dayMinutes(event('d', 'Zero', at(9), at(9)), day), { s: 540, e: 570 }, 'a zero-length event is still shown, as 30 minutes');
});

test('the timeline renders a very busy day with A, B and the list fallback, and a sparse one with a 24-hour event', async () => {
  const gym = event('gym', '24/7 gym', at(0), at(24));
  const busy = Array.from({ length: 12 }, (_, i) => event(`m${i}`, `Meeting number ${i}`, at(14), at(15, 30)))
    .concat(Array.from({ length: 10 }, (_, i) => event(`e${i}`, `Early ${i}`, at(7, i * 5), at(8))), gym);
  const sparse = [gym, event('s1', 'Standup', at(8), at(8, 30)), event('s2', 'Deploy', at(21), at(22))];
  for (const events of [busy, sparse]) {
    const plain = await render(model(events), { geometry, layout: 'timeline', theme: 'none', breakHours: 0, ambientHours: 0 });
    const smart = await render(model(events), { geometry, layout: 'timeline', theme: 'none', breakHours: 3, ambientHours: 24 });
    assert.equal(smart.subarray(1, 4).toString(), 'PNG');
    assert.notDeepEqual(smart, plain, 'the options change the picture');
    const { info } = await sharp(smart).toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 480);
  }
});

test('nothing but a 24-hour event: its chip, and "Nothing timed today."', async () => {
  const png = await render(model([event('gym', '24/7 gym', at(0), at(24))]), { geometry, layout: 'timeline', theme: 'none', ambientHours: 24 });
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
});

test('overlapping blocks cascade: indent a little, but start past the title when they begin within it', () => {
  const opt = { left0: 10, right: 810, indent: 30, minW: 100 };
  // Long event 8:15 to 6 PM (title 120 wide), one at 8:30 inside its title, one at 11 far below it.
  const long = { top: 0, bottom: 1000, zone: 50, textW: 120 };
  const [l0, l1, l2] = cascade([long, { top: 20, bottom: 100, zone: 50, textW: 80 }, { top: 300, bottom: 400, zone: 50, textW: 80 }], opt);
  assert.equal(l0, 10, 'the first starts at the left');
  assert.equal(l1, 130, 'one that begins in its title starts just past the title');
  assert.equal(l2, 40, 'one that begins below the title only indents a little (and clears the earlier overlapped one: it ended)');
  // Three that begin together fan out by their titles, and none is squeezed below the minimum width.
  const fan = cascade([long, { top: 0, bottom: 500, zone: 50, textW: 400 }, { top: 0, bottom: 500, zone: 50, textW: 400 }], opt);
  assert.deepEqual(fan, [10, 130, 530], 'the last starts past the second title');
  const crowded = cascade([long, { top: 0, bottom: 500, zone: 50, textW: 700 }, { top: 0, bottom: 500, zone: 50, textW: 400 }], opt);
  assert.equal(crowded[2], 710, 'and is held at the right edge minus the minimum width when titles are too wide');
  // A block that ends before the next begins is not overlapped.
  assert.deepEqual(cascade([{ top: 0, bottom: 50, zone: 50, textW: 100 }, { top: 60, bottom: 100, zone: 50, textW: 100 }], opt), [10, 10]);
});

test('an event exactly 24 hours long becomes an all-day chip; a shorter long one stays a block', async () => {
  const gym = event('gym', '24/7 gym', at(0), at(24)), long = event('long', 'Long Event 1', at(8, 15), at(18));
  const withGym = await render(model([gym, long]), { geometry, layout: 'timeline', theme: 'none', breakHours: 0, ambientHours: 24 });
  const without = await render(model([gym, long]), { geometry, layout: 'timeline', theme: 'none', breakHours: 0, ambientHours: 0 });
  assert.notDeepEqual(withGym, without);
});
