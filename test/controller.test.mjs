import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createController, estimateDaysLeft } from '../src/controller.mjs';
import { discoveryMessages, stateJson } from '../src/mqtt.mjs';

const LAYOUTS = ['paper', 'timeline'];
const THEMES = ['auto', 'none', 'easter', 'christmas'];
const display = { id: 'main', layout: 'paper', theme: 'auto' };

/** A controller over a fake panel: `picture.text` is what the calendar currently looks like. */
function setup({ mode = 'manual', configured = true, stateFile = '', forcePushSeconds = 0 } = {}) {
  const picture = { text: 'v1' };
  const sent = [];
  let clock = 1_000_000;
  const panel = { ok: true, extra: {}, calls: [], battery: { percent: 90, source: '' } };
  const fakePanel = {
    checkBattery: async (_d, { progress }) => { progress('waking'); panel.calls.push('battery'); return { battery: panel.battery, wakeSeconds: 6.5, slept: true, reason: '' }; },
    sleep: async () => { panel.calls.push('sleep'); return { slept: true, reason: '' }; },
  };
  const phases = [];
  const ctl = createController({
    displays: [display], mode, layouts: LAYOUTS, themes: THEMES, forcePushSeconds, stateFile, now: () => clock,
    renderFor: async (_d, { layout, theme }) => ({ image: Buffer.from(`${layout}/${theme}:${picture.text}`), summary: { eventsToday: 2, shoppingOpen: 3, feedsOk: true, themeActive: theme === 'auto' ? 'spring' : theme } }),
    refreshModel: () => {},
    deliver: async (_d, image, opts) => {
      sent.push(image.toString()); panel.calls.push(opts.fresh ? 'fresh' : 'same'); opts.progress('pushing'); phases.push('pushing');
      return { pushId: 'x', configured, pushed: configured && panel.ok, reason: panel.ok ? undefined : 'unreachable', ...panel.extra };
    },
    panel: fakePanel,
  });
  ctl.events.on('state', (s) => phases.push(s.phase));
  return { ctl, picture, sent, panel, phases, tick: (ms) => { clock += ms; } };
}

test('manual mode: a change raises "pending" and nothing is sent until told', async () => {
  const { ctl, picture, sent } = setup();
  assert.equal(ctl.status('main').pending, false, 'nothing rendered yet');
  await ctl.check(display);
  assert.equal(ctl.status('main').pending, true, 'never sent anything, so the panel is out of date');
  assert.equal(sent.length, 0);
  await ctl.refresh(display);
  assert.deepEqual(sent, ['paper/auto:v1']);
  assert.equal(ctl.status('main').pending, false);
  assert.equal(ctl.status('main').pendingSince, null);

  await ctl.check(display);
  assert.equal(ctl.status('main').pending, false, 'same picture: not pending');
  picture.text = 'v2';
  await ctl.check(display);
  const s = ctl.status('main');
  assert.equal(s.pending, true); assert.ok(s.pendingSince);
  assert.equal(sent.length, 1, 'still nothing sent');
  assert.equal(s.eventsToday, 2); assert.equal(s.shoppingOpen, 3); assert.equal(s.feedsOk, true);
});

test('refresh sends only if changed; redraw sends regardless', async () => {
  const { ctl, sent } = setup();
  await ctl.refresh(display);
  const again = await ctl.refresh(display);
  assert.equal(again.unchanged, true);
  assert.equal(sent.length, 1);
  await ctl.redraw(display);
  assert.equal(sent.length, 2, 'redraw sends even though nothing changed');
});

test('pending keeps its first timestamp while the picture keeps changing', async () => {
  const { ctl, picture, tick } = setup();
  await ctl.refresh(display);
  picture.text = 'v2'; await ctl.check(display);
  const first = ctl.status('main').pendingSince;
  tick(60_000); picture.text = 'v3'; await ctl.check(display);
  assert.equal(ctl.status('main').pendingSince, first);
});

test('auto mode sends a change at once, and only when it changed', async () => {
  const { ctl, picture, sent } = setup({ mode: 'auto' });
  await ctl.check(display);
  assert.equal(sent.length, 1);
  await ctl.check(display);
  assert.equal(sent.length, 1, 'unchanged: no flash');
  picture.text = 'v2'; await ctl.check(display);
  assert.equal(sent.length, 2);
});

test('auto mode resends a stale picture, manual mode never does', async () => {
  const auto = setup({ mode: 'auto', forcePushSeconds: 3600 });
  await auto.ctl.check(display); auto.tick(3601_000); await auto.ctl.check(display);
  assert.equal(auto.sent.length, 2);
  const manual = setup({ mode: 'manual', forcePushSeconds: 0 });
  await manual.ctl.refresh(display); manual.tick(30 * 86400_000); await manual.ctl.check(display);
  assert.equal(manual.sent.length, 1);
});

test('a panel that cannot be reached stays pending and reports the problem', async () => {
  const { ctl, panel, sent } = setup({ mode: 'auto' });
  panel.ok = false;
  await ctl.check(display);
  let s = ctl.status('main');
  assert.equal(s.pending, true); assert.equal(s.lastPushOk, false); assert.equal(s.lastPushReason, 'unreachable');
  panel.ok = true;
  await ctl.check(display);
  s = ctl.status('main');
  assert.equal(s.pending, false); assert.equal(s.lastPushOk, true);
  assert.equal(sent.length, 2, 'it was retried on the next check');
});

test('serve-only (no panel configured) counts as delivered', async () => {
  const { ctl } = setup({ configured: false });
  await ctl.refresh(display);
  const s = ctl.status('main');
  assert.equal(s.pending, false); assert.equal(s.lastPushOk, null);
});

test('changing the layout shows up as a pending change', async () => {
  const { ctl, sent } = setup();
  await ctl.refresh(display);
  assert.equal((await ctl.setLayout(display, 'paper')).changed, false);
  assert.equal((await ctl.setLayout(display, 'timeline')).changed, true);
  assert.equal(ctl.status('main').pending, true);
  assert.equal(ctl.status('main').layout, 'timeline');
  await ctl.refresh(display);
  assert.deepEqual(sent, ['paper/auto:v1', 'timeline/auto:v1']);
  await assert.rejects(() => ctl.setLayout(display, 'nope'), /Unknown layout/);
});

test('changing the theme shows up as a pending change and reports the active theme', async () => {
  const { ctl, sent } = setup();
  await ctl.refresh(display);
  assert.equal(ctl.status('main').theme, 'auto'); assert.equal(ctl.status('main').themeActive, 'spring');
  assert.equal((await ctl.setTheme(display, 'auto')).changed, false);
  assert.equal((await ctl.setTheme(display, 'easter')).changed, true);
  assert.equal(ctl.status('main').pending, true);
  assert.equal(ctl.status('main').themeActive, 'easter');
  await ctl.refresh(display);
  assert.deepEqual(sent, ['paper/auto:v1', 'paper/easter:v1']);
  await assert.rejects(() => ctl.setTheme(display, 'nope'), /Unknown theme/);
});

test('state events are emitted, and a restart does not redraw an unchanged picture', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cal-')), 'state.json');
  const a = setup({ stateFile: file });
  const seen = []; a.ctl.events.on('state', (s) => seen.push(s.pending));
  await a.ctl.refresh(display);
  assert.equal(seen.at(-1), false, 'the last event says the picture is up to date');
  const b = setup({ stateFile: file }); // a new process, same state file
  await b.ctl.check(display);
  assert.equal(b.ctl.status('main').pending, false, 'remembered what the panel shows');
  b.picture.text = 'v2'; await b.ctl.check(display);
  assert.equal(b.ctl.status('main').pending, true);
});

test('MQTT discovery describes one device with the sensors and controls', () => {
  const msgs = discoveryMessages({ display, prefix: 'samsung-epaper-calendar', discoveryPrefix: 'homeassistant', layouts: LAYOUTS, themes: THEMES });
  const byKey = Object.fromEntries(msgs.map((m) => [m.topic.split('/').at(-2), { topic: m.topic, ...JSON.parse(m.payload) }]));
  for (const key of ['redraw_pending', 'status', 'pending_since', 'last_redraw', 'events_today', 'shopping_open', 'feed_problem', 'push_problem', 'refresh', 'redraw', 'check', 'layout', 'theme', 'theme_active', 'battery', 'power_source', 'battery_days_left', 'panel_state', 'last_wake_seconds', 'check_battery', 'sleep']) assert.ok(byKey[key], key);
  assert.equal(byKey.battery.device_class, 'battery'); assert.equal(byKey.battery.unit_of_measurement, '%');
  assert.equal(byKey.check_battery.command_topic, 'samsung-epaper-calendar/main/set/battery'); assert.equal(byKey.sleep.command_topic, 'samsung-epaper-calendar/main/set/sleep');
  assert.match(byKey.redraw_pending.topic, /^homeassistant\/binary_sensor\/samsung_epaper_calendar_main\/redraw_pending\/config$/);
  assert.equal(byKey.refresh.command_topic, 'samsung-epaper-calendar/main/set/refresh');
  assert.deepEqual(byKey.layout.options, LAYOUTS);
  assert.equal(byKey.layout.retain, true);
  assert.deepEqual(byKey.theme.options, THEMES);
  assert.equal(byKey.theme.retain, true);
  assert.equal(new Set(msgs.map((m) => JSON.parse(m.payload).unique_id)).size, msgs.length, 'unique ids');
  assert.deepEqual(new Set(msgs.map((m) => JSON.parse(m.payload).device.identifiers[0])), new Set(['samsung_epaper_calendar_main']));
  for (const m of msgs) assert.equal(JSON.parse(m.payload).availability_topic, 'samsung-epaper-calendar/availability');
});

test('the state JSON maps to what the entities read', () => {
  const ctl = setup().ctl;
  const base = ctl.status('main');
  const json = JSON.parse(stateJson({ ...base, pending: true, pendingSince: '2026-10-20T12:00:00.000Z', lastPushOk: false, lastPushReason: 'unreachable', feedsOk: false }));
  assert.equal(json.pending, 'ON'); assert.equal(json.status, 'redraw failed'); assert.equal(json.push_problem, 'ON'); assert.equal(json.feed_problem, 'ON');
  const calm = JSON.parse(stateJson({ ...base, pending: false, lastPushOk: true, feedsOk: true }));
  assert.equal(calm.pending, 'OFF'); assert.equal(calm.status, 'up to date'); assert.equal(calm.push_problem, 'OFF'); assert.equal(calm.feed_problem, 'OFF');
});

test('delivered means the panel fetched the picture: unconfirmed stays pending and reports why', async () => {
  const { ctl, panel, sent } = setup({ mode: 'auto' });
  panel.extra = { confirmed: false, reason: 'the panel never fetched the picture' };
  await ctl.check(display);
  let s = ctl.status('main');
  assert.equal(s.pending, true); assert.equal(s.lastPushOk, false); assert.match(s.lastPushReason, /never fetched/);
  panel.extra = { confirmed: true };
  await ctl.check(display);
  s = ctl.status('main');
  assert.equal(s.pending, false); assert.equal(s.lastPushOk, true); assert.equal(s.lastPushReason, '');
  assert.equal(sent.length, 2, 'retried on the next check');
});

test('the panel is told when a picture must be treated as new', async () => {
  const { ctl, picture, panel } = setup({ mode: 'manual' });
  await ctl.refresh(display);          // first push: nothing known about the panel
  picture.text = 'v2'; await ctl.refresh(display); // an ordinary change
  await ctl.redraw(display);           // forced
  assert.deepEqual(panel.calls.filter((c) => c === 'fresh' || c === 'same'), ['fresh', 'same', 'fresh']);
});

test('what the panel is doing is reported while it works, and goes back to idle', async () => {
  const { ctl, phases } = setup({ mode: 'manual' });
  assert.equal(ctl.status('main').phase, 'idle');
  await ctl.refresh(display);
  assert.ok(phases.includes('pushing'));
  assert.equal(ctl.status('main').phase, 'idle');
});

test('battery and sleep state come from pushes and checks, with a days-left estimate', async () => {
  const { ctl, panel, tick } = setup({ mode: 'manual' });
  assert.equal(ctl.status('main').battery, null); assert.equal(ctl.status('main').panelState, 'unknown');
  panel.extra = { battery: { percent: 100, source: '' }, wakeSeconds: 4.2, slept: true };
  await ctl.refresh(display);
  let s = ctl.status('main');
  assert.equal(s.battery.percent, 100); assert.equal(s.panelState, 'asleep'); assert.equal(s.lastWakeSeconds, 4.2);
  tick(10 * 86400000);
  panel.battery = { percent: 98, source: '' };
  const out = await ctl.checkBattery(display);
  s = ctl.status('main');
  assert.equal(out.battery.percent, 98); assert.equal(s.battery.percent, 98); assert.equal(s.lastWakeSeconds, 6.5); assert.equal(s.panelState, 'asleep');
  assert.equal(s.batteryDaysLeft, 490, '2% in 10 days: 98% lasts 490 more days');
  panel.calls.length = 0;
  assert.equal((await ctl.sleepPanel(display)).slept, true); assert.deepEqual(panel.calls, ['sleep']);
});

test('days-left: needs half a day on battery, ignores charging, resets after a charge', () => {
  const day = 86400000, at = (d, percent, source = '') => ({ t: d * day, percent, source });
  assert.equal(estimateDaysLeft([]), null);
  assert.equal(estimateDaysLeft([at(0, 100)]), null);
  assert.equal(estimateDaysLeft([at(0, 100), at(0.2, 99)]), null, 'too short a span');
  assert.equal(estimateDaysLeft([at(0, 100), at(10, 95)]), 190, '0.5%/day, 95% left');
  assert.equal(estimateDaysLeft([at(0, 100), at(5, 100)]), null, 'not falling');
  assert.equal(estimateDaysLeft([at(0, 60), at(10, 40), at(11, 100), at(21, 90)]), 90, 'only the run since the last charge counts');
  assert.equal(estimateDaysLeft([at(0, 100, ''), at(1, 100, 'usb'), at(2, 100, 'usb'), at(10, 90, '')]), 90, 'USB samples are ignored');
});

test('battery state survives a restart through the state file', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cal-')), 'state.json');
  const a = setup({ stateFile: file });
  a.panel.extra = { battery: { percent: 77, source: '' }, slept: true };
  await a.ctl.refresh(display);
  const b = setup({ stateFile: file });
  assert.equal(b.ctl.status('main').battery.percent, 77);
  assert.equal(b.ctl.status('main').panelState, 'asleep');
});
