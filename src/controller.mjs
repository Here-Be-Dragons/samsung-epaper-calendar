/**
 * Decides when each panel is redrawn, and keeps what Home Assistant (or anything else) needs to know:
 * whether the picture on the panel is out of date ("pending"), since when, how the last redraw went, what
 * the panel is doing right now, and its battery.
 *
 * Every check renders the frame the display would show now and compares it with the frame last sent.
 * In `auto` mode a difference is sent at once. In `manual` mode it only raises `pending`, and nothing
 * is sent until someone calls `refresh()` or `redraw()`, so an automation can pick the moment (for
 * example when nobody is in the room). Nothing here depends on the time of day.
 *
 * A picture counts as delivered only when the panel was reached AND fetched it; a panel that could not be
 * woken, or never fetched, stays pending and is tried again.
 *
 * The parts that touch the outside world are passed in, which keeps this testable:
 *   renderFor(display, { layout, theme }) -> { image, summary }  draw the frame (summary: counts for HA)
 *   refreshModel()                                               drop cached calendar data
 *   deliver(display, image, { fresh, progress }) -> { configured, pushed, confirmed, reason, battery, wakeSeconds, slept }
 *   panel: { checkBattery(display, { progress }), sleep(display, { progress }) }   optional
 */
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import fs from 'fs';
import { serial } from './queue.mjs';

const hashOf = (buf) => createHash('sha256').update(buf).digest('hex');
const HISTORY = 240;

/**
 * Days of battery left, from samples { t (ms), percent, source }: a straight line through the samples taken
 * while on battery power. Needs at least half a day of them and a falling charge; otherwise null.
 */
export function estimateDaysLeft(history) {
  const onBattery = history.filter((h) => !h.source && Number.isFinite(h.percent));
  // Only the latest unbroken stretch on battery counts: a charge in between resets the line.
  let start = onBattery.length;
  for (let i = onBattery.length - 1; i >= 0; i--) {
    if (i < onBattery.length - 1 && onBattery[i].percent < onBattery[i + 1].percent - 1) break;
    start = i;
  }
  const run = onBattery.slice(start);
  if (run.length < 2) return null;
  const first = run[0], last = run.at(-1);
  const days = (last.t - first.t) / 86400000;
  const drop = first.percent - last.percent;
  if (days < 0.5 || drop <= 0) return null;
  return Math.round((last.percent / (drop / days)) * 10) / 10;
}

export function createController({ displays, mode, layouts, themes, forcePushSeconds = 0, stateFile = '', renderFor, refreshModel, deliver, panel = null, now = () => Date.now() }) {
  const events = new EventEmitter();
  const saved = readState(stateFile);
  const st = new Map(displays.map((d) => [d.id, {
    layout: layouts.includes(d.layout) ? d.layout : layouts[0],
    theme: themes.includes(d.theme) ? d.theme : 'auto',
    renderedHash: null, image: null, summary: null,
    pushedHash: saved[d.id]?.pushedHash ?? null,
    lastPushAt: saved[d.id]?.lastPushAt ?? 0,
    lastPushOk: null, lastPushReason: '', note: '',
    lastCheckAt: 0, pendingSince: null,
    configured: false,
    phase: 'idle',
    asleep: saved[d.id]?.asleep ?? null,
    battery: saved[d.id]?.battery ?? null,
    history: saved[d.id]?.history ?? [],
    lastWakeSeconds: null,
    queue: serial(),
  }]));

  const of = (id) => {
    const s = st.get(id);
    if (!s) throw new Error(`Unknown display "${id}"`);
    return s;
  };

  function status(id) {
    const s = of(id);
    const pending = s.renderedHash !== null && s.renderedHash !== s.pushedHash;
    const iso = (t) => (t ? new Date(t).toISOString() : null);
    return {
      id, mode, layout: s.layout, theme: s.theme, themeActive: s.summary?.themeActive ?? null, pending,
      pendingSince: pending ? iso(s.pendingSince) : null,
      lastCheckAt: iso(s.lastCheckAt), lastPushAt: iso(s.lastPushAt),
      lastPushOk: s.lastPushOk, lastPushReason: s.lastPushReason, note: s.note, configured: s.configured,
      phase: s.phase,
      panelState: s.asleep === true ? 'asleep' : s.asleep === false ? 'awake' : 'unknown',
      battery: s.battery ? { percent: s.battery.percent, source: s.battery.source, at: iso(s.battery.at) } : null,
      batteryDaysLeft: estimateDaysLeft(s.history),
      lastWakeSeconds: s.lastWakeSeconds,
      eventsToday: s.summary?.eventsToday ?? null, shoppingOpen: s.summary?.shoppingOpen ?? null, feedsOk: s.summary?.feedsOk ?? null,
    };
  }
  const emit = (id) => events.emit('state', status(id));
  const progress = (id) => (phase) => { of(id).phase = phase; emit(id); };
  const settled = (id) => { of(id).phase = 'idle'; };

  function recordBattery(s, battery) {
    if (!battery || !Number.isFinite(battery.percent)) return;
    s.battery = { percent: battery.percent, source: battery.source ?? '', at: now() };
    s.history.push({ t: now(), percent: battery.percent, source: battery.source ?? '' });
    if (s.history.length > HISTORY) s.history.splice(0, s.history.length - HISTORY);
  }

  async function render(display, { fresh }) {
    const s = of(display.id);
    if (fresh) refreshModel();
    const { image, summary } = await renderFor(display, { layout: s.layout, theme: s.theme });
    s.image = image; s.summary = summary;
    s.renderedHash = hashOf(image);
    s.lastCheckAt = now();
    const pending = s.renderedHash !== s.pushedHash;
    if (pending && !s.pendingSince) s.pendingSince = now();
    if (!pending) s.pendingSince = null;
    return pending;
  }

  async function send(display, { force = false } = {}) {
    const s = of(display.id);
    let result;
    try {
      // `fresh` makes the panel treat the picture as new even if it is byte-identical (a forced redraw, or
      // the first push after a restart that remembers nothing about what the panel holds).
      result = await deliver(display, s.image, { fresh: force || s.pushedHash === null, progress: progress(display.id) });
    } catch (err) {
      result = { configured: true, pushed: false, reason: err.message };
    } finally { settled(display.id); }
    s.configured = Boolean(result.configured);
    // A panel that could not be reached, or never fetched the picture, still has the old one: stay pending.
    const delivered = !result.configured || (result.pushed && result.confirmed !== false);
    s.lastPushOk = result.configured ? delivered : null;
    s.lastPushReason = delivered ? '' : String(result.reason ?? 'push failed');
    s.note = delivered ? String(result.reason ?? '') : '';
    if (result.wakeSeconds !== undefined) s.lastWakeSeconds = result.wakeSeconds;
    if (result.slept) s.asleep = true; else if (result.pushed) s.asleep = false;
    recordBattery(s, result.battery);
    if (delivered) {
      s.pushedHash = s.renderedHash;
      s.lastPushAt = now();
      s.pendingSince = null;
    }
    writeState(stateFile, st);
    return { pushed: delivered, ...result };
  }

  /** Looks for a change. In auto mode a change (or a stale picture) is sent straight away. */
  const check = (display, { fresh = false } = {}) => of(display.id).queue(async () => {
    const pending = await render(display, { fresh });
    const s = of(display.id);
    const stale = forcePushSeconds > 0 && now() - s.lastPushAt > forcePushSeconds * 1000;
    let sent = null;
    if (mode === 'auto' && (pending || stale)) sent = await send(display);
    emit(display.id);
    return { pending: status(display.id).pending, sent };
  });

  /** Fetches calendars again and sends the picture only if it changed. */
  const refresh = (display) => of(display.id).queue(async () => {
    const pending = await render(display, { fresh: true });
    const sent = pending ? await send(display) : { pushed: false, unchanged: true };
    emit(display.id);
    return sent;
  });

  /** Fetches calendars again and sends the picture whether or not it changed (clears ghosting). */
  const redraw = (display) => of(display.id).queue(async () => {
    await render(display, { fresh: true });
    const sent = await send(display, { force: true });
    emit(display.id);
    return sent;
  });

  /** Wakes the panel if it sleeps, reads its battery, and lets it sleep again. */
  const checkBattery = (display) => of(display.id).queue(async () => {
    if (!panel) throw new Error('battery checks are not available');
    const s = of(display.id);
    try {
      const out = await panel.checkBattery(display, { progress: progress(display.id) });
      recordBattery(s, out.battery);
      if (out.wakeSeconds !== undefined) s.lastWakeSeconds = out.wakeSeconds;
      s.asleep = Boolean(out.slept);
      s.note = out.reason ?? '';
      writeState(stateFile, st);
      return out;
    } finally { settled(display.id); emit(display.id); }
  });

  /** Puts the panel to sleep (only if it can be woken again). */
  const sleepPanel = (display) => of(display.id).queue(async () => {
    if (!panel) throw new Error('sleeping is not available');
    const s = of(display.id);
    try {
      const out = await panel.sleep(display, { progress: progress(display.id) });
      if (out.slept) s.asleep = true;
      s.note = out.reason ?? '';
      writeState(stateFile, st);
      return out;
    } finally { settled(display.id); emit(display.id); }
  });

  /** Switches the display's layout; the next check sees the new picture as a change. */
  const setLayout = async (display, name) => {
    if (!layouts.includes(name)) throw new Error(`Unknown layout "${name}". Available: ${layouts.join(', ')}`);
    const s = of(display.id);
    if (s.layout === name) return { changed: false };
    s.layout = name;
    await check(display);
    return { changed: true };
  };

  /** Switches the theme setting (auto, none or a theme name); the next check sees it as a change. */
  const setTheme = async (display, name) => {
    if (!themes.includes(name)) throw new Error(`Unknown theme "${name}". Available: ${themes.join(', ')}`);
    const s = of(display.id);
    if (s.theme === name) return { changed: false };
    s.theme = name;
    await check(display);
    return { changed: true };
  };

  return { events, status, check, refresh, redraw, checkBattery, sleepPanel, setLayout, setTheme, layoutOf: (id) => of(id).layout, themeOf: (id) => of(id).theme };
}

function readState(file) {
  if (!file) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

function writeState(file, st) {
  if (!file) return;
  const out = {};
  for (const [id, s] of st) out[id] = { pushedHash: s.pushedHash, lastPushAt: s.lastPushAt, asleep: s.asleep, battery: s.battery, history: s.history };
  try { fs.writeFileSync(file, JSON.stringify(out)); } catch (err) { console.warn(`[state] could not write ${file}: ${err.message}`); }
}
