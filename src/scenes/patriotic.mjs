/** The Fourth of July: fireworks over a night skyline, and a flag waving on its pole. */
import { TAU, rng, sky, sparkle, burst, skyline, starPath } from './common.mjs';

export function patriotic(ctx, W, H, SH) {
  const rnd = rng(704);
  sky(ctx, W, H, SH, [[0, '#141c58'], [0.45, '#1c2f86'], [0.8, '#3a4fa8'], [1, '#6a6cc0']]);
  for (let i = 0; i < 120; i++) sparkle(ctx, rnd() * W, rnd() * SH * 0.6, 1.6 + rnd() * 2.6, rnd() > 0.5 ? '#ffffff' : '#bcd0ff');

  const palette = [['#ff2a2a', '#ffffff', '#4a7bff'], ['#ffffff', '#4a7bff'], ['#ff2a2a', '#ffe45c'], ['#ffe45c', '#ffffff'], ['#4a7bff', '#ff2a2a', '#ffffff']];
  [[420, SH * 0.31, 250], [1050, SH * 0.27, 290], [740, SH * 0.5, 210], [200, SH * 0.55, 170], [1290, SH * 0.52, 190], [610, SH * 0.2, 130]].forEach(([x, y, R], i) => burst(ctx, x, y, R, palette[i % palette.length], rnd, 24 + (i % 3) * 4));

  // The skyline, with a domed building in the middle.
  const base = SH * 0.76;
  skyline(ctx, W, base, rng(77));
  ctx.fillStyle = '#06091c';
  ctx.fillRect(520, base - 190, 400, 260);
  ctx.beginPath(); ctx.ellipse(720, base - 190, 150, 120, 0, Math.PI, TAU); ctx.fill();
  ctx.fillRect(704, base - 360, 32, 70); ctx.fillRect(570, base - 150, 14, 150); ctx.fillRect(856, base - 150, 14, 150);
  ctx.fillStyle = '#ffe45c'; for (let i = 0; i < 6; i++) ctx.fillRect(550 + i * 62, base - 110, 16, 70);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(722, base - 430, 4, 70); // a flagpole, and a small flag
  ctx.fillStyle = '#ff2a2a'; ctx.fillRect(726, base - 430, 38, 12); ctx.fillStyle = '#ffffff'; ctx.fillRect(726, base - 418, 38, 12);

  // The ground, and a big waving flag on a pole at the left, in front of the skyline.
  ctx.fillStyle = '#06091c'; ctx.fillRect(0, base, W, H - base);
  const fx = 170, fy = SH * 0.5, fw = 650, fh = 380;
  ctx.fillStyle = '#d9d9e6'; ctx.fillRect(fx - 20, fy - 40, 24, SH * 0.88 - fy); ctx.beginPath(); ctx.arc(fx - 8, fy - 48, 24, 0, TAU); ctx.fill();
  const wave = (x) => Math.sin((x / fw) * TAU * 1.15) * 20 * (x / fw + 0.2);
  const stripes = 7;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ff1f2e'; ctx.beginPath();
    for (let x = 0; x <= fw; x += 10) ctx[x ? 'lineTo' : 'moveTo'](fx + x, fy + (fh * i) / stripes + wave(x));
    for (let x = fw; x >= 0; x -= 10) ctx.lineTo(fx + x, fy + (fh * (i + 1)) / stripes + 1 + wave(x));
    ctx.closePath(); ctx.fill();
  }
  const cantonW = fw * 0.42, cantonH = (fh * 4) / stripes;
  ctx.fillStyle = '#0a2a9e'; ctx.beginPath();
  for (let x = 0; x <= cantonW; x += 10) ctx[x ? 'lineTo' : 'moveTo'](fx + x, fy + wave(x));
  for (let x = cantonW; x >= 0; x -= 10) ctx.lineTo(fx + x, fy + cantonH + wave(x));
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { const x = (cantonW * (c + 0.7)) / 5.3, y = (cantonH * (r + 0.6)) / 4.2; starPath(ctx, fx + x, fy + y + wave(x), 17); ctx.fill(); }
  ctx.strokeStyle = '#08040f'; ctx.lineWidth = 6; ctx.beginPath(); for (let x = 0; x <= fw; x += 10) ctx[x ? 'lineTo' : 'moveTo'](fx + x, fy + wave(x)); ctx.stroke();
  ctx.beginPath(); for (let x = 0; x <= fw; x += 10) ctx[x ? 'lineTo' : 'moveTo'](fx + x, fy + fh + wave(x)); ctx.stroke();
}
