/**
 * Monthly themes, in full color. A theme dresses the frame around the calendar: a scenic banner behind
 * the date, a scenic footer holding the legend, the weekday band and panel headers, and a tinted,
 * decorated background on real holiday dates (Easter Sunday, Thanksgiving...). The calendar itself,
 * its text, bars and boxes, is untouched and stays white on the panel's six pure inks.
 *
 * Decoration may use any color: quantize.mjs mixes the six inks into the other colors by dithering, which
 * reads as a tint. So backgrounds are full-color gradients and pastels, and anything that must be read
 * (the date, the legend) sits on a solid white plate.
 *
 * Which theme a month gets: THEME=auto follows MONTH_THEMES below, overridden per month with
 * THEME_JAN ... THEME_DEC; THEME=none turns theming off; any theme name forces that theme.
 */
const TAU = Math.PI * 2;

export const P = {
  ink: '#140E18', white: '#FFFFFF', cream: '#FFF6DA',
  red: '#E53935', darkRed: '#B71C1C', pink: '#FF8FB3', hotPink: '#F0508A', rose: '#FFC9DA',
  lavender: '#B9A6E8', purple: '#7E57C2', blue: '#3F8FE0', navy: '#1F3A93', sky: '#8ED0F5', ice: '#DCEEFF',
  mint: '#9BE3B8', green: '#43A047', darkGreen: '#1E7B3A', lime: '#A5D65C',
  yellow: '#FFD93D', gold: '#F5B700', orange: '#FF8A1F', brown: '#7A4B24', sand: '#F2D9A0',
};
const EGGS = [P.pink, P.lavender, P.mint, P.yellow, P.sky, P.orange];

// --- Drawing helpers: every motif is drawn centered on (x, y) inside a box of size s ---------------------

const lw = (s, k) => Math.max(1, s * k);
function outline(ctx, s, k = 0.045) { ctx.strokeStyle = P.ink; ctx.lineWidth = lw(s, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
function paint(ctx, fill, s) { ctx.fillStyle = fill; ctx.fill(); outline(ctx, s); }
function circle(ctx, x, y, r, fill, s) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); paint(ctx, fill, s); }
function ellipse(ctx, x, y, rx, ry, fill, s, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); paint(ctx, fill, s); }
function dot(ctx, x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function shaded(ctx, x, y, r, light, dark) { const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1); g.addColorStop(0, light); g.addColorStop(1, dark); return g; }

function starPath(ctx, x, y, R, r, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points, rad = i % 2 ? r : R;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + 0.4 * s);
  ctx.bezierCurveTo(x + 0.62 * s, y - 0.02 * s, x + 0.34 * s, y - 0.46 * s, x, y - 0.14 * s);
  ctx.bezierCurveTo(x - 0.34 * s, y - 0.46 * s, x - 0.62 * s, y - 0.02 * s, x, y + 0.4 * s);
  ctx.closePath();
}

// --- Motifs ----------------------------------------------------------------------------------------------

const MOTIFS = {
  egg(ctx, x, y, s, v) {
    const base = EGGS[v % EGGS.length], accent = [P.white, P.hotPink, P.blue, P.purple][(v + 1) % 4];
    const path = () => { ctx.beginPath(); ctx.ellipse(x, y + s * 0.03, s * 0.33, s * 0.45, 0, 0, TAU); };
    ctx.save(); path(); ctx.clip();
    ctx.fillStyle = base; ctx.fillRect(x - s, y - s, s * 2, s * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(x - s * 0.12, y - s * 0.2, s * 0.08, s * 0.16, 0.4, 0, TAU); ctx.fill();
    const pattern = v % 3;
    if (pattern === 0) { ctx.fillStyle = accent; ctx.fillRect(x - s, y - s * 0.08, s * 2, s * 0.14); ctx.fillRect(x - s, y + s * 0.18, s * 2, s * 0.07); }
    else if (pattern === 1) {
      ctx.strokeStyle = accent; ctx.lineWidth = lw(s, 0.1); ctx.beginPath();
      for (let i = 0; i <= 6; i++) ctx[i ? 'lineTo' : 'moveTo'](x - s * 0.36 + (i * s * 0.72) / 6, y + (i % 2 ? s * 0.08 : -s * 0.08));
      ctx.stroke();
    } else { [[-0.12, -0.16], [0.12, -0.06], [-0.08, 0.14], [0.14, 0.22], [-0.16, 0.02]].forEach(([dx, dy]) => dot(ctx, x + dx * s, y + dy * s, s * 0.045, accent)); }
    ctx.restore(); path(); outline(ctx, s);
  },
  chick(ctx, x, y, s) {
    circle(ctx, x, y + s * 0.12, s * 0.3, shaded(ctx, x, y + s * 0.12, s * 0.3, '#FFF08A', P.yellow), s);
    circle(ctx, x, y - s * 0.16, s * 0.2, shaded(ctx, x, y - s * 0.16, s * 0.2, '#FFF08A', P.yellow), s);
    ctx.beginPath(); ctx.moveTo(x + s * 0.1, y - s * 0.16); ctx.lineTo(x + s * 0.26, y - s * 0.12); ctx.lineTo(x + s * 0.1, y - s * 0.08); ctx.closePath(); paint(ctx, P.orange, s);
    dot(ctx, x + s * 0.02, y - s * 0.21, s * 0.03, P.ink);
    ctx.strokeStyle = P.orange; ctx.lineWidth = lw(s, 0.05); ctx.beginPath(); ctx.moveTo(x - s * 0.08, y + s * 0.42); ctx.lineTo(x - s * 0.08, y + s * 0.5); ctx.moveTo(x + s * 0.08, y + s * 0.42); ctx.lineTo(x + s * 0.08, y + s * 0.5); ctx.stroke();
  },
  bunny(ctx, x, y, s) {
    ellipse(ctx, x - s * 0.15, y - s * 0.26, s * 0.09, s * 0.27, P.white, s, -0.12);
    ellipse(ctx, x + s * 0.15, y - s * 0.26, s * 0.09, s * 0.27, P.white, s, 0.12);
    ellipse(ctx, x - s * 0.15, y - s * 0.24, s * 0.04, s * 0.19, P.pink, s * 0.1, -0.12);
    ellipse(ctx, x + s * 0.15, y - s * 0.24, s * 0.04, s * 0.19, P.pink, s * 0.1, 0.12);
    circle(ctx, x, y + s * 0.16, s * 0.3, shaded(ctx, x, y + s * 0.16, s * 0.3, P.white, '#E8E0F0'), s);
    dot(ctx, x - s * 0.11, y + s * 0.1, s * 0.035, P.ink); dot(ctx, x + s * 0.11, y + s * 0.1, s * 0.035, P.ink);
    dot(ctx, x, y + s * 0.2, s * 0.05, P.hotPink);
    dot(ctx, x - s * 0.18, y + s * 0.2, s * 0.05, 'rgba(255,143,179,0.7)'); dot(ctx, x + s * 0.18, y + s * 0.2, s * 0.05, 'rgba(255,143,179,0.7)');
    ctx.strokeStyle = P.ink; ctx.lineWidth = lw(s, 0.025); ctx.beginPath();
    ctx.moveTo(x - s * 0.1, y + s * 0.25); ctx.lineTo(x - s * 0.34, y + s * 0.22); ctx.moveTo(x + s * 0.1, y + s * 0.25); ctx.lineTo(x + s * 0.34, y + s * 0.22); ctx.stroke();
  },
  flower(ctx, x, y, s, v) {
    const petal = [P.hotPink, P.lavender, P.yellow, P.sky, P.orange][v % 5], center = petal === P.yellow ? P.orange : P.yellow;
    ctx.strokeStyle = P.green; ctx.lineWidth = lw(s, 0.06); ctx.beginPath(); ctx.moveTo(x, y + s * 0.1); ctx.lineTo(x, y + s * 0.5); ctx.stroke();
    ellipse(ctx, x + s * 0.12, y + s * 0.36, s * 0.12, s * 0.05, P.lime, s * 0.5, -0.5);
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * TAU) / 5; circle(ctx, x + Math.cos(a) * s * 0.2, y + Math.sin(a) * s * 0.2, s * 0.16, petal, s); }
    circle(ctx, x, y, s * 0.12, center, s);
  },
  tulip(ctx, x, y, s, v) {
    const c = [P.red, P.hotPink, P.yellow, P.lavender][v % 4];
    ctx.strokeStyle = P.green; ctx.lineWidth = lw(s, 0.07); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s * 0.5); ctx.stroke();
    ellipse(ctx, x - s * 0.1, y + s * 0.34, s * 0.12, s * 0.05, P.lime, s * 0.5, -0.7); ellipse(ctx, x + s * 0.1, y + s * 0.34, s * 0.12, s * 0.05, P.lime, s * 0.5, 0.7);
    ctx.beginPath(); ctx.moveTo(x - s * 0.22, y - s * 0.28); ctx.quadraticCurveTo(x - s * 0.25, y + s * 0.08, x, y + s * 0.12); ctx.quadraticCurveTo(x + s * 0.25, y + s * 0.08, x + s * 0.22, y - s * 0.28);
    ctx.lineTo(x + s * 0.08, y - s * 0.12); ctx.lineTo(x, y - s * 0.32); ctx.lineTo(x - s * 0.08, y - s * 0.12); ctx.closePath(); paint(ctx, c, s);
  },
  butterfly(ctx, x, y, s, v) {
    const a = [P.orange, P.hotPink, P.sky, P.lavender][v % 4], b = [P.yellow, P.lavender, P.mint, P.pink][v % 4];
    for (const m of [1, -1]) {
      ctx.save(); ctx.translate(x, y); ctx.scale(m, 1);
      ellipse(ctx, s * 0.22, -s * 0.16, s * 0.2, s * 0.26, a, s, 0.6); ellipse(ctx, s * 0.17, s * 0.2, s * 0.14, s * 0.18, b, s, -0.5);
      dot(ctx, s * 0.24, -s * 0.2, s * 0.05, P.white);
      ctx.restore();
    }
    ellipse(ctx, x, y, s * 0.045, s * 0.26, P.ink, s * 0.1);
    ctx.strokeStyle = P.ink; ctx.lineWidth = lw(s, 0.03); ctx.beginPath(); ctx.moveTo(x, y - s * 0.24); ctx.quadraticCurveTo(x - s * 0.1, y - s * 0.42, x - s * 0.16, y - s * 0.4); ctx.moveTo(x, y - s * 0.24); ctx.quadraticCurveTo(x + s * 0.1, y - s * 0.42, x + s * 0.16, y - s * 0.4); ctx.stroke();
  },
  heart(ctx, x, y, s, v) {
    heartPath(ctx, x, y, s);
    const g = ctx.createLinearGradient(x - s * 0.4, y - s * 0.4, x + s * 0.4, y + s * 0.4);
    const pair = [[P.pink, P.red], [P.rose, P.hotPink], [P.hotPink, P.darkRed]][v % 3];
    g.addColorStop(0, pair[0]); g.addColorStop(1, pair[1]); paint(ctx, g, s);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x - s * 0.2, y - s * 0.12, s * 0.07, s * 0.1, 0.7, 0, TAU); ctx.fill();
  },
  shamrock(ctx, x, y, s) {
    ctx.strokeStyle = P.darkGreen; ctx.lineWidth = lw(s, 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.05); ctx.quadraticCurveTo(x + s * 0.05, y + s * 0.3, x + s * 0.18, y + s * 0.44); ctx.stroke();
    for (const a of [0, TAU / 3, (2 * TAU) / 3]) {
      ctx.save(); ctx.translate(x, y + s * 0.05); ctx.rotate(a + Math.PI); heartPath(ctx, 0, s * 0.22, s * 0.62);
      const g = ctx.createLinearGradient(0, 0, 0, s * 0.5); g.addColorStop(0, P.lime); g.addColorStop(1, P.green); paint(ctx, g, s); ctx.restore();
    }
  },
  rainbow(ctx, x, y, s) {
    const bands = [P.red, P.orange, P.yellow, P.green, P.blue, P.purple];
    ctx.lineCap = 'butt';
    bands.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = s * 0.075; ctx.beginPath(); ctx.arc(x, y + s * 0.2, s * (0.42 - i * 0.065), Math.PI, 0); ctx.stroke(); });
    for (const dx of [-0.46, 0.46]) {
      ctx.fillStyle = P.white; ctx.beginPath(); ctx.arc(x + dx * s * 0.9, y + s * 0.26, s * 0.12, 0, TAU); ctx.arc(x + dx * s * 0.78, y + s * 0.24, s * 0.1, 0, TAU); ctx.fill();
    }
  },
  coin(ctx, x, y, s) {
    circle(ctx, x, y, s * 0.3, shaded(ctx, x, y, s * 0.3, '#FFE680', P.gold), s);
    ctx.strokeStyle = '#C48A00'; ctx.lineWidth = lw(s, 0.04); ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, TAU); ctx.stroke();
  },
  pumpkin(ctx, x, y, s) {
    ctx.fillStyle = P.green; ctx.fillRect(x - s * 0.05, y - s * 0.42, s * 0.1, s * 0.14);
    ctx.strokeStyle = P.ink; ctx.lineWidth = lw(s, 0.04); ctx.strokeRect(x - s * 0.05, y - s * 0.42, s * 0.1, s * 0.14);
    ellipse(ctx, x - s * 0.22, y + s * 0.04, s * 0.22, s * 0.34, shaded(ctx, x - s * 0.22, y, s * 0.3, '#FFB347', P.orange), s);
    ellipse(ctx, x + s * 0.22, y + s * 0.04, s * 0.22, s * 0.34, shaded(ctx, x + s * 0.22, y, s * 0.3, '#FFB347', P.orange), s);
    ellipse(ctx, x, y + s * 0.04, s * 0.24, s * 0.36, shaded(ctx, x, y, s * 0.34, '#FFB347', '#F57C00'), s);
    ctx.fillStyle = P.ink;
    for (const dx of [-0.12, 0.12]) { ctx.beginPath(); ctx.moveTo(x + dx * s, y - s * 0.08); ctx.lineTo(x + (dx - 0.06) * s, y + s * 0.03); ctx.lineTo(x + (dx + 0.06) * s, y + s * 0.03); ctx.closePath(); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(x - s * 0.15, y + s * 0.13);
    for (let i = 1; i <= 6; i++) ctx.lineTo(x - s * 0.15 + (i * s * 0.3) / 6, y + s * (i % 2 ? 0.23 : 0.13));
    ctx.closePath(); ctx.fill();
  },
  ghost(ctx, x, y, s) {
    ctx.beginPath(); ctx.moveTo(x - s * 0.3, y + s * 0.42); ctx.lineTo(x - s * 0.3, y - s * 0.08);
    ctx.arc(x, y - s * 0.08, s * 0.3, Math.PI, 0);
    ctx.lineTo(x + s * 0.3, y + s * 0.42);
    for (let i = 0; i < 3; i++) ctx.quadraticCurveTo(x + s * (0.2 - i * 0.2), y + s * 0.28, x + s * (0.1 - i * 0.2), y + s * 0.42);
    ctx.closePath();
    const g = ctx.createLinearGradient(x, y - s * 0.4, x, y + s * 0.42); g.addColorStop(0, P.white); g.addColorStop(1, '#D9D2EE'); paint(ctx, g, s);
    ellipse(ctx, x - s * 0.11, y - s * 0.1, s * 0.05, s * 0.07, P.ink, s * 0.2);
    ellipse(ctx, x + s * 0.11, y - s * 0.1, s * 0.05, s * 0.07, P.ink, s * 0.2);
    ellipse(ctx, x, y + s * 0.1, s * 0.05, s * 0.07, P.ink, s * 0.2);
    dot(ctx, x - s * 0.19, y + s * 0.02, s * 0.04, 'rgba(255,143,179,0.7)'); dot(ctx, x + s * 0.19, y + s * 0.02, s * 0.04, 'rgba(255,143,179,0.7)');
  },
  bat(ctx, x, y, s) {
    ctx.fillStyle = '#1B1030'; ctx.strokeStyle = P.lavender; ctx.lineWidth = lw(s, 0.06); ctx.lineJoin = 'round';
    for (const m of [1, -1]) {
      ctx.beginPath(); ctx.moveTo(x, y - s * 0.05);
      ctx.quadraticCurveTo(x + m * s * 0.2, y - s * 0.4, x + m * s * 0.5, y - s * 0.12);
      ctx.quadraticCurveTo(x + m * s * 0.42, y + s * 0.02, x + m * s * 0.34, y + s * 0.04);
      ctx.quadraticCurveTo(x + m * s * 0.28, y + s * 0.14, x + m * s * 0.2, y + s * 0.06);
      ctx.quadraticCurveTo(x + m * s * 0.1, y + s * 0.2, x, y + s * 0.16); ctx.closePath(); ctx.stroke(); ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.09, s * 0.14, 0, 0, TAU); ctx.stroke(); ctx.fill();
    dot(ctx, x - s * 0.035, y - s * 0.02, s * 0.025, P.yellow); dot(ctx, x + s * 0.035, y - s * 0.02, s * 0.025, P.yellow);
  },
  moon(ctx, x, y, s) {
    ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, TAU);
    const g = ctx.createRadialGradient(x - s * 0.1, y - s * 0.1, s * 0.05, x, y, s * 0.4); g.addColorStop(0, '#FFF6B0'); g.addColorStop(1, P.yellow); ctx.fillStyle = g; ctx.fill();
    for (const [dx, dy, r] of [[-0.12, -0.1, 0.07], [0.14, 0.1, 0.09], [-0.05, 0.18, 0.05]]) dot(ctx, x + dx * s, y + dy * s, r * s, 'rgba(200,160,0,0.35)');
  },
  acorn(ctx, x, y, s) {
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.12, s * 0.2, s * 0.28, 0, 0, TAU); paint(ctx, '#C98A3D', s);
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.12, s * 0.26, s * 0.16, 0, Math.PI, 0); ctx.closePath(); paint(ctx, P.brown, s);
    ctx.strokeStyle = P.ink; ctx.lineWidth = lw(s, 0.06); ctx.beginPath(); ctx.moveTo(x, y - s * 0.28); ctx.lineTo(x + s * 0.04, y - s * 0.4); ctx.stroke();
  },
  tree(ctx, x, y, s, v) {
    ctx.fillStyle = P.brown; ctx.fillRect(x - s * 0.06, y + s * 0.3, s * 0.12, s * 0.14);
    [[0.04, 0.4, P.darkGreen], [-0.1, 0.34, P.green], [-0.22, 0.26, P.lime]].forEach(([dy, half, c]) => {
      const bottom = dy + 0.3 - (half === 0.26 ? 0.04 : 0);
      ctx.beginPath(); ctx.moveTo(x, y + s * (dy - 0.18)); ctx.lineTo(x + s * half, y + s * bottom); ctx.lineTo(x - s * half, y + s * bottom); ctx.closePath(); paint(ctx, c, s);
    });
    starPath(ctx, x, y - s * 0.4, s * 0.13, s * 0.055); paint(ctx, P.gold, s * 0.6);
    [[-0.12, 0.2, P.red], [0.14, 0.12, P.sky], [-0.03, -0.02, v % 2 ? P.yellow : P.hotPink], [0.04, -0.2, P.red], [0.18, 0.26, P.yellow]].forEach(([dx, dy, c]) => dot(ctx, x + dx * s, y + dy * s, s * 0.05, c));
  },
  ornament(ctx, x, y, s, v) {
    ctx.fillStyle = P.gold; ctx.fillRect(x - s * 0.07, y - s * 0.4, s * 0.14, s * 0.12);
    ctx.strokeStyle = P.gold; ctx.lineWidth = lw(s, 0.03); ctx.beginPath(); ctx.arc(x, y - s * 0.44, s * 0.05, 0, TAU); ctx.stroke();
    const [a, b] = [[P.red, P.darkRed], [P.sky, P.blue], [P.gold, '#C48A00']][v % 3];
    circle(ctx, x, y + s * 0.02, s * 0.32, shaded(ctx, x, y + s * 0.02, s * 0.32, a, b), s);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = lw(s, 0.05); ctx.beginPath(); ctx.arc(x, y + s * 0.02, s * 0.22, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  },
  star(ctx, x, y, s, v) {
    const [a, b] = [[P.gold, P.yellow], [P.red, P.hotPink], [P.blue, P.sky]][v % 3];
    starPath(ctx, x, y, s * 0.5, s * 0.21);
    const g = ctx.createLinearGradient(x, y - s * 0.5, x, y + s * 0.5); g.addColorStop(0, b); g.addColorStop(1, a); paint(ctx, g, s);
  },
  snowflake(ctx, x, y, s, v) {
    ctx.strokeStyle = v % 2 ? '#7AB8EE' : P.blue; ctx.lineWidth = lw(s, 0.075); ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.translate(x, y); ctx.rotate((i * TAU) / 6);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.46, 0);
      ctx.moveTo(s * 0.26, 0); ctx.lineTo(s * 0.38, s * 0.11); ctx.moveTo(s * 0.26, 0); ctx.lineTo(s * 0.38, -s * 0.11);
      ctx.stroke(); ctx.restore();
    }
  },
  snowman(ctx, x, y, s) {
    const white = (cx, cy, r) => circle(ctx, cx, cy, r, shaded(ctx, cx, cy, r, P.white, '#D6E6F5'), s);
    white(x, y + s * 0.22, s * 0.25); white(x, y - s * 0.1, s * 0.19); white(x, y - s * 0.34, s * 0.14);
    ctx.fillStyle = P.ink; ctx.fillRect(x - s * 0.13, y - s * 0.5, s * 0.26, s * 0.06); ctx.fillRect(x - s * 0.08, y - s * 0.62, s * 0.16, s * 0.14);
    ctx.fillStyle = P.red; ctx.fillRect(x - s * 0.16, y - s * 0.22, s * 0.32, s * 0.07); ctx.fillRect(x + s * 0.08, y - s * 0.16, s * 0.06, s * 0.14);
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.34); ctx.lineTo(x + s * 0.14, y - s * 0.31); ctx.lineTo(x, y - s * 0.28); ctx.closePath(); ctx.fillStyle = P.orange; ctx.fill();
    dot(ctx, x - s * 0.05, y - s * 0.37, s * 0.02, P.ink); dot(ctx, x + s * 0.05, y - s * 0.37, s * 0.02, P.ink);
    dot(ctx, x, y - s * 0.05, s * 0.025, P.ink); dot(ctx, x, y + s * 0.08, s * 0.025, P.ink);
  },
  gift(ctx, x, y, s, v) {
    const [box, rib] = [[P.red, P.gold], [P.blue, P.yellow], [P.green, P.red]][v % 3];
    ctx.fillStyle = box; ctx.fillRect(x - s * 0.32, y - s * 0.12, s * 0.64, s * 0.46);
    ctx.strokeStyle = P.ink; ctx.lineWidth = lw(s, 0.045); ctx.strokeRect(x - s * 0.32, y - s * 0.12, s * 0.64, s * 0.46);
    ctx.fillStyle = rib; ctx.fillRect(x - s * 0.06, y - s * 0.12, s * 0.12, s * 0.46); ctx.fillRect(x - s * 0.32, y + s * 0.08, s * 0.64, s * 0.1);
    ellipse(ctx, x - s * 0.1, y - s * 0.2, s * 0.1, s * 0.07, rib, s, -0.4); ellipse(ctx, x + s * 0.1, y - s * 0.2, s * 0.1, s * 0.07, rib, s, 0.4);
  },
  candycane(ctx, x, y, s) {
    const path = () => { ctx.beginPath(); ctx.moveTo(x + s * 0.12, y + s * 0.44); ctx.lineTo(x + s * 0.12, y - s * 0.12); ctx.arc(x - s * 0.06, y - s * 0.12, s * 0.18, 0, Math.PI, true); };
    ctx.lineCap = 'round';
    ctx.strokeStyle = P.ink; ctx.lineWidth = lw(s, 0.25); path(); ctx.stroke();
    ctx.strokeStyle = P.white; ctx.lineWidth = lw(s, 0.17); path(); ctx.stroke();
    ctx.strokeStyle = P.red; ctx.lineWidth = lw(s, 0.17); ctx.setLineDash([s * 0.09, s * 0.11]); path(); ctx.stroke(); ctx.setLineDash([]);
  },
  sun(ctx, x, y, s) {
    ctx.lineCap = 'round'; ctx.strokeStyle = P.orange; ctx.lineWidth = lw(s, 0.08);
    for (let i = 0; i < 10; i++) {
      const a = (i * TAU) / 10;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 0.32, y + Math.sin(a) * s * 0.32); ctx.lineTo(x + Math.cos(a) * s * (i % 2 ? 0.44 : 0.5), y + Math.sin(a) * s * (i % 2 ? 0.44 : 0.5)); ctx.stroke();
    }
    circle(ctx, x, y, s * 0.26, shaded(ctx, x, y, s * 0.26, '#FFF28A', P.yellow), s);
  },
  wave(ctx, x, y, s) {
    ctx.lineCap = 'round';
    [[-0.12, P.sky], [0.14, P.blue]].forEach(([dy, c]) => {
      ctx.strokeStyle = c; ctx.lineWidth = lw(s, 0.14); ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const t = i / 24; ctx[i ? 'lineTo' : 'moveTo'](x - s * 0.46 + t * s * 0.92, y + s * dy + Math.sin(t * TAU * 1.5) * s * 0.1); }
      ctx.stroke();
    });
  },
  palm(ctx, x, y, s) {
    ctx.strokeStyle = P.brown; ctx.lineWidth = lw(s, 0.09); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - s * 0.05, y + s * 0.46); ctx.quadraticCurveTo(x + s * 0.12, y + s * 0.1, x + s * 0.04, y - s * 0.16); ctx.stroke();
    for (const a of [-2.7, -2.2, -1.57, -0.9, -0.4, 0.3]) {
      ctx.save(); ctx.translate(x + s * 0.04, y - s * 0.16); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.2, -s * 0.16, s * 0.42, s * 0.04); ctx.quadraticCurveTo(s * 0.2, -s * 0.04, 0, 0); ctx.closePath(); paint(ctx, P.green, s * 0.7); ctx.restore();
    }
    dot(ctx, x + s * 0.02, y - s * 0.14, s * 0.05, P.brown);
  },
  beachball(ctx, x, y, s) {
    const cols = [P.red, P.white, P.yellow, P.white, P.blue, P.white];
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, s * 0.34, 0, TAU); ctx.clip();
    cols.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, s * 0.5, (i * TAU) / 6, ((i + 1) * TAU) / 6); ctx.closePath(); ctx.fill(); });
    ctx.restore(); ctx.beginPath(); ctx.arc(x, y, s * 0.34, 0, TAU); outline(ctx, s);
  },
  leaf(ctx, x, y, s, v) {
    const [a, b] = [[P.red, P.darkRed], [P.orange, '#C25E00'], [P.yellow, P.gold], [P.brown, '#4E2E12']][v % 4];
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.46);
    ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.1, x, y + s * 0.38); ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.1, x, y - s * 0.46); ctx.closePath();
    const g = ctx.createLinearGradient(x, y - s * 0.4, x, y + s * 0.4); g.addColorStop(0, a); g.addColorStop(1, b); paint(ctx, g, s);
    ctx.strokeStyle = P.ink; ctx.lineWidth = lw(s, 0.035); ctx.beginPath(); ctx.moveTo(x, y - s * 0.3); ctx.lineTo(x, y + s * 0.48); ctx.stroke();
  },
  apple(ctx, x, y, s) {
    circle(ctx, x - s * 0.1, y + s * 0.08, s * 0.27, shaded(ctx, x - s * 0.1, y + s * 0.08, s * 0.27, '#FF7B72', P.red), s);
    circle(ctx, x + s * 0.1, y + s * 0.08, s * 0.27, shaded(ctx, x + s * 0.1, y + s * 0.08, s * 0.27, '#FF7B72', P.red), s);
    ctx.fillStyle = P.red; ctx.fillRect(x - s * 0.12, y - s * 0.1, s * 0.24, s * 0.3);
    ctx.strokeStyle = P.brown; ctx.lineWidth = lw(s, 0.05); ctx.beginPath(); ctx.moveTo(x, y - s * 0.12); ctx.lineTo(x + s * 0.04, y - s * 0.34); ctx.stroke();
    ellipse(ctx, x + s * 0.17, y - s * 0.3, s * 0.14, s * 0.07, P.lime, s, -0.4);
  },
  pencil(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 5);
    ctx.fillStyle = P.yellow; ctx.fillRect(-s * 0.09, -s * 0.34, s * 0.18, s * 0.6);
    ctx.fillStyle = '#E0A800'; ctx.fillRect(-s * 0.09, -s * 0.34, s * 0.05, s * 0.6);
    ctx.fillStyle = P.pink; ctx.fillRect(-s * 0.09, -s * 0.46, s * 0.18, s * 0.12);
    ctx.fillStyle = '#B0B8C4'; ctx.fillRect(-s * 0.09, -s * 0.36, s * 0.18, s * 0.03);
    ctx.beginPath(); ctx.moveTo(-s * 0.09, s * 0.26); ctx.lineTo(0, s * 0.46); ctx.lineTo(s * 0.09, s * 0.26); ctx.closePath(); ctx.fillStyle = '#F3D9B1'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.04, s * 0.37); ctx.lineTo(0, s * 0.46); ctx.lineTo(s * 0.04, s * 0.37); ctx.closePath(); ctx.fillStyle = P.ink; ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = lw(s, 0.04); ctx.strokeRect(-s * 0.09, -s * 0.46, s * 0.18, s * 0.72);
    ctx.beginPath(); ctx.moveTo(-s * 0.09, s * 0.26); ctx.lineTo(0, s * 0.46); ctx.lineTo(s * 0.09, s * 0.26); ctx.stroke();
    ctx.restore();
  },
  book(ctx, x, y, s, v) {
    const cover = [P.blue, P.red, P.green][v % 3];
    ctx.fillStyle = cover; ctx.fillRect(x - s * 0.34, y - s * 0.3, s * 0.68, s * 0.6);
    ctx.fillStyle = P.cream; ctx.fillRect(x - s * 0.26, y - s * 0.24, s * 0.56, s * 0.46);
    ctx.fillStyle = '#E8DDB5'; ctx.fillRect(x - s * 0.26, y + s * 0.22, s * 0.56, s * 0.04);
    ctx.strokeStyle = '#9AA8C0'; ctx.lineWidth = lw(s, 0.03);
    for (const dy of [-0.14, -0.05, 0.04, 0.13]) { ctx.beginPath(); ctx.moveTo(x - s * 0.18, y + dy * s); ctx.lineTo(x + s * 0.22, y + dy * s); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - s * 0.34, y - s * 0.3, s * 0.07, s * 0.6);
    ctx.strokeStyle = P.ink; ctx.lineWidth = lw(s, 0.045); ctx.strokeRect(x - s * 0.34, y - s * 0.3, s * 0.68, s * 0.6);
  },
  fireworks(ctx, x, y, s, v) {
    ctx.lineCap = 'round';
    const cols = v % 2 ? [P.gold, P.sky] : [P.red, P.blue];
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12, long = i % 2 === 0, c = cols[i % 2];
      ctx.strokeStyle = c; ctx.lineWidth = lw(s, 0.07);
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 0.14, y + Math.sin(a) * s * 0.14); ctx.lineTo(x + Math.cos(a) * s * (long ? 0.5 : 0.38), y + Math.sin(a) * s * (long ? 0.5 : 0.38)); ctx.stroke();
      dot(ctx, x + Math.cos(a) * s * (long ? 0.5 : 0.38), y + Math.sin(a) * s * (long ? 0.5 : 0.38), s * 0.04, c);
    }
    circle(ctx, x, y, s * 0.08, P.gold, s * 0.5);
  },
};

export const MOTIF_NAMES = Object.keys(MOTIFS);

// Pictures to draw instead of a generated motif (your own PNGs, see themeArt.mjs). Set per frame by the renderer, like
// the geometry: frames render one at a time.
let motifImages = new Map();
export const useMotifImages = (images) => { motifImages = images ?? new Map(); };

/** Draws a motif centered on (x, y) within a box of size s; `variant` picks its colors or pattern. */
export function drawMotif(ctx, name, x, y, s, variant = 0) {
  const image = motifImages.get(name);
  if (image) { // your own picture, fitted into the box
    const k = s / Math.max(image.width, image.height);
    ctx.drawImage(image, x - (image.width * k) / 2, y - (image.height * k) / 2, image.width * k, image.height * k);
    return;
  }
  const draw = MOTIFS[name];
  if (!draw) return;
  ctx.save();
  draw(ctx, x, y, s, variant);
  ctx.restore();
}

// --- Scenery: gradient sky, scattered pattern, rolling ground -------------------------------------------------

/** A small deterministic random sequence, so a banner looks the same every time it is drawn. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seedOf = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function scatter(ctx, theme, x, y, w, h, seed) {
  const pat = theme.pattern;
  if (!pat) return;
  const rnd = rng(seedOf(theme.name) + seed);
  const count = Math.round((w * h) / pat.density);
  for (let i = 0; i < count; i++) {
    const px = x + rnd() * w, py = y + rnd() * h, c = pat.colors[Math.floor(rnd() * pat.colors.length)], r = (0.7 + rnd() * 0.8) * pat.size;
    ctx.fillStyle = c; ctx.strokeStyle = c;
    switch (pat.kind) {
      case 'dots': ctx.beginPath(); ctx.arc(px, py, r * 0.5, 0, TAU); ctx.fill(); break;
      case 'confetti': ctx.save(); ctx.translate(px, py); ctx.rotate(rnd() * TAU); ctx.fillRect(-r * 0.6, -r * 0.2, r * 1.2, r * 0.4); ctx.restore(); break;
      case 'snow': ctx.beginPath(); ctx.arc(px, py, r * 0.45, 0, TAU); ctx.fill(); break;
      case 'stars': starPath(ctx, px, py, r * 0.8, r * 0.34); ctx.fill(); break;
      case 'hearts': heartPath(ctx, px, py, r * 1.6); ctx.fill(); break;
      case 'leaves': ctx.save(); ctx.translate(px, py); ctx.rotate(rnd() * TAU); ctx.beginPath(); ctx.ellipse(0, 0, r * 0.9, r * 0.45, 0, 0, TAU); ctx.fill(); ctx.restore(); break;
      case 'clover': ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = (k * TAU) / 3; ctx.moveTo(px, py); ctx.arc(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.5, r * 0.5, 0, TAU); } ctx.fill(); break;
      default: break;
    }
  }
  if (pat.kind === 'lines') { // ruled notebook paper with a red margin
    ctx.strokeStyle = pat.colors[0]; ctx.lineWidth = Math.max(1, w / 400);
    for (let ly = y + h * 0.22; ly < y + h; ly += h * 0.2) { ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w, ly); ctx.stroke(); }
    ctx.strokeStyle = pat.colors[1]; ctx.lineWidth = Math.max(1, w / 300); ctx.beginPath(); ctx.moveTo(x + w * 0.06, y); ctx.lineTo(x + w * 0.06, y + h); ctx.stroke();
  }
}

function ground(ctx, theme, x, y, w, h) {
  const g = theme.ground;
  if (!g) return;
  const top = y + h * (1 - g.height);
  const hills = (base, amp, phase, color) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y + h);
    for (let i = 0; i <= 40; i++) { const t = i / 40; ctx.lineTo(x + t * w, base + Math.sin(t * TAU * 1.6 + phase) * amp); }
    ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
  };
  if (g.kind === 'hills') { hills(top + h * 0.1, h * 0.06, 0.6, g.colors[0]); hills(top + h * 0.2, h * 0.06, 2.4, g.colors[1]); }
  else if (g.kind === 'snow') { hills(top + h * 0.08, h * 0.07, 0.3, g.colors[0]); hills(top + h * 0.22, h * 0.06, 2.2, g.colors[1]); }
  else if (g.kind === 'waves') {
    for (const [i, c] of g.colors.entries()) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y + h); for (let k = 0; k <= 60; k++) { const t = k / 60; ctx.lineTo(x + t * w, top + h * (0.08 + i * 0.12) + Math.sin(t * TAU * 5 + i * 1.7) * h * 0.04); } ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill(); }
  } else if (g.kind === 'stripes') {
    const bands = 5, bh = (y + h - top) / bands;
    for (let i = 0; i < bands; i++) { ctx.fillStyle = i % 2 ? g.colors[1] : g.colors[0]; ctx.fillRect(x, top + i * bh, w, bh + 1); }
  }
}

/** Where the ground starts in a banner of height h, for standing motifs on it. */
export const groundLine = (theme, y, h) => y + h * (1 - (theme.ground?.height ?? 0.2)) + h * 0.1;

/** A scenic banner: gradient sky, scattered pattern, and ground along the bottom. */
export function drawScene(ctx, theme, x, y, w, h, seed = 1) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, theme.bg[0]); g.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  scatter(ctx, theme, x, y, w, h, seed);
  ground(ctx, theme, x, y, w, h);
}

/** Tint, speckle and a corner motif for a holiday's day cell (the cell stays white where it is read). */
export function drawCellDecor(ctx, mark, x, y, w, h, motifSize) {
  ctx.fillStyle = mark.bg; ctx.fillRect(x, y, w, h);
  const rnd = rng(seedOf(mark.motif) + Math.round(x + y));
  ctx.fillStyle = mark.deco[0];
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = mark.deco[i % mark.deco.length];
    const px = x + rnd() * w, py = y + h * 0.3 + rnd() * h * 0.7;
    if (mark.speckle === 'stars') { starPath(ctx, px, py, 3.2, 1.4); ctx.fill(); } else { ctx.beginPath(); ctx.arc(px, py, 1.8 + rnd() * 1.8, 0, TAU); ctx.fill(); }
  }
  drawMotif(ctx, mark.motif, x + w - motifSize * 0.62, y + motifSize * 0.58, motifSize, mark.variant ?? 0);
}

// --- Dates for the marks ---------------------------------------------------------------------------------

const key = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Easter Sunday (the anonymous Gregorian algorithm). */
export function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return key(y, month, day);
}

/** The nth (1-based) given weekday (0 = Sunday) of a month (1-12): Thanksgiving is (11, 4, 4). */
export function nthWeekday(y, month, weekday, n) {
  const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
  return key(y, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}

// --- Themes ----------------------------------------------------------------------------------------------

const mark = (motif, bg, deco, extra = {}) => ({ motif, bg, deco, ...extra });

/**
 * chrome:  band color for the weekday row and panel headers (dark enough for white text).
 * bg:      [top, bottom] gradient of the banner and footer.
 * pattern: scattered shapes on the sky ({ kind, colors, size, density }, density = px² per shape).
 * ground:  { kind: hills | snow | waves | stripes, colors, height } along the bottom.
 * strip:   [motif, variant] pairs: the large ones in the header, repeated, and the footer's sides.
 * marks:   (year) => { 'YYYY-MM-DD': mark } the holiday's tinted, decorated cell.
 */
export const THEMES = {
  winter: {
    label: 'Winter', chrome: '#2F6DB5', bg: ['#8FC3EE', '#E4F2FD'],
    pattern: { kind: 'snow', colors: ['#FFFFFF'], size: 7, density: 1400 }, ground: { kind: 'snow', colors: ['#CFE4F5', '#FFFFFF'], height: 0.34 },
    strip: [['snowman', 0], ['snowflake', 0], ['tree', 2], ['snowflake', 1]],
    marks: (y) => ({ [key(y, 1, 1)]: mark('star', '#E5F1FC', ['#9CC9F0', '#FFFFFF'], { speckle: 'stars' }), [nthWeekday(y, 1, 1, 3)]: mark('snowflake', '#EAF4FD', ['#9CC9F0', '#FFFFFF']) }),
  },
  valentine: {
    label: "Valentine's Day", chrome: '#C2185B', bg: ['#FFB3CE', '#FFE3EE'],
    pattern: { kind: 'hearts', colors: ['#FF7FA8', '#FFFFFF', '#F0508A'], size: 10, density: 1300 }, ground: null,
    strip: [['heart', 0], ['heart', 1], ['flower', 0], ['heart', 2]],
    marks: (y) => ({ [key(y, 2, 14)]: mark('heart', '#FFD9E6', ['#F0508A', '#FF9DBE', '#FFFFFF'], { speckle: 'hearts' }) }),
  },
  shamrock: {
    label: "St. Patrick's Day", chrome: '#1B7F3B', bg: ['#A8E0A0', '#E6F7E1'],
    pattern: { kind: 'clover', colors: ['#7CC77A', '#FFFFFF', '#FFD93D'], size: 10, density: 1500 }, ground: { kind: 'hills', colors: ['#5DBB63', '#2E9D4B'], height: 0.36 },
    strip: [['shamrock', 0], ['rainbow', 0], ['coin', 0], ['shamrock', 0]],
    marks: (y) => ({ [key(y, 3, 17)]: mark('shamrock', '#D5F2CC', ['#43A047', '#FFD93D', '#FFFFFF']) }),
  },
  easter: {
    label: 'Easter', chrome: '#7E57C2', bg: ['#FFD3E8', '#FFF6CC'],
    pattern: { kind: 'confetti', colors: ['#FF8FB3', '#B9A6E8', '#9BE3B8', '#8ED0F5', '#FFD93D'], size: 9, density: 1100 }, ground: { kind: 'hills', colors: ['#A8D86A', '#7DBE45'], height: 0.36 },
    strip: [['bunny', 0], ['egg', 0], ['chick', 0], ['egg', 1], ['flower', 0], ['egg', 2]],
    marks: (y) => ({ [easterSunday(y)]: mark('bunny', '#FFF3BF', ['#FF8FB3', '#B9A6E8', '#9BE3B8', '#8ED0F5']) }),
  },
  spring: {
    label: 'Spring', chrome: '#2E9D5B', bg: ['#BDE6FF', '#F2FFE0'],
    pattern: { kind: 'dots', colors: ['#FFFFFF', '#FFE98A', '#FFB6D1'], size: 9, density: 1500 }, ground: { kind: 'hills', colors: ['#9AD860', '#5DB84A'], height: 0.36 },
    strip: [['tulip', 0], ['butterfly', 0], ['flower', 1], ['tulip', 1], ['butterfly', 1], ['flower', 2]],
    marks: (y) => ({ [nthWeekday(y, 5, 0, 2)]: mark('flower', '#FFE0EC', ['#FF8FB3', '#FFD93D', '#FFFFFF']) }),
  },
  summer: {
    label: 'Summer', chrome: '#0277BD', bg: ['#6FD0FF', '#FFF1B8'],
    pattern: { kind: 'dots', colors: ['#FFFFFF'], size: 8, density: 4200 }, ground: { kind: 'waves', colors: ['#7AD3F5', '#2AA9E8', '#0277BD'], height: 0.4 },
    strip: [['sun', 0], ['palm', 0], ['beachball', 0], ['butterfly', 2], ['flower', 4]],
    marks: (y) => ({ [key(y, 6, 21)]: mark('sun', '#FFF1B0', ['#FFB300', '#FF8A1F', '#FFFFFF']), [nthWeekday(y, 6, 0, 3)]: mark('wave', '#D8F0FC', ['#2AA9E8', '#FFFFFF']) }),
  },
  patriotic: {
    label: 'Fourth of July', chrome: '#1F3A93', bg: ['#DCE6FF', '#FFFFFF'],
    pattern: { kind: 'stars', colors: ['#C62828', '#1F3A93', '#FFFFFF'], size: 9, density: 1700 }, ground: { kind: 'stripes', colors: ['#D32F2F', '#FFFFFF'], height: 0.36 },
    strip: [['star', 1], ['fireworks', 0], ['star', 2], ['fireworks', 1], ['star', 0]],
    marks: (y) => ({ [key(y, 7, 4)]: mark('fireworks', '#E4EAFF', ['#D32F2F', '#1F3A93', '#FFFFFF'], { speckle: 'stars' }) }),
  },
  school: {
    label: 'Back to school', chrome: '#2F5D50', bg: ['#FFF3C4', '#FFFBE6'],
    pattern: { kind: 'lines', colors: ['#9CC9F0', '#F29A9A'], size: 1, density: 1e9 }, ground: null,
    strip: [['apple', 0], ['pencil', 0], ['book', 0], ['apple', 0], ['book', 1]],
    marks: (y) => ({ [nthWeekday(y, 9, 1, 1)]: mark('book', '#FFF3C4', ['#9CC9F0', '#F29A9A']) }),
  },
  halloween: {
    label: 'Halloween', chrome: '#4A2C7A', bg: ['#2B1B45', '#6A3FA0'],
    pattern: { kind: 'stars', colors: ['#FFE98A', '#FFFFFF', '#FFB347'], size: 6, density: 2000 }, ground: { kind: 'hills', colors: ['#3B2560', '#1B1030'], height: 0.32 },
    strip: [['moon', 0], ['pumpkin', 0], ['ghost', 0], ['bat', 0], ['pumpkin', 0]],
    marks: (y) => ({ [key(y, 10, 31)]: mark('pumpkin', '#FFE2BC', ['#FF8A1F', '#7E57C2', '#FFFFFF']) }),
  },
  autumn: {
    label: 'Autumn', chrome: '#B3501B', bg: ['#FFCF8A', '#FFF0DA'],
    pattern: { kind: 'leaves', colors: ['#E55D26', '#F5B700', '#B3501B', '#C62828'], size: 11, density: 1500 }, ground: { kind: 'hills', colors: ['#D9983A', '#A9692B'], height: 0.34 },
    strip: [['leaf', 0], ['pumpkin', 0], ['acorn', 0], ['leaf', 1], ['leaf', 2]],
    marks: (y) => ({ [nthWeekday(y, 11, 4, 4)]: mark('pumpkin', '#FFE3BA', ['#E55D26', '#F5B700', '#B3501B']) }),
  },
  christmas: {
    label: 'Christmas', chrome: '#B71C1C', bg: ['#0E4A28', '#2A8A52'],
    pattern: { kind: 'snow', colors: ['#FFFFFF', '#FFE98A'], size: 7, density: 1500 }, ground: { kind: 'snow', colors: ['#D5E8F2', '#FFFFFF'], height: 0.32 },
    strip: [['tree', 0], ['candycane', 0], ['gift', 0], ['ornament', 0], ['snowman', 0], ['gift', 1], ['ornament', 1]],
    marks: (y) => ({
      [key(y, 12, 24)]: mark('gift', '#E1F2E3', ['#B71C1C', '#2E9D4B', '#FFFFFF']),
      [key(y, 12, 25)]: mark('tree', '#D8F0DD', ['#B71C1C', '#F5B700', '#FFFFFF'], { speckle: 'stars' }),
      [key(y, 12, 31)]: mark('star', '#E9ECFF', ['#F5B700', '#7E57C2', '#FFFFFF'], { speckle: 'stars' }),
    }),
  },
};
// The twelve month designs (a month wears one unless a holiday window or your settings say otherwise). May, July, September and
// October use the spring, summer, school and autumn themes above.
Object.assign(THEMES, {
  january: {
    label: 'January', chrome: '#27508F', bg: ['#7FA9DC', '#EAF3FC'],
    pattern: { kind: 'snow', colors: ['#FFFFFF'], size: 6, density: 1100 }, ground: { kind: 'snow', colors: ['#C9DCEF', '#FFFFFF'], height: 0.34 },
    strip: [['snowflake', 0], ['snowman', 0], ['star', 0], ['snowflake', 1]],
  },
  february: {
    label: 'February', chrome: '#6A4C93', bg: ['#D9C8F0', '#FFEAF3'],
    pattern: { kind: 'snow', colors: ['#FFFFFF', '#FFC1D6'], size: 6, density: 1300 }, ground: { kind: 'snow', colors: ['#E9DDF7', '#FFFFFF'], height: 0.3 },
    strip: [['snowflake', 1], ['heart', 1], ['star', 1], ['heart', 0]],
  },
  march: {
    label: 'March', chrome: '#2D7D6B', bg: ['#BFE3EC', '#F3FBE6'],
    pattern: { kind: 'dots', colors: ['#FFFFFF', '#CDE9B0'], size: 8, density: 1400 }, ground: { kind: 'hills', colors: ['#B4DE8A', '#7FBF5C'], height: 0.34 },
    strip: [['tulip', 0], ['rainbow', 0], ['sun', 0], ['butterfly', 0]],
  },
  april: {
    label: 'April', chrome: '#3C7D9E', bg: ['#B5D6EF', '#EAF6F8'],
    pattern: { kind: 'dots', colors: ['#FFFFFF', '#9CC9F0'], size: 7, density: 1100 }, ground: { kind: 'hills', colors: ['#9BD36F', '#6BB552'], height: 0.36 },
    strip: [['tulip', 1], ['flower', 0], ['rainbow', 0], ['butterfly', 1], ['tulip', 2]],
  },
  june: {
    label: 'June', chrome: '#2E7D32', bg: ['#9FDBFF', '#FFF6C9'],
    pattern: { kind: 'dots', colors: ['#FFFFFF'], size: 8, density: 3500 }, ground: { kind: 'hills', colors: ['#8ED36B', '#4CAF50'], height: 0.36 },
    strip: [['sun', 0], ['butterfly', 2], ['flower', 3], ['beachball', 0], ['flower', 1]],
  },
  august: {
    label: 'August', chrome: '#B26A00', bg: ['#FFD08A', '#FFF1D2'],
    pattern: { kind: 'dots', colors: ['#FFFFFF', '#FFE29A'], size: 8, density: 3000 }, ground: { kind: 'hills', colors: ['#E6B84F', '#C98A2B'], height: 0.34 },
    strip: [['sun', 1], ['palm', 0], ['beachball', 0], ['butterfly', 2]],
  },
  november: {
    label: 'November', chrome: '#6D4C2B', bg: ['#D9C3A0', '#F5ECDD'],
    pattern: { kind: 'leaves', colors: ['#B3501B', '#8D6E3F', '#C98A2B'], size: 10, density: 1800 }, ground: { kind: 'hills', colors: ['#8B5A2B', '#5E3B1C'], height: 0.32 },
    strip: [['acorn', 0], ['leaf', 1], ['pumpkin', 0], ['leaf', 2]],
  },
  december: {
    label: 'December', chrome: '#1F3F7A', bg: ['#13306A', '#4A78C0'],
    pattern: { kind: 'stars', colors: ['#FFFFFF', '#FFE98A'], size: 6, density: 1800 }, ground: { kind: 'snow', colors: ['#D9E8F5', '#FFFFFF'], height: 0.32 },
    strip: [['snowflake', 0], ['star', 0], ['tree', 2], ['gift', 0], ['snowflake', 1]],
  },
});
for (const [name, t] of Object.entries(THEMES)) t.name = name;
export const THEME_NAMES = Object.keys(THEMES);
export const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** What each month wears unless a holiday window or your settings say otherwise (January first). */
export const MONTH_THEMES = ['january', 'february', 'march', 'april', 'spring', 'june', 'summer', 'august', 'school', 'autumn', 'november', 'december'];

// --- Dates: holiday windows and marks ----------------------------------------------------------------------

const shiftDay = (dayKey, n) => { const d = new Date(`${dayKey}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** A date in `year` from "MM-DD", or "easter" / "thanksgiving" with an optional offset in days ("easter-7", "thanksgiving+1"). */
export function dateSpec(spec, year) {
  const fixed = /^(\d\d)-(\d\d)$/.exec(spec);
  if (fixed) {
    const [m, d] = [Number(fixed[1]), Number(fixed[2])];
    if (m < 1 || m > 12 || d < 1 || d > 31) throw new Error(`"${spec}" is not a date`);
    return key(year, m, d);
  }
  const rel = /^(easter|thanksgiving)([+-]\d+)?$/.exec(spec);
  if (!rel) throw new Error(`"${spec}" is not a date: use MM-DD, or easter / thanksgiving with an offset like easter-7`);
  return shiftDay(rel[1] === 'easter' ? easterSunday(year) : nthWeekday(year, 11, 4, 4), Number(rel[2] ?? 0));
}

/** Built-in holiday windows: the theme for a holiday replaces the month's design only around the day itself. */
export const BUILTIN_WINDOWS = [
  { from: '02-07', to: '02-14', theme: 'valentine' },
  { from: '03-10', to: '03-17', theme: 'shamrock' },
  { from: 'easter-7', to: 'easter+1', theme: 'easter' },
  { from: '06-28', to: '07-05', theme: 'patriotic' },
  { from: '10-24', to: '10-31', theme: 'halloween' },
  { from: 'thanksgiving-4', to: 'thanksgiving', theme: 'autumn' },
  { from: '12-12', to: '12-26', theme: 'christmas' },
];

/** The theme name of the first window that holds `day` (YYYY-MM-DD), or null. Windows repeat every year and may span new year. */
function windowTheme(day, windows) {
  const year = Number(day.slice(0, 4));
  for (const w of windows) {
    for (const y of [year - 1, year, year + 1]) {
      const from = dateSpec(w.from, y);
      let to = dateSpec(w.to, y);
      if (to < from) to = dateSpec(w.to, y + 1);
      if (day >= from && day <= to) return w.theme;
    }
  }
  return null;
}

/** Every built-in holiday's decorated cell, whatever the theme (Easter Sunday has its bunny in any April design). */
const builtinMarks = (year) => Object.assign({}, ...Object.values(THEMES).map((t) => t.marks?.(year) ?? {}));

// --- Plans: which theme when, with your settings applied ----------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;
const PATTERN_KINDS = ['dots', 'confetti', 'snow', 'stars', 'hearts', 'leaves', 'clover', 'lines'];
const GROUND_KINDS = ['hills', 'snow', 'waves', 'stripes'];
const NAME = /^[a-z0-9][a-z0-9_-]*$/;
const CUSTOM_KEYS = ['label', 'extends', 'chrome', 'sky', 'pattern', 'ground', 'motifs', 'holidays'];
const THEMES_KEYS = ['months', 'windows', 'builtin_windows', 'custom', 'marks'];

function checkKeys(obj, allowed, where) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`${where} must be a map`);
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) throw new Error(`${where}: unknown key "${k}" (allowed: ${allowed.join(', ')})`);
}
function colors(list, where, min = 1) {
  if (!Array.isArray(list) || list.length < min || !list.every((c) => HEX.test(String(c)))) throw new Error(`${where} must be a list of ${min === 1 ? 'one or more' : min} colors like "#3b2a5a"`);
  return list.map(String);
}
const luminance = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return 0.299 * r + 0.587 * g + 0.114 * b; };

function markFrom(m, where) {
  checkKeys(m, ['motif', 'tint', 'deco', 'speckle', 'variant'], where);
  if (!MOTIF_NAMES.includes(m.motif)) throw new Error(`${where}: motif "${m.motif}" is not one of ${MOTIF_NAMES.join(', ')}`);
  if (!HEX.test(String(m.tint))) throw new Error(`${where}: tint must be a color like "#ffe0b0"`);
  if (m.speckle !== undefined && !['stars', 'dots'].includes(m.speckle)) throw new Error(`${where}: speckle must be stars or dots`);
  return mark(m.motif, String(m.tint), m.deco === undefined ? ['#FFFFFF'] : colors(m.deco, `${where}.deco`), { ...(m.speckle ? { speckle: m.speckle } : {}), variant: Number(m.variant ?? 0) });
}
/** (year) => { 'YYYY-MM-DD': mark } from a map of date specs to marks. */
function marksFn(map, where) {
  const specs = Object.entries(map ?? {}).map(([spec, m]) => { dateSpec(spec, 2026); return [spec, markFrom(m, `${where}.${spec}`)]; });
  return (year) => Object.fromEntries(specs.map(([spec, m]) => [dateSpec(spec, year), m]));
}

function customTheme(name, def, base, where) {
  checkKeys(def, CUSTOM_KEYS, where);
  let from = null;
  if (def.extends !== undefined) {
    from = base[def.extends];
    if (!from) throw new Error(`${where}: extends "${def.extends}", which is not a theme (${Object.keys(base).join(', ')})`);
  }
  const theme = from ? { ...from } : {};
  theme.name = name; theme.label = def.label ? String(def.label) : (from?.label ?? name);
  if (def.chrome !== undefined) theme.chrome = String(def.chrome);
  if (!HEX.test(theme.chrome ?? '')) throw new Error(`${where}: chrome (the weekday band and panel title color) must be a color like "#3b2a5a"`);
  if (luminance(theme.chrome) >= 150) throw new Error(`${where}: chrome ${theme.chrome} is too light for the white text on it`);
  if (def.sky !== undefined) theme.bg = colors(def.sky, `${where}.sky`, 2).slice(0, 2);
  if (!theme.bg) throw new Error(`${where}: sky must be two colors, the top and bottom of the banner`);
  if (def.pattern !== undefined) {
    const pat = def.pattern;
    if (pat === null) theme.pattern = null;
    else {
      checkKeys(pat, ['kind', 'colors', 'size', 'density'], `${where}.pattern`);
      if (!PATTERN_KINDS.includes(pat.kind)) throw new Error(`${where}.pattern.kind must be one of ${PATTERN_KINDS.join(', ')}`);
      theme.pattern = { kind: pat.kind, colors: colors(pat.colors, `${where}.pattern.colors`), size: Number(pat.size ?? 8), density: Number(pat.density ?? 1500) };
    }
  }
  if (def.ground !== undefined) {
    const g = def.ground;
    if (g === null) theme.ground = null;
    else {
      checkKeys(g, ['kind', 'colors', 'height'], `${where}.ground`);
      if (!GROUND_KINDS.includes(g.kind)) throw new Error(`${where}.ground.kind must be one of ${GROUND_KINDS.join(', ')}`);
      theme.ground = { kind: g.kind, colors: colors(g.colors, `${where}.ground.colors`, g.kind === 'waves' ? 1 : 2), height: Number(g.height ?? 0.34) };
    }
  }
  if (def.motifs !== undefined) {
    if (!Array.isArray(def.motifs) || !def.motifs.length) throw new Error(`${where}.motifs must be a list of motif names`);
    theme.strip = def.motifs.map((m, i) => {
      const [motif, variant] = Array.isArray(m) ? m : [m, 0];
      if (!MOTIF_NAMES.includes(motif)) throw new Error(`${where}.motifs[${i}]: "${motif}" is not one of ${MOTIF_NAMES.join(', ')}`);
      return [motif, Number(variant ?? 0)];
    });
  }
  if (!theme.strip) throw new Error(`${where}: motifs must list at least one motif`);
  if (!theme.pattern && theme.pattern !== null) theme.pattern = null;
  if (theme.ground === undefined) theme.ground = null;
  if (def.holidays !== undefined) { const own = marksFn(def.holidays, `${where}.holidays`), inherited = from?.marks; theme.marks = (y) => ({ ...(inherited?.(y) ?? {}), ...own(y) }); }
  return theme;
}

/**
 * Turns your `themes:` settings into a plan, checking everything. `settings`: { months: { oct: "autumn" }, windows: [{ from, to,
 * theme }], builtin_windows: false, custom: { name: {...} }, marks: { "MM-DD": {...} } }. Returns { themes, names, months (12 names
 * or ''), windows, marks }.
 */
export function buildThemePlan(settings = {}, where = 'themes') {
  checkKeys(settings, THEMES_KEYS, where);
  const themes = { ...THEMES };
  for (const [name, def] of Object.entries(settings.custom ?? {})) {
    if (!NAME.test(name) || name === 'auto' || name === 'none') throw new Error(`${where}.custom: "${name}" is not a usable theme name (letters, digits, - and _; not auto or none)`);
    themes[name] = customTheme(name, def, themes, `${where}.custom.${name}`);
  }
  const known = (name, at) => { if (name !== 'none' && !Object.hasOwn(themes, name)) throw new Error(`${at}: "${name}" is not a theme (auto and none aside, one of ${Object.keys(themes).join(', ')})`); return name; };
  const months = [...MONTH_THEMES];
  for (const [mon, name] of Object.entries(settings.months ?? {})) {
    const i = MONTH_KEYS.indexOf(String(mon).toLowerCase());
    if (i < 0) throw new Error(`${where}.months: "${mon}" is not a month (${MONTH_KEYS.join(', ')})`);
    months[i] = known(String(name).toLowerCase(), `${where}.months.${mon}`);
  }
  const windows = (settings.windows ?? []).map((w, i) => {
    checkKeys(w, ['from', 'to', 'theme'], `${where}.windows[${i}]`);
    for (const end of ['from', 'to']) { try { dateSpec(String(w[end]), 2026); } catch (err) { throw new Error(`${where}.windows[${i}].${end}: ${err.message}`); } }
    return { from: String(w.from), to: String(w.to), theme: known(String(w.theme), `${where}.windows[${i}].theme`) };
  });
  if (settings.builtin_windows !== false) windows.push(...BUILTIN_WINDOWS);
  const marks = marksFn(settings.marks, `${where}.marks`);
  return { themes, names: Object.keys(themes), months, windows, marks };
}

export const DEFAULT_PLAN = buildThemePlan();

/** A setting is valid if it is auto, none, or a theme in the plan. */
export const isThemeSetting = (s, plan = DEFAULT_PLAN) => s === 'auto' || s === 'none' || Object.hasOwn(plan.themes, s);

/**
 * The theme to draw on `day` (YYYY-MM-DD): `setting` is auto (a holiday window if one holds the day, else the month's design),
 * none, or a theme name that is worn all year. A month set to none in the plan has no theme at all, windows included.
 * Returns the theme, or null for none.
 */
export function resolveTheme(setting, day, plan = DEFAULT_PLAN) {
  let name = setting;
  if (setting === 'auto') {
    const month = plan.months[Number(day.slice(5, 7)) - 1];
    name = month === 'none' ? 'none' : windowTheme(day, plan.windows) ?? month;
  }
  if (name === 'none' || !Object.hasOwn(plan.themes, name)) return null;
  return plan.themes[name];
}

/** The decorated cells for a list of day keys: Map('YYYY-MM-DD' -> mark). None without a theme. */
export function stampsFor(theme, days, plan = DEFAULT_PLAN) {
  const out = new Map();
  if (!theme) return out;
  const wanted = new Set(days);
  for (const year of new Set(days.map((d) => Number(d.slice(0, 4))))) {
    for (const [day, m] of Object.entries({ ...builtinMarks(year), ...(theme.marks?.(year) ?? {}), ...plan.marks(year) })) if (m && wanted.has(day)) out.set(day, m);
  }
  return out;
}
