import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { FakePanel } from './support/fakePanel.mjs';
import { buildFrame, parseFrames, openSession, getBattery, getWifiMac, setContentDownload, setNetworkStandby, sleepNow, MdcError } from '../src/mdc.mjs';
import { wolPacket, samsungMagic, guessBroadcast, sendWake, normalizeMac } from '../src/wake.mjs';
import { publicUrlWarnings } from '../src/netcheck.mjs';
import { connectWithWake, pushFrame, checkBattery, sleepPanel, sleepDecision, isKnownAsleep } from '../src/panel.mjs';

const settle = () => new Promise((r) => setTimeout(r, 80));
const fast = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 20)));
const MAC = '00:11:22:33:44:55';
const base = (panel, extra = {}) => ({ id: `t${Math.random()}`, host: '127.0.0.1', mdcPort: panel.port, pin: '123456', mac: MAC, wake: true, wakeTimeoutSeconds: 5, firstWaitMs: 30, probeTimeoutMs: 300, connectTimeoutMs: 300, settleSeconds: 0, fetchTimeoutSeconds: 2, ...extra });

test('frames: checksum, round trip, resync on garbage, bad checksum flagged', () => {
  const req = buildFrame(0xc7, [1, 2, 3]);
  assert.deepEqual([...req], [0xaa, 0xc7, 0, 3, 1, 2, 3, (0xc7 + 0 + 3 + 1 + 2 + 3) & 0xff]);
  const good = Buffer.from([0xaa, 0xff, 0, 4, 0x41, 0x1b, 0x73, 0x50, 0]);
  good[good.length - 1] = good.subarray(1, -1).reduce((a, b) => a + b, 0) & 0xff;
  const bad = Buffer.from(good); bad[bad.length - 1] ^= 0xff;
  const { frames, rest } = parseFrames(Buffer.concat([Buffer.from([1, 2, 3]), good, bad, Buffer.from([0xaa, 0xff])]));
  assert.equal(frames.length, 2);
  assert.equal(frames[0].ack, 'A'); assert.equal(frames[0].cmd, 0x1b); assert.deepEqual([...frames[0].payload], [0x73, 0x50]); assert.equal(frames[0].valid, true);
  assert.equal(frames[1].valid, false);
  assert.equal(rest.length, 2, 'an incomplete tail is kept');
});

test('a session: PIN, battery on battery power and on USB, content download, NAK, wrong PIN', async () => {
  const panel = await new FakePanel({ battery: 87, source: 0 }).start();
  try {
    const s = await openSession({ host: '127.0.0.1', port: panel.port, pin: '123456' });
    const b = await getBattery(s);
    assert.equal(b.percent, 87); assert.equal(b.source, ''); assert.match(b.raw, /^73/);
    await setContentDownload(s, 'http://10.0.0.5:8080/api/display-content/ABC/content.json');
    assert.deepEqual(panel.contentUrls, ['http://10.0.0.5:8080/api/display-content/ABC/content.json']);
    const mac = await getWifiMac(s); assert.equal(mac.mac, '00:11:22:33:44:55'); assert.equal(mac.text, '001122334455');
    s.close();
    await settle(); // the panel takes one connection at a time and must see this one close first
    panel.source = 2; panel.battery = 100;
    const s2 = await openSession({ host: '127.0.0.1', port: panel.port, pin: '123456' });
    assert.deepEqual({ ...(await getBattery(s2)), raw: undefined }, { percent: 100, source: 'usb', raw: undefined });
    panel.nakStandby = true;
    await assert.rejects(() => setNetworkStandby(s2, true), (e) => e instanceof MdcError && e.kind === 'nak');
    s2.close();
    await settle();
    await assert.rejects(() => openSession({ host: '127.0.0.1', port: panel.port, pin: '000000' }), (e) => e.kind === 'auth');
    await assert.rejects(() => setContentDownload({ command: async () => {} }, `http://${'x'.repeat(260)}`), /at most 254/);
  } finally { await panel.stop(); }
});

test('timeouts: a silent (asleep) panel times out quickly, a closed port is "refused"', async () => {
  const panel = await new FakePanel({ asleep: true }).start();
  try {
    const t0 = Date.now();
    await assert.rejects(() => openSession({ host: '127.0.0.1', port: panel.port, pin: '123456', timeoutMs: 250 }), (e) => e.kind === 'timeout');
    assert.ok(Date.now() - t0 < 1500);
  } finally { await panel.stop(); }
  await assert.rejects(() => openSession({ host: '127.0.0.1', port: panel.port, pin: '1', timeoutMs: 500 }), (e) => e.kind === 'refused');
});

test('wake packets: a standard WoL packet and Samsung\'s hashed packet, to the right places', async () => {
  assert.equal(normalizeMac('00-11-22-33-44-55'), '00:11:22:33:44:55');
  const wol = wolPacket(MAC);
  assert.equal(wol.length, 102); assert.deepEqual([...wol.subarray(0, 6)], Array(6).fill(255)); assert.deepEqual([...wol.subarray(96, 102)], [0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
  const [colon, plain] = samsungMagic(MAC);
  assert.match(colon.toString(), /^[0-9a-f]{64}$/); assert.notEqual(colon.toString(), plain.toString());
  assert.equal(guessBroadcast('192.168.1.30'), '192.168.1.255'); assert.equal(guessBroadcast('panel.local'), null);
  assert.throws(() => wolPacket('nope'), /not a MAC/);

  const got = [];
  const mk = () => new Promise((resolve) => { const s = dgram.createSocket('udp4'); s.on('message', (m) => got.push(m)); s.bind(0, '127.0.0.1', () => resolve(s)); });
  const [a, b] = await Promise.all([mk(), mk()]);
  await sendWake({ mac: MAC, host: '127.0.0.1', broadcast: null, ports: { wol: a.address().port, magic: b.address().port } });
  await new Promise((r) => setTimeout(r, 100));
  a.close(); b.close();
  assert.ok(got.some((m) => m.length === 102), 'a WoL packet arrived');
  assert.ok(got.some((m) => m.toString() === colon.toString()), 'the Samsung packet arrived');
});

test('wake: an asleep panel is woken by the packets and the session opens', async () => {
  const panel = await new FakePanel({ asleep: true }).start();
  try {
    const ports = await panel.listenForWake({ afterMs: 150 });
    const display = base(panel, { wakePorts: ports, broadcast: null });
    const phases = [];
    const { session, wakeSeconds } = await connectWithWake(display, { sleep: fast, progress: (p) => phases.push(p), wake: (t) => import('../src/wake.mjs').then((m) => m.sendWake(t)) });
    assert.ok(wakeSeconds >= 0.1, `took ${wakeSeconds} s`);
    assert.deepEqual(phases, ['waking']);
    assert.ok(panel.wakePackets.length >= 2);
    session.close();
  } finally { await panel.stop(); }
});

test('wake: gives up with a clear error when the panel never wakes, and when waking is not set up', async () => {
  const panel = await new FakePanel({ asleep: true }).start();
  try {
    const sent = [];
    await assert.rejects(() => connectWithWake(base(panel, { wakeTimeoutSeconds: 1 }), { sleep: fast, wake: async () => { sent.push(1); } }), (e) => e.kind === 'asleep' && /did not wake/.test(e.message));
    assert.ok(sent.length >= 1);
    await assert.rejects(() => connectWithWake(base(panel, { mac: '', wake: false }), { sleep: fast }), (e) => e.kind === 'asleep' && /DISPLAY_MAC/.test(e.message));
  } finally { await panel.stop(); }
});

test('a push: battery, content, confirmed fetch, then standby and sleep; the next connect wakes first', async () => {
  const panel = await new FakePanel({ battery: 64, source: 0 }).start();
  try {
    const display = base(panel, { sleepAfterPush: true });
    const phases = [];
    const out = await pushFrame({ display, contentUrl: 'http://10.0.0.5:8080/c.json', waitForFetch: async () => true }, { sleep: fast, progress: (p) => phases.push(p) });
    assert.deepEqual({ pushed: out.pushed, confirmed: out.confirmed, slept: out.slept, percent: out.battery.percent }, { pushed: true, confirmed: true, slept: true, percent: 64 });
    assert.deepEqual(phases, ['connecting', 'pushing', 'waiting', 'settling', 'sleeping']);
    assert.deepEqual(panel.contentUrls, ['http://10.0.0.5:8080/c.json']);
    assert.deepEqual(panel.commands.map((c) => c.cmd), [0x1b, 0xc7, 0xb5, 0x11], 'battery, content, standby, sleep');
    assert.equal(panel.sleeps, 1); assert.equal(isKnownAsleep(display.id), true);

    // Asleep now: the next connect must send wake packets first instead of waiting for a timeout.
    const ports = await panel.listenForWake({ afterMs: 100 });
    const woke = [];
    const { session } = await connectWithWake({ ...display, wakePorts: ports }, { sleep: fast, wake: async (t) => { woke.push(t); const m = await import('../src/wake.mjs'); await m.sendWake({ ...t, ports }); } });
    assert.ok(woke.length >= 1); session.close();
  } finally { await panel.stop(); }
});

test('sleeping is skipped on external power, without a wake setup, and when standby is refused', async () => {
  const run = async (panelOpts, displayOpts) => {
    const panel = await new FakePanel(panelOpts).start();
    try { return await pushFrame({ display: base(panel, { sleepAfterPush: true, ...displayOpts }), contentUrl: 'http://x/c.json', waitForFetch: async () => true }, { sleep: fast }); } finally { await panel.stop(); }
  };
  let out = await run({ source: 2 }, {});
  assert.equal(out.slept, false); assert.match(out.reason, /on usb power/);
  out = await run({ source: 2 }, { sleepOnExternalPower: true });
  assert.equal(out.slept, true);
  out = await run({}, { mac: '', wake: false });
  assert.equal(out.slept, false); assert.match(out.reason, /waking is not set up/);
  out = await run({ nakStandby: true }, {});
  assert.equal(out.slept, false); assert.match(out.reason, /did not accept Network Standby/);
  out = await run({}, { sleepAfterPush: false });
  assert.equal(out.slept, false); assert.equal(out.reason, '');
});

test('a panel that never fetches the picture is reported, not assumed good, and is not put to sleep', async () => {
  const panel = await new FakePanel().start();
  try {
    const out = await pushFrame({ display: base(panel, { sleepAfterPush: true }), contentUrl: 'http://x/c.json', waitForFetch: async () => false }, { sleep: fast });
    assert.equal(out.pushed, true); assert.equal(out.confirmed, false); assert.match(out.reason, /never fetched/); assert.equal(panel.sleeps, 0);
  } finally { await panel.stop(); }
});

test('battery check wakes a sleeping panel and lets it sleep again; the sleep button refuses without a MAC', async () => {
  const panel = await new FakePanel({ battery: 42, asleep: true }).start();
  try {
    const ports = await panel.listenForWake({ afterMs: 100 });
    const display = base(panel, { wakePorts: ports });
    const out = await checkBattery(display, { sleep: fast, wake: async (t) => { const m = await import('../src/wake.mjs'); await m.sendWake({ ...t, ports }); } });
    assert.equal(out.battery.percent, 42); assert.ok(out.wakeSeconds > 0); assert.equal(out.slept, true);
    await assert.rejects(() => sleepPanel({ ...display, mac: '' }), /refusing to sleep/);
    assert.equal((await sleepPanel(display)).slept, true, 'an already-sleeping panel counts as asleep');
  } finally { await panel.stop(); }
});

test('sleep decision', () => {
  assert.equal(sleepDecision({ sleepAfterPush: false }, null).sleep, false);
  assert.equal(sleepDecision({ sleepAfterPush: true, wake: true, mac: 'x' }, { source: '' }).sleep, true);
  assert.equal(sleepDecision({ sleepAfterPush: true, wake: true, mac: 'x' }, { source: 'ac' }).sleep, false);
});

test('the real EM32DX replies parse: battery 73 00 00 01 64 02 02 is 100% on USB, and its MAC reply is ASCII hex', async () => {
  const fake = (hex) => ({ command: async () => ({ ack: 'A', payload: Buffer.from(hex.replaceAll(' ', ''), 'hex') }) });
  const real = await getBattery(fake('73 00 00 01 64 02 02'));
  assert.deepEqual({ percent: real.percent, source: real.source }, { percent: 100, source: 'usb' });
  assert.equal((await getWifiMac(fake('81 30 30 31 31 32 32 33 33 34 34 35 35'))).mac, '00:11:22:33:44:55');
  assert.equal((await getBattery(fake('73 00 00 01 32 02 00'))).source, '', 'a power-source byte of 0 means on battery');
  const onBattery = await getBattery(fake('73 00 00 01 64 02 00')); // seen on the real panel running on battery
  assert.deepEqual({ percent: onBattery.percent, source: onBattery.source }, { percent: 100, source: '' });
});

test('"refused" is retried like a timeout when waking is set up (a real panel did this), and explained when it never recovers', async () => {
  const net = await import('node:net');
  const port = await new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const display = { id: 'refusing', host: '127.0.0.1', mdcPort: port, pin: '1', mac: MAC, wake: true, wakeTimeoutSeconds: 1, firstWaitMs: 20, probeTimeoutMs: 200, connectTimeoutMs: 200 };
  const wakes = [];
  await assert.rejects(() => connectWithWake(display, { sleep: fast, wake: async () => { wakes.push(1); } }), (e) => e.kind === 'asleep' && /refused the connection/.test(e.message));
  assert.ok(wakes.length >= 1, 'it tried waking instead of giving up at once');
  await assert.rejects(() => connectWithWake({ ...display, mac: '', wake: false }, { sleep: fast }), (e) => e.kind === 'refused' && /another device/.test(e.message));
});

test('after the panel\'s own idle timer must have run out, it is woken first instead of waiting on a timeout', async () => {
  const panel = await new FakePanel({ battery: 80 }).start();
  try {
    const display = base(panel, { autoSleepMinutes: 20 });
    let clock = 1_000_000;
    const order = [];
    const spyOpen = async (o) => { order.push('open'); const { openSession } = await import('../src/mdc.mjs'); return openSession(o); };
    const spyWake = async () => { order.push('wake'); };
    // First contact: nothing known, so it just connects.
    let r = await connectWithWake(display, { now: () => clock, open: spyOpen, wake: spyWake, sleep: fast });
    r.session.close(); await settle();
    assert.deepEqual(order, ['open']);
    // 10 minutes later: still inside the idle window, so it just connects.
    clock += 10 * 60000; order.length = 0;
    r = await connectWithWake(display, { now: () => clock, open: spyOpen, wake: spyWake, sleep: fast });
    r.session.close(); await settle();
    assert.deepEqual(order, ['open']);
    // 25 minutes after that: the panel must have gone to sleep itself, so wake packets go first.
    clock += 25 * 60000; order.length = 0;
    r = await connectWithWake(display, { now: () => clock, open: spyOpen, wake: spyWake, sleep: fast });
    r.session.close();
    assert.equal(order[0], 'wake', 'the wake packets are sent before the first connection attempt');
  } finally { await panel.stop(); }
});

test('with the panel\'s own "sleep after receiving content" switch on, we neither wait nor send a sleep command', async () => {
  const panel = await new FakePanel({ battery: 70 }).start();
  try {
    const display = base(panel, { panelSleepsAfterContent: true, sleepAfterPush: true });
    const phases = [];
    const out = await pushFrame({ display, contentUrl: 'http://x/c.json', waitForFetch: async () => true }, { sleep: fast, progress: (p) => phases.push(p) });
    assert.equal(out.confirmed, true); assert.equal(out.slept, true); assert.match(out.reason, /sleeps by itself/);
    assert.deepEqual(phases, ['connecting', 'pushing', 'waiting']);
    assert.deepEqual(panel.commands.map((c) => c.cmd), [0x1b, 0xc7], 'only the battery read and the content download');
    assert.equal(isKnownAsleep(display.id), true, 'the next connection wakes it first');
  } finally { await panel.stop(); }
});

test('a panel that has already gone to sleep by the time we would sleep it counts as asleep, not as an error', async () => {
  const panel = await new FakePanel({ battery: 70, asleepMode: 'closed' }).start();
  try {
    const display = base(panel, { sleepAfterPush: true });
    const out = await pushFrame({ display, contentUrl: 'http://x/c.json', waitForFetch: async () => { setTimeout(() => panel.setAsleep(true), 5); await new Promise((r) => setTimeout(r, 40)); return true; } }, { sleep: fast });
    assert.equal(out.slept, true); assert.match(out.reason, /already gone to sleep/);
  } finally { await panel.stop(); }
});

test('a PUBLIC_HOST the panel cannot reach is called out: localhost, Docker, or another network', () => {
  assert.deepEqual(publicUrlWarnings('http://192.168.1.20:8080', ['192.168.1.30']), []);
  assert.match(publicUrlWarnings('http://10.8.0.6:8080', ['192.168.1.30'])[0], /on 192\.168\.1\.x.*VPN or another network/);
  assert.match(publicUrlWarnings('http://localhost:8080', ['192.168.1.30'])[0], /localhost or a Docker address/);
  assert.match(publicUrlWarnings('http://172.18.0.2:8080', [])[0], /Docker/);
  assert.deepEqual(publicUrlWarnings('http://10.8.0.6:8080', []), [], 'nothing to compare with when no panel is configured');
  assert.match(publicUrlWarnings(`http://${'a'.repeat(240)}.example:8080`, [])[0], /at most 254/);
});
