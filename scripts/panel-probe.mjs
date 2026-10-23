#!/usr/bin/env node
/**
 * Talks to your panel and reports what it finds, so you can check waking, battery and power before
 * relying on them. READ-ONLY by default. Run it with your .env:
 *
 *   node --env-file=.env scripts/panel-probe.mjs [--display <id>]
 *
 * It tries to open an MDC session; if the panel is asleep and DISPLAY_MAC is set, it wakes it and reports
 * how long that took. Then it reads the battery (percent, power source, and the raw bytes so the readings
 * can be checked) and asks for the Wi-Fi MAC. Nothing is changed unless you pass:
 *
 *   --enable-standby   turn Network Standby ON (needed for the panel to be woken after it sleeps)
 *   --sleep-test       enable standby, put the panel to sleep, then wake it and report the time taken
 *                      (if the wake fails the panel stays asleep: press its power button)
 */
import * as config from '../src/config.mjs';
import { openSession, getBattery, getWifiMac, setNetworkStandby, sleepNow } from '../src/mdc.mjs';
import { connectWithWake } from '../src/panel.mjs';
import { sendWake } from '../src/wake.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const display = config.DISPLAYS.find((d) => d.id === (value('--display') ?? config.DISPLAYS[0].id));
if (!display) { console.error(`Unknown display. Available: ${config.DISPLAYS.map((d) => d.id).join(', ')}`); process.exit(2); }
if (!display.host || !display.pin) { console.error(`Display "${display.id}" needs DISPLAY_HOST and DISPLAY_PIN in .env.`); process.exit(2); }

const say = (m) => console.log(m);
const secs = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
say(`Panel "${display.id}" at ${display.host}:${display.mdcPort}`);
say(`  Wi-Fi MAC: ${display.mac || '(not set: waking is unavailable)'}   waking: ${display.wake ? 'on' : 'off'}   broadcast: ${display.broadcast || '(panel IP /24)'}`);

let connection;
const t0 = Date.now();
try {
  connection = await connectWithWake({ ...display, wake: display.wake }, { progress: (p) => say(`  ... ${p}`) });
  say(connection.wakeSeconds > 0 ? `Woke the panel and opened a session in ${secs(t0)}.` : `Opened a session at once (${secs(t0)}): the panel was awake.`);
} catch (err) {
  say(`Could not reach the panel: ${err.message}`);
  say(err.kind === 'refused' ? '  Something else answers at that IP, or the panel is not at DISPLAY_HOST.' : err.kind === 'auth' ? '  Check DISPLAY_PIN.' : '  If it is asleep, set DISPLAY_MAC (Wi-Fi MAC) and turn on Network Standby on the panel.');
  process.exit(1);
}

const { session } = connection;
try {
  const b = await getBattery(session);
  say(`Battery: ${b.percent === null ? '(unreadable)' : `${b.percent}%`}   power: ${b.source || 'battery'}   raw reply: ${b.raw}`);
  say('  (raw layout: 73 then 3 bytes, percent, 1 byte, power source: 01 ac, 02 usb, 03 wireless, otherwise battery)');
} catch (err) { say(`Battery read failed: ${err.message}`); }
try {
  const m = await getWifiMac(session);
  const mine = display.mac ? display.mac.replace(/[^0-9a-f]/gi, '').toUpperCase().match(/../g)?.join(':') : null;
  say(`Wi-Fi MAC: ${m.mac ?? '(unreadable)'}   ${!mine ? 'no DISPLAY_MAC to compare' : mine === m.mac ? 'matches DISPLAY_MAC' : `DOES NOT MATCH DISPLAY_MAC (${mine}): wake packets would not reach this panel`}   raw reply: ${m.raw}`);
} catch (err) { say(`Wi-Fi MAC query failed: ${err.message}`); }

if (flag('--enable-standby') || flag('--sleep-test')) {
  try { await setNetworkStandby(session, true); say('Network Standby: the panel accepted ON.'); } catch (err) { say(`Network Standby: the panel did not accept it (${err.message}). Do not use sleep until it does.`); session.close(); process.exit(1); }
}
if (flag('--sleep-test')) {
  if (!display.mac) { say('Refusing the sleep test: DISPLAY_MAC is not set, so the panel could not be woken.'); session.close(); process.exit(1); }
  await sleepNow(session);
  session.close();
  say('Sleep command sent. Waiting 10 s, then waking it with the same packets the container uses ...');
  await new Promise((r) => setTimeout(r, 10000));
  const t1 = Date.now();
  await sendWake({ mac: display.mac, host: display.host, broadcast: display.broadcast });
  try {
    const again = await connectWithWake({ ...display, wake: true, firstWaitMs: 3000 }, { progress: (p) => say(`  ... ${p}`) });
    say(`The panel woke and answered ${secs(t1)} after the first wake packet. Sleeping and waking work: you can set DISPLAY_SLEEP_AFTER_PUSH=true.`);
    again.session.close();
  } catch (err) {
    say(`The panel did NOT wake: ${err.message}`);
    say('  Press its power button. Check that Network Standby is ON and DISPLAY_MAC is its Wi-Fi MAC; do not enable sleep yet.');
    process.exit(1);
  }
} else {
  session.close();
}
