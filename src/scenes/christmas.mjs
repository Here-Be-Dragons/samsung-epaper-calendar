/** Christmas: a lit tree on a snowy night, a heap of presents, a snowman and candy canes. */
import { TAU, rng, sky, sparkle, hill, starPath } from './common.mjs';
import { drawMotif } from '../themes.mjs';

export function christmas(ctx, W, H, SH) {
  const rnd = rng(1225);
  sky(ctx, W, H, SH, [[0, '#0a1a44'], [0.45, '#1b4585'], [0.78, '#7fa9dc'], [1, '#b6d2f0']]);
  for (let i = 0; i < 90; i++) sparkle(ctx, rnd() * W, rnd() * SH * 0.5, 1.6 + rnd() * 2.8, '#ffffff');
  const ground = SH * 0.76;
  hill(ctx, W, H, ground, 24, 260, 1.0, '#dbeafb');
  hill(ctx, W, H, ground + 120, 30, 220, 3.0, '#f3f9ff');
  hill(ctx, W, H, ground + 260, 26, 300, 5.0, '#ffffff');

  // The tree: four tiers, a trunk, a star, garland, ornaments and lights.
  const cx = 720, top = Math.max(SH * 0.2, 590), base = ground + 60, tiers = 4;
  ctx.fillStyle = '#5b3a1a'; ctx.fillRect(cx - 44, base - 40, 88, 90);
  const half = (t) => 150 + t * 120; // half-width of tier t
  for (let t = tiers - 1; t >= 0; t--) {
    const y0 = top + (t * (base - top - 20)) / tiers - (t ? 20 : 0), y1 = top + ((t + 1) * (base - top - 20)) / tiers + 70, w = half(t) * 1.55;
    ctx.fillStyle = t % 2 ? '#0e6b2e' : '#14853a'; ctx.strokeStyle = '#08040f'; ctx.lineWidth = 9; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx + w, y1); ctx.lineTo(cx - w, y1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.moveTo(cx, y0 + 14); ctx.lineTo(cx - w * 0.9, y1 - 10); ctx.lineTo(cx - w * 0.3, y1 - 10); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#ffd01a'; ctx.lineWidth = 12; ctx.lineCap = 'round';
  for (let t = 0; t < tiers; t++) { const y = top + 150 + t * ((base - top - 160) / tiers), w = half(t) * 1.3; ctx.beginPath(); ctx.moveTo(cx - w, y + 70); ctx.quadraticCurveTo(cx, y + 20 + 90, cx + w, y + 70); ctx.stroke(); }
  const colors = ['#e0103f', '#0000ff', '#ffd01a', '#ffffff', '#e0103f'];
  const rn = rng(5);
  for (let i = 0; i < 26; i++) {
    const t = rn() * tiers, y = top + 130 + t * ((base - top - 160) / tiers) + 70 * rn(), span = (y - top) * 0.62;
    const x = cx + (rn() - 0.5) * 2 * span * 0.8;
    ctx.fillStyle = colors[i % colors.length]; ctx.strokeStyle = '#08040f'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, 22 + rn() * 12, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.arc(x - 8, y - 8, 7, 0, TAU); ctx.fill();
  }
  const star = ctx.createRadialGradient(cx, top - 20, 10, cx, top - 20, 150); star.addColorStop(0, 'rgba(255,240,150,0.9)'); star.addColorStop(1, 'rgba(255,240,150,0)');
  ctx.fillStyle = star; ctx.beginPath(); ctx.arc(cx, top - 20, 150, 0, TAU); ctx.fill();
  starPath(ctx, cx, top - 20, 76); ctx.fillStyle = '#ffee3a'; ctx.fill(); ctx.strokeStyle = '#08040f'; ctx.lineWidth = 8; ctx.stroke();

  // Presents under the tree.
  const gift = (x, y, w, h, box, ribbon) => {
    ctx.fillStyle = box; ctx.strokeStyle = '#08040f'; ctx.lineWidth = 7; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = ribbon; ctx.fillRect(x + w / 2 - 14, y, 28, h); ctx.fillRect(x, y + h / 2 - 14, w, 28);
    ctx.beginPath(); ctx.ellipse(x + w / 2 - 28, y - 18, 30, 20, -0.5, 0, TAU); ctx.ellipse(x + w / 2 + 28, y - 18, 30, 20, 0.5, 0, TAU); ctx.fill(); ctx.stroke();
  };
  gift(cx - 330, base - 60, 180, 130, '#e0103f', '#ffffff'); gift(cx - 150, base - 20, 150, 110, '#14853a', '#ffd01a');
  gift(cx + 40, base - 40, 170, 120, '#0000ff', '#ffff00'); gift(cx + 230, base - 90, 130, 160, '#ffd01a', '#e0103f');
  drawMotif(ctx, 'snowman', 1250, ground + 220, 420, 0); drawMotif(ctx, 'candycane', 170, ground + 230, 360, 0);
  [[100, ground + 380, 120], [1330, ground + 440, 100], [380, ground + 450, 100]].forEach(([x, y, s], i) => drawMotif(ctx, 'ornament', x, y, s, i));
  for (let i = 0; i < 170; i++) { ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * SH * 0.95, 2.5 + rnd() * 5.5, 0, TAU); ctx.fill(); }
}
