import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findConfigFile, parseConfigText, calendarsFromFile, displayEntriesFromFile } from '../src/configFile.mjs';

const SECRET = 'https://calendar.google.com/calendar/ical/me%40example.com/private-s3cr3tt0ken/basic.ics';
const parse = (text, env = {}) => parseConfigText(text, { env, file: 'cfg.yaml' });

test('any number of calendars, with defaults filled in', () => {
  const { calendars } = parse(`
calendars:
  - { url: "${SECRET}", name: "Work Stuff" }
  - { id: Family, url: family.ics, color: Red, mark_days: yes }
  - { url: "https://example.com/c.ics" }
`);
  const list = calendarsFromFile(calendars, { baseDir: '/etc/cal', file: 'cfg.yaml' });
  assert.deepEqual(list.map((c) => [c.id, c.color, c.markDays, c.name]), [
    ['work-stuff', 'blue', false, 'Work Stuff'], ['family', 'red', true, ''], ['calendar-3', 'green', false, ''],
  ]);
  assert.equal(list[0].url, SECRET, 'a web link is kept as is');
  assert.equal(list[1].url, path.resolve('/etc/cal', 'family.ics'), 'a relative path is relative to the config file');
});

test('JSON is accepted, and one calendar is as good as ten', () => {
  const { calendars } = parse(JSON.stringify({ calendars: [{ url: 'https://example.com/a.ics', name: 'A' }] }));
  assert.equal(calendarsFromFile(calendars).length, 1);
  assert.deepEqual(parse('').calendars, undefined, 'an empty file is fine: the environment decides');
});

test('${VAR} reads the environment, and a missing variable is named, not guessed', () => {
  const env = { ICAL: SECRET };
  assert.equal(parse('calendars:\n  - url: "${ICAL}"\n', env).calendars[0].url, SECRET);
  assert.throws(() => parse('calendars:\n  - url: "${NOPE}"\n', env), /calendars\[0\]\.url: environment variable NOPE is not set/);
});

test('mistakes are reported by entry and key, and never print the calendar link', () => {
  const bad = (text) => { try { calendarsFromFile(parse(text).calendars, { file: 'cfg.yaml' }); } catch (e) { return e.message; } return ''; };
  assert.match(bad(`calendars:\n  - { url: "${SECRET}", colour: red }\n`), /calendars\[0\]: unknown key "colour"/);
  assert.match(bad(`calendars:\n  - { url: "${SECRET}", color: purple }\n`), /color must be one of/);
  assert.match(bad('calendars:\n  - { name: x }\n'), /calendars\[0\]: url is not set/);
  assert.match(bad(`calendars:\n  - { id: a, url: "${SECRET}" }\n  - { id: A, url: "${SECRET}" }\n`), /duplicate ids/);
  assert.match(bad(`calendars:\n  - { id: "bad id", url: "${SECRET}" }\n`), /may only use/);
  assert.throws(() => parse('calendar: []\n'), /unknown key "calendar"/);
  for (const msg of [bad(`calendars:\n  - { url: "${SECRET}", colour: red }\n`), bad(`calendars:\n  - { id: a, url: "${SECRET}" }\n  - { id: A, url: "${SECRET}" }\n`)]) assert.ok(!msg.includes('s3cr3tt0ken'));
});

test('a YAML syntax error gives a line number, not the line', () => {
  try { parse(`calendars:\n  - url: "${SECRET}\n    name: [broken\n`); assert.fail('should throw'); } catch (e) {
    assert.match(e.message, /not valid YAML.* at line \d/);
    assert.ok(!e.message.includes('s3cr3tt0ken') && !e.message.includes('example.com'));
  }
});

test('displays: ids, the single-display default and unknown keys', () => {
  const one = displayEntriesFromFile(parse('displays:\n  - { host: 10.0.0.5 }\n').displays);
  assert.equal(one[0].id, 'main');
  assert.throws(() => displayEntriesFromFile(parse('displays:\n  - { host: a }\n  - { host: b }\n').displays), /id is required/);
  assert.throws(() => displayEntriesFromFile(parse('displays:\n  - { id: a, hots: b }\n').displays), /unknown key "hots"/);
  assert.throws(() => displayEntriesFromFile([]), /at least one display/);
});

test('the file is found by CONFIG_FILE, then in /config and ./config', () => {
  const has = (...files) => (f) => files.includes(f);
  assert.equal(findConfigFile({ CONFIG_FILE: 'x.yaml' }, has('x.yaml')), 'x.yaml');
  assert.throws(() => findConfigFile({ CONFIG_FILE: 'gone.yaml' }, has()), /does not exist/);
  assert.equal(findConfigFile({}, has('/config/config.yml', 'config/config.yaml')), '/config/config.yml');
  assert.equal(findConfigFile({}, has('config/config.json')), path.join('config', 'config.json'));
  assert.equal(findConfigFile({}, has()), null);
});

// config.mjs reads its file and environment once, when it is imported, so each case loads it in a fresh process.
const CONFIG_URL = pathToFileURL(fileURLToPath(new URL('../src/config.mjs', import.meta.url))).href;
function loadConfig(env, cwd, pick) {
  const script = `const c = await import(${JSON.stringify(CONFIG_URL)}); console.log(JSON.stringify((${pick})(c)))`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.trim().split('\n').pop());
}

test('config.mjs takes calendars and displays from the file and ignores the old variables', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  fs.writeFileSync(path.join(dir, 'config.yaml'), `
calendars:
  - { id: mine, name: Mine, color: green, url: mine.ics, mark_days: true }
  - { id: other, url: "\${OTHER_URL}" }
displays:
  - { id: kitchen, host: 10.0.0.5, wake: false, rotation: 90, width: 100, sleep_after_push: true, mdc_port: 2000 }
  - { id: hall, host: 10.0.0.6, layout: timeline }
`);
  const env = { CONFIG_FILE: path.join(dir, 'config.yaml'), OTHER_URL: 'https://example.com/o.ics', DISPLAY_PIN: '1234', CALENDARS: 'ignored', CALENDAR_IGNORED_URL: 'x', DISPLAYS: 'ignored' };
  const { file, cals, displays } = loadConfig(env, dir, '(c) => ({ file: c.CONFIG_FILE, cals: c.CALENDARS, displays: c.DISPLAYS })');
  assert.equal(file, path.join(dir, 'config.yaml'));
  assert.deepEqual(cals.map((c) => [c.id, c.color, c.markDays, c.url]), [
    ['mine', 'green', true, path.join(dir, 'mine.ics')], ['other', 'red', false, 'https://example.com/o.ics'],
  ]);
  assert.deepEqual(displays.map((d) => [d.id, d.host, d.layout, d.rotation, d.width, d.sleepAfterPush, d.mdcPort, d.pin, d.wake]), [
    ['kitchen', '10.0.0.5', 'paper', 90, 100, true, 2000, '1234', false],
    ['hall', '10.0.0.6', 'timeline', 0, 1440, false, 1515, '1234', false],
  ]);
});

test('without a file the environment variables still work', () => {
  const env = { CALENDARS: 'a,b', CALENDAR_A_URL: 'a.ics', CALENDAR_B_URL: 'b.ics', CALENDAR_B_COLOR: 'black', DISPLAYS: 'one', DISPLAY_ONE_HOST: '10.0.0.9' };
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'nocfg-')); // no ./config here
  assert.deepEqual(loadConfig(env, empty, '(c) => ({ file: c.CONFIG_FILE, cals: c.CALENDARS.map((x) => [x.id, x.color]), displays: c.DISPLAYS.map((d) => [d.id, d.host]) })'),
    { file: '', cals: [['a', 'blue'], ['b', 'black']], displays: [['one', '10.0.0.9']] });
});
