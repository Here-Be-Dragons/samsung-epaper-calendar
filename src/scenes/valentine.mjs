/** Valentine's Day: a giant glossy heart pierced by an arrow, heart balloons and a drift of hearts. */
import { TAU, rng, sky, sparkle, heartPath } from './common.mjs';

export function valentine(ctx, W, H, SH) {
  const rnd = rng(214);
  sky(ctx, W, H, SH, [[0, '#ff9ec2'], [0.5, '#ff5f93'], [1, '#b3124f']]);
  for (let i = 0; i < 90; i++) sparkle(ctx, rnd() * W, rnd() * SH * 0.92, 2 + rnd() * 3.5, rnd() > 0.5 ? '#ffffff' : '#ffe3ee');

  // A drift of small hearts, kept out of the middle where the big one is.
  const cx = W / 2, cy = SH * 0.5;
  for (let i = 0; i < 48; i++) {
    const x = rnd() * W, y = rnd() * SH, s = 36 + rnd() * 100;
    if (Math.abs(x - cx) < 450 && Math.abs(y - cy) < 420) continue;
    ctx.save(); ctx.translate(x, y); ctx.rotate((rnd() - 0.5) * 0.7); heartPath(ctx, 0, 0, s);
    ctx.fillStyle = ['rgba(255,255,255,0.92)', 'rgba(255,208,224,0.92)', '#ff2a6d', '#ff6f9c', '#c2185b'][i % 5]; ctx.fill(); ctx.restore();
  }

  // The arrow goes behind the heart, which is drawn on top; its ends are redrawn over the heart afterwards.
  const [ax, ay, bx, by] = [110, cy + 310, 1330, cy - 270];
  const along = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t];
  const shaft = (t0, t1) => {
    const [x0, y0] = along(t0), [x1, y1] = along(t1);
    ctx.strokeStyle = '#08040f'; ctx.lineWidth = 28; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };
  shaft(0, 1);

  // The big heart: a shadow, the body with a gloss, and a dark outline.
  heartPath(ctx, cx + 16, cy + 22, 880); ctx.fillStyle = '#7a0a30'; ctx.fill();
  const body = ctx.createRadialGradient(cx - 170, cy - 190, 40, cx, cy, 560);
  body.addColorStop(0, '#ff5a78'); body.addColorStop(1, '#d10f39');
  heartPath(ctx, cx, cy, 880); ctx.fillStyle = body; ctx.fill();
  ctx.strokeStyle = '#5c0826'; ctx.lineWidth = 18; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.save(); ctx.translate(cx - 250, cy - 215); ctx.rotate(-0.55); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(0, 0, 100, 48, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(cx - 130, cy - 300, 22, 0, TAU); ctx.fill();

  shaft(0, 0.2); shaft(0.82, 1);
  // Fletching on the tail, an arrowhead on the point.
  const [fx, fy] = along(0.02), ang = Math.atan2(by - ay, bx - ax);
  ctx.save(); ctx.translate(fx, fy); ctx.rotate(ang);
  [[0, '#ffffff'], [34, '#ff2a2a'], [68, '#ffffff']].forEach(([off, c]) => {
    ctx.fillStyle = c; ctx.strokeStyle = '#08040f'; ctx.lineWidth = 5;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(off, 0); ctx.lineTo(off + 52, side * 66); ctx.lineTo(off + 82, side * 66); ctx.lineTo(off + 52, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  });
  ctx.restore();
  ctx.save(); ctx.translate(bx, by); ctx.rotate(ang); ctx.fillStyle = '#2b2b33'; ctx.strokeStyle = '#08040f'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(86, 0); ctx.lineTo(-18, -52); ctx.lineTo(0, 0); ctx.lineTo(-18, 52); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();

  // Heart balloons on strings, left and right.
  [[130, SH * 0.78, '#ff2a6d', 150], [270, SH * 0.84, '#ffffff', 120], [90, SH * 0.9, '#c2185b', 110], [1310, SH * 0.78, '#ffffff', 150], [1170, SH * 0.85, '#ff2a6d', 130], [1350, SH * 0.92, '#ffd0e0', 110]].forEach(([x, y, c, s]) => {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y + s * 0.4); ctx.bezierCurveTo(x - 30, y + s * 0.9, x + 30, y + s * 1.3, x + (x < cx ? 40 : -40), SH * 1.02); ctx.stroke();
    heartPath(ctx, x, y, s); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = '#5c0826'; ctx.lineWidth = 7; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.ellipse(x - s * 0.2, y - s * 0.2, s * 0.09, s * 0.05, -0.6, 0, TAU); ctx.fill();
  });
}
