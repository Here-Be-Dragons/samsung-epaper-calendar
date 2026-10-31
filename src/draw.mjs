/**
 * The drawing parts the layouts are built from: header, month grid, agenda, coming up, shopping.
 * Everything is authored in design units (800 wide in portrait) and scaled by px().
 *
 * Colors: everything that carries meaning (calendar text, bars, boxes, grid) uses only the six inks
 * (see inks.mjs), so it stays solid on the panel. Calendars get one of red / green / blue / black /
 * yellow. A theme's decoration (banner, footer, bands, holiday cell backgrounds) may be any color:
 * the panel dithers it into a tint.
 *
 * A style S ({ ruleW, chrome, theme }, see styleFor) carries the chrome color and the month's theme
 * (themes.mjs); the parts hold no layout decisions, so a layout is just a choice of parts and rectangles.
 */
import { GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import * as config from './config.mjs';
import { px } from './scale.mjs';
import { BLACK, WHITE, RED, YELLOW, GREEN, BLUE } from './inks.mjs';
import { buildMonth, dayAgenda, upcomingDays } from './calendar.mjs';
import { addDays, diffDays, dayOfMonth, monthOf, fullDay, longDay, shortDay, clock } from './dates.mjs';
import { drawMotif, drawScene, drawCellDecor, stampsFor } from './themes.mjs';

export const INK = { red: RED, green: GREEN, blue: BLUE, black: BLACK, yellow: YELLOW };
/** Text color that reads on a fill of this ink. (Green is white: on the panel its green is much darker than on a screen.) */
export const ON = { red: WHITE, blue: WHITE, black: WHITE, green: WHITE, yellow: BLACK };
/** The black outline of a small color chip (a legend square, a dot): every color gets one, so a small mark stays distinct from the paper.
 * Bars and blocks get none: the inks print vibrantly on their own. */
function chipEdge(ctx, x, y, w, h) {
  ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(1, px(1)); ctx.strokeRect(x, y, w, h);
}

let fontsRegistered = false;
export function ensureFonts() {
  if (fontsRegistered) return;
  const reg = (file, family) => GlobalFonts.registerFromPath(path.join(config.FONT_DIR, file), family);
  reg('DejaVuSans.ttf', 'DejaVu Sans');
  reg('DejaVuSans-Bold.ttf', 'DejaVu Sans Bold');
  fontsRegistered = true;
}

// Font sets: a regular and a bold family. The frame being drawn uses one (picked with useFont, like useGeometry:
// frames render one at a time). More sets can be added from font files at run time with addFontSet.
const FONT_SETS = new Map([['dejavu', { regular: 'DejaVu Sans', bold: 'DejaVu Sans Bold' }]]);
let font = FONT_SETS.get('dejavu');
export const fontSetNames = () => [...FONT_SETS.keys()];
/**
 * Adds a font from files. `boldFile` may be null (bold text then uses the regular weight). A pixel font passes
 * `pixel: { em, cap }`: `em` is the font size in px at which one font pixel is one screen pixel, `cap` the capital height
 * in font pixels. Sizes then snap to whole multiples, so the pixels stay square, and text lands on whole pixels.
 */
export function addFontSet(name, regularFile, boldFile, { pixel = null } = {}) {
  GlobalFonts.registerFromPath(regularFile, name);
  if (boldFile) GlobalFonts.registerFromPath(boldFile, `${name} Bold`);
  FONT_SETS.set(name, { regular: name, bold: boldFile ? `${name} Bold` : name, pixel });
}
// The size to draw `n` design units at: a pixel font's nearest whole multiple with about the capital height DejaVu has.
const sizeFor = (n) => (font.pixel ? Math.max(1, Math.round((0.73 * px(n)) / font.pixel.cap)) * font.pixel.em : px(n));
/** Makes text on `ctx` suit the active font: whole-pixel positions for a pixel font. */
export function dressContext(ctx) {
  if (!font.pixel) return;
  const fill = ctx.fillText.bind(ctx);
  ctx.fillText = (text, x, y, maxWidth) => fill(text, Math.round(x), Math.round(y), maxWidth);
}
export function useFont(name) {
  if (!FONT_SETS.has(name)) throw new Error(`Unknown font "${name}". Available: ${fontSetNames().join(', ')}`);
  font = FONT_SETS.get(name);
}

export const F = {
  regular: (n) => `${sizeFor(n)}px "${font.regular}"`,
  bold: (n) => `bold ${sizeFor(n)}px "${font.bold}"`,
};

/**
 * The style a frame is drawn with: the month's theme (or null), the rule weight, and `art`, the
 * decoration layer's context. A frame has two layers (see quantize.mjs): decoration is drawn on `art`
 * so the quantizer can dither it; everything that is read goes on the `ctx` the layouts are given.
 */
export function styleFor(theme, art = null) {
  return { ruleW: 3, theme: theme ?? null, art };
}
const chromeFill = (S) => (S.theme ? S.theme.chrome : BLACK);
const chromeText = () => WHITE;
/** White text on a themed band, with a thin dark outline: the band is dithered, the text must not be. */
function bandText(ctx, S, text, x, y) {
  if (S.theme) { ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(2, px(3.2)); ctx.lineJoin = 'round'; ctx.strokeText(text, x, y); }
  ctx.fillStyle = chromeText(S); ctx.fillText(text, x, y);
}
/** Fills a chrome rectangle: on the art layer for a theme (it is dithered), else black on the content layer. */
function fillChrome(ctx, S, x, y, w, h) {
  const target = S.theme ? S.art : ctx;
  target.fillStyle = chromeFill(S); target.fillRect(x, y, w, h);
}
/** Height of the header and footer, in design units: a theme gets a scenic banner and a footer. */
export const headerH = (S) => (S.theme ? 126 : HEADER_H);
export const footerH = (S) => (S.theme ? 62 : 0);

export function roundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

const width = (ctx, text, font) => { ctx.font = font; return ctx.measureText(text).width; };

/**
 * The ellipsis is three small square dots, close together, about half the width of the font's own "…" (which is a full em).
 * That leaves room for a letter or two more of the text. `fit` ends a cut text with the "…" character, and `drawText` draws
 * that character as these dots. Each dot is at least 2 px, so it stays solid on the panel.
 */
function ellipsisParts(ctx) {
  const size = parseFloat(/([\d.]+)px/.exec(ctx.font)?.[1] ?? '16');
  const dot = Math.max(2, Math.round(size * 0.11)), gap = Math.max(1, Math.round(dot * 0.7));
  return { dot, gap, w: 3 * dot + 2 * gap, pad: gap + 1 };
}

/** The width of text drawn with drawText: a trailing "…" counts as the compact dots, not the font's wide glyph. */
function measure(ctx, text, font) {
  const ends = text.endsWith('…'), w = width(ctx, ends ? text.slice(0, -1) : text, font);
  if (!ends) return w;
  const e = ellipsisParts(ctx);
  return w + e.pad + e.w;
}

/** The text, or as much of its start as fits in `maxW` with the compact ellipsis after it (drawn by drawText). */
export function fit(ctx, text, font, maxW) {
  if (measure(ctx, text, font) <= maxW) return text;
  let t = text.endsWith('…') ? text.slice(0, -1) : text;
  while (t.length > 1 && measure(ctx, `${t.trimEnd()}…`, font) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Draws text from `fit` or `wrap` in the current font and fill color: a trailing "…" becomes the compact dots. */
export function drawText(ctx, text, x, y) {
  if (!text.endsWith('…')) { ctx.fillText(text, x, y); return; }
  const body = text.slice(0, -1), e = ellipsisParts(ctx);
  ctx.fillText(body, x, y);
  const x0 = Math.round(x + ctx.measureText(body).width + e.pad), y0 = Math.round(y);
  for (let i = 0; i < 3; i++) ctx.fillRect(x0 + i * (e.dot + e.gap), y0 - e.dot, e.dot, e.dot);
}

/** Wraps text into at most `maxLines` lines of `maxW`; if it does not all fit, the last line is filled with as much as fits and ends with the ellipsis. */
export function wrap(ctx, text, font, maxW, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (line && width(ctx, next, font) > maxW) {
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) { line = ''; lines[lines.length - 1] = fit(ctx, `${lines[lines.length - 1]} ${words.slice(i).join(' ')}`, font, maxW); break; } // out of lines: the rest is cut to fill this one
    } else line = next;
  }
  if (line && lines.length < maxLines) lines.push(fit(ctx, line, font, maxW));
  // A single long word can still be wider than the line.
  return lines.map((l) => fit(ctx, l, font, maxW));
}

export const MARGIN = 16;
/** The width of the white outline around the date in a themed header, in design units. */
export const WIDE_OUTLINE = 5;
export const HEADER_H = 96;
export const WEEKDAY_H = 28;

// --- Header -------------------------------------------------------------------------

/** One line with the full date, as large as fits beside the calendar legend. No "updated" clock:
 * anything that changes on its own would defeat redrawing only when the calendar changes. */
export function drawHeader(ctx, model, w, S) {
  if (S.theme) return drawThemedHeader(ctx, model, w, S);
  const x = px(MARGIN), top = px(10);
  ctx.fillStyle = BLACK; ctx.textBaseline = 'alphabetic';
  const text = fullDay(model.today);
  const legendW = Math.max(0, ...model.calendars.map((c) => width(ctx, c.ok ? c.name : `${c.name} (offline)`, F.regular(14)))) + px(18) + px(24);
  let size = 46;
  for (; size > 24; size--) if (width(ctx, text, F.bold(size)) <= w - 2 * px(MARGIN) - legendW) break;
  ctx.font = F.bold(size);
  ctx.fillText(text, x, top + px(46) + (46 - size) * px(0.3));

  // Legend: one row per calendar, right-aligned.
  const rowH = px(18);
  const cals = model.calendars;
  const startY = top + px(6) + Math.max(0, (px(80) - cals.length * rowH) / 2);
  cals.forEach((c, i) => {
    const label = c.ok ? c.name : `${c.name} (offline)`;
    ctx.font = F.regular(14);
    const lw = ctx.measureText(label).width;
    const sw = px(12);
    const rx = w - px(MARGIN) - lw - px(18);
    const y = startY + i * rowH;
    ctx.fillStyle = INK[c.color]; ctx.fillRect(rx, y + px(3), sw, sw);
    chipEdge(ctx, rx, y + px(3), sw, sw);
    ctx.fillStyle = BLACK; ctx.fillText(label, rx + px(18), y + px(14));
  });

  ctx.fillStyle = BLACK;
  ctx.fillRect(px(MARGIN), px(HEADER_H - 4), w - 2 * px(MARGIN), Math.max(1, px(S.ruleW)));
}

/** A white plate (so text on it reads) with a colored border: the white is content, the border is art. */
function plate(ctx, S, x, y, w, h, r, border) {
  roundedRect(S.art, x, y, w, h, r); S.art.strokeStyle = S.theme.chrome; S.art.lineWidth = border * 2; S.art.stroke();
  roundedRect(ctx, x, y, w, h, r); ctx.fillStyle = WHITE; ctx.fill();
}

/** The themed header: a scenic banner with the date centered on it, in black with a white outline (so it reads on
 * any art), large motifs either side of it and small ones standing on the ground. */
function drawThemedHeader(ctx, model, w, S) {
  const T = S.theme, H = px(headerH(S));
  const banner = S.images?.header; // your own header.png replaces the generated scene and its motifs
  if (banner) drawCover(S.art, banner, 0, 0, w, H); else drawScene(S.art, T, 0, 0, w, H, 1);
  ctx.textBaseline = 'alphabetic';
  const text = fullDay(model.today);
  let size = 42;
  for (; size > 24; size--) if (width(ctx, text, F.bold(size)) <= w - 2 * px(MARGIN) - px(34) - px(130)) break;
  ctx.font = F.bold(size);
  const tw = width(ctx, text, F.bold(size)), halo = px(WIDE_OUTLINE);
  // Centered across the header; over your own banner also centered down it, over the generated scene above its ground.
  const dateX = (w - tw) / 2, dateY = (banner ? (H - px(4)) / 2 : px(43)) + px(size) * 0.36;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = WHITE; ctx.lineWidth = halo; ctx.strokeText(text, dateX, dateY);
  ctx.fillStyle = BLACK; ctx.fillText(text, dateX, dateY);

  // Large motifs in the room either side of the date, small ones standing along the ground.
  const step = px(52), room = (w - tw) / 2 - halo / 2 - px(MARGIN);
  for (let i = 0; i < Math.min(2, Math.floor(room / step)); i++) {
    if (banner) break;
    const [motif, variant] = T.strip[i % T.strip.length];
    drawMotif(S.art, motif, px(MARGIN) + step / 2 + i * step, px(44), px(44), variant + i);
    const [motifR, variantR] = T.strip[(i + 2) % T.strip.length];
    drawMotif(S.art, motifR, w - px(MARGIN) - step / 2 - i * step, px(44), px(44), variantR + i);
  }
  const gstep = px(74), count = Math.floor((w - 2 * px(MARGIN)) / gstep);
  for (let i = 0; i < count && !banner; i++) {
    const [motif, variant] = T.strip[(i + 2) % T.strip.length];
    drawMotif(S.art, motif, px(MARGIN) + gstep / 2 + i * gstep, px(100) + (i % 2) * px(2), px(34), variant + i);
  }
  S.art.fillStyle = T.chrome; S.art.fillRect(0, H - px(4), w, px(4));
}

/** Draws an image to fill a box, scaled to cover it and centered (what overflows is cropped). */
function drawCover(ctx, image, x, y, w, h) {
  const k = Math.max(w / image.width, h / image.height), dw = image.width * k, dh = image.height * k;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/** The themed footer: a scenic strip along the bottom holding the calendar legend on a white plate. */
export function drawFooter(ctx, model, w, h, S) {
  if (!S.theme) return;
  const T = S.theme, F0 = px(footerH(S)), y0 = h - F0;
  const strip = S.images?.footer; // your own footer.png replaces the generated scene and its motifs
  if (strip) drawCover(S.art, strip, 0, y0, w, F0); else drawScene(S.art, T, 0, y0, w, F0, 2);
  ctx.textBaseline = 'alphabetic';
  const entries = model.calendars.map((c) => ({ c, label: c.ok ? c.name : `${c.name} (offline)` }));
  let font = 14;
  const total = () => entries.reduce((n, e) => n + px(12) + px(6) + width(ctx, e.label, F.regular(font)) + px(18), 0) - px(18);
  while (font > 10 && total() > w * 0.72) font--;
  const pw = total() + px(30), ph = px(30), px0 = (w - pw) / 2, py0 = y0 + px(10);
  plate(ctx, S, px0, py0, pw, ph, px(10), px(2.5));
  let x = px0 + px(15);
  for (const { c, label } of entries) {
    ctx.fillStyle = INK[c.color]; ctx.fillRect(x, py0 + px(9), px(12), px(12));
    chipEdge(ctx, x, py0 + px(9), px(12), px(12));
    ctx.fillStyle = BLACK; ctx.font = F.regular(font); ctx.fillText(label, x + px(18), py0 + px(20));
    x += px(12) + px(6) + width(ctx, label, F.regular(font)) + px(18);
  }
  const room = (w - pw) / 2 - px(MARGIN), step = px(48);
  for (let i = 0; i < Math.min(3, Math.floor(room / step)) && !strip; i++) {
    const [motif, variant] = T.strip[(i + 1) % T.strip.length];
    drawMotif(S.art, motif, px(MARGIN) + step / 2 + i * step, y0 + px(34), px(38), variant + i);
    const [motifR, variantR] = T.strip[(i + 4) % T.strip.length];
    drawMotif(S.art, motifR, w - px(MARGIN) - step / 2 - i * step, y0 + px(34), px(38), variantR + i);
  }
  S.art.fillStyle = T.chrome; S.art.fillRect(0, y0, w, px(4));
}

// --- Month grid -------------------------------------------------------------------------

/** One box from startX to endX, with an arrow point (continues right) or notch (continues left) at
 * either end where the event carries on into the neighbouring week. */
function barShape(ctx, { bx, bxEnd, by, h, r, tip, contL, contR }) {
  ctx.beginPath();
  ctx.moveTo(contL ? bx : bx + r, by);
  if (contR) { ctx.lineTo(bxEnd - tip, by); ctx.lineTo(bxEnd, by + h / 2); ctx.lineTo(bxEnd - tip, by + h); }
  else { ctx.lineTo(bxEnd - r, by); ctx.quadraticCurveTo(bxEnd, by, bxEnd, by + r); ctx.lineTo(bxEnd, by + h - r); ctx.quadraticCurveTo(bxEnd, by + h, bxEnd - r, by + h); }
  if (contL) { ctx.lineTo(bx, by + h); ctx.lineTo(bx + tip, by + h / 2); }
  else { ctx.lineTo(bx + r, by + h); ctx.quadraticCurveTo(bx, by + h, bx, by + h - r); ctx.lineTo(bx, by + r); ctx.quadraticCurveTo(bx, by, bx + r, by); }
  ctx.closePath();
}

/** The days of every all-day event on a calendar that asks for its days to be marked (holidays). */
function markedDays(model) {
  const marked = new Set();
  for (const ev of model.events) {
    if (!ev.allDay || !ev.cal.markDays) continue;
    for (let d = ev.startDay, n = 0; d <= ev.endDay && n < 14; n++, d = addDays(d, 1)) marked.add(d);
  }
  return marked;
}

/**
 * The month: all-day and multi-day events as bars across the days, single-day timed events as titles
 * (or, when `compact`, as a row of colored dots) in whatever rows the bars leave free.
 */
export function drawMonth(ctx, model, x, y, w, h, S, { compact = false } = {}) {
  const month = buildMonth(model);
  const weeks = month.weeks;
  const colW = w / 7;
  const wdH = px(WEEKDAY_H);
  const rowH = (h - wdH) / weeks.length;
  const NUM_H = px(compact ? 22 : 28), LINE_H = px(compact ? 20 : 21), BAR_H = px(compact ? 18 : 19);
  const dotsH = compact ? px(15) : 0;
  const capacity = Math.max(1, Math.floor((rowH - NUM_H - dotsH - px(2)) / LINE_H));
  const marked = markedDays(model);
  const stamps = stampsFor(S.theme, weeks.flatMap((wk) => wk.days), S.plan);
  const line = Math.max(1, px(1.5));

  // Weekday header.
  fillChrome(ctx, S, x, y, w, wdH);
  ctx.font = F.bold(15);
  ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].forEach((d, i) => {
    bandText(ctx, S, d, x + i * colW + (colW - ctx.measureText(d).width) / 2, y + px(19));
  });

  weeks.forEach((week, wi) => {
    const top = y + wdH + wi * rowH;
    // Cells.
    week.days.forEach((key, ci) => {
      const cx = x + ci * colW;
      const inMonth = monthOf(key) === monthOf(model.today);
      const holiday = stamps.get(key); // the theme's tinted, decorated background for a holiday
      const isToday = key === model.today;
      const motifSize = px(compact ? 24 : 30);
      if (holiday) drawCellDecor(S.art, holiday, cx, top, colW, rowH, motifSize);
      if (isToday) {
        // Today: a yellow band across the date number (not down into the events), inside a heavy black frame.
        // Yellow is the ink itself, so it never dithers. On the art layer, with the holiday's motif redrawn on top.
        const a = S.art; // the band runs out under the frame, so no sliver of paper shows between them
        a.fillStyle = YELLOW; a.fillRect(Math.floor(cx), Math.floor(top), Math.ceil(cx + colW) - Math.floor(cx), Math.round(NUM_H));
        if (holiday) drawMotif(a, holiday.motif, cx + colW - motifSize * 0.62, top + motifSize * 0.58, motifSize, holiday.variant ?? 0);
      }
      ctx.strokeStyle = BLACK; ctx.lineWidth = line; ctx.strokeRect(cx, top, colW, rowH);
      const n = String(dayOfMonth(key));
      const red = !isToday && (ci === 0 || marked.has(key));
      ctx.fillStyle = red ? RED : BLACK;
      ctx.font = inMonth || isToday ? F.bold(17) : F.regular(15);
      ctx.fillText(n, cx + px(8), top + px(20));
      if (!inMonth) { // a small tick marks days from the neighbouring months, since there is no gray to dim them with
        ctx.fillStyle = BLACK; ctx.font = F.regular(11);
        ctx.fillText(new Date(Date.UTC(2000, Number(key.slice(5, 7)) - 1, 1)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' }), cx + px(26), top + px(19));
      }
    });
    if (week.days.includes(model.today)) { // heavier frame around today
      const ci = week.days.indexOf(model.today);
      ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(2, px(3.5));
      ctx.strokeRect(x + ci * colW + px(1), top + px(1), colW - px(2), rowH - px(2));
    }

    // Multi-day and all-day bars, packed into lanes across the week. A lane is a row of the cell;
    // bars deeper than the cell has rows are not drawn and are counted in "+N more". One box runs
    // across the days of the week, over the grid lines; where the event carries on into the
    // neighbouring week it runs to the edge of the grid and ends in an arrow, and the next week
    // repeats the title.
    // A day with more entries than rows keeps its last row for "+N more", so a bar on that row is not drawn
    // either (it is counted in the "+N more" instead). Compact months show the count elsewhere and need no row.
    const entriesOn = (ci) => week.bars.filter((b) => ci >= b.startCol && ci <= b.endCol).length + (week.singles.get(week.days[ci])?.length ?? 0);
    const overflowing = week.days.map((_, ci) => !compact && entriesOn(ci) > capacity);
    const drawn = (bar) => bar.lane < capacity - (overflowing.slice(bar.startCol, bar.endCol + 1).some(Boolean) ? 1 : 0);
    for (const bar of week.bars) {
      if (!drawn(bar)) continue;
      const gap = px(2);
      const bx = x + bar.startCol * colW + (bar.contL ? 0 : gap);
      const bxEnd = x + (bar.endCol + 1) * colW - (bar.contR ? 0 : gap);
      const bw = bxEnd - bx;
      const by = top + NUM_H + bar.lane * LINE_H;
      const ink = bar.cal.color;
      const shape = { bx, bxEnd, by, h: BAR_H, r: px(5), tip: px(8), contL: bar.contL, contR: bar.contR };
      ctx.fillStyle = INK[ink]; barShape(ctx, shape); ctx.fill();
      ctx.fillStyle = ON[ink]; ctx.font = F.bold(13);
      const padL = bar.contL ? px(11) : px(6), padR = bar.contR ? px(11) : px(6);
      drawText(ctx, fit(ctx, bar.ev.title, F.bold(13), bw - padL - padR), bx + padL, by + px(14));
    }

    // Single-day timed events, in whichever rows of the day's cell the all-day bars leave free (the bars come first), each
    // as its title in black beside a thin bar in its calendar's color. When they do not all fit, a compact month shows a dot
    // for each of the rest, and the full month says in its last free row how many are hidden.
    week.days.forEach((key, ci) => {
      const evs = week.singles.get(key) ?? [];
      const covering = week.bars.filter((b) => ci >= b.startCol && ci <= b.endCol);
      const hiddenBars = covering.filter((b) => !drawn(b)).length;
      const cx = x + ci * colW;
      const taken = new Set(covering.filter(drawn).map((b) => b.lane));
      const free = Array.from({ length: capacity }, (_, i) => i).filter((i) => !taken.has(i));
      const titled = (list) => list.forEach((ev, i) => {
        // The bar starts where an all-day bar's left edge does, and the title's first letter where an all-day bar's title does.
        const ly = top + NUM_H + free[i] * LINE_H, ink = ev.cal.color, bx = cx + px(2);
        ctx.fillStyle = INK[ink]; ctx.fillRect(bx, ly + px(1), px(4), px(17));
        ctx.fillStyle = BLACK; ctx.font = F.regular(13);
        drawText(ctx, fit(ctx, ev.title, F.regular(13), colW - px(14)), cx + px(2) + px(6), ly + px(14));
      });
      if (compact) {
        const listed = evs.slice(0, free.length); // the events that fit are listed by title, the rest become dots
        titled(listed);
        const dotted = evs.slice(listed.length);
        const dot = px(8), step = px(11), avail = colW - px(12);
        ctx.font = F.bold(11);
        // As many dots as leave room for the "+N" after them, inside the cell.
        const fits = (n) => { const more = dotted.length - n + hiddenBars; return n * step + (more > 0 ? ctx.measureText(`+${more}`).width + px(2) : 0) <= avail; };
        let showDots = dotted.length;
        while (showDots > 0 && !fits(showDots)) showDots--;
        const dy = top + rowH - px(12);
        dotted.slice(0, showDots).forEach((ev, i) => {
          ctx.fillStyle = INK[ev.cal.color]; ctx.fillRect(cx + px(6) + i * step, dy, dot, dot);
          chipEdge(ctx, cx + px(6) + i * step, dy, dot, dot);
        });
        const more = dotted.length - showDots + hiddenBars;
        if (more > 0) { ctx.fillStyle = BLACK; ctx.font = F.bold(11); ctx.fillText(`+${more}`, cx + px(6) + showDots * step, dy + px(9)); }
        return;
      }
      const lanes = capacity;
      let shown = evs;
      let more = hiddenBars;
      if (evs.length + (hiddenBars ? 1 : 0) > free.length) {
        const room = Math.max(0, free.length - 1); // keep one row for "+N more"
        shown = evs.slice(0, room);
        more += evs.length - room;
      }
      titled(shown);
      if (more > 0) {
        const ly = top + NUM_H + (free[shown.length] ?? lanes - 1) * LINE_H;
        ctx.fillStyle = BLACK; ctx.font = F.bold(12);
        ctx.fillText(`+${more} more`, cx + px(6), ly + px(14));
      }
    });
  });
}

// --- Panels (agenda, coming up, shopping) ---------------------------------------------------

export function panelHeader(ctx, x, y, w, left, right = '', S) {
  const hh = px(30);
  fillChrome(ctx, S, x, y, w, hh);
  ctx.font = F.bold(16);
  bandText(ctx, S, left, x + px(8), y + px(21));
  if (S.theme) { // a motif from the theme after the title
    const [motif, variant] = S.theme.strip[left.length % S.theme.strip.length];
    drawMotif(S.art, motif, x + px(8) + ctx.measureText(left).width + px(22), y + px(15), px(24), variant);
  }
  if (right) { ctx.font = F.regular(14); bandText(ctx, S, right, x + w - px(8) - ctx.measureText(right).width, y + px(21)); }
  return y + hh;
}

/** The details of an event worth showing under its title, most useful first. */
export function detailLines(ev) {
  const lines = [];
  if (ev.location) lines.push(['Where', ev.location]);
  if (ev.conference) lines.push(['Video', ev.conference]);
  const people = [ev.organizerName && `${ev.organizerName} (organizer)`, ...ev.attendeeNames].filter(Boolean);
  if (people.length) lines.push(['With', people.length > 3 ? `${people.slice(0, 3).join(', ')} +${people.length - 3}` : people.join(', ')]);
  if (ev.description) lines.push(['Notes', ev.description]);
  if (ev.status === 'TENTATIVE') lines.push(['Status', 'Tentative']);
  return lines;
}

export function timeLabel(ev, key) {
  if (ev.allDay) return ev.endDay > ev.startDay ? [shortDay(ev.startDay).replace(/^\w+, /, ''), `– ${shortDay(ev.endDay).replace(/^\w+, /, '')}`] : ['All day', ''];
  if (ev.startDay < key) return ['until', clock(ev.end)]; // began on an earlier day
  if (ev.endDay > key) return [clock(ev.start), 'continues'];
  return [clock(ev.start), `– ${clock(ev.end)}`];
}

export function drawAgenda(ctx, model, x, y, w, h, S, { comingUp = true } = {}) {
  const bottom = y + h;
  let cy = panelHeader(ctx, x, y, w, 'TODAY', longDay(model.today), S);
  const today = dayAgenda(model, model.today);
  const timeW = px(104);
  const textX = x + px(8) + timeW;
  const textW = w - px(8) - timeW - px(8);

  const drawEntry = (ev, key, maxH) => {
    const ink = ev.cal.color;
    const detail = detailLines(ev);
    const titleLines = wrap(ctx, ev.title, F.bold(19), textW, 2);
    const titleH = titleLines.length * px(24);
    const detailRoom = Math.max(0, Math.floor((maxH - titleH - px(12)) / px(19)));
    const shown = detail.slice(0, Math.min(detail.length, detailRoom));
    const h2 = Math.max(titleH + shown.length * px(19) + px(12), px(50)); // at least the two-line time label
    if (h2 > maxH) return 0;
    ctx.fillStyle = INK[ink]; ctx.fillRect(x, cy + px(3), px(5), h2 - px(8));
    const [t1, t2] = timeLabel(ev, key);
    ctx.fillStyle = BLACK; ctx.font = F.bold(16); drawText(ctx, fit(ctx, t1, F.bold(16), timeW - px(4)), x + px(12), cy + px(22));
    ctx.font = F.regular(14); drawText(ctx, fit(ctx, t2, F.regular(14), timeW - px(4)), x + px(12), cy + px(41));
    ctx.font = F.bold(19);
    titleLines.forEach((l, i) => drawText(ctx, l, textX, cy + px(22) + i * px(24)));
    shown.forEach(([label, value], i) => {
      const ly = cy + px(22) + (titleLines.length - 1) * px(24) + px(20) + i * px(19);
      ctx.font = F.bold(14); ctx.fillText(`${label}:`, textX, ly);
      const lw = ctx.measureText(`${label}: `).width;
      ctx.font = F.regular(14); drawText(ctx, fit(ctx, value, F.regular(14), textW - lw), textX + lw, ly);
    });
    cy += h2;
    ctx.fillStyle = BLACK; ctx.fillRect(x + px(12), cy - px(3), w - px(12), 1);
    return h2;
  };

  if (!today.length) {
    ctx.fillStyle = BLACK; ctx.font = F.regular(18);
    ctx.fillText('Nothing scheduled today.', x + px(8), cy + px(30));
    cy += px(44);
  }
  let hiddenToday = 0;
  for (const ev of today) {
    const used = drawEntry(ev, model.today, bottom - cy - px(24));
    if (!used) hiddenToday += 1;
  }
  if (hiddenToday) {
    ctx.fillStyle = BLACK; ctx.font = F.bold(14);
    ctx.fillText(`+${hiddenToday} more today`, x + px(8), cy + px(18));
    cy += px(24);
  }

  if (comingUp && bottom - cy > px(70)) cy = drawComingUp(ctx, model, x, cy + px(6), w, bottom, S) ?? cy;
  return cy; // where the content ends
}

/** The next days that have anything on, a line per event, as far as the room goes. */
export function drawComingUp(ctx, model, x, y, w, bottom, S, { span = 14, title = 'COMING UP' } = {}) {
  let cy = panelHeader(ctx, x, y, w, title, '', S);
  for (const day of upcomingDays(model, model.today, span)) {
    if (cy + px(26) + px(22) > bottom) break; // a day heading needs room for at least one event under it
    ctx.fillStyle = BLACK; ctx.font = F.bold(15);
    ctx.fillText(shortDay(day.key), x + px(8), cy + px(20));
    cy += px(26);
    for (const ev of day.events) {
      if (cy + px(22) > bottom) return;
      // A multi-day event reads "Day 2/4" on its later days; its dates are in the heading of its first.
      const t1 = ev.allDay && ev.endDay > ev.startDay ? `Day ${diffDays(ev.startDay, day.key) + 1}/${diffDays(ev.startDay, ev.endDay) + 1}` : timeLabel(ev, day.key)[0];
      ctx.fillStyle = INK[ev.cal.color]; ctx.fillRect(x + px(10), cy + px(5), px(9), px(9));
      chipEdge(ctx, x + px(10), cy + px(5), px(9), px(9));
      ctx.fillStyle = BLACK; ctx.font = F.regular(14);
      ctx.fillText(t1, x + px(26), cy + px(15));
      drawText(ctx, fit(ctx, ev.title, F.regular(14), w - px(26) - px(86) - px(8)), x + px(26) + px(88), cy + px(15));
      cy += px(22);
    }
    cy += px(4);
  }
}

export function drawShopping(ctx, model, x, y, w, h, S) {
  const bottom = y + h;
  const open = model.shopping.items.filter((i) => !i.done);
  const cy = panelHeader(ctx, x, y, w, config.SHOPPING_TITLE.toUpperCase(), open.length ? `${open.length}` : '', S);
  if (model.shopping.error) {
    ctx.fillStyle = BLACK; ctx.font = F.regular(15);
    for (const [i, l] of wrap(ctx, 'List unavailable right now.', F.regular(15), w - px(16), 3).entries()) drawText(ctx, l, x + px(8), cy + px(26) + i * px(20));
    return;
  }
  if (!open.length) {
    ctx.fillStyle = BLACK; ctx.font = F.regular(16);
    ctx.fillText('Nothing needed.', x + px(8), cy + px(28));
    return;
  }
  const rowH = px(30);
  const fits = Math.max(1, Math.floor((bottom - cy - px(4)) / rowH));
  const shown = open.length > fits ? open.slice(0, fits - 1) : open;
  shown.forEach((item, i) => {
    const ly = cy + px(6) + i * rowH;
    ctx.strokeStyle = BLACK; ctx.lineWidth = Math.max(1.5, px(2));
    ctx.strokeRect(x + px(8), ly + px(5), px(15), px(15));
    ctx.fillStyle = BLACK; ctx.font = F.regular(18);
    drawText(ctx, fit(ctx, item.text, F.regular(18), w - px(8) - px(34)), x + px(32), ly + px(19));
  });
  if (open.length > shown.length) {
    ctx.font = F.bold(15); ctx.fillStyle = BLACK;
    ctx.fillText(`+${open.length - shown.length} more`, x + px(8), cy + px(6) + shown.length * rowH + px(18));
  }
}
