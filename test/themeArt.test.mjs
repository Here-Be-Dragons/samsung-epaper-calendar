import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { themeDirs, loadThemeArt } from '../src/themeArt.mjs';
import { render } from '../src/render.mjs';
import { geometryFor } from '../src/geometry.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const solid = (width, height, color) => sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
const put = (file, buffer) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buffer); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'art-'));

test('the folders are searched in order, and a missing THEMES_DIR is an error', () => {
  const has = (...found) => (d) => found.includes(d);
  assert.throws(() => themeDirs({ THEMES_DIR: '/nope' }, has()), /THEMES_DIR \/nope does not exist/);
  const dirs = themeDirs({ THEMES_DIR: '/mine' }, has('/mine', '/config/themes'));
  assert.deepEqual(dirs.slice(0, 2), ['/mine', '/config/themes']);
  assert.equal(themeDirs({}, has()).length, 0, 'nothing exists, nothing to search');
});

test("a theme's own file beats default/, an earlier folder beats a later one, and nothing found is empty", async () => {
  const a = tmp(), b = tmp();
  put(path.join(a, 'default', 'header.png'), await solid(10, 4, '#f00'));
  put(path.join(b, 'easter', 'header.png'), await solid(20, 4, '#0f0'));
  put(path.join(b, 'easter', 'footer.png'), await solid(30, 4, '#00f'));
  put(path.join(b, 'easter', 'motifs', 'egg.png'), await solid(8, 8, '#000'));
  put(path.join(b, 'easter', 'motifs', 'notamotif.png'), await solid(8, 8, '#000'));
  const art = await loadThemeArt('easter', { dirs: [a, b] });
  assert.equal(art.header.width, 10, 'the first folder wins, even with its default');
  assert.equal(art.footer.width, 30);
  assert.deepEqual([...art.motifs.keys()], ['egg'], 'only real motif names');
  const other = await loadThemeArt('winter', { dirs: [b] });
  assert.deepEqual([other.header, other.footer, other.motifs.size], [null, null, 0]);
  const inside = await loadThemeArt('easter', { dirs: [b, a] });
  assert.equal(inside.header.width, 20, "within a folder the theme's own file wins");
});

test('an unreadable PNG is ignored, not fatal', async () => {
  const a = tmp();
  put(path.join(a, 'easter', 'header.png'), Buffer.from('this is not a png'));
  const warn = console.warn; console.warn = () => {};
  try { assert.equal((await loadThemeArt('easter', { dirs: [a] })).header, null); } finally { console.warn = warn; }
});

test('your header.png, footer.png and motifs replace the generated art in a frame', async () => {
  const dir = tmp();
  put(path.join(dir, 'easter', 'header.png'), await solid(1440, 227, '#0000ff'));
  put(path.join(dir, 'easter', 'footer.png'), await solid(1440, 112, '#ff0000'));
  const model = {
    now: new Date('2026-04-05T16:00:00Z'), today: '2026-04-05', from: '2026-03-29', to: '2026-05-02',
    calendars: [{ id: 'a', name: 'Home', color: 'blue', ok: true }], shopping: null, events: [],
  };
  const geometry = geometryFor({ width: 480, height: 854, rotation: 0 });
  const pixelAt = async (png, x, y) => { const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }); const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  process.env.THEMES_DIR = dir;
  try {
    const mine = await render(model, { geometry, layout: 'paper', theme: 'easter', art: 'pattern', text: 'threshold' });
    assert.deepEqual(await pixelAt(mine, 470, 5), [0, 0, 255], 'the header is your blue');
    assert.deepEqual(await pixelAt(mine, 470, 849), [255, 0, 0], 'the footer is your red');
    const plain = await render(model, { geometry, layout: 'paper', theme: 'none', art: 'pattern', text: 'threshold' });
    assert.notDeepEqual(await pixelAt(plain, 470, 5), [0, 0, 255], 'an unthemed frame ignores theme art');
  } finally { delete process.env.THEMES_DIR; }
  const generated = await render(model, { geometry, layout: 'paper', theme: 'easter', art: 'pattern', text: 'threshold' });
  assert.notDeepEqual(await pixelAt(generated, 470, 5), [0, 0, 255], 'without your art it is the generated scene again');
});
