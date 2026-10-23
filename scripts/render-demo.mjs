#!/usr/bin/env node
/**
 * Renders the documentation images from the synthetic calendars in examples/. It never reads .env or any real
 * calendar, so the output is safe to publish:
 *
 *   node scripts/render-demo.mjs [--out docs/images]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(root, 'docs/images'));
const example = (name) => path.join(root, 'examples', name);

// Everything the renderer reads comes from here, whatever the shell has exported.
for (const key of Object.keys(process.env)) if (/^(CALENDAR|DISPLAY|THEME|LAYOUT|SHOPPING|GOOGLE|MQTT)/.test(key)) delete process.env[key];
Object.assign(process.env, {
  TIMEZONE: 'America/New_York', CALENDARS: 'personal,family,holidays',
  CALENDAR_PERSONAL_URL: example('personal.ics'), CALENDAR_PERSONAL_NAME: 'Alex', CALENDAR_PERSONAL_COLOR: 'blue',
  CALENDAR_FAMILY_URL: example('family.ics'), CALENDAR_FAMILY_NAME: 'Family', CALENDAR_FAMILY_COLOR: 'red',
  CALENDAR_HOLIDAYS_URL: example('holidays.ics'), CALENDAR_HOLIDAYS_NAME: 'Holidays', CALENDAR_HOLIDAYS_COLOR: 'black', CALENDAR_HOLIDAYS_MARK_DAYS: 'true',
  SHOPPING_SOURCE: 'file', SHOPPING_FILE: example('shopping.json'),
});

const { getModel } = await import('../src/calendar.mjs');
const { render } = await import('../src/render.mjs');
const { geometryFor } = await import('../src/geometry.mjs');
const sharp = createRequire(import.meta.url)('sharp');

fs.mkdirSync(out, { recursive: true });
const geometry = geometryFor({ width: 1440, height: 2560, rotation: 0 });
const at = (iso) => getModel({ now: new Date(iso) });
const save = async (name, buffer) => { fs.writeFileSync(path.join(out, name), buffer); console.log(`wrote ${path.relative(root, path.join(out, name))} (${(buffer.length / 1024).toFixed(0)} KB)`); };

// Easter Sunday, the paper layout: the theme marks the holiday cell.
await save('paper-easter.png', await render(await at('2026-04-05T16:00:00Z'), { geometry, layout: 'paper', theme: 'auto' }));
// A busy Thursday, the timeline layout (overlapping meetings share the width).
await save('timeline.png', await render(await at('2026-04-09T16:00:00Z'), { geometry, layout: 'timeline', theme: 'auto' }));
// The same day with theming off.
await save('paper-plain.png', await render(await at('2026-04-09T16:00:00Z'), { geometry, layout: 'paper', theme: 'none' }));

// The top of the paper layout in each month's default theme.
const days = [15, 14, 17, 5, 15, 15, 4, 15, 15, 31, 26, 25];
const tiles = [];
for (let m = 1; m <= 12; m++) {
  const png = await render(await at(new Date(Date.UTC(2026, m - 1, days[m - 1], 16)).toISOString()), { geometry, layout: 'paper', theme: 'auto' });
  tiles.push(await sharp(png).extract({ left: 0, top: 0, width: 1440, height: 640 }).resize(700).png().toBuffer());
}
const th = (await sharp(tiles[0]).metadata()).height;
await save('themes.png', await sharp({ create: { width: 1410, height: 6 * (th + 10), channels: 3, background: '#ffffff' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % 2) * 710, top: Math.floor(i / 2) * (th + 10) }))).png({ palette: false, compressionLevel: 9 }).toBuffer());
