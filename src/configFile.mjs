/**
 * The optional config file (YAML, or JSON, which is YAML): the lists that do not fit environment variables,
 * calendars and displays. Everything else stays in the environment. See config/config.example.yaml.
 *
 *   calendars:                       one entry per calendar, as many or as few as you like
 *     - id: personal                 optional (default: made from the name)
 *       url: ${PERSONAL_ICAL}        the iCal link, or a local file path; ${VAR} reads an environment variable
 *       name: Me
 *       color: blue
 *       mark_days: false
 *   displays:                        optional; without it the DISPLAY_* environment variables are used
 *     - id: kitchen
 *       host: 192.168.1.123
 *       ...
 *   themes:                          optional: which theme when, and your own (checked by buildThemePlan in themes.mjs)
 *
 * A calendar link is a credential, so no message made here ever contains a value from the file: errors name the
 * entry and the key, and YAML syntax errors give a line number, never the line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

export const CALENDAR_INKS = ['blue', 'red', 'green', 'black', 'yellow'];
const TOP_KEYS = ['calendars', 'displays', 'themes'];
const CALENDAR_KEYS = ['id', 'url', 'name', 'color', 'mark_days'];
export const DISPLAY_KEYS = [
  'id', 'host', 'mac', 'pin', 'rotation', 'layout', 'theme', 'width', 'height', 'refresh_interval_seconds', 'mdc_port', 'wake',
  'broadcast', 'wake_timeout_seconds', 'fetch_timeout_seconds', 'sleep_after_push', 'sleep_on_external_power',
  'panel_sleeps_after_content', 'settle_seconds', 'battery_check_hours', 'auto_sleep_minutes',
];
const ID = /^[a-z0-9][a-z0-9_-]*$/;

/** The config file to read: CONFIG_FILE, else the first of /config/config.{yaml,yml,json} and ./config/config.{...}. */
export function findConfigFile(env = process.env, exists = fs.existsSync) {
  if (env.CONFIG_FILE) {
    if (!exists(env.CONFIG_FILE)) throw new Error(`CONFIG_FILE ${env.CONFIG_FILE} does not exist`);
    return env.CONFIG_FILE;
  }
  for (const dir of ['/config', 'config']) for (const ext of ['yaml', 'yml', 'json']) {
    const file = path.join(dir, `config.${ext}`);
    if (exists(file)) return file;
  }
  return null;
}

/** Reads and checks the file: returns { calendars?, displays? } with ${VAR} replaced from `env`. */
export function parseConfigText(text, { env = process.env, file = 'the config file' } = {}) {
  const doc = parseDocument(text);
  if (doc.errors.length) {
    throw new Error(`${file}: not valid YAML (${doc.errors.map((e) => `${e.code} at line ${e.linePos?.[0]?.line ?? '?'}`).join('; ')})`);
  }
  const data = doc.toJS() ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error(`${file}: the top level must be a map with calendars and/or displays`);
  checkKeys(data, TOP_KEYS, file);
  return interpolate(data, env, file, '');
}

function checkKeys(entry, allowed, label) {
  for (const key of Object.keys(entry)) {
    if (!allowed.includes(key)) throw new Error(`${label}: unknown key "${key}" (allowed: ${allowed.join(', ')})`);
  }
}

function interpolate(value, env, file, where) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
      if (!env[name]) throw new Error(`${file}: ${where}: environment variable ${name} is not set`);
      return env[name];
    });
  }
  if (Array.isArray(value)) return value.map((v, i) => interpolate(v, env, file, `${where}[${i}]`));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v, env, file, where ? `${where}.${k}` : k)]));
  return value;
}

const text = (v) => (v === undefined || v === null ? '' : String(v)).trim();
const flag = (v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(text(v).toLowerCase()));
const slug = (s) => text(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** A feed is a URL, or a file: relative paths are relative to the config file. */
function feedLocation(url, baseDir) {
  if (/^(https?|file):/i.test(url) || path.isAbsolute(url)) return url;
  return path.resolve(baseDir, url);
}

/** [{ id, url, name, color, markDays }] from the file's `calendars` list. */
export function calendarsFromFile(list, { baseDir = '.', file = 'the config file' } = {}) {
  if (!Array.isArray(list)) throw new Error(`${file}: calendars must be a list`);
  const calendars = list.map((entry, i) => {
    const label = `${file}: calendars[${i}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${label} must be a map with at least a url`);
    checkKeys(entry, CALENDAR_KEYS, label);
    const url = text(entry.url);
    if (!url) throw new Error(`${label}: url is not set`);
    const id = text(entry.id).toLowerCase() || slug(entry.name) || `calendar-${i + 1}`;
    if (!ID.test(id)) throw new Error(`${label}: id "${id}" may only use letters, digits, - and _`);
    const color = text(entry.color).toLowerCase() || CALENDAR_INKS[i % CALENDAR_INKS.length];
    if (!CALENDAR_INKS.includes(color)) throw new Error(`${label} (${id}): color must be one of ${CALENDAR_INKS.join(', ')}`);
    return { id, url: feedLocation(url, baseDir), name: text(entry.name), color, markDays: flag(entry.mark_days) };
  });
  if (new Set(calendars.map((c) => c.id)).size !== calendars.length) throw new Error(`${file}: calendars contains duplicate ids`);
  return calendars;
}

/** [{ id, entry }] from the file's `displays` list; the display settings themselves are read by config.mjs. */
export function displayEntriesFromFile(list, { file = 'the config file' } = {}) {
  if (!Array.isArray(list) || !list.length) throw new Error(`${file}: displays must be a list with at least one display`);
  const entries = list.map((entry, i) => {
    const label = `${file}: displays[${i}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${label} must be a map`);
    checkKeys(entry, DISPLAY_KEYS, label);
    const id = text(entry.id).toLowerCase() || (list.length === 1 ? 'main' : '');
    if (!id) throw new Error(`${label}: id is required when there is more than one display`);
    if (!ID.test(id)) throw new Error(`${label}: id "${id}" may only use letters, digits, - and _`);
    return { id, entry };
  });
  if (new Set(entries.map((e) => e.id)).size !== entries.length) throw new Error(`${file}: displays contains duplicate ids`);
  return entries;
}
