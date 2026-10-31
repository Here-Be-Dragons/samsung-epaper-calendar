/** Halloween: a harvest moon, a haunted house, bats, a graveyard and jack-o'-lanterns. */
import { drawMotif } from '../themes.mjs';
import { TAU, rng } from './common.mjs';

function bat(ctx, x, y, s, tilt = 0, color = '#08040f') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(s, s);
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.bezierCurveTo(8, -14, 22, -22, 44, -12); ctx.bezierCurveTo(36, -6, 36, 4, 28, 10);   // right wing, scalloped
  ctx.bezierCurveTo(24, 2, 18, 4, 14, 12); ctx.bezierCurveTo(10, 4, 6, 6, 0, 18);
  ctx.bezierCurveTo(-6, 6, -10, 4, -14, 12); ctx.bezierCurveTo(-18, 4, -24, 2, -28, 10);
  ctx.bezierCurveTo(-36, 4, -36, -6, -44, -12); ctx.bezierCurveTo(-22, -22, -8, -14, 0, -6);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-4, -18); ctx.lineTo(0, -10); ctx.lineTo(4, -18); ctx.lineTo(6, -8); ctx.closePath(); ctx.fill(); // ears
  ctx.restore();
}

function arched(ctx, x, y, w, h, fill) { // a window: a rectangle with a round top
  ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}

function glowWindow(ctx, x, y, w, h, color = '#ffe45c') {
  ctx.save(); // the window with its panes
  arched(ctx, x, y, w, h, color);
  ctx.strokeStyle = '#08040f'; ctx.lineWidth = Math.max(4, w * 0.07);
  ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h * 0.55); ctx.lineTo(x + w, y + h * 0.55); ctx.stroke();
  ctx.restore();
}

function spiky(ctx, x0, x1, y, depth, step, rnd, color, bottom) { // a ground edge of grass blades
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x0, bottom);
  for (let x = x0; x <= x1; x += step) { ctx.lineTo(x, y); ctx.lineTo(x + step * 0.5, y - depth * (0.5 + rnd())); }
  ctx.lineTo(x1, bottom); ctx.closePath(); ctx.fill();
}

function deadTree(ctx, x, y, len, rnd) {
  const branch = (bx, by, angle, l, width, depth) => {
    if (depth === 0 || l < 14) return;
    const ex = bx + Math.cos(angle) * l, ey = by + Math.sin(angle) * l;
    ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
    const n = depth > 2 ? 2 : 1 + Math.round(rnd());
    for (let i = 0; i < n; i++) branch(ex, ey, angle + (rnd() - 0.5) * 1.3, l * (0.68 + rnd() * 0.12), width * 0.68, depth - 1);
  };
  ctx.strokeStyle = '#08040f'; ctx.lineCap = 'round';
  branch(x, y, -Math.PI / 2 + 0.12, len, 26, 7);
}

function spider(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.strokeStyle = '#08040f'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const a = -0.9 + i * 0.55;
    ctx.beginPath(); ctx.moveTo(side * 12, 4); ctx.lineTo(side * (34 + i * 3), 4 + a * 26 - 20); ctx.lineTo(side * (50 + i * 2), 4 + a * 40 + 12); ctx.stroke();
  }
  ctx.fillStyle = '#08040f'; ctx.beginPath(); ctx.ellipse(0, 14, 24, 28, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -14, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(-6, -16, 3.5, 0, TAU); ctx.arc(6, -16, 3.5, 0, TAU); ctx.fill();
  ctx.restore();
}

function cobweb(ctx, cx, cy, reach) { // threads fanning from a corner, with sagging rings between them
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const n = 6, a0 = Math.PI / 2, a1 = Math.PI; // from straight down to straight left
  const ring = (r) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  ring(reach).forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); });
  for (let k = 1; k <= 5; k++) {
    const p = ring((reach * k) / 5.5);
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) { const mx = (p[i - 1][0] + p[i][0]) / 2, my = (p[i - 1][1] + p[i][1]) / 2; ctx.quadraticCurveTo(mx + (cx - mx) * 0.2, my + (cy - my) * 0.2, p[i][0], p[i][1]); }
    ctx.stroke();
  }
  ctx.restore();
}

export function halloween(ctx, W, H, SH) {
  const rnd = rng(1031);
  const horizon = SH * 0.735; // where the sky meets the hills

  // Sky: night at the top, a harvest-orange glow at the horizon.
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  [[0, '#1e1146'], [0.3, '#321c66'], [0.52, '#6a2c8a'], [0.7, '#d9522b'], [0.86, '#ffa53a'], [1, '#ffd770']].forEach(([t, c]) => sky.addColorStop(t, c));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // Stars.
  for (let i = 0; i < 130; i++) {
    const x = rnd() * W, y = rnd() * horizon * 0.62, r = 2 + rnd() * 3.4;
    ctx.fillStyle = rnd() > 0.5 ? '#ffffff' : '#fff2a8';
    ctx.beginPath(); ctx.moveTo(x, y - r * 1.8); ctx.lineTo(x + r * 0.5, y - r * 0.5); ctx.lineTo(x + r * 1.8, y); ctx.lineTo(x + r * 0.5, y + r * 0.5); ctx.lineTo(x, y + r * 1.8); ctx.lineTo(x - r * 0.5, y + r * 0.5); ctx.lineTo(x - r * 1.8, y); ctx.lineTo(x - r * 0.5, y - r * 0.5); ctx.closePath(); ctx.fill();
  }

  // The moon, huge and low, with a glow, craters and thin cloud across it.
  const mx = 930, my = 640, mr = 330;
  const glow = ctx.createRadialGradient(mx, my, mr * 0.9, mx, my, mr * 1.75);
  glow.addColorStop(0, 'rgba(255,238,150,0.55)'); glow.addColorStop(1, 'rgba(255,238,150,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(mx, my, mr * 1.75, 0, TAU); ctx.fill();
  const disc = ctx.createRadialGradient(mx - 90, my - 100, 40, mx, my, mr);
  disc.addColorStop(0, '#fff4a8'); disc.addColorStop(1, '#f2cf62');
  ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e6c25a';
  [[-120, -80, 62], [90, -150, 44], [140, 20, 70], [-60, 120, 52], [-180, 70, 34], [30, 200, 38], [190, -60, 26]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, TAU); ctx.fill(); });
  const puff = (x, y, r) => { // a cloud: a cluster of circles
    ctx.fillStyle = '#4a2478'; ctx.beginPath();
    [[0, 0, 1], [0.9, -0.15, 0.8], [-0.9, 0.05, 0.75], [1.7, 0.1, 0.6], [-1.6, 0.2, 0.55]].forEach(([dx, dy, k]) => { ctx.moveTo(x + dx * r + r * k, y + dy * r); ctx.arc(x + dx * r, y + dy * r, r * k, 0, TAU); });
    ctx.fill();
  };
  puff(mx - 190, my + 250, 60); puff(mx + 230, my + 190, 48); puff(mx + 20, my + 300, 40);

  // Bats against the moon.
  [[800, 520, 1.5, -0.2], [1010, 430, 1.1, 0.15], [1120, 580, 0.9, -0.35], [700, 700, 0.8, 0.25]].forEach(([x, y, s, t]) => bat(ctx, x, y, s * 1.6, t));

  // Far hills, then the haunted house on its hill.
  ctx.fillStyle = '#2a1346'; ctx.beginPath(); ctx.moveTo(0, H);
  ctx.lineTo(0, horizon + 30);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, horizon + 30 + Math.sin(x / 210 + 1) * 34 + Math.sin(x / 90) * 8);
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

  const hill = horizon + 74; // the house stands on the near hill
  ctx.fillStyle = '#08040f';
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, hill + 110);
  ctx.bezierCurveTo(240, hill + 40, 420, hill - 20, 700, hill - 10); ctx.bezierCurveTo(980, hill, 1200, hill + 70, W, hill + 40);
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

  // The house: a black silhouette with towers, a crooked roof and glowing windows.
  const base = hill + 6;
  ctx.fillStyle = '#08040f';
  ctx.fillRect(330, base - 390, 520, 390);                                              // main body
  ctx.beginPath(); ctx.moveTo(296, base - 380); ctx.lineTo(560, base - 600); ctx.lineTo(884, base - 380); ctx.closePath(); ctx.fill(); // roof
  ctx.fillRect(262, base - 470, 118, 470);                                              // left tower
  ctx.beginPath(); ctx.moveTo(244, base - 462); ctx.lineTo(322, base - 700); ctx.lineTo(400, base - 462); ctx.closePath(); ctx.fill();
  ctx.fillRect(800, base - 430, 112, 430);                                              // right tower
  ctx.beginPath(); ctx.moveTo(784, base - 424); ctx.lineTo(858, base - 640); ctx.lineTo(930, base - 424); ctx.closePath(); ctx.fill();
  ctx.fillRect(636, base - 640, 56, 130);                                               // chimney
  ctx.fillRect(630, base - 656, 68, 20);
  ctx.fillRect(316, base - 40, 560, 40);                                                // porch step
  ctx.strokeStyle = '#08040f'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(322, base - 700); ctx.lineTo(322, base - 768); ctx.moveTo(858, base - 640); ctx.lineTo(858, base - 704); ctx.stroke();
  ctx.fillStyle = '#08040f'; ctx.beginPath(); ctx.moveTo(322, base - 768); ctx.lineTo(372, base - 752); ctx.lineTo(322, base - 736); ctx.closePath(); ctx.fill(); // pennant
  // windows and the door, glowing
  glowWindow(ctx, 396, base - 330, 78, 124); glowWindow(ctx, 552, base - 330, 78, 124); glowWindow(ctx, 708, base - 330, 78, 124);
  glowWindow(ctx, 288, base - 400, 62, 100); glowWindow(ctx, 824, base - 370, 62, 100);
  ctx.save(); const rg = ctx.createRadialGradient(560, base - 520, 4, 560, base - 520, 70); rg.addColorStop(0, '#fff6b0'); rg.addColorStop(1, '#ffb52e');
  ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(560, base - 520, 36, 0, TAU); ctx.fill(); ctx.restore();
  glowWindow(ctx, 520, base - 190, 104, 190, '#ffb02e');                              // the door
  // bats leaving the tower
  [[470, base - 760, 1.1, -0.3], [610, base - 840, 0.8, 0.2], [420, base - 930, 1.0, 0.1], [90, base - 830, 0.7, -0.15], [1040, base - 700, 0.9, 0.3]].forEach(([x, y, s, t]) => bat(ctx, x, y, s * 1.5, t));

  // The graveyard: crooked stones, a fence and a dead tree.
  const stone = (x, y, w, h, tilt, cross = false) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.fillStyle = '#08040f'; ctx.strokeStyle = '#3a2766'; ctx.lineWidth = 4;
    ctx.beginPath();
    if (cross) { ctx.rect(-w * 0.18, -h, w * 0.36, h); ctx.rect(-w * 0.5, -h * 0.75, w, h * 0.3); }
    else { ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -h + w / 2); ctx.arc(0, -h + w / 2, w / 2, Math.PI, 0); ctx.lineTo(w / 2, 0); ctx.closePath(); }
    ctx.fill(); ctx.stroke(); ctx.restore();
  };
  [[70, hill + 175, 96, 130, -0.08], [190, hill + 190, 78, 100, 0.07], [1130, hill + 168, 92, 120, 0.06], [1280, hill + 150, 84, 110, -0.05]].forEach(([x, y, w, h, t]) => stone(x, y, w, h, t));
  stone(300, hill + 200, 88, 120, 0.1, true); stone(1380, hill + 200, 80, 110, -0.1, true);
  deadTree(ctx, 1210, hill + 104, 190, rnd);
  ctx.fillStyle = '#08040f';
  for (let i = 0; i < 12; i++) { // fence pickets, leaning
    const x = 940 + i * 36, y = hill + 112, lean = (rnd() - 0.5) * 0.22;
    ctx.save(); ctx.translate(x, y); ctx.rotate(lean); ctx.fillRect(-9, -98, 18, 98); ctx.beginPath(); ctx.moveTo(-12, -98); ctx.lineTo(0, -122); ctx.lineTo(12, -98); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  ctx.fillRect(930, hill + 30, 440, 10); ctx.fillRect(930, hill + 62, 440, 10);

  // A winding path from the door, then the dark foreground with grass.
  ctx.fillStyle = '#4a3278'; ctx.beginPath(); ctx.moveTo(520, base); ctx.lineTo(624, base);
  ctx.bezierCurveTo(660, base + 120, 800, base + 190, 860, base + 330); ctx.lineTo(560, base + 330); ctx.bezierCurveTo(580, base + 190, 480, base + 120, 520, base); ctx.closePath(); ctx.fill();
  spiky(ctx, 0, W, SH * 0.8, 46, 24, rnd, '#08040f', H);

  // Jack-o'-lanterns lining the way, and ghosts in the dark.
  [[190, SH * 0.842, 250, 0], [450, SH * 0.877, 290, 0], [740, SH * 0.848, 190, 0], [1000, SH * 0.88, 280, 0], [1250, SH * 0.845, 230, 0]].forEach(([x, y, s, v]) => drawMotif(ctx, 'pumpkin', x, y, s, v));
  [[130, base - 470, 200], [1170, base - 330, 170]].forEach(([x, y, s]) => drawMotif(ctx, 'ghost', x, y, s, 0));

  // A spider on its thread, top left; webs in the top right corner.
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(130, 0); ctx.lineTo(130, 440); ctx.stroke();
  spider(ctx, 130, 480, 1.25);
  cobweb(ctx, W, 0, 330);
}

