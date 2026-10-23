/**
 * Talking to one panel: waking it if it sleeps, handing it a picture, waiting until it has really fetched
 * it, then (optionally) letting it sleep again so a battery lasts. Everything that touches the panel's
 * network lives here and is passed its connections, so it can be tested against a fake panel.
 *
 * One push is:  connect (waking if needed) -> read battery -> content download -> [panel fetches the
 * manifest and image from us] -> settle while the e-paper refreshes -> reconnect -> network standby on
 * -> sleep. The sleep steps only run when DISPLAY_SLEEP_AFTER_PUSH is on, the panel can be woken, and it
 * is not on external power (the panel then has no reason to sleep, and sleeping would cost remote wake).
 * If the panel's own "sleep immediately after receiving content" switch is on (DISPLAY_PANEL_SLEEPS_AFTER_CONTENT),
 * none of that is needed after the fetch: the panel sleeps itself.
 */
import { MdcError, openSession, openSessionRetry, setContentDownload, getBattery, setNetworkStandby, sleepNow } from './mdc.mjs';
import { sendWake } from './wake.mjs';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** display ids we have put to sleep: the next connection wakes first instead of waiting on a timeout. */
const asleep = new Map();
/** When we last talked to each panel: a real panel sleeps by itself about 20 minutes after waking. */
const lastContact = new Map();
/**
 * True if we put the panel to sleep, or if long enough has passed since we last reached it that its own
 * idle timer (`autoSleepMinutes`, 20 on the EM32DX) must have put it to sleep. Waking an awake panel is
 * harmless, so a wrong guess costs a moment; a right one saves a connection timeout.
 */
export const isKnownAsleep = (id, { now = () => Date.now(), autoSleepMinutes = 20 } = {}) =>
  asleep.get(id) === true || (lastContact.has(id) && now() - lastContact.get(id) > (autoSleepMinutes - 1) * 60000);

const defaults = { open: openSession, openRetry: openSessionRetry, wake: sendWake, sleep: delay, now: () => Date.now(), progress: () => {} };

const canWake = (d) => Boolean(d.wake && d.mac);
const sessionOptions = (d, timeoutMs) => ({ host: d.host, port: d.mdcPort || 1515, pin: d.pin, timeoutMs });
const wakeTarget = (d) => ({ mac: d.mac, host: d.host, broadcast: d.broadcast, ports: d.wakePorts });

/**
 * An open session with the panel, waking it first if needed. Resolves { session, wakeSeconds }.
 * Does not probe: a connection that works IS the session the caller uses. A refusal is not retried.
 */
export async function connectWithWake(display, deps = {}) {
  const { open, wake, sleep, now, progress } = { ...defaults, ...deps };
  const started = now();
  const wakeMs = (display.wakeTimeoutSeconds ?? 45) * 1000;
  let lastKind = '';
  // timeout / unreachable: asleep. refused: the address answers but MDC is not listening yet (seen on a
  // real panel just after it was unplugged or woken), so it is retried like the others.
  const tryOpen = async (timeoutMs) => {
    try { return await open(sessionOptions(display, timeoutMs)); } catch (err) {
      if (err instanceof MdcError && (err.kind === 'timeout' || err.kind === 'unreachable' || err.kind === 'refused')) { lastKind = err.kind; return null; }
      throw err;
    }
  };
  const refusedNote = () => (lastKind === 'refused' ? ' The address answered but MDC refused the connection: the panel may be starting up, or another device may hold its IP address.' : '');
  const ready = (session) => { asleep.set(display.id, false); lastContact.set(display.id, now()); return { session, wakeSeconds: Math.round((now() - started) / 100) / 10 }; };

  if (!(canWake(display) && isKnownAsleep(display.id, { now, autoSleepMinutes: display.autoSleepMinutes ?? 20 }))) {
    const session = await tryOpen(display.connectTimeoutMs ?? 5000);
    if (session) { asleep.set(display.id, false); lastContact.set(display.id, now()); return { session, wakeSeconds: 0 }; }
  }
  if (!canWake(display)) {
    if (lastKind === 'refused') throw new MdcError('refused', `${display.host} refused the MDC connection (another device may hold the panel's IP address, or the panel is starting up). Waking is not set up (DISPLAY_MAC).`);
    throw new MdcError('asleep', 'the panel did not answer and waking is not set up (set DISPLAY_MAC to its Wi-Fi MAC and enable Network Standby on the panel)');
  }

  progress('waking');
  await wake(wakeTarget(display));
  let nextResend = now() + 10000;
  await sleep(display.firstWaitMs ?? 3000);
  while (now() - started < wakeMs) {
    const session = await tryOpen(display.probeTimeoutMs ?? 3000);
    if (session) return ready(session);
    if (now() >= nextResend) { await wake(wakeTarget(display)); nextResend = now() + 10000; }
    await sleep(1000);
  }
  throw new MdcError('asleep', `the panel did not wake within ${display.wakeTimeoutSeconds ?? 45} s (is Network Standby on, and is DISPLAY_MAC its Wi-Fi MAC? A panel left asleep for a long time, or unplugged while asleep, may be in a deep sleep that needs its power button).${refusedNote()}`);
}

const external = (battery) => Boolean(battery?.source);

/** Whether this display should be put to sleep now, and if not, why. */
export function sleepDecision(display, battery) {
  if (!display.sleepAfterPush) return { sleep: false, why: '' };
  if (!canWake(display)) return { sleep: false, why: 'not sleeping: waking is not set up (DISPLAY_MAC)' };
  if (external(battery) && !display.sleepOnExternalPower) return { sleep: false, why: `not sleeping: on ${battery.source} power` };
  return { sleep: true, why: '' };
}

/**
 * Turns network standby on (so the panel can be woken again) and sleeps it, but only if the panel
 * accepted standby: a panel put to sleep without it can only be woken by its power button.
 */
async function standbyThenSleep(display, session) {
  try { await setNetworkStandby(session, true); } catch (err) {
    return { slept: false, why: `not sleeping: the panel did not accept Network Standby (${err.message})` };
  }
  await sleepNow(session);
  asleep.set(display.id, true);
  return { slept: true, why: '' };
}

/**
 * Hands the panel a picture and sees it through.
 * @param contentUrl     the manifest URL the panel should fetch
 * @param waitForFetch   (ms) => Promise<boolean>, true once the panel has downloaded the image
 * @returns { pushed, confirmed, wakeSeconds, battery, slept, reason }
 */
export async function pushFrame({ display, contentUrl, waitForFetch }, deps = {}) {
  const { openRetry, sleep, progress } = { ...defaults, ...deps };
  progress('connecting');
  const { session, wakeSeconds } = await connectWithWake(display, deps);
  const result = { pushed: false, confirmed: false, wakeSeconds, battery: null, slept: false, reason: '' };
  try {
    try { result.battery = await getBattery(session); } catch { /* the battery read is a bonus */ }
    progress('pushing');
    await setContentDownload(session, contentUrl);
    result.pushed = true;
  } finally { session.close(); }

  progress('waiting');
  result.confirmed = await waitForFetch((display.fetchTimeoutSeconds ?? 60) * 1000);
  if (!result.confirmed) {
    result.reason = 'the panel accepted the command but never fetched the picture (check PUBLIC_HOST / PUBLIC_URL and the firewall)';
    return result;
  }

  if (display.panelSleepsAfterContent) {
    // The panel's own "sleep immediately after receiving content" switch is on: it sleeps itself, so we neither
    // wait for the refresh nor send a sleep command. Next time we wake it first.
    asleep.set(display.id, true);
    result.slept = true;
    result.reason = 'the panel sleeps by itself after receiving content';
    return result;
  }

  const decision = sleepDecision(display, result.battery);
  result.reason = decision.why;
  if (!decision.sleep) return result;

  progress('settling');
  await sleep((display.settleSeconds ?? 45) * 1000);
  progress('sleeping');
  try {
    const again = await openRetry(sessionOptions(display, 5000), { sleep });
    try {
      const out = await standbyThenSleep(display, again);
      result.slept = out.slept; result.reason = out.why;
    } finally { again.close(); }
  } catch (err) {
    if (err instanceof MdcError && (err.kind === 'timeout' || err.kind === 'unreachable' || err.kind === 'refused')) {
      // It no longer answers: it went to sleep by itself (its idle timer, or its own sleep switch).
      asleep.set(display.id, true);
      result.slept = true;
      result.reason = 'the panel had already gone to sleep';
    } else result.reason = `could not put the panel to sleep: ${err.message}`;
  }
  return result;
}

/** Wakes the panel if needed, reads the battery, and lets it sleep again if it was asleep or sleeping is on. */
export async function checkBattery(display, deps = {}) {
  const { progress } = { ...defaults, ...deps };
  progress('connecting');
  const { session, wakeSeconds } = await connectWithWake(display, deps);
  const wasAsleep = wakeSeconds > 0;
  try {
    const battery = await getBattery(session);
    let slept = false, reason = '';
    const decision = sleepDecision({ ...display, sleepAfterPush: display.sleepAfterPush || wasAsleep }, battery);
    if (decision.sleep) { progress('sleeping'); ({ slept, why: reason } = await standbyThenSleep(display, session)); } else reason = decision.why;
    return { battery, wakeSeconds, slept, reason };
  } finally { session.close(); }
}

/** Puts the panel to sleep now (refuses if it could not be woken again). */
export async function sleepPanel(display, deps = {}) {
  const { open, progress } = { ...defaults, ...deps };
  if (!canWake(display)) throw new MdcError('protocol', 'refusing to sleep a panel that cannot be woken: set DISPLAY_MAC to its Wi-Fi MAC first');
  progress('sleeping');
  let session;
  try { session = await open(sessionOptions(display, 5000)); } catch (err) {
    if (err instanceof MdcError && (err.kind === 'timeout' || err.kind === 'unreachable')) { asleep.set(display.id, true); return { slept: true, reason: 'the panel was already asleep' }; }
    throw err;
  }
  try { const out = await standbyThenSleep(display, session); return { slept: out.slept, reason: out.why }; } finally { session.close(); }
}
