/** St. Patrick's Day: a rainbow ending in a pot of gold, green hills, a leprechaun's hat and shamrocks. */
import { TAU, rng, sky, sparkle, cloud, hill } from './common.mjs';
import { drawMotif } from '../themes.mjs';

export function shamrock(ctx, W, H, SH) {
  const rnd = rng(317);
  sky(ctx, W, H, SH, [[0, '#4fb4ff'], [0.55, '#bde8ff'], [0.8, '#eaf9ff'], [1, '#eaf9ff']]);
  const ground = SH * 0.66;
  cloud(ctx, 240, SH * 0.3, 70, '#ffffff'); cloud(ctx, 1190, SH * 0.27, 80, '#ffffff'); cloud(ctx, 860, SH * 0.42, 55, '#ffffff');

  // The rainbow: seven bands, ending in clouds.
  const colors = ['#ff0000', '#ff8a1f', '#ffff00', '#2fd44a', '#0000ff', '#7e3fbf'];
  const rx = 640, ry = ground + 30, outer = 600, band = 48;
  ctx.lineCap = 'butt';
  colors.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = band + 2; ctx.beginPath(); ctx.arc(rx, ry, outer - i * band, Math.PI, TAU); ctx.stroke(); });
  cloud(ctx, rx - outer + 120, ry - 10, 76, '#ffffff'); cloud(ctx, rx + outer - 120, ry - 10, 76, '#ffffff');

  hill(ctx, W, H, ground + 10, 26, 240, 0.6, '#3fb24c');
  hill(ctx, W, H, ground + 150, 34, 190, 2.4, '#2a9a3a');
  hill(ctx, W, H, ground + 300, 30, 260, 4.1, '#1f7f2e');

  // A pot of gold at the end of the rainbow.
  const px = rx + outer - 120, py = ground + 130;
  ctx.fillStyle = '#ffff00'; ctx.strokeStyle = '#08040f'; ctx.lineWidth = 6;
  [[-60, -16, 34], [-20, -30, 38], [26, -22, 36], [66, -8, 32], [-30, -6, 34], [28, 0, 34], [-84, 4, 28], [86, 10, 26]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(px + dx, py + dy, r, 0, TAU); ctx.fill(); ctx.stroke(); });
  ctx.fillStyle = '#08040f'; ctx.beginPath(); ctx.moveTo(px - 112, py); ctx.bezierCurveTo(px - 140, py + 120, px - 70, py + 170, px, py + 170); ctx.bezierCurveTo(px + 70, py + 170, px + 140, py + 120, px + 112, py); ctx.closePath(); ctx.fill();
  ctx.fillRect(px - 120, py - 6, 240, 24);
  [[px - 60, py - 70], [px + 40, py - 90], [px + 120, py - 40], [px - 150, py - 30]].forEach(([x, y]) => sparkle(ctx, x, y, 7, '#ffffff'));

  // The leprechaun's hat on the hill.
  const hx = 240, hy = ground + 250;
  ctx.fillStyle = '#08040f'; ctx.beginPath(); ctx.ellipse(hx, hy + 30, 190, 40, 0, 0, TAU); ctx.fill();
  ctx.fillRect(hx - 110, hy - 190, 220, 220);
  ctx.beginPath(); ctx.ellipse(hx, hy - 190, 110, 26, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#12a63a'; ctx.fillRect(hx - 110, hy - 40, 220, 56);
  ctx.fillStyle = '#ffff00'; ctx.fillRect(hx - 36, hy - 52, 72, 80); ctx.fillStyle = '#08040f'; ctx.fillRect(hx - 22, hy - 38, 44, 52);
  ctx.fillStyle = '#12a63a'; ctx.fillRect(hx - 12, hy - 28, 24, 32);

  // Shamrocks and gold coins everywhere.
  [[760, ground + 270, 190], [1130, ground + 340, 170], [470, ground + 380, 150], [90, ground + 130, 120], [1330, ground + 190, 130], [860, ground + 150, 100]].forEach(([x, y, s]) => drawMotif(ctx, 'shamrock', x, y, s, 0));
  [[600, ground + 320, 90], [980, ground + 250, 80], [350, ground + 420, 70], [1230, ground + 420, 90]].forEach(([x, y, s]) => drawMotif(ctx, 'coin', x, y, s, 0));
  for (let i = 0; i < 40; i++) sparkle(ctx, rnd() * W, ground * rnd() * 0.9, 2 + rnd() * 3, '#ffffff');
}
