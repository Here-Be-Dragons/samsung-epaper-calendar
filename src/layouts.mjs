/**
 * The layouts: which parts go where. Each takes (ctx, model, { w, h, S }) with the canvas size in pixels
 * and the style (chrome color and theme, see draw.mjs styleFor), and draws a whole frame. A display
 * chooses one by name (LAYOUT, or DISPLAY_<ID>_LAYOUT, or live from Home Assistant).
 *
 *   paper     month grid like a printed wall calendar, then today's agenda and the shopping list
 *   timeline  a compact month, then today as an hour-by-hour timeline beside coming up and shopping
 */
import { BLACK } from './inks.mjs';
import { px } from './scale.mjs';
import { dayAgenda, buildMonth } from './calendar.mjs';
import { longDay, minuteOfDay, shortDay } from './dates.mjs';
import {
  INK, ON, F, MARGIN, WEEKDAY_H, headerH, footerH, outlined, fit, wrap,
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

// --- timeline: a compact month on top ------------------------------------------------------------------

/** Draws the header and a compact month; returns the y where the lower part starts. */
function compactTop(ctx, model, w, S) {
  drawHeader(ctx, model, w, S);
  const x = px(MARGIN), cw = w - 2 * px(MARGIN);
  const gridTop = px(headerH(S) + 8);
  const weeks = buildMonth(model).weeks.length;
  const gridH = px(WEEKDAY_H) + weeks * px(weeks > 5 ? 80 : 96);
  drawMonth(ctx, model, x, gridTop, cw, gridH, S, { compact: true });
  return gridTop + gridH + px(14);
}

// --- timeline: today hour by hour ---------------------------------------------------------------------

function drawTimeline(ctx, model, x, y, w, h, S) {
  const bottom = y + h;
  let cy = panelHeader(ctx, x, y, w, 'TODAY', longDay(model.today), S);
  const key = model.today;
  const list = dayAgenda(model, key);
  const allDay = list.filter((e) => e.allDay);
  const timed = list.filter((e) => !e.allDay);

  // All-day events as colored bars across the top.
  const chipH = px(22), maxChips = 4;
  allDay.slice(0, maxChips).forEach((ev) => {
    const ink = ev.cal.color;
    ctx.fillStyle = INK[ink]; ctx.fillRect(x, cy + px(4), w, chipH);
    if (outlined(ink)) { ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(1, px(1)); ctx.strokeRect(x, cy + px(4), w, chipH); }
    ctx.fillStyle = ON[ink]; ctx.font = F.bold(14);
    const span = ev.endDay > ev.startDay ? `  (${shortDay(ev.startDay).replace(/^\w+, /, '')} – ${shortDay(ev.endDay).replace(/^\w+, /, '')})` : '';
    ctx.fillText(fit(ctx, ev.title + span, F.bold(14), w - px(14)), x + px(7), cy + px(4) + px(16));
    cy += chipH + px(4);
  });
  if (allDay.length > maxChips) {
    ctx.fillStyle = BLACK; ctx.font = F.bold(13); ctx.fillText(`+${allDay.length - maxChips} more all-day`, x + px(4), cy + px(18)); cy += px(24);
  }
  cy += px(8);
  if (!timed.length) {
    ctx.fillStyle = BLACK; ctx.font = F.regular(18);
    ctx.fillText(allDay.length ? 'Nothing timed today.' : 'Nothing scheduled today.', x + px(8), cy + px(24));
    return;
  }

  // The visible hours: from an hour before the first event to an hour after the last, at least six.
  const span = timed.map((ev) => {
    const s = ev.startDay < key ? 0 : minuteOfDay(ev.start);
    let e = ev.endDay > key ? 1440 : minuteOfDay(ev.end);
    if (e <= s) e = s + 30;
    return { ev, s, e };
  }).sort((a, b) => a.s - b.s || b.e - a.e);
  let startH = Math.max(0, Math.floor(Math.min(...span.map((t) => t.s)) / 60) - 1);
  let endH = Math.min(24, Math.ceil(Math.max(...span.map((t) => t.e)) / 60) + 1);
  while (endH - startH < 6) { if (endH < 24) endH++; if (endH - startH < 6 && startH > 0) startH--; }
  const areaTop = cy, areaH = bottom - cy - px(6);
  const hourH = Math.min(px(90), areaH / (endH - startH));
  const axisW = px(46), bx0 = x + axisW, bw = w - axisW - px(2);
  const yOf = (min) => areaTop + ((min - startH * 60) / 60) * hourH;

  ctx.textBaseline = 'alphabetic';
  for (let hr = startH; hr <= endH; hr++) {
    const ly = yOf(hr * 60);
    ctx.fillStyle = BLACK; ctx.fillRect(bx0, ly, bw, 1);
    if (hr < endH) {
      ctx.font = F.regular(11);
      const label = hr === 0 ? '12 AM' : hr < 12 ? `${hr} AM` : hr === 12 ? 'Noon' : `${hr - 12} PM`;
      ctx.fillText(label, x + px(2), ly + px(11));
    }
  }
  ctx.fillRect(bx0, yOf(startH * 60), 1, (endH - startH) * hourH);

  // Overlapping events share the width: each cluster of overlaps is split into side-by-side lanes.
  const laid = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => { const lanes = Math.max(0, ...cluster.map((c) => c.lane + 1)); cluster.forEach((c) => { c.lanes = lanes; laid.push(c); }); cluster = []; };
  for (const t of span) {
    if (t.s >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.e > t.s).map((c) => c.lane));
    let lane = 0; while (used.has(lane)) lane++;
    cluster.push({ ...t, lane });
    clusterEnd = Math.max(clusterEnd < 0 || !cluster.length ? 0 : clusterEnd, t.e);
  }
  flush();

  for (const t of laid) {
    const { ev } = t, ink = ev.cal.color;
    const lw = bw / t.lanes;
    const top = yOf(t.s) + 1, bh = Math.max(px(24), yOf(t.e) - yOf(t.s) - 2);
    const bx = bx0 + t.lane * lw + px(3), bwid = lw - px(5);
    ctx.fillStyle = INK[ink]; ctx.fillRect(bx, top, bwid, bh);
    if (outlined(ink)) { ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(1, px(1)); ctx.strokeRect(bx, top, bwid, bh); }
    ctx.fillStyle = ON[ink];
    const inner = bwid - px(10);
    const titleLines = wrap(ctx, ev.title, F.bold(13), inner, Math.max(1, Math.min(3, Math.floor((bh - px(6)) / px(16)) - (bh > px(44) ? 1 : 0))));
    let ty = top + px(15);
    if (bh > px(44)) { ctx.font = F.regular(11); ctx.fillText(fit(ctx, timeLabel(ev, key).join(' ').replace('– ', '– '), F.regular(11), inner), bx + px(6), ty - px(1)); ty += px(15); }
    ctx.font = F.bold(13);
    titleLines.forEach((l) => { ctx.fillText(l, bx + px(6), ty); ty += px(16); });
    if (ev.location && ty + px(10) < top + bh) { ctx.font = F.regular(11); ctx.fillText(fit(ctx, ev.location, F.regular(11), inner), bx + px(6), ty - px(2)); }
  }
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

export const LAYOUTS = { paper: paperLayout, timeline: timelineLayout };
export const LAYOUT_NAMES = Object.keys(LAYOUTS);
export const DEFAULT_LAYOUT = 'paper';
