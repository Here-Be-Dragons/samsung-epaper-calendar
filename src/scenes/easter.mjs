/** Easter: a spring morning, a big bunny, a basket's worth of painted eggs, chicks and tulips. */
import { TAU, rng, sky, sparkle, cloud, hill } from './common.mjs';
import { drawMotif } from '../themes.mjs';

export function easter(ctx, W, H, SH) {
  const rnd = rng(405);
  sky(ctx, W, H, SH, [[0, '#9fd6ff'], [0.45, '#ffd3e8'], [0.75, '#fff6cc'], [1, '#fff6cc']]);
  const ground = SH * 0.6;
  // The sun, with rays.
  const sx = 1190, sy = SH * 0.22;
  ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 16; ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * 130, sy + Math.sin(a) * 130); ctx.lineTo(sx + Math.cos(a) * (i % 2 ? 175 : 205), sy + Math.sin(a) * (i % 2 ? 175 : 205)); ctx.stroke(); }
  const sun = ctx.createRadialGradient(sx - 30, sy - 30, 10, sx, sy, 118); sun.addColorStop(0, '#fff7a8'); sun.addColorStop(1, '#ffd01a');
  ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sx, sy, 118, 0, TAU); ctx.fill();
  cloud(ctx, 260, SH * 0.26, 74, '#ffffff'); cloud(ctx, 760, SH * 0.2, 56, '#ffffff'); cloud(ctx, 560, SH * 0.33, 64, '#ffffff');
  [[130, SH * 0.4], [980, SH * 0.35], [420, SH * 0.45]].forEach(([x, y], i) => drawMotif(ctx, 'butterfly', x, y, 120, i));

  hill(ctx, W, H, ground, 30, 250, 0.5, '#a8dc6a');
  hill(ctx, W, H, ground + 130, 38, 200, 2.0, '#7dc345');
  hill(ctx, W, H, ground + 280, 34, 280, 3.7, '#5db84a');
  // A row of tulips along the far hill, then the star of the show.
  for (let i = 0; i < 9; i++) drawMotif(ctx, 'tulip', 100 + i * 155, ground + 50 + (i % 2) * 14, 150, i % 3);
  // a fence of flowers
  [[120, ground + 400, 120], [1320, ground + 380, 120], [700, ground + 450, 100]].forEach(([x, y, s], i) => drawMotif(ctx, 'flower', x, y, s, i));
  drawMotif(ctx, 'bunny', 720, ground + 260, 560, 0);
  // Painted eggs in the grass.
  [[200, ground + 330, 250, 0], [470, ground + 440, 230, 1], [1000, ground + 440, 260, 2], [1260, ground + 320, 240, 3], [330, ground + 560, 190, 4], [1110, ground + 600, 190, 5], [720, ground + 620, 200, 2]].forEach(([x, y, s, v]) => drawMotif(ctx, 'egg', x, y, s, v));
  [[110, ground + 520, 150], [1330, ground + 560, 150]].forEach(([x, y, s]) => drawMotif(ctx, 'chick', x, y, s, 0));
  for (let i = 0; i < 50; i++) sparkle(ctx, rnd() * W, rnd() * ground * 0.9, 2 + rnd() * 3, '#ffffff');
}
