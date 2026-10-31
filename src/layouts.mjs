/**
 * The layouts: which parts go where. Each takes (ctx, model, { w, h, S }) with the canvas size in pixels
 * and the style (chrome color and theme, see draw.mjs styleFor), and draws a whole frame. A display
 * chooses one by name (LAYOUT, or DISPLAY_<ID>_LAYOUT, or live from Home Assistant).
 *
 *   paper     month grid like a printed wall calendar, then today's agenda and the shopping list
 *   timeline  a compact month, then today as an hour-by-hour timeline beside coming up and shopping
 */
import { createCanvas } from '@napi-rs/canvas';
import { BLACK, WHITE, YELLOW } from './inks.mjs';
import { px } from './scale.mjs';
import { dayAgenda, buildMonth } from './calendar.mjs';
import { drawPosterScene, POSTER_SCENES, POSTER_GREETINGS } from './scenes.mjs';
import { longDay, minuteOfDay, shortDay } from './dates.mjs';
import {
  INK, ON, F, MARGIN, WEEKDAY_H, headerH, footerH, fit, drawText, wrap, roundedRect,
  drawHeader, drawMonth, drawAgenda, drawComingUp, drawShopping, panelHeader, timeLabel,
} from './draw.mjs';

// --- paper: month, then agenda + shopping ---------------------------------------------------------------

function paperLayout(ctx, model, { w, h, S }) {
  drawHeader(ctx, model, w, S);
  const x = px(MARGIN), cw = w - 2 * px(MARGIN);
  const gridTop = px(headerH(S) + 8);
  const weeks = buildMonth(model).weeks.length;
  // A five-week month leaves more room for the agenda; a six-week month needs more for the grid.
  const gridH = px(WEEKDAY_H) + weeks * px(weeks > 5 ? 116 : 128);
  drawMonth(ctx, model, x, gridTop, cw, gridH, S);

  const bottomTop = gridTop + gridH + px(14);
  const bottomH = h - bottomTop - px(S.theme ? 12 : MARGIN) - px(footerH(S));
  if (model.shopping) {
    const aw = Math.round(cw * 0.63), gap = px(14);
    drawAgenda(ctx, model, x, bottomTop, aw, bottomH, S);
    drawShopping(ctx, model, x + aw + gap, bottomTop, cw - aw - gap, bottomH, S);
  } else {
    drawAgenda(ctx, model, x, bottomTop, cw, bottomH, S);
  }
}

// --- poster: a holiday scene with only today's agenda ---------------------------------------------------

/** A full-bleed holiday scene across the frame, a big greeting on it, and today's agenda on a plaque at the bottom. */
function posterLayout(ctx, model, { w, h, S }) {
  const take = S.takeover; // set on a holiday takeover; a plain layout=poster preview falls back to the theme's scene
  const scene = take?.scene ?? (POSTER_SCENES[S.theme?.name] ? S.theme.name : S.theme?.name === 'autumn' ? 'thanksgiving' : 'halloween');
  const k = w / 1440, margin = Math.round(30 * k), pad = Math.round(24 * k);
  // The plaque is as tall as the agenda needs (measured by drawing it once off to the side), within limits; the scene gets the rest.
  const dry = createCanvas(8, 8).getContext('2d');
  dry.textBaseline = 'alphabetic';
  const used = drawAgenda(dry, model, 0, 0, w - 2 * margin - 2 * pad, h, { ...S, art: dry }, { comingUp: false });
  const ph = Math.min(Math.round(h * 0.42), Math.max(Math.round(300 * k), Math.round(used + 2 * pad + 56 * k))); // + room for the entry that just fits
  const plaqueTop = h - margin - ph;
  if (take?.picture) { // your own picture: covers the frame; no lettering unless the takeover asks for a greeting
    const im = take.picture, cover = Math.max(w / im.width, h / im.height);
    S.art.drawImage(im, (w - im.width * cover) / 2, (h - im.height * cover) / 2, im.width * cover, im.height * cover);
  } else drawPosterScene(S.art, scene, w, h, plaqueTop);
  const label = (text, cy, size, fill, stroke) => { // big lettering, outlined so it reads on the art; shrunk to fit the width
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.textBaseline = 'alphabetic';
    let fitted = size;
    for (; fitted > 24; fitted -= 2) { ctx.font = F.bold((fitted * k * 800) / w); if (ctx.measureText(text).width <= w - 2 * margin - stroke * k) break; }
    const x = (w - ctx.measureText(text).width) / 2, y = cy * k;
    ctx.strokeStyle = BLACK; ctx.lineWidth = stroke * k * (fitted / size); ctx.strokeText(text, x, y);
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
  };
  const base = POSTER_GREETINGS[scene] ?? { lines: [], fill: '#ffff00' };
  const lines = take?.greeting ?? (take?.picture ? [] : base.lines); // your picture is left bare unless the takeover gives a greeting
  if (lines.length === 2) { label(lines[0], 190, 130, base.fill, 26); label(lines[1], 335, 156, base.fill, 30); }
  else if (lines.length === 1) label(lines[0], 300, 156, base.fill, 30);
  if (lines.length) label(longDay(model.today), 440, 62, WHITE, 16);
  // the plaque, and the agenda in it. The white is on the decoration layer, under the agenda's colored title band (also drawn there).
  const px0 = margin, pw = w - 2 * margin;
  S.art.fillStyle = WHITE; roundedRect(S.art, px0, plaqueTop, pw, ph, 30 * k); S.art.fill();
  ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(4, 10 * k); roundedRect(ctx, px0, plaqueTop, pw, ph, 30 * k); ctx.stroke();
  drawAgenda(ctx, model, px0 + pad, plaqueTop + pad, pw - 2 * pad, ph - 2 * pad, S, { comingUp: false });
}

// --- timeline: a compact month on top ------------------------------------------------------------------

/** Draws the header and a compact month; returns the y where the lower part starts. */
function compactTop(ctx, model, w, S) {
  drawHeader(ctx, model, w, S);
  const x = px(MARGIN), cw = w - 2 * px(MARGIN);
  const gridTop = px(headerH(S) + 8);
  const weeks = buildMonth(model).weeks.length;
  const gridH = px(WEEKDAY_H) + weeks * px(weeks > 5 ? 80 : 100); // a five-week month's rows hold three lines of titles
  drawMonth(ctx, model, x, gridTop, cw, gridH, S, { compact: true });
  return gridTop + gridH + px(14);
}

// --- timeline: today hour by hour ---------------------------------------------------------------------

/**
 * Splits overlapping events into side-by-side lanes. `span` is [{ s, e }] in minutes, sorted by start; `minMinutes` is the
 * shortest time a drawn block covers (a block is never shorter than its title needs), so an event is laid out by
 * `d = max(e, s + minMinutes)`. Returns each event with its `lane`, the `lanes` its cluster of overlaps has in all, and the `cluster` it is in.
 */
export function assignLanes(span, minMinutes = 0) {
  const laid = [];
  let cluster = [], clusterEnd = -1, clusters = 0;
  const flush = () => { const lanes = Math.max(0, ...cluster.map((c) => c.lane + 1)); cluster.forEach((c) => { c.lanes = lanes; c.cluster = clusters; laid.push(c); }); clusters++; cluster = []; };
  for (const t0 of span) {
    const t = { ...t0, d: Math.max(t0.e, t0.s + minMinutes) };
    if (t.s >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.d > t.s).map((c) => c.lane));
    let lane = 0; while (used.has(lane)) lane++;
    cluster.push({ ...t, lane });
    clusterEnd = Math.max(clusterEnd < 0 || !cluster.length ? 0 : clusterEnd, t.d);
  }
  flush();
  return laid;
}

/**
 * Where overlapping blocks start, left to right, the way Google Calendar cascades them. `items` are one cluster of overlapping
 * blocks in start order: { top, bottom, zone, textW } (`zone` is the height of a block's title and time at its top, `textW` how
 * wide they are). A later block lies over the earlier ones and reaches the right edge. It starts a little to the right of
 * any earlier block it overlaps (`indent`), and, if it starts within that block's title, just past the end of that title, so it
 * never covers text. It is never squeezed below `minW`. Returns the left edge of each.
 */
export function cascade(items, { left0, right, indent, minW }) {
  const placed = [];
  return items.map((it) => {
    let left = left0;
    for (const e of placed) {
      if (e.bottom <= it.top) continue;
      left = Math.max(left, e.left + indent);
      if (it.top < e.top + e.zone) left = Math.max(left, e.left + e.textW);
    }
    left = Math.min(left, right - minW);
    placed.push({ ...it, left });
    return left;
  });
}

/**
 * The hours the timeline shows: your usual day (`dayStart` to `dayEnd`, hours of the day) at least, widened to an hour before the
 * first event and an hour after the last when they fall outside it, and never fewer than six. `span` is [{ s, e }] in minutes.
 */
export function visibleHours(span, dayStart = 0, dayEnd = 0) {
  const around = { from: Math.max(0, Math.floor(Math.min(...span.map((t) => t.s)) / 60) - 1), to: Math.min(24, Math.ceil(Math.max(...span.map((t) => t.e)) / 60) + 1) };
  const normal = dayEnd > dayStart; // no normal day set: just around the events
  let startH = normal ? Math.min(dayStart, around.from) : around.from;
  let endH = normal ? Math.max(dayEnd, around.to) : around.to;
  while (endH - startH < 6) { if (endH < 24) endH++; if (endH - startH < 6 && startH > 0) startH--; }
  return { startH, endH };
}

/** Whether any event overlaps the hour `hr` (an event counts as at least 30 minutes long). */
export const hourBusy = (span, hr) => span.some((t) => t.s < (hr + 1) * 60 && Math.max(t.e, t.s + 30) > hr * 60);

/**
 * The rows of the timeline from `startH` to `endH`: one `{ hr }` per hour, except that with `breakHours` set, a run of that many
 * empty hours or more between two busy ones becomes one `{ from, to }` break. Empty hours before the first event and after the
 * last are never folded: they are the day's normal hours, shown as they are.
 */
export function hourRows(span, startH, endH, breakHours) {
  const busyHours = [];
  for (let hr = startH; hr < endH; hr++) if (hourBusy(span, hr)) busyHours.push(hr);
  const first = busyHours[0], last = busyHours.at(-1), rows = [];
  for (let hr = startH; hr < endH;) {
    let run = hr;
    if (breakHours > 0 && hr > first) while (run < endH && !hourBusy(span, run)) run++;
    if (breakHours > 0 && run - hr >= breakHours && run <= last) { rows.push({ from: hr, to: run }); hr = run; } else { rows.push({ hr }); hr++; }
  }
  return rows;
}

/** Minutes of the day an event covers on `key`: from 0 if it began earlier, to 1440 if it carries on (or ends exactly at midnight). */
export function dayMinutes(ev, key) {
  const s = ev.startDay < key ? 0 : minuteOfDay(ev.start);
  let e = ev.endDay > key ? 1440 : minuteOfDay(ev.end);
  if (e === 0 && ev.end > ev.start) e = 1440; // ends at 12 AM: runs to the end of the day, not zero length
  if (e <= s) e = s + 30;
  return { s, e };
}

/**
 * Today, hour by hour. Three things keep a crowded or odd day readable (all off unless S.ambientHours / S.breakHours are set):
 *  - an event as long as S.ambientHours (a 24/7 gym: a whole day) is treated as an all-day event: a chip above the hours, taking no
 *    part in laying out the day, so it neither stretches the hours nor takes width;
 *  - a run of S.breakHours or more empty hours is folded into one thin break row, so the busy part keeps its height;
 *  - if the hours still cannot be drawn legibly (a block an hour long would be tiny, or more than six events overlapping at once),
 *    the day is listed in time order instead.
 */
function drawTimeline(ctx, model, x, y, w, h, S) {
  const bottom = y + h;
  let cy = panelHeader(ctx, x, y, w, 'TODAY', longDay(model.today), S);
  const key = model.today;
  const list = dayAgenda(model, key);
  const allDay = list.filter((e) => e.allDay);
  const timed = list.filter((e) => !e.allDay);
  const ambientMin = (S.ambientHours ?? 0) * 60;
  const ambient = ambientMin > 0 ? timed.filter((e) => (e.end - e.start) / 60000 >= ambientMin) : [];
  const normal = timed.filter((e) => !ambient.includes(e));

  // All-day events, then ambient ones, as colored bars across the top.
  const chipH = px(22), maxChips = 4;
  const chips = [...allDay.map((ev) => ({ ev, extra: '' })), ...ambient.map((ev) => ({ ev, extra: '' }))];
  chips.slice(0, maxChips).forEach(({ ev, extra }) => {
    const ink = ev.cal.color;
    ctx.fillStyle = INK[ink]; roundedRect(ctx, x, cy + px(4), w, chipH, px(5)); ctx.fill();
    ctx.fillStyle = ON[ink]; ctx.font = F.bold(14);
    const span = extra || (ev.endDay > ev.startDay ? `  (${shortDay(ev.startDay).replace(/^\w+, /, '')} – ${shortDay(ev.endDay).replace(/^\w+, /, '')})` : '');
    drawText(ctx, fit(ctx, ev.title + span, F.bold(14), w - px(14)), x + px(7), cy + px(4) + px(16));
    cy += chipH + px(4);
  });
  if (chips.length > maxChips) {
    ctx.fillStyle = BLACK; ctx.font = F.bold(13); ctx.fillText(`+${chips.length - maxChips} more all-day`, x + px(4), cy + px(18)); cy += px(24);
  }
  cy += px(8);
  if (!normal.length) {
    ctx.fillStyle = BLACK; ctx.font = F.regular(18);
    ctx.fillText(chips.length ? 'Nothing timed today.' : 'Nothing scheduled today.', x + px(8), cy + px(24));
    return;
  }

  const span = normal.map((ev) => ({ ev, ...dayMinutes(ev, key) })).sort((a, b) => a.s - b.s || b.e - a.e);
  const { startH, endH } = visibleHours(span, S.dayStart ?? 0, S.dayEnd ?? 0);
  const areaTop = cy, areaH = bottom - cy - px(6);
  const axisW = px(46), bx0 = x + axisW, bw = w - axisW - px(2);
  const rows = hourRows(span, startH, endH, S.breakHours ?? 0); // { hr } or { from, to } for a folded break
  const breakH = px(26), nHours = rows.filter((r) => r.hr !== undefined).length, nBreaks = rows.length - nHours;
  const hourH = Math.min(px(90), (areaH - nBreaks * breakH) / nHours);
  let ry = areaTop;
  for (const r of rows) { r.y = ry; ry += r.hr !== undefined ? hourH : breakH; }
  const areaEnd = ry;
  /** The y of a minute of the day (a minute inside a folded break maps to the break's top). */
  const yOf = (min) => {
    if (min >= endH * 60) return areaEnd;
    const hr = Math.floor(min / 60), row = rows.find((r) => (r.hr !== undefined ? r.hr === hr : hr >= r.from && hr < r.to));
    return row ? row.y + (row.hr !== undefined ? ((min % 60) / 60) * hourH : 0) : areaTop;
  };

  // Overlapping events share the width: each cluster of overlaps is split into side-by-side lanes. A block is never drawn
  // shorter than a title needs, so a short event is laid out by the minutes its block covers (`d`), not just its own: the next
  // event may start before that block ends on the page.
  const laid = assignLanes(span, ((px(24) + 3) * 60) / hourH);

  // Too dense for the hours? List the day instead (only when the smart options are on).
  const smart = (S.ambientHours ?? 0) > 0 || (S.breakHours ?? 0) > 0;
  if (smart && (hourH < px(30) || Math.max(...laid.map((t) => t.lanes)) > 6)) { drawDayList(ctx, span, key, x, cy, w, bottom - px(6)); return; }

  const hourLabel = (hr) => (hr === 0 ? '12 AM' : hr < 12 ? `${hr} AM` : hr === 12 ? 'Noon' : `${hr - 12} PM`);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = BLACK;
  for (const r of rows) {
    if (r.hr !== undefined) {
      ctx.fillStyle = BLACK; ctx.fillRect(bx0, r.y, bw, 1); ctx.fillRect(bx0, r.y, 1, hourH);
      ctx.font = F.regular(11); ctx.fillText(hourLabel(r.hr), x + px(2), r.y + px(11));
    } else { // a folded break: a dotted line across, with the hours it hides
      ctx.fillStyle = BLACK; ctx.fillRect(bx0, r.y, bw, 1);
      const mid = r.y + breakH / 2, dot = Math.max(2, px(1.6));
      for (let dx = px(10); dx < bw; dx += dot * 3) ctx.fillRect(bx0 + dx, mid - dot / 2, dot, dot);
      for (let dy = dot; dy < breakH; dy += dot * 3) ctx.fillRect(bx0, r.y + dy, 1, dot);
      const label = `${hourLabel(r.from)} – ${hourLabel(r.to)}`;
      ctx.font = F.regular(11);
      const tw = ctx.measureText(label).width + px(16), tx = bx0 + (bw - tw) / 2;
      ctx.fillStyle = WHITE; ctx.fillRect(tx, r.y + px(3), tw, breakH - px(6));
      ctx.fillStyle = BLACK; ctx.fillText(label, tx + px(8), mid + px(4));
      ctx.fillText('⋮', x + px(14), mid + px(5));
    }
  }
  ctx.fillRect(bx0, areaEnd, bw, 1);

  // Overlapping events cascade, each lying over the earlier ones, with a thin white border around it so the edges read.
  const right = bx0 + bw - px(2), left0 = bx0 + px(3);
  const clusters = new Map();
  for (const t of laid) clusters.set(t.cluster, [...(clusters.get(t.cluster) ?? []), t]);
  for (const members of clusters.values()) {
    const solo = members.length === 1;
    const share = Math.max(px(90), (right - left0) / members[0].lanes); // the most any title claims: an equal column, so the worst case is columns
    const items = members.map((t) => {
      const top = yOf(t.s) + 1, bh = Math.max(px(24), yOf(t.e) - yOf(t.s) - 2), tall = bh > px(44);
      ctx.font = F.bold(13); const titleW = ctx.measureText(t.ev.title).width;
      ctx.font = F.regular(11); const timeW = tall ? ctx.measureText(timeLabel(t.ev, key).join(' ').replace('– ', '– ')).width : 0;
      return { t, top, bh, bottom: top + bh, tall, zone: tall ? px(32) : px(19), textW: Math.min(Math.max(titleW, timeW) + px(16), share), right }; // a title claims at most its share of the width
    });
    const lefts = solo ? [left0] : cascade(items, { left0, right, indent: px(18), minW: share });
    items.forEach((it, i) => { it.left = lefts[i]; });
    // The text of a block runs only as far as the next block that starts within its title.
    items.forEach((it, i) => {
      it.limit = it.right - it.left - px(10);
      items.slice(i + 1).forEach((o) => { if (o.top < it.top + it.zone && o.left > it.left) it.limit = Math.min(it.limit, o.left - it.left - px(8)); });
    });
    for (const it of items) {
      const { ev } = it.t, ink = ev.cal.color, wide = it.right - it.left;
      const r = px(5); // rounded corners, and the white border around an overlapping block follows them
      if (!solo) { ctx.fillStyle = WHITE; roundedRect(ctx, it.left - px(2), it.top - px(2), wide + px(4), it.bh + px(4), r + px(2)); ctx.fill(); }
      ctx.fillStyle = INK[ink]; roundedRect(ctx, it.left, it.top, wide, it.bh, r); ctx.fill();
      ctx.fillStyle = ON[ink];
      let ty = it.top + px(15);
      if (it.tall) { ctx.font = F.regular(11); drawText(ctx, fit(ctx, timeLabel(ev, key).join(' ').replace('– ', '– '), F.regular(11), it.limit), it.left + px(6), ty - px(1)); ty += px(15); }
      if (solo) {
        const lines = wrap(ctx, ev.title, F.bold(13), it.limit, Math.max(1, Math.min(3, Math.floor((it.bh - px(6)) / px(16)) - (it.tall ? 1 : 0))));
        ctx.font = F.bold(13);
        lines.forEach((l) => { drawText(ctx, l, it.left + px(6), ty); ty += px(16); });
        if (ev.location && ty + px(10) < it.top + it.bh) { ctx.font = F.regular(11); drawText(ctx, fit(ctx, ev.location, F.regular(11), it.limit), it.left + px(6), ty - px(2)); }
      } else {
        ctx.font = F.bold(13);
        drawText(ctx, fit(ctx, ev.title, F.bold(13), it.limit), it.left + px(6), ty);
      }
    }
  }
}

/** The day as a list in time order, for a day too busy for the hours: a color bar, the start time and the title; "+N more" if it overflows. */
function drawDayList(ctx, span, key, x, top, w, bottom) {
  // Rows are 27 units tall, squeezed down to 20 to fit the whole day if that is enough; beyond that the rest is "+N more".
  const rowH = Math.max(px(20), Math.min(px(27), (bottom - top) / span.length));
  const room = Math.max(1, Math.floor((bottom - top) / rowH)), shown = span.length > room ? room - 1 : span.length;
  span.slice(0, shown).forEach(({ ev }, i) => {
    const ry = top + i * rowH, ink = ev.cal.color;
    ctx.fillStyle = INK[ink]; ctx.fillRect(x, ry + px(2), px(5), rowH - px(4));
    const base = ry + rowH / 2 + px(5);
    ctx.fillStyle = BLACK; ctx.font = F.bold(14);
    const [t1] = timeLabel(ev, key);
    drawText(ctx, fit(ctx, t1, F.bold(14), px(86)), x + px(14), base);
    ctx.font = F.regular(15);
    drawText(ctx, fit(ctx, ev.title, F.regular(15), w - px(14) - px(96)), x + px(14) + px(92), base);
  });
  if (shown < span.length) { ctx.fillStyle = BLACK; ctx.font = F.bold(14); ctx.fillText(`+${span.length - shown} more`, x + px(14), top + shown * rowH + rowH / 2 + px(5)); }
}

function timelineLayout(ctx, model, { w, h, S }) {
  const top = compactTop(ctx, model, w, S);
  const x = px(MARGIN), cw = w - 2 * px(MARGIN);
  const bottom = h - px(S.theme ? 12 : MARGIN) - px(footerH(S)), gap = px(14);
  const lw = Math.round(cw * 0.6);
  drawTimeline(ctx, model, x, top, lw, bottom - top, S);
  const rx = x + lw + gap, rw = cw - lw - gap;
  if (model.shopping) {
    const shopH = Math.round((bottom - top) * 0.4);
    drawComingUp(ctx, model, rx, top, rw, bottom - shopH - gap, S, { span: 7 });
    drawShopping(ctx, model, rx, bottom - shopH, rw, shopH, S);
  } else {
    drawComingUp(ctx, model, rx, top, rw, bottom, S, { span: 7 });
  }
}

export const LAYOUTS = { paper: paperLayout, timeline: timelineLayout, poster: posterLayout };
export const LAYOUT_NAMES = Object.keys(LAYOUTS);
/** Layouts that fill the frame themselves, with no themed footer legend over them. */
export const FULL_BLEED = new Set(['poster']);
export const DEFAULT_LAYOUT = 'paper';
