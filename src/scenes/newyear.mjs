/** New Year's: fireworks over a city, a clock at midnight, confetti and streamers. */
import { TAU, rng, sky, sparkle, burst, skyline } from './common.mjs';

export function newyear(ctx, W, H, SH) {
  const rnd = rng(101);
  sky(ctx, W, H, SH, [[0, '#16124a'], [0.5, '#241a68'], [0.85, '#3c2a86'], [1, '#5a3aa0']]);
  for (let i = 0; i < 140; i++) sparkle(ctx, rnd() * W, rnd() * SH * 0.62, 1.6 + rnd() * 2.6, rnd() > 0.5 ? '#ffffff' : '#ffe9a0');
  const palette = [['#ffd01a', '#ffffff', '#ff5fa0'], ['#ffffff', '#6ad1ff'], ['#ff5fa0', '#ffd01a'], ['#7dff9a', '#ffffff', '#ffd01a'], ['#ffd01a', '#ffffff']];
  [[260, SH * 0.3, 230], [1140, SH * 0.26, 260], [700, SH * 0.17, 140], [120, SH * 0.58, 150], [1330, SH * 0.55, 160]].forEach(([x, y, R], i) => burst(ctx, x, y, R, palette[i % palette.length], rnd, 24 + (i % 3) * 4));

  const base = SH * 0.8;
  skyline(ctx, W, base, rng(33), '#08051c');
  ctx.fillStyle = '#08051c'; ctx.fillRect(0, base, W, H - base);

  // The clock, at midnight.
  const cx = 720, cy = SH * 0.5, R = 290;
  const glow = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.5); glow.addColorStop(0, 'rgba(255,208,26,0.45)'); glow.addColorStop(1, 'rgba(255,208,26,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd01a'; ctx.strokeStyle = '#08040f'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(cx, cy, R + 26, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fffdf2'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#08040f'; ctx.lineCap = 'round';
  for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU, long = i % 5 === 0; ctx.lineWidth = long ? 12 : 4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R - (long ? 46 : 26)), cy + Math.sin(a) * (R - (long ? 46 : 26))); ctx.lineTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); ctx.stroke(); }
  ctx.fillStyle = '#08040f'; ctx.font = 'bold 74px "DejaVu Sans Bold"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  [['12', 0, -1], ['3', 1, 0], ['6', 0, 1], ['9', -1, 0]].forEach(([t, dx, dy]) => ctx.fillText(t, cx + dx * (R - 100), cy + dy * (R - 100) + 4));
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - R * 0.62); ctx.stroke();            // both hands at twelve
  ctx.strokeStyle = '#e0103f'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(cx, cy + 40); ctx.lineTo(cx, cy - R * 0.84); ctx.stroke();
  ctx.fillStyle = '#08040f'; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, TAU); ctx.fill();

  // Streamers curling up from the lower corners, and confetti all over.
  [['#e0103f', 0, 0], ['#00a0ff', 0, 1], ['#ffd01a', 1, 0], ['#7dff9a', 1, 1]].forEach(([c, right, i]) => {
    ctx.strokeStyle = c; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.beginPath();
    const x0 = right ? W : 0, y0 = SH * 0.74 - i * 60;
    ctx.moveTo(x0, y0);
    for (let k = 1; k <= 9; k++) ctx.lineTo(x0 + (right ? -1 : 1) * k * 30, y0 - k * 36 + Math.sin(k * 0.9 + i * 2) * 34);
    ctx.stroke();
  });
  const cols = ['#ffd01a', '#ff5fa0', '#6ad1ff', '#7dff9a', '#ffffff', '#e0103f'];
  for (let i = 0; i < 220; i++) {
    const x = rnd() * W, y = rnd() * SH * 0.92;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * TAU); ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-9, -4, 18, 8 + rnd() * 6); ctx.restore();
  }
}
