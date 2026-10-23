/**
 * Calendars: fetch the iCal feeds, expand repeating events into plain events, and lay a month out.
 *
 * Repeating events are expanded by wall-clock time. A meeting at 9:00 AM New York stays at 9:00 AM
 * when daylight saving changes, even though its UTC time moves, so each repeat is computed as a
 * "floating" wall-clock time and only then converted to a real instant in the event's own zone.
 * (node-ical hands back the raw rule but leaves that conversion, and the exclusion and
 * moved-instance matching, to the caller.)
 */
import ical from 'node-ical';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import rrulePkg from 'rrule'; // CommonJS: no named exports under ESM
const { RRule } = rrulePkg;
import * as config from './config.mjs';
import { addDays, clock, dateOnlyKey, dayKey, diffDays, monthWeeks } from './dates.mjs';
import { getShopping } from './shopping.mjs';

// --- Time zones ----------------------------------------------------------------------------------

/** Offset (ms) of `tz` from UTC at the instant `ms`. */
function zoneOffset(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** The instant at which the wall clock in `tz` shows the UTC-field time of `floating`. */
export function wallToInstant(floating, tz) {
  const guess = floating.getTime();
  let t = guess - zoneOffset(guess, tz);
  const again = guess - zoneOffset(t, tz); // settle across a daylight saving boundary
  return new Date(again === t ? t : again);
}

/** The wall-clock time of `date` in `tz`, as a Date whose UTC fields show it. */
export function instantToWall(date, tz) {
  return new Date(date.getTime() + zoneOffset(date.getTime(), tz));
}

// --- Cleaning text -------------------------------------------------------------------------------

const text = (v) => (v && typeof v === 'object' ? String(v.val ?? '') : String(v ?? ''));

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

/** An event's description as one short plain line: no HTML, links or invite boilerplate. */
export function cleanDescription(raw) {
  let s = text(raw);
  // Invite footers added by Google and Microsoft come after a marker line; the useful part is before it.
  s = s.split(/\n?-::~|\n?_{10,}|\n?Join with Google Meet|\n?Microsoft Teams (?:meeting|Need help)|\s*To see detailed information for automatically created events/i)[0];
  s = s.replace(/<\s*br\s*\/?>|<\/(?:p|div|li)>/gi, ' ').replace(/<[^>]+>/g, ' ');
  s = s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m]);
  s = s.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

const CONFERENCE_HOSTS = [
  [/meet\.google\.com/i, 'Google Meet'], [/zoom\.us/i, 'Zoom'], [/teams\.(?:microsoft|live)\.com/i, 'Microsoft Teams'],
  [/webex\.com/i, 'Webex'], [/facetime\.apple\.com/i, 'FaceTime'], [/whereby\.com/i, 'Whereby'],
];

function conferenceOf(e) {
  const urls = [e['GOOGLE-CONFERENCE'], e['MICROSOFT-SKYPETEAMSMEETINGURL'], e['MICROSOFT-ONLINEMEETINGCONFLINK'], e.url, e.location, e.description]
    .map(text).filter(Boolean);
  for (const u of urls) for (const [re, name] of CONFERENCE_HOSTS) if (re.test(u)) return name;
  return '';
}

/** A person's display name: their CN, or the part of an email before the @ (some feeds use the email as the CN). */
const personName = (p) => {
  const raw = String(p?.params?.CN ?? '').replace(/^"|"$/g, '') || text(p).replace(/^mailto:/i, '');
  return raw.includes('@') ? raw.split('@')[0] : raw;
};
const personMail = (p) => text(p).replace(/^mailto:/i, '').toLowerCase();

/** The calendar owner's email, read from a personal calendar's link (group calendars have none). Used to leave you off your own guest lists. */
const ownerCache = new Map();
function ownerOf(cal) {
  if (!ownerCache.has(cal.id)) {
    const m = /\/ical\/([^/]+)\//.exec(cal.url);
    const mail = m ? decodeURIComponent(m[1]).toLowerCase() : '';
    ownerCache.set(cal.id, mail.includes('@') && !mail.endsWith('calendar.google.com') ? mail : '');
  }
  return ownerCache.get(cal.id);
}

// --- Events ---------------------------------------------------------------------------------------

/** One event as the rest of the program sees it. */
function makeEvent(cal, e, { start, end, allDay, recurring, recurrenceKey }) {
  let startDay, endDay;
  if (allDay) {
    startDay = dateOnlyKey(start);
    const last = end ? addDays(dateOnlyKey(end), -1) : startDay; // the end of an all-day event is exclusive
    endDay = last < startDay ? startDay : last;
  } else {
    startDay = dayKey(start);
    endDay = end && end > start ? dayKey(new Date(end.getTime() - 1)) : startDay;
  }
  const owner = ownerOf(cal);
  const attendees = [].concat(e.attendee ?? []).filter((a) => a?.params?.PARTSTAT !== 'DECLINED' && a?.params?.CUTYPE !== 'RESOURCE' && (!owner || personMail(a) !== owner));
  const organizer = e.organizer && personMail(e.organizer) !== owner ? personName(e.organizer) : '';
  const attendeeNames = attendees.map(personName).filter((n) => n && n !== organizer);
  return {
    id: `${cal.id}:${text(e.uid)}:${recurrenceKey ?? ''}`,
    cal,
    title: text(e.summary).trim() || '(no title)',
    start, end: end ?? start, allDay, startDay, endDay,
    multiDay: endDay > startDay,
    location: text(e.location).replace(/\s+/g, ' ').trim(),
    description: cleanDescription(e.description),
    url: text(e.url),
    status: text(e.status).toUpperCase(),
    private: text(e.class).toUpperCase() === 'PRIVATE',
    free: text(e.transparency).toUpperCase() === 'TRANSPARENT',
    categories: [].concat(e.categories ?? []).map(text).filter(Boolean),
    organizerName: attendeeNames.length || !organizer ? organizer : '',
    attendeeNames,
    conference: conferenceOf(e),
    recurring: Boolean(recurring),
  };
}

const overlaps = (ev, from, to) => ev.endDay >= from && ev.startDay <= to;

/** Every instance of the repeating event `e` that touches the days from..to (day keys). */
function expandRecurring(cal, e, from, to) {
  const allDay = e.datetype === 'date';
  const tz = e.start.tz && e.start.tz !== 'Z' ? e.start.tz : config.TIMEZONE;
  const wallOf = (d) => (allDay ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : instantToWall(d, tz));
  const startWall = wallOf(e.start);
  const durationMs = e.end ? e.end.getTime() - e.start.getTime() : 0;
  const dayCount = allDay ? Math.max(1, e.end ? diffDays(dateOnlyKey(e.start), dateOnlyKey(e.end)) : 1) : 0;

  const { tzid: _tzid, dtstart: _dtstart, until, ...rest } = e.rrule.origOptions;
  const rule = new RRule({
    ...rest,
    dtstart: startWall,
    ...(until ? { until: allDay ? new Date(Date.UTC(until.getFullYear(), until.getMonth(), until.getDate(), 23, 59, 59)) : instantToWall(until, tz) } : {}),
  });

  // Instances to skip (excluded) and instances that were moved or edited (replaced by an override).
  const skip = new Set();
  for (const d of Object.values(e.exdate ?? {})) skip.add(allDay ? dateOnlyKey(d) : d.getTime());
  const replaced = new Set();
  for (const o of Object.values(e.recurrences ?? {})) {
    const rid = o.recurrenceid ?? o.start;
    replaced.add(allDay ? dateOnlyKey(rid) : rid.getTime());
  }

  const margin = 3 * 86400000 + durationMs;
  const lo = new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10)) - margin);
  const hi = new Date(Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) + 2 * 86400000);
  const out = [];
  for (const wall of rule.between(lo, hi, true)) {
    let start, end, key;
    if (allDay) {
      const k = `${wall.getUTCFullYear()}-${String(wall.getUTCMonth() + 1).padStart(2, '0')}-${String(wall.getUTCDate()).padStart(2, '0')}`;
      key = k;
      start = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
      end = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + dayCount);
    } else {
      start = wallToInstant(wall, tz);
      end = new Date(start.getTime() + durationMs);
      key = start.getTime();
    }
    if (skip.has(key) || replaced.has(key)) continue;
    const ev = makeEvent(cal, e, { start, end, allDay, recurring: true, recurrenceKey: String(key) });
    if (overlaps(ev, from, to)) out.push(ev);
  }
  for (const o of Object.values(e.recurrences ?? {})) { // the moved or edited instances, wherever they landed
    if (!o.start || text(o.status).toUpperCase() === 'CANCELLED') continue;
    const ev = makeEvent(cal, o, { start: o.start, end: o.end, allDay: o.datetype === 'date', recurring: true, recurrenceKey: `r${o.start.getTime()}` });
    if (overlaps(ev, from, to)) out.push(ev);
  }
  return out;
}

/** All events of a parsed feed that touch the days from..to. */
export function eventsFrom(cal, parsed, from, to) {
  const out = [];
  for (const e of Object.values(parsed)) {
    if (e.type !== 'VEVENT' || !e.start || text(e.status).toUpperCase() === 'CANCELLED') continue;
    if (e.recurrenceid) continue; // a moved instance: handled with its series
    try {
      if (e.rrule) { out.push(...expandRecurring(cal, e, from, to)); continue; }
      const ev = makeEvent(cal, e, { start: e.start, end: e.end, allDay: e.datetype === 'date' });
      if (overlaps(ev, from, to)) out.push(ev);
    } catch (err) {
      console.warn(`[calendar:${cal.id}] skipped an event: ${err.message}`);
    }
  }
  return out;
}

// --- Fetching --------------------------------------------------------------------------------------

const feeds = new Map(); // calendar id -> { at, parsed, name, ok, error }

/** The calendar's text: fetched over HTTP(S), or read from a local file (a path or a file: URL), which the demo and tests use. */
async function readFeed(url) {
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'samsung-epaper-calendar' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  return readFile(url.startsWith('file:') ? fileURLToPath(url) : url, 'utf8');
}

async function loadFeed(cal) {
  const hit = feeds.get(cal.id);
  if (hit && Date.now() - hit.at < config.CALENDAR_FETCH_SECONDS * 1000) return hit;
  try {
    const parsed = ical.sync.parseICS(await readFeed(cal.url));
    const meta = Object.values(parsed).find((x) => x.type === 'VCALENDAR') ?? {};
    const entry = { at: Date.now(), parsed, name: text(meta['WR-CALNAME'] ?? meta.name), ok: true };
    feeds.set(cal.id, entry);
    return entry;
  } catch (err) {
    // Never print the URL: for a private calendar it is a credential.
    console.warn(`[calendar:${cal.id}] fetch failed (${err.message}); ${hit ? 'using the last good copy' : 'nothing to show'}`);
    const entry = { ...(hit ?? { parsed: {}, name: '' }), at: Date.now() - config.CALENDAR_FETCH_SECONDS * 1000 + 60000, ok: false };
    feeds.set(cal.id, entry);
    return entry;
  }
}

/** Everything one frame needs. `now` can be set to preview another day. */
export async function getModel({ now = new Date(), calendars = config.CALENDARS } = {}) {
  const today = dayKey(now);
  const weeks = monthWeeks(today);
  const from = weeks[0][0];
  const to = [weeks.at(-1)[6], addDays(today, 21)].sort().at(-1);

  const loaded = await Promise.all(calendars.map(async (cal) => ({ cal, feed: await loadFeed(cal) })));
  const events = [];
  const info = [];
  for (const { cal, feed } of loaded) {
    const named = { ...cal, name: cal.name || feed.name || cal.id };
    info.push({ id: cal.id, name: named.name, color: cal.color, ok: feed.ok, markDays: cal.markDays });
    events.push(...eventsFrom(named, feed.parsed, from, to));
  }
  return { now, today, from, to, events, calendars: info, shopping: await getShopping() };
}

// --- Layout of the month ------------------------------------------------------------------------------

const isBar = (ev) => ev.allDay || ev.multiDay;

/**
 * The month as weeks. All-day and multi-day events become bars that run across the days of a week
 * (several lanes deep when they overlap); single-day timed events are listed under their day.
 */
export function buildMonth(model) {
  const weeks = monthWeeks(model.today).map((days) => {
    const first = days[0], last = days[6];
    const segs = model.events.filter((ev) => isBar(ev) && ev.startDay <= last && ev.endDay >= first).map((ev) => {
      const startCol = ev.startDay < first ? 0 : diffDays(first, ev.startDay);
      const endCol = ev.endDay > last ? 6 : diffDays(first, ev.endDay);
      return { ev, cal: ev.cal, startCol, endCol, contL: ev.startDay < first, contR: ev.endDay > last, lane: 0 };
    });
    // Longest first within a start day, so the long bars sit on top and the short ones fill in below.
    segs.sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol) || a.ev.title.localeCompare(b.ev.title));
    const laneEnd = [];
    for (const s of segs) {
      let lane = laneEnd.findIndex((end) => end < s.startCol);
      if (lane === -1) lane = laneEnd.length;
      laneEnd[lane] = s.endCol;
      s.lane = lane;
    }
    const singles = new Map();
    for (const key of days) {
      const list = model.events.filter((ev) => !isBar(ev) && ev.startDay === key).sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
      if (list.length) singles.set(key, list);
    }
    return { days, bars: segs, lanes: laneEnd.length, singles };
  });
  return { weeks };
}

/**
 * The day's agenda: what is on that day, all-day items first, then by time. It does not depend on the
 * time of day (an event that has ended stays until midnight), so the picture only changes when the
 * calendar does or the date turns, and the panel is never redrawn just because an hour passed.
 */
export function dayAgenda(model, key) {
  return model.events
    .filter((ev) => ev.startDay <= key && ev.endDay >= key)
    .sort((a, b) => (b.allDay - a.allDay) || a.start - b.start || a.title.localeCompare(b.title));
}

/** The next days after `key`, within `span` days, that have something on, with their events. */
export function upcomingDays(model, key, span) {
  const out = [];
  for (let i = 1; i <= span; i++) {
    const day = addDays(key, i);
    const events = dayAgenda(model, day);
    if (events.length) out.push({ key: day, events });
  }
  return out;
}

export { clock };
