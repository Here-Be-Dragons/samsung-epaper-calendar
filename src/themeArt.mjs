/**
 * Your own artwork for a theme, as PNG files, in place of the generated scenery (see themes/README.md):
 *
 *   <dir>/<theme>/header.png        the banner behind the date (1440 x 227 px at the default size)
 *   <dir>/<theme>/footer.png        the strip behind the legend (1440 x 112 px)
 *   <dir>/<theme>/motifs/<name>.png one small picture instead of a generated motif (egg, pumpkin, ...)
 *   <dir>/<month>/...               the same for a month (jan ... dec), for any theme that month without its own file
 *   <dir>/default/...               the same, for any theme without a file of its own or its month's
 *
 * The folders searched, first match wins: THEMES_DIR, /config/themes, ./config/themes, then themes/ in the project (which
 * is copied into the Docker image); THEMES_DIR=none searches nowhere. Within a folder a theme's own file beats the month's,
 * which beats default/. Files are read again when they
 * change, so you can edit them while the server runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadImage } from '@napi-rs/canvas';
import { MOTIF_NAMES } from './themes.mjs';

const BUNDLED = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'themes');

/** The existing folders to look in, best first. A THEMES_DIR that does not exist is an error. */
export function themeDirs(env = process.env, exists = fs.existsSync) {
  if (env.THEMES_DIR === 'none') return [];
  if (env.THEMES_DIR && !exists(env.THEMES_DIR)) throw new Error(`THEMES_DIR ${env.THEMES_DIR} does not exist`);
  return [env.THEMES_DIR, '/config/themes', 'config/themes', BUNDLED].filter((dir) => dir && exists(dir));
}

const cache = new Map(); // file -> { mtimeMs, size, image }
const complained = new Set();

async function readImage(file) {
  let stat;
  try { stat = fs.statSync(file); } catch { return null; }
  if (!stat.isFile()) return null;
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.image;
  try {
    const image = await loadImage(fs.readFileSync(file));
    cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, image });
    return image;
  } catch (err) {
    if (!complained.has(file)) { complained.add(file); console.warn(`[theme art] ignoring ${file}: ${err.message}`); }
    return null;
  }
}

/** { header, footer, motifs: Map(name -> image) } for a theme: whatever of your art exists, null or empty otherwise. */
export async function loadThemeArt(themeName, { month = null, dirs = themeDirs() } = {}) {
  const spots = dirs.flatMap((dir) => [path.join(dir, themeName), ...(month ? [path.join(dir, month)] : []), path.join(dir, 'default')]);
  const find = async (rel) => {
    for (const spot of spots) { const image = await readImage(path.join(spot, rel)); if (image) return image; }
    return null;
  };
  const motifs = new Map();
  for (const name of MOTIF_NAMES) { const image = await find(path.join('motifs', `${name}.png`)); if (image) motifs.set(name, image); }
  return { header: await find('header.png'), footer: await find('footer.png'), motifs };
}
