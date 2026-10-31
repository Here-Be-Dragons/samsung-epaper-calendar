#!/usr/bin/env node
/**
 * Renders the documentation images from the synthetic calendars in examples/. It never reads .env or any real
 * calendar, so the output is safe to publish:
 *
 *   node scripts/render-demo.mjs [--out docs/images] [--art panel|pattern|diffusion]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(root, 'docs/images'));
const art = process.argv.includes('--art') ? process.argv[process.argv.indexOf('--art') + 1] : undefined; // default: ART_DITHER's default
const example = (name) => path.join(root, 'examples', name);

// Everything the renderer reads comes from here, whatever the shell has exported (or config/ holds).
for (const key of Object.keys(process.env)) if (/^(ART|CALENDAR|CONFIG|DISPLAY|THEME|LAYOUT|SHOPPING|GOOGLE|MQTT)/.test(key)) delete process.env[key];
Object.assign(process.env, {
  TIMEZONE: 'America/New_York', CONFIG_FILE: example('config.yaml'), THEMES_DIR: 'none', // none: never your own theme art
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
await save('paper-easter.png', await render(await at('2026-04-05T16:00:00Z'), { geometry, layout: 'paper', theme: 'auto', art, takeover: false }));
// A busy Thursday, the timeline layout (overlapping meetings share the width).
await save('timeline.png', await render(await at('2026-04-09T16:00:00Z'), { geometry, layout: 'timeline', theme: 'auto', art }));
// The same day with theming off.
await save('paper-plain.png', await render(await at('2026-04-09T16:00:00Z'), { geometry, layout: 'paper', theme: 'none', art }));

// The top of the paper layout, as tiles of 2 columns: the twelve month designs (a day in each month outside any holiday window),
// then the holiday windows.
async function tileSheet(name, dates) {
  const tiles = [];
  for (const date of dates) {
    const png = await render(await at(`${date}T16:00:00Z`), { geometry, layout: 'paper', theme: 'auto', art, takeover: false }); // the calendar on the holiday, not its poster
    tiles.push(await sharp(png).extract({ left: 0, top: 0, width: 1440, height: 640 }).resize(700).png().toBuffer());
  }
  const th = (await sharp(tiles[0]).metadata()).height, rows = Math.ceil(tiles.length / 2);
  await save(name, await sharp({ create: { width: 1410, height: rows * (th + 10), channels: 3, background: '#ffffff' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 2) * 710, top: Math.floor(i / 2) * (th + 10) }))).png({ palette: false, compressionLevel: 9 }).toBuffer());
}
await tileSheet('themes.png', ['2026-01-15', '2026-02-20', '2026-03-03', '2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15', '2026-11-03', '2026-12-03']);
await tileSheet('holidays.png', ['2026-02-14', '2026-03-17', '2026-04-05', '2026-07-04', '2026-10-31', '2026-11-26', '2026-12-25', '2026-12-31']);

// The eight holiday posters, one contact sheet: on the day itself the poster replaces the calendar.
{
  const days = ['2026-02-14', '2026-03-17', '2026-04-05', '2026-07-04', '2026-10-31', '2026-11-26', '2026-12-25', '2026-12-31'];
  const tiles = [];
  for (const date of days) tiles.push(await sharp(await render(await at(`${date}T16:00:00Z`), { geometry, layout: 'paper', theme: 'auto', art })).resize(340).png().toBuffer());
  const th = (await sharp(tiles[0]).metadata()).height;
  await save('posters.png', await sharp({ create: { width: 4 * 350 - 10, height: 2 * (th + 10) - 10, channels: 3, background: '#ffffff' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 4) * 350, top: Math.floor(i / 4) * (th + 10) }))).png({ palette: false, compressionLevel: 9 }).toBuffer());
}
