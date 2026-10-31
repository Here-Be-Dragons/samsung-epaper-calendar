/** Thanksgiving: a big turkey with a fan of autumn feathers, pumpkins, acorns and falling leaves. */
import { TAU, rng, sky, hill } from './common.mjs';
import { drawMotif } from '../themes.mjs';

export function thanksgiving(ctx, W, H, SH) {
  const rnd = rng(1126);
  sky(ctx, W, H, SH, [[0, '#ffb347'], [0.45, '#ffd98a'], [0.75, '#fff0d0'], [1, '#fff0d0']]);
  const ground = SH * 0.7;
  hill(ctx, W, H, ground, 28, 260, 0.4, '#b97a2e');
  hill(ctx, W, H, ground + 140, 36, 210, 2.2, '#8a5520');
  hill(ctx, W, H, ground + 300, 30, 280, 4.0, '#5e3a14');

  // The turkey: a fan of feathers behind a round body.
  const cx = 720, cy = SH * 0.52;
  const feathers = ['#c62828', '#ff8a1f', '#ffd01a', '#7a4b24', '#c62828', '#ff8a1f', '#ffd01a', '#7a4b24', '#c62828'];
  feathers.forEach((c, i) => {
    const a = -Math.PI * 0.92 + (i / (feathers.length - 1)) * Math.PI * 0.84;
    ctx.save(); ctx.translate(cx, cy + 40); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = c; ctx.strokeStyle = '#08040f'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.ellipse(0, -330, 92, 300, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.ellipse(0, -390, 40, 170, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#08040f'; ctx.beginPath(); ctx.ellipse(0, -520, 28, 60, 0, 0, TAU); ctx.fill();
    ctx.restore();
  });
  // legs
  ctx.strokeStyle = '#d98a1a'; ctx.lineWidth = 22; ctx.lineCap = 'round';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 70, cy + 300); ctx.lineTo(cx + s * 76, cy + 400); ctx.moveTo(cx + s * 76, cy + 400); ctx.lineTo(cx + s * 30, cy + 430); ctx.moveTo(cx + s * 76, cy + 400); ctx.lineTo(cx + s * 78, cy + 440); ctx.moveTo(cx + s * 76, cy + 400); ctx.lineTo(cx + s * 126, cy + 430); ctx.stroke(); }
  // body, wing, head, beak, wattle, eye
  const body = ctx.createRadialGradient(cx - 80, cy + 20, 20, cx, cy + 120, 300);
  body.addColorStop(0, '#a8692f'); body.addColorStop(1, '#6b3c14');
  ctx.fillStyle = body; ctx.strokeStyle = '#08040f'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.ellipse(cx, cy + 150, 230, 270, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8a5322'; ctx.beginPath(); ctx.ellipse(cx - 150, cy + 190, 70, 130, 0.35, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx + 150, cy + 190, 70, 130, -0.35, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8c9a0'; ctx.beginPath(); ctx.ellipse(cx, cy + 190, 120, 160, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#a8692f'; ctx.beginPath(); ctx.arc(cx, cy - 120, 120, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.moveTo(cx - 24, cy - 108); ctx.lineTo(cx + 24, cy - 108); ctx.lineTo(cx, cy - 56); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e0103f'; ctx.beginPath(); ctx.ellipse(cx + 8, cy - 40, 22, 42, 0, 0, TAU); ctx.fill(); ctx.stroke();
  for (const s of [-1, 1]) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx + s * 48, cy - 150, 24, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#08040f'; ctx.beginPath(); ctx.arc(cx + s * 48 + s * 4, cy - 148, 11, 0, TAU); ctx.fill(); }

  // Pumpkins, acorns and leaves around.
  [[200, ground + 300, 330], [1240, ground + 320, 310], [470, ground + 520, 200], [1010, ground + 520, 210]].forEach(([x, y, s]) => drawMotif(ctx, 'pumpkin', x, y, s, 0));
  [[720, ground + 560, 160], [90, ground + 520, 120], [1350, ground + 530, 120]].forEach(([x, y, s]) => drawMotif(ctx, 'acorn', x, y, s, 0));
  for (let i = 0; i < 26; i++) { const y = rnd() * SH * 0.88; if (y > SH * 0.2) drawMotif(ctx, 'leaf', rnd() * W, y, 80 + rnd() * 90, i % 3); }
}
