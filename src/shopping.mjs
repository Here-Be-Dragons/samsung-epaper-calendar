/**
 * The shopping list. SHOPPING_SOURCE picks where it is read from; every source returns
 * `{ items: [{ text, done }] }` and the panel shows the items not yet done.
 *
 *   none         no list: the agenda takes the whole bottom area
 *   file         SHOPPING_FILE: a .json file (["milk", { "text": "eggs", "done": true }]) or a text file with
 *                one item per line ("- [x] eggs" marks one done). Edit it however you like.
 *   googletasks  a Google Tasks list, read with an OAuth refresh token (see scripts/google-auth.mjs)
 *
 * The display only reads the list; you change it in whichever app owns it.
 */
import fs from 'fs';
import * as config from './config.mjs';

function readFileSource() {
  if (!config.SHOPPING_FILE) throw new Error('SHOPPING_FILE is not set');
  const raw = fs.readFileSync(config.SHOPPING_FILE, 'utf8');
  if (config.SHOPPING_FILE.toLowerCase().endsWith('.json')) {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) throw new Error('shopping JSON must be an array');
    return list.map((x) => (typeof x === 'string' ? { text: x, done: false } : { text: String(x.text ?? ''), done: Boolean(x.done) })).filter((x) => x.text.trim());
  }
  return raw.split(/\r?\n/).map((line) => {
    const m = line.match(/^\s*(?:[-*]\s*)?(?:\[( |x|X)\]\s*)?(.*?)\s*$/);
    return { text: m[2], done: m[1] === 'x' || m[1] === 'X' };
  }).filter((x) => x.text);
}

// Google Tasks (https://developers.google.com/tasks/reference/rest): trade the refresh token for an access
// token, find the list, and read its open tasks.
let tokenCache = { value: '', until: 0 };
async function googleToken() {
  if (tokenCache.value && Date.now() < tokenCache.until) return tokenCache.value;
  const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret, GOOGLE_REFRESH_TOKEN: refresh } = config;
  if (!id || !secret || !refresh) throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN are required');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Google token request failed (${res.status}${body.error ? `: ${body.error}` : ''})`);
  tokenCache = { value: body.access_token, until: Date.now() + (Number(body.expires_in) || 3600) * 1000 - 60000 };
  return tokenCache.value;
}

async function googleGet(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await googleToken()}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Google Tasks ${res.status}`);
  return res.json();
}

async function readGoogleTasks() {
  const wanted = config.GOOGLE_TASKS_LIST;
  let listId = wanted;
  if (wanted !== '@default') {
    const lists = (await googleGet('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100')).items ?? [];
    const hit = lists.find((l) => l.id === wanted) ?? lists.find((l) => l.title.toLowerCase() === wanted.toLowerCase());
    if (!hit) throw new Error(`Google Tasks list "${wanted}" not found`);
    listId = hit.id;
  }
  const tasks = (await googleGet(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks?showCompleted=false&showHidden=false&maxResults=100`)).items ?? [];
  return tasks.filter((t) => (t.title ?? '').trim()).map((t) => ({ text: t.title.trim(), done: t.status === 'completed' }));
}

const SOURCES = { file: readFileSource, googletasks: readGoogleTasks };

/** The shopping list, or null when no source is configured. A failing source gives `{ error }`, not an exception. */
export async function getShopping() {
  if (config.SHOPPING_SOURCE === 'none') return null;
  const read = SOURCES[config.SHOPPING_SOURCE];
  if (!read) return { items: [], error: `unknown SHOPPING_SOURCE "${config.SHOPPING_SOURCE}"` };
  try {
    return { items: await read() };
  } catch (err) {
    console.warn(`[shopping] ${err.message}`);
    return { items: [], error: err.message };
  }
}
