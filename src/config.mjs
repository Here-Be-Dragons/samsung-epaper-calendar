import path from 'path';
import { MONTH_KEYS, THEME_NAMES, isThemeSetting } from './themes.mjs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function int(name, fallback) {
  const v = process.env[name];
  const n = v === undefined ? NaN : parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function bool(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

// IANA zone that decides which day it is and how event times are shown.
export const TIMEZONE = process.env.TIMEZONE || 'America/New_York';

// --- Refresh cadence --------------------------------------------------------
// How often a frame is rendered (and pushed, if the content changed). A calendar
// changes slowly and the panel flashes on every push, so this is long by default.
export const REFRESH_INTERVAL_SECONDS = int('REFRESH_INTERVAL_SECONDS', 900);
// How long a fetched calendar feed is reused before it is fetched again.
export const CALENDAR_FETCH_SECONDS = int('CALENDAR_FETCH_SECONDS', 600);
// Push to the panel only when the picture changed (a quiet calendar then never flashes it),
// but always at least this often so a panel that lost its image recovers.
export const FORCE_PUSH_SECONDS = int('FORCE_PUSH_SECONDS', 6 * 3600);
// Who decides when the panel is redrawn:
//   auto    (default) this server redraws whenever the picture changed, checked every refresh interval
//   manual  the server only notices a change ("redraw pending") and waits to be told: from Home
//           Assistant (MQTT), or POST /api/displays/<id>/refresh. No timed redraws at all.
export const REDRAW_MODE = (process.env.REDRAW_MODE || 'auto').toLowerCase();
if (!['auto', 'manual'].includes(REDRAW_MODE)) throw new Error('REDRAW_MODE must be auto or manual');
// Where to remember what the panel is showing across restarts (so a restart does not redraw it).
export const STATE_FILE = process.env.STATE_FILE || '';

// --- Panel / image geometry --------------------------------------------------
// This display is meant to hang in portrait, so the defaults are a portrait image
// (1440x2560, rotation 0). A panel whose firmware is in landscape mode (2560x1440)
// takes OUTPUT_ROTATION=90 instead. See geometry.mjs.
export const PANEL_WIDTH = int('PANEL_WIDTH', 1440);
export const PANEL_HEIGHT = int('PANEL_HEIGHT', 2560);
export const OUTPUT_ROTATION = int('OUTPUT_ROTATION', 0); // 0 | 90 | 180 | 270

// Frames are reduced to the panel's six exact inks before they are sent (src/quantize.mjs), so the
// lossless PNG is the default. JPEG blurs those exact colors and is kept only as an option.
export const IMAGE_FORMAT = (process.env.IMAGE_FORMAT || 'png').toLowerCase(); // 'png' | 'jpeg'
// Optional: what the six inks actually look like on your panel (they are duller than nominal), used only
// to decide how to mix them when dithering theme art. JSON, e.g. {"red":"#8a1c0c","blue":"#1d3f8a"}.
export const PANEL_PALETTE = (() => {
  if (!process.env.PANEL_PALETTE) return null;
  try { return JSON.parse(process.env.PANEL_PALETTE); } catch { throw new Error('PANEL_PALETTE must be JSON like {"red":"#8a1c0c"}'); }
})();
// How theme art is mixed from the six inks: pattern (default: clean regular tiles) or diffusion (finer, noisier).
export const ART_DITHER = process.env.ART_DITHER === 'diffusion' ? 'diffusion' : 'pattern';
export const JPEG_QUALITY = int('JPEG_QUALITY', 100);

// --- HTTP server -------------------------------------------------------------
export const HOST = process.env.HOST || '0.0.0.0';
export const PORT = int('PORT', 8080);
// The host the panels use to fetch frames (reachable on your LAN). Auto-detected if
// unset, which usually fails inside Docker.
export const PUBLIC_HOST = process.env.PUBLIC_HOST || '';
// Full base URL the panel uses, e.g. behind an Ingress. Overrides PUBLIC_HOST and PORT.
export const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

export const FONT_DIR = path.join(__dirname, '..', 'fonts');

// --- Calendars ------------------------------------------------------------------
// List ids in CALENDARS and configure each with CALENDAR_<ID>_*:
//   URL    the calendar's iCal link (Google: Settings > the calendar > "Secret address in iCal format").
//          That link is a password: keep it in .env or a Secret, never in code or a ConfigMap.
//   NAME   label shown in the legend and the agenda (default: the calendar's own name)
//   COLOR  red | green | blue | yellow | black (the panel's inks; default: assigned in order)
//   MARK_DAYS  true to print the day numbers of this calendar's all-day events in red (for a holiday calendar)
const envSlug = (id) => id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
const INK_NAMES = ['blue', 'red', 'green', 'black', 'yellow'];

const calendarIds = (process.env.CALENDARS || '').split(',').map((s) => s.trim()).filter(Boolean);
export const CALENDARS = calendarIds.map((id, i) => {
  const key = (n) => `CALENDAR_${envSlug(id)}_${n}`;
  const url = (process.env[key('URL')] || '').trim();
  if (!url) throw new Error(`Calendar "${id}": ${key('URL')} is not set`);
  const color = (process.env[key('COLOR')] || INK_NAMES[i % INK_NAMES.length]).trim().toLowerCase();
  if (!INK_NAMES.includes(color)) throw new Error(`Calendar "${id}": COLOR must be one of ${INK_NAMES.join(', ')}`);
  return { id: id.toLowerCase(), url, name: (process.env[key('NAME')] || '').trim(), color, markDays: bool(key('MARK_DAYS'), false) };
});
if (new Set(CALENDARS.map((c) => c.id)).size !== CALENDARS.length) throw new Error('CALENDARS contains duplicate ids');

// --- Layout --------------------------------------------------------------------------------------
// paper | timeline (see src/layouts.mjs). Per display: DISPLAY_<ID>_LAYOUT. Home Assistant
// can change it at run time.
export const LAYOUT = (process.env.LAYOUT || 'paper').toLowerCase();

// --- Theme -----------------------------------------------------------------------------------------
// auto (default): each month wears its own theme (see src/themes.mjs), overridden per month with
// THEME_JAN ... THEME_DEC (a theme name, or "none"). none: no theming. A theme name: that theme all
// year. Per display: DISPLAY_<ID>_THEME. Home Assistant can change it at run time.
export const THEME = (process.env.THEME || 'auto').toLowerCase();
export const THEME_MONTHS = MONTH_KEYS.map((m) => (process.env[`THEME_${m.toUpperCase()}`] || '').trim().toLowerCase());
for (const [variable, name] of [['THEME', THEME], ...THEME_MONTHS.map((n, i) => [`THEME_${MONTH_KEYS[i].toUpperCase()}`, n])]) {
  if (name && !isThemeSetting(name)) throw new Error(`${variable} must be auto, none, or one of ${THEME_NAMES.join(', ')} (got "${name}")`);
}

// --- Home Assistant over MQTT ------------------------------------------------------------------
// Set MQTT_URL (for example mqtt://192.168.1.10:1883) to publish status and accept commands, with
// Home Assistant MQTT discovery so the entities appear on their own.
export const MQTT_URL = process.env.MQTT_URL || '';
export const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
export const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
export const MQTT_DISCOVERY_PREFIX = (process.env.MQTT_DISCOVERY_PREFIX || 'homeassistant').replace(/\/+$/, '');
export const MQTT_TOPIC_PREFIX = (process.env.MQTT_TOPIC_PREFIX || 'samsung-epaper-calendar').replace(/\/+$/, '');

// --- Shopping list ----------------------------------------------------------------
// SHOPPING_SOURCE: none (default) | file | googletasks   (see src/shopping.mjs and docs/CONFIGURATION.md)
export const SHOPPING_SOURCE = (process.env.SHOPPING_SOURCE || 'none').toLowerCase();
export const SHOPPING_TITLE = process.env.SHOPPING_TITLE || 'Shopping';
export const SHOPPING_FILE = process.env.SHOPPING_FILE || '';
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
export const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
// A Google Tasks list: its id, or its title (default: your default list).
export const GOOGLE_TASKS_LIST = process.env.GOOGLE_TASKS_LIST || '@default';

// --- Displays ------------------------------------------------------------------
// One server drives any number of EMDX panels, each showing the same calendar. List ids in
// DISPLAYS and configure each with DISPLAY_<ID>_*: HOST, MAC, PIN (default: the shared
// DISPLAY_PIN), ROTATION, WIDTH, HEIGHT, REFRESH_INTERVAL_SECONDS. With DISPLAYS unset there
// is one display, "main", from the plain DISPLAY_HOST / DISPLAY_PIN / DISPLAY_MAC.
function buildDisplay(id, named) {
  const key = (name) => (named ? `DISPLAY_${envSlug(id)}_${name}` : `DISPLAY_${name}`);
  const get = (name, fallback = '') => process.env[key(name)] ?? fallback;
  const number = (name, fallback) => {
    const n = parseInt(process.env[key(name)] ?? '', 10);
    return Number.isFinite(n) ? n : fallback;
  };
  const rotation = ((number('ROTATION', OUTPUT_ROTATION) % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(rotation)) throw new Error(`Display "${id}": ROTATION must be 0, 90, 180 or 270`);
  const flag = (name, fallback) => {
    const v = process.env[key(name)];
    return v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
  };
  const mac = get('MAC').trim();
  const wake = flag('WAKE', Boolean(mac));
  return {
    id: id.toLowerCase(),
    host: get('HOST'),
    pin: named ? get('PIN', process.env.DISPLAY_PIN ?? '') : get('PIN'),
    mac,
    rotation,
    layout: (get('LAYOUT', LAYOUT) || LAYOUT).toLowerCase(),
    theme: (get('THEME', THEME) || THEME).toLowerCase(),
    width: named ? number('WIDTH', PANEL_WIDTH) : PANEL_WIDTH,
    height: named ? number('HEIGHT', PANEL_HEIGHT) : PANEL_HEIGHT,
    refreshSeconds: named ? number('REFRESH_INTERVAL_SECONDS', REFRESH_INTERVAL_SECONDS) : REFRESH_INTERVAL_SECONDS,
    // Waking and sleeping a battery panel (see src/panel.mjs and docs/CONFIGURATION.md):
    mdcPort: number('MDC_PORT', 1515),
    wake,                                               // wake a sleeping panel before a push (needs MAC)
    broadcast: get('BROADCAST').trim(),                 // subnet broadcast for Wake-on-LAN (default: panel IP's /24)
    wakeTimeoutSeconds: number('WAKE_TIMEOUT_SECONDS', 45),
    fetchTimeoutSeconds: number('FETCH_TIMEOUT_SECONDS', 60),
    sleepAfterPush: flag('SLEEP_AFTER_PUSH', false),    // let the panel sleep after a push (saves battery)
    sleepOnExternalPower: flag('SLEEP_ON_EXTERNAL_POWER', false),
    // The panel's own "sleep immediately after receiving content" switch. When it is on, the panel sleeps itself and
    // we neither wait nor send a sleep command.
    panelSleepsAfterContent: flag('PANEL_SLEEPS_AFTER_CONTENT', false),
    settleSeconds: number('SETTLE_SECONDS', 45),        // wait for the e-paper refresh before sleeping
    batteryCheckHours: number('BATTERY_CHECK_HOURS', wake ? 24 : 0),
    autoSleepMinutes: number('AUTO_SLEEP_MINUTES', 20),  // the panel sleeps by itself this long after waking (seen: 20)
  };
}

const displayIds = (process.env.DISPLAYS || '').split(',').map((s) => s.trim()).filter(Boolean);
export const DISPLAYS = displayIds.length ? displayIds.map((id) => buildDisplay(id, true)) : [buildDisplay('main', false)];
if (new Set(DISPLAYS.map((d) => d.id)).size !== DISPLAYS.length) throw new Error('DISPLAYS contains duplicate ids');

// Master switch for MDC pushes (set false for no-push preview containers).
export const MDC_PUSH_ENABLED = bool('MDC_PUSH_ENABLED', DISPLAYS.some((d) => d.host));
