/** Shared pieces for the holiday scenes (see ../scenes.mjs). Everything is drawn in a design space 1440 wide. */
export const TAU = Math.PI * 2;

/** A small deterministic random sequence, so a scene looks the same every time it is drawn. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Fills the whole frame with a vertical gradient: stops are [position 0..1 down `h`, color]. */
export function sky(ctx, W, H, h, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/** A four-pointed sparkle. */
export function sparkle(ctx, x, y, r, color) {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x, y - r * 1.8); ctx.lineTo(x + r * 0.5, y - r * 0.5); ctx.lineTo(x + r * 1.8, y); ctx.lineTo(x + r * 0.5, y + r * 0.5);
  ctx.lineTo(x, y + r * 1.8); ctx.lineTo(x - r * 0.5, y + r * 0.5); ctx.lineTo(x - r * 1.8, y); ctx.lineTo(x - r * 0.5, y - r * 0.5); ctx.closePath(); ctx.fill();
}

/** A cloud: a cluster of circles. */
export function cloud(ctx, x, y, r, color) {
  ctx.fillStyle = color; ctx.beginPath();
  [[0, 0, 1], [0.9, -0.15, 0.8], [-0.9, 0.05, 0.75], [1.7, 0.1, 0.6], [-1.6, 0.2, 0.55]].forEach(([dx, dy, k]) => { ctx.moveTo(x + dx * r + r * k, y + dy * r); ctx.arc(x + dx * r, y + dy * r, r * k, 0, TAU); });
  ctx.fill();
}

/** A rolling hill filling from a wavy line down to the bottom of the frame. */
export function hill(ctx, W, H, baseY, amp, freq, phase, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, baseY);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, baseY + Math.sin(x / freq + phase) * amp);
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}

/** A heart centered on (x, y), `s` wide: sets the path, you fill or stroke it. */
export function heartPath(ctx, x, y, s) {
  const w = s, h = s * 0.92;
  ctx.beginPath(); ctx.moveTo(x, y + h * 0.38);
  ctx.bezierCurveTo(x + w * 0.55, y + h * 0.02, x + w * 0.62, y - h * 0.34, x + w * 0.28, y - h * 0.4);
  ctx.bezierCurveTo(x + w * 0.1, y - h * 0.43, x, y - h * 0.3, x, y - h * 0.2);
  ctx.bezierCurveTo(x, y - h * 0.3, x - w * 0.1, y - h * 0.43, x - w * 0.28, y - h * 0.4);
  ctx.bezierCurveTo(x - w * 0.62, y - h * 0.34, x - w * 0.55, y + h * 0.02, x, y + h * 0.38);
  ctx.closePath();
}

/** A five-pointed star centered on (x, y), outer radius R. */
export function starPath(ctx, x, y, R, r = R * 0.42) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r : R; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); }
  ctx.closePath();
}

/** A firework burst: a glow, rays with a bead on the end, and a few sparks. */
export function burst(ctx, x, y, R, colors, rnd, rays = 26) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.9);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 0.9, 0, TAU); ctx.fill();
  ctx.lineCap = 'round';
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU + rnd() * 0.05, c = colors[i % colors.length], r0 = R * 0.18, r1 = R * (0.72 + rnd() * 0.28);
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = Math.max(5, R * 0.035);
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * (r1 + R * 0.06), y + Math.sin(a) * (r1 + R * 0.06), Math.max(6, R * 0.045), 0, TAU); ctx.fill();
    if (i % 2 === 0) { ctx.beginPath(); ctx.arc(x + Math.cos(a + 0.12) * R * 0.5, y + Math.sin(a + 0.12) * R * 0.5, Math.max(4, R * 0.025), 0, TAU); ctx.fill(); }
  }
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, R * 0.07, 0, TAU); ctx.fill();
}

/** A city skyline silhouette along y, with a few lit windows. */
export function skyline(ctx, W, baseY, rnd, color = '#06091c', glow = '#ffe45c') {
  ctx.fillStyle = color;
  const lit = [];
  for (let x = -10; x < W; ) {
    const w = 70 + rnd() * 110, h = 120 + rnd() * 330;
    ctx.fillRect(x, baseY - h, w, h + 400);
    if (rnd() > 0.65) { ctx.fillRect(x + w * 0.45, baseY - h - 60, 8, 60); }
    for (let wy = baseY - h + 24; wy < baseY - 30; wy += 38) for (let wx = x + 14; wx < x + w - 20; wx += 30) if (rnd() > 0.72) lit.push([wx, wy]);
    x += w + 4 + rnd() * 14;
  }
  ctx.fillStyle = glow; lit.forEach(([wx, wy]) => ctx.fillRect(wx, wy, 12, 18));
}
