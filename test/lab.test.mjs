import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { FakePanel } from './support/fakePanel.mjs';

const run = promisify(execFile);
let hasPython = true;
try { execFileSync('python3', ['--version'], { stdio: 'ignore' }); } catch { hasPython = false; }
const LAB = new URL('../scripts/panel_lab.py', import.meta.url).pathname;
const args = (panel, ports, more) => ['--host', '127.0.0.1', '--pin', '123456', '--mac', '00:11:22:33:44:55', '--mdc-port', String(panel.port), ...(ports ? ['--wol-port', String(ports.wol), '--magic-port', String(ports.magic)] : []), ...more];

test('panel_lab.py: info reads and parses the battery, and reports queries the panel refuses', { skip: !hasPython && 'python3 is not installed' }, async () => {
  const panel = await new FakePanel({ battery: 73, source: 2 }).start();
  try {
    const { stdout } = await run('python3', [LAB, ...args(panel, null, ['info', '--json'])]); // an option AFTER the command
    const out = JSON.parse(stdout.slice(stdout.indexOf('{')));
    assert.deepEqual({ percent: out.battery.percent, source: out.battery.source }, { percent: 73, source: 'usb' });
    assert.equal(out.wifi_mac.mac, '00:11:22:33:44:55');
    assert.ok(out.info['serial number'].error, 'a refused query is reported, not fatal');
  } finally { await panel.stop(); }
});

test('panel_lab.py: wake wakes a sleeping panel with the same packets the container sends', { skip: !hasPython && 'python3 is not installed' }, async () => {
  const panel = await new FakePanel({ asleep: true }).start();
  try {
    const ports = await panel.listenForWake({ afterMs: 200 });
    const { stdout } = await run('python3', [LAB, ...args(panel, ports, ['wake'])]);
    assert.match(stdout, /MDC session open/);
    assert.ok(panel.wakePackets.some((p) => p.kind === 'wol') && panel.wakePackets.some((p) => p.kind === 'magic'));
  } finally { await panel.stop(); }
});

test('panel_lab.py: options work before or after the command, and a later one does not overwrite an earlier one', { skip: !hasPython && 'python3 is not installed' }, async () => {
  const panel = await new FakePanel({ battery: 55 }).start();
  try {
    const before = await run('python3', [LAB, '--json', ...args(panel, null, ['info'])]);
    const after = await run('python3', [LAB, ...args(panel, null, ['info', '--json'])]);
    assert.equal(JSON.parse(before.stdout.slice(before.stdout.indexOf('{'))).battery.percent, 55);
    assert.equal(JSON.parse(after.stdout.slice(after.stdout.indexOf('{'))).battery.percent, 55);
    // `test session --single-connection-check` (the command in the guide) parses and runs.
    const t = await run('python3', [LAB, ...args(panel, null, ['test', 'session', '--single-connection-check'])]);
    assert.match(t.stdout, /FINDING: protocol/);
  } finally { await panel.stop(); }
});

test('panel_lab.py: battery logs a sample, reports the drain between samples, and puts a woken panel back to sleep', { skip: !hasPython && 'python3 is not installed' }, async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lab-')), 'drain.jsonl');
  const old = Date.now() / 1000 - 10 * 3600;
  fs.writeFileSync(log, JSON.stringify({ t: old, iso: 'x', percent: 100, source: 'battery', woke: false }) + '\n');
  const panel = await new FakePanel({ battery: 95, source: 0, asleep: true }).start();
  try {
    const ports = await panel.listenForWake({ afterMs: 100 });
    const { stdout } = await run('python3', [LAB, ...args(panel, ports, ['battery', '--log', log, '--label', 'start'])]);
    assert.match(stdout, /Battery: 95% on battery/);
    assert.match(stdout, /Drain: 5% in 10\.0 h = 0\.50 %\/hour = 12\.00 %\/day/);
    assert.match(stdout, /put back to sleep/);
    assert.equal(panel.sleeps, 1);
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2, 'the sample was appended');
    assert.equal(JSON.parse(lines[1]).label, 'start');
  } finally { await panel.stop(); }
});

test('panel_lab.py: drain sleeps the panel with our command, leaves it alone, and reports how it found it', { skip: !hasPython && 'python3 is not installed' }, async () => {
  const panel = await new FakePanel({ battery: 90, source: 0, asleepMode: 'closed' }).start();
  try {
    const ports = await panel.listenForWake({ afterMs: 100 });
    const { stdout } = await run('python3', [LAB, ...args(panel, ports, ['--yes', '--hours', '0.002', '--http-port', '8196', 'test', 'drain', '--config', 'mdc-sleep'])]);
    assert.match(stdout, /Quiet now/);
    assert.match(stdout, /FINDING: drain/);
    assert.match(stdout, /it was asleep and woke in/);
    assert.equal(panel.sleeps >= 1, true);
  } finally { await panel.stop(); }
});

test('panel_lab.py: settings are read from a .env in the current directory (quotes included), with no sourcing', { skip: !hasPython && 'python3 is not installed' }, async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const panel = await new FakePanel({ battery: 88 }).start();
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labenv-'));
    fs.writeFileSync(path.join(dir, '.env'), `# comment\nDISPLAY_HOST=127.0.0.1\nexport DISPLAY_PIN="123456"\nDISPLAY_MDC_PORT=${panel.port}\nDISPLAY_MAC='00:11:22:33:44:55'\nCALENDAR_HOLIDAYS_NAME="US Holidays"\n`);
    const env = { ...process.env }; for (const k of ['DISPLAY_HOST', 'DISPLAY_PIN', 'DISPLAY_MAC', 'DISPLAY_MDC_PORT']) delete env[k];
    const { stdout } = await run('python3', [LAB, 'info', '--json'], { cwd: dir, env });
    assert.equal(JSON.parse(stdout.slice(stdout.indexOf('{'))).battery.percent, 88);
    // An environment variable still wins over the file.
    await assert.rejects(() => run('python3', [LAB, 'info', '--json'], { cwd: dir, env: { ...env, DISPLAY_PIN: '000000' } }), (e) => /wrong PIN/i.test(e.stdout));
  } finally { await panel.stop(); }
});

test('panel_lab.py: it picks this machine\'s address on the panel\'s network, not a VPN address, and says so', { skip: !hasPython && 'python3 is not installed' }, async () => {
  const code = `
import importlib.util, json
spec = importlib.util.spec_from_file_location('lab', ${JSON.stringify(LAB)}); lab = importlib.util.module_from_spec(spec); spec.loader.exec_module(lab)
mac = 'utun3: inet 10.8.0.6 netmask 0xffffff00\\nen0: inet 192.168.1.20 netmask 0xffffff00 broadcast 192.168.1.255\\nlo0: inet 127.0.0.1'.replace('\\\\n', chr(10))
print(json.dumps([lab.pick_lan_address('192.168.1.20', '192.168.1.30', mac),
                  lab.pick_lan_address('10.8.0.6', '192.168.1.30', mac),
                  lab.pick_lan_address('10.8.0.6', '192.168.1.30', 'utun3: inet 10.8.0.6 netmask 0xffffff00'),
                  lab.pick_lan_address('10.0.0.5', '192.168.1.30', 'eth0: inet addr:192.168.1.7  Bcast:192.168.1.255')]))`;
  const { stdout } = await run('python3', ['-c', code]);
  const [same, vpn, none, linux] = JSON.parse(stdout);
  assert.deepEqual(same, ['192.168.1.20', '']);
  assert.equal(vpn[0], '192.168.1.20'); assert.match(vpn[1], /cannot reach/);
  assert.equal(none[0], '10.8.0.6'); assert.match(none[1], /WARNING.*not on the panel's network/);
  assert.equal(linux[0], '192.168.1.7');
});
