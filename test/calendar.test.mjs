import test from 'node:test';
import assert from 'node:assert/strict';
import ical from 'node-ical';
import { eventsFrom, wallToInstant, instantToWall, cleanDescription, buildMonth, dayAgenda } from '../src/calendar.mjs';
import { monthWeeks, addDays, dayKey } from '../src/dates.mjs';

const cal = { id: 't', name: 'Test', color: 'blue' };
const wrap = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
const parse = (body) => ical.sync.parseICS(wrap(body));
const NY = 'America/New_York';
const hhmm = (d) => new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

test('wall clock stays put across the daylight saving change (Nov 1 2026)', () => {
  const p = parse(`BEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID=America/New_York:20261026T090000\r\nDTEND;TZID=America/New_York:20261026T100000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nSUMMARY:Standup\r\nEND:VEVENT`);
  const evs = eventsFrom(cal, p, '2026-10-25', '2026-11-14').sort((a, b) => a.start - b.start);
  assert.deepEqual(evs.map((e) => e.startDay), ['2026-10-26', '2026-11-02', '2026-11-09']);
  assert.ok(evs.every((e) => hhmm(e.start) === '09:00'), 'every repeat is 9:00 AM New York');
  assert.equal(evs[0].start.toISOString(), '2026-10-26T13:00:00.000Z'); // EDT
  assert.equal(evs[1].start.toISOString(), '2026-11-02T14:00:00.000Z'); // EST
  assert.ok(evs.every((e) => e.end - e.start === 3600000));
});

test('exclusions are skipped and moved instances replace their original', () => {
  const p = parse(`BEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID=America/New_York:20261026T090000\r\nDTEND;TZID=America/New_York:20261026T100000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T140000Z\r\nEXDATE;TZID=America/New_York:20261102T090000\r\nSUMMARY:Standup\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:a\r\nRECURRENCE-ID;TZID=America/New_York:20261109T090000\r\nDTSTART;TZID=America/New_York:20261110T140000\r\nDTEND;TZID=America/New_York:20261110T150000\r\nSUMMARY:Standup (moved)\r\nEND:VEVENT`);
  const evs = eventsFrom(cal, p, '2026-10-25', '2026-12-05').sort((a, b) => a.start - b.start);
  assert.deepEqual(evs.map((e) => [e.startDay, e.title]), [
    ['2026-10-26', 'Standup'], ['2026-11-10', 'Standup (moved)'], ['2026-11-16', 'Standup'], ['2026-11-23', 'Standup'], ['2026-11-30', 'Standup'],
  ]); // Nov 2 excluded, Nov 9 replaced by Nov 10 at 2pm, UNTIL keeps Nov 30 (9am EST = 14:00Z)
  assert.equal(hhmm(evs[1].start), '14:00');
});

test('all-day events: exclusive end, multi-day, and weekly repeats', () => {
  const p = parse(`BEGIN:VEVENT\r\nUID:b\r\nDTSTART;VALUE=DATE:20261022\r\nDTEND;VALUE=DATE:20261025\r\nSUMMARY:Trip\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:c\r\nDTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261002\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Bins\r\nEND:VEVENT`);
  const evs = eventsFrom(cal, p, '2026-10-01', '2026-10-31');
  const trip = evs.find((e) => e.title === 'Trip');
  assert.equal(trip.startDay, '2026-10-22'); assert.equal(trip.endDay, '2026-10-24'); assert.ok(trip.multiDay && trip.allDay);
  assert.deepEqual(evs.filter((e) => e.title === 'Bins').map((e) => e.startDay).sort(), ['2026-10-01', '2026-10-08', '2026-10-15']);
});

test('an overnight timed event spans both days; a cancelled one is dropped', () => {
  const p = parse(`BEGIN:VEVENT\r\nUID:d\r\nDTSTART;TZID=America/New_York:20261023T220000\r\nDTEND;TZID=America/New_York:20261024T060000\r\nSUMMARY:Red-eye\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:e\r\nDTSTART:20261023T150000Z\r\nDTEND:20261023T160000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Nope\r\nEND:VEVENT`);
  const evs = eventsFrom(cal, p, '2026-10-20', '2026-10-30');
  assert.equal(evs.length, 1);
  assert.equal(evs[0].startDay, '2026-10-23'); assert.equal(evs[0].endDay, '2026-10-24'); assert.ok(evs[0].multiDay);
});

test('wallToInstant / instantToWall round-trip, and the repeated hour resolves to one of its two instants', () => {
  for (const iso of ['2026-03-08T06:30:00Z', '2026-03-08T07:30:00Z', '2026-11-01T04:30:00Z', '2026-11-01T07:30:00Z', '2026-07-04T16:00:00Z']) {
    const d = new Date(iso);
    assert.equal(wallToInstant(instantToWall(d, NY), NY).getTime(), d.getTime(), iso);
  }
  // 1:30 AM on Nov 1 2026 happens twice in New York (05:30Z in EDT, 06:30Z in EST); either is a correct answer.
  const both = [new Date('2026-11-01T05:30:00Z').getTime(), new Date('2026-11-01T06:30:00Z').getTime()];
  assert.ok(both.includes(wallToInstant(new Date('2026-11-01T01:30:00Z'), NY).getTime()));
  // The skipped hour on Mar 8 2026 (2:30 AM does not exist) must still give a real instant near it.
  const gap = wallToInstant(new Date('2026-03-08T02:30:00Z'), NY).getTime();
  assert.ok(Math.abs(gap - new Date('2026-03-08T07:30:00Z').getTime()) <= 3600000);
});

test('descriptions lose HTML, links and invite boilerplate', () => {
  assert.equal(cleanDescription('Bring snacks<br>and drinks &amp; ice https://x.example/y\n-::~:~::~:~:~:~:~:~:~::~\nJoin with Google Meet'), 'Bring snacks and drinks & ice');
  assert.equal(cleanDescription(''), '');
});

test('month layout: bars share lanes, weeks cover the month, the agenda ignores the time of day', () => {
  const p = parse(`BEGIN:VEVENT\r\nUID:1\r\nDTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261016\r\nSUMMARY:A\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:2\r\nDTSTART;VALUE=DATE:20261014\r\nDTEND;VALUE=DATE:20261018\r\nSUMMARY:B\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:3\r\nDTSTART;VALUE=DATE:20261016\r\nDTEND;VALUE=DATE:20261017\r\nSUMMARY:C\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:4\r\nDTSTART;TZID=America/New_York:20261020T080000\r\nDTEND;TZID=America/New_York:20261020T090000\r\nSUMMARY:Early\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:5\r\nDTSTART;TZID=America/New_York:20261020T180000\r\nDTEND;TZID=America/New_York:20261020T190000\r\nSUMMARY:Late\r\nEND:VEVENT`);
  const now = new Date('2026-10-20T20:00:00Z'); // 4:00 PM New York
  const model = { now, today: dayKey(now, NY), events: eventsFrom(cal, p, '2026-09-27', '2026-11-07') };
  assert.equal(model.today, '2026-10-20');
  const weeks = buildMonth(model).weeks;
  assert.ok(weeks.length === 5 || weeks.length === 6);
  assert.equal(weeks[0].days[0], monthWeeks('2026-10-20')[0][0]);
  const w = weeks.find((x) => x.days.includes('2026-10-14'));
  const [a, b] = ['A', 'B'].map((t) => w.bars.find((s) => s.ev.title === t));
  assert.notEqual(a.lane, b.lane, 'overlapping bars are on different lanes');
  const c = w.bars.find((s) => s.ev.title === 'C');
  assert.ok(c.lane === a.lane || c.lane === b.lane || c.lane === 2, 'C reuses a free lane if one is free');
  const agenda = (m) => dayAgenda(m, '2026-10-20').map((e) => e.title);
  assert.deepEqual(agenda(model), ['Early', 'Late'], 'an event that has ended stays until midnight');
  assert.deepEqual(agenda({ ...model, now: new Date('2026-10-20T14:00:00Z') }), agenda(model), 'the same at any time of day');
  assert.deepEqual(agenda({ ...model, today: '2026-10-19' }), ['Early', 'Late'], 'other days show everything');
});

test('month weeks start on Sunday and cover whole weeks', () => {
  const weeks = monthWeeks('2026-02-14');
  assert.equal(weeks.length, 4); // Feb 2026 starts on a Sunday and has 28 days
  assert.equal(weeks[0][0], '2026-02-01'); assert.equal(weeks.at(-1)[6], '2026-02-28');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
});

test('guest lists leave out the calendar owner, shorten emails, and drop Google boilerplate notes', () => {
  const ownerCal = { id: 'o', name: 'Me', color: 'blue', url: 'https://calendar.google.com/calendar/ical/me%40example.com/private-x/basic.ics' };
  const p = parse(`BEGIN:VEVENT\r\nUID:g\r\nDTSTART;TZID=America/New_York:20261023T180000\r\nDTEND;TZID=America/New_York:20261023T190000\r\nSUMMARY:Dinner\r\nDESCRIPTION:To see detailed information for automatically created events like this one\\, use the official Google Calendar app. https://g.co/calendar\r\nORGANIZER;CN=me@example.com:mailto:me@example.com\r\nATTENDEE;CN=me@example.com;PARTSTAT=ACCEPTED:mailto:me@example.com\r\nATTENDEE;CN=sam@example.com;PARTSTAT=ACCEPTED:mailto:sam@example.com\r\nATTENDEE;CN=Pat Lee;PARTSTAT=DECLINED:mailto:pat@example.com\r\nEND:VEVENT`);
  const [ev] = eventsFrom(ownerCal, p, '2026-10-20', '2026-10-30');
  assert.deepEqual(ev.attendeeNames, ['sam']);
  assert.equal(ev.organizerName, '');
  assert.equal(ev.description, '');
});
