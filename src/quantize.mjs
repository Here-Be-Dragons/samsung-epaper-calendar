/**
 * Turns a frame into the panel's six exact inks BEFORE it is sent, so the panel's own dithering (which
 * smears small text) has nothing left to do.
 *
 * A frame is drawn on two transparent layers:
 *   content  everything that is read: text, lines, boxes, bars, plates. Snapped to the nearest ink with
 *            no dithering, so edges are crisp. Antialiased edge pixels become either ink or nothing.
 *   art      theme decoration: gradients, pastels, motifs, in full color. Each color is mixed from all six
 *            inks: by a regular-pattern dither that plans a 16-ink tile per color (`art: 'pattern'`, the
 *            default: clean and even, no worms or streaks), or by error diffusion (`art: 'diffusion'`, finer
 *            but noisier). A color within `snapDistance` of an ink just becomes that ink, so outlines and
 *            flat fills stay solid and crisp.
 * Layers are composed over white, art first, then content.
 *
 * The dither decides which inks to mix using their *perceived* colors (the panel's inks look duller than
 * their nominal values), but always writes the nominal ink, which is what the panel expects.
 */
import { BLACK, WHITE, RED, YELLOW, GREEN, BLUE, rgb } from './inks.mjs';

/** Ink names in a fixed order; also the order of every palette array below. */
export const INK_NAMES = ['black', 'white', 'red', 'yellow', 'green', 'blue'];
export const INK_HEX = [BLACK, WHITE, RED, YELLOW, GREEN, BLUE];
const NOMINAL = INK_HEX.map(rgb);

/** Weighted squared distance: green counts most, blue least, as the eye does. */
const dist2 = (r1, g1, b1, r2, g2, b2) => 0.3 * (r1 - r2) ** 2 + 0.59 * (g1 - g2) ** 2 + 0.11 * (b1 - b2) ** 2;

/** An 8x8 Bayer threshold matrix with values 0..63. */
const BAYER = (() => {
  let m = [[0]];
  while (m.length < 8) {
    const n = m.length;
    const next = Array.from({ length: n * 2 }, () => new Array(n * 2));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = m[y][x] * 4;
      next[y][x] = v; next[y][x + n] = v + 2; next[y + n][x] = v + 3; next[y + n][x + n] = v + 1;
    }
    m = next;
  }
  return Uint8Array.from(m.flat());
})();

/**
 * @param perceived  optional { black, white, red, yellow, green, blue } "#rrggbb" colors the inks look like
 * @param snapDistance art colors this close to an ink (weighted RGB distance) become that ink
 * @param alphaCut   content pixels with at least this much coverage (0..1) are drawn
 * @param tile       pattern mode: how many inks make up one color's tile (more = finer tints)
 * @param art        'pattern' (default) or 'diffusion'
 */
export function createQuantizer({ perceived = null, snapDistance = 22, alphaCut = 0.4, tile = 16, art: artMode = 'pattern' } = {}) {
  const seen = INK_NAMES.map((name, i) => (perceived?.[name] ? rgb(perceived[name]) : NOMINAL[i]));
  const lumaOrder = [...seen.keys()].sort((a, b) => 0.3 * seen[a][0] + 0.59 * seen[a][1] + 0.11 * seen[a][2] - (0.3 * seen[b][0] + 0.59 * seen[b][1] + 0.11 * seen[b][2]));
  const snapLimit = snapDistance * snapDistance;
  const cut = Math.round(alphaCut * 255);

  const nearest = (palette, r, g, b) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const d = dist2(r, g, b, palette[i][0], palette[i][1], palette[i][2]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return [best, bestD];
  };

  // Mixing is done in linear light (how the panel's inks really blend), judged in perceptual space.
  const toLinear = (c) => (c / 255) ** 2.2, toGamma = (v) => 255 * Math.max(0, Math.min(1, v)) ** (1 / 2.2);
  const linear = seen.map((c) => c.map(toLinear));
  const spread = seen.map((a) => seen.map((b) => dist2(a[0], a[1], a[2], b[0], b[1], b[2])));
  const SPREAD_COST = 0.04; // a small penalty for mixing inks that look very different (it reads as noise)
  // Complementary inks are never mixed: red with green (or blue with yellow) only averages to a speckled brown or gray,
  // which is better made from the inks between them (red + yellow + black, green + yellow, ...).
  const CLASH = [['red', 'green'], ['yellow', 'blue']].map(([a, b]) => [INK_NAMES.indexOf(a), INK_NAMES.indexOf(b)]);

  /**
   * The tile of `tile` inks (sorted dark to light) whose blend best matches one color: start from the nearest
   * ink and keep moving one part from one ink to another while that brings the blend (in linear light, judged
   * in perceptual space) closer. Any of the six inks may join, so a deep purple becomes blue and red, a brown
   * becomes red, yellow and black, and a pastel green becomes green, yellow and white.
   */
  const cache = new Map();
  const plan = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let entry = cache.get(key);
    if (entry) return entry;
    const [near, d] = nearest(seen, r, g, b);
    if (d <= snapLimit) entry = { snap: near };
    else {
      const counts = new Array(seen.length).fill(0);
      counts[near] = tile;
      const costOf = () => {
        let lr = 0, lg = 0, lb = 0;
        for (let i = 0; i < counts.length; i++) { const w = counts[i] / tile, L = linear[i]; lr += L[0] * w; lg += L[1] * w; lb += L[2] * w; }
        let cost = dist2(r, g, b, toGamma(lr), toGamma(lg), toGamma(lb));
        for (let p = 0; p < counts.length; p++) for (let q = p + 1; q < counts.length; q++) cost += SPREAD_COST * (Math.min(counts[p], counts[q]) / tile) * spread[p][q];
        for (const [p, q] of CLASH) if (counts[p] && counts[q]) cost += 1e6;
        return cost;
      };
      let best = costOf();
      for (let improved = true, rounds = 0; improved && rounds < 4 * tile; rounds++) {
        improved = false;
        let move = null;
        for (let from = 0; from < counts.length; from++) {
          if (!counts[from]) continue;
          for (let to = 0; to < counts.length; to++) {
            if (to === from) continue;
            counts[from]--; counts[to]++;
            const c = costOf();
            counts[from]++; counts[to]--;
            if (c < best - 1e-6) { best = c; move = [from, to]; }
          }
        }
        if (move) { counts[move[0]]--; counts[move[1]]++; improved = true; }
      }
      const picks = [];
      counts.forEach((n, ink) => { for (let i = 0; i < n; i++) picks.push(ink); });
      picks.sort((a, b2) => lumaOrder.indexOf(a) - lumaOrder.indexOf(b2));
      entry = { picks: Uint8Array.from(picks) };
    }
    cache.set(key, entry);
    return entry;
  };

  const flatOver = (a, i, f) => [Math.round(a[i] * f + 255 * (1 - f)), Math.round(a[i + 1] * f + 255 * (1 - f)), Math.round(a[i + 2] * f + 255 * (1 - f))];
  const MAX_ERR = 0.5; // keeps colors outside what the inks can mix (deep purple, navy) from smearing into their neighbors

  /** Art by error diffusion: the best ink for each pixel, the remainder handed on to its neighbors (Floyd-Steinberg, serpentine). */
  function diffuse(art, content, width, height, out) {
    let cur = new Float32Array((width + 2) * 3), next = new Float32Array((width + 2) * 3);
    for (let y = 0; y < height; y++) {
      const ltr = (y & 1) === 0, dir = ltr ? 1 : -1;
      next.fill(0);
      for (let k = 0, x = ltr ? 0 : width - 1; k < width; k++, x += dir) {
        const p = y * width + x, i = p * 4, e = (x + 1) * 3;
        const aa = art[i + 3];
        if (aa <= 6 || (content && content[i + 3] >= cut)) { cur[e] = cur[e + 1] = cur[e + 2] = 0; continue; } // not art: nothing to carry
        const [r, g, b] = flatOver(art, i, aa / 255);
        const [near, d] = nearest(seen, r, g, b);
        let ink = near;
        if (d > snapLimit) {
          const lr = Math.max(0, Math.min(1, toLinear(r) + cur[e])), lg = Math.max(0, Math.min(1, toLinear(g) + cur[e + 1])), lb = Math.max(0, Math.min(1, toLinear(b) + cur[e + 2]));
          ink = nearest(seen, toGamma(lr), toGamma(lg), toGamma(lb))[0];
          const L = linear[ink];
          const er = Math.max(-MAX_ERR, Math.min(MAX_ERR, lr - L[0])), eg = Math.max(-MAX_ERR, Math.min(MAX_ERR, lg - L[1])), eb = Math.max(-MAX_ERR, Math.min(MAX_ERR, lb - L[2]));
          const ahead = e + dir * 3, behind = e - dir * 3;
          for (let c = 0; c < 3; c++) {
            const err = c === 0 ? er : c === 1 ? eg : eb;
            cur[ahead + c] += err * 7 / 16;
            next[behind + c] += err * 3 / 16; next[e + c] += err * 5 / 16; next[ahead + c] += err * 1 / 16;
          }
        }
        out[p] = ink;
      }
      [cur, next] = [next, cur];
    }
  }

  /**
   * @param art      RGBA bytes of the decoration layer (non-premultiplied)
   * @param content  RGBA bytes of the content layer (non-premultiplied), or null
   * @returns Buffer of RGB bytes, every pixel exactly one of the six inks
   */
  function compose(art, content, width, height) {
    const out = Buffer.alloc(width * height * 3);
    const inks = new Uint8Array(width * height).fill(1); // white
    if (art && artMode === 'diffusion') diffuse(art, content, width, height, inks);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x, i = p * 4;
        let ink = inks[p];
        const aa = art ? art[i + 3] : 0;
        if (aa > 6 && artMode === 'pattern') {
          const [r, g, b] = flatOver(art, i, aa / 255);
          const entry = plan(r, g, b);
          ink = entry.snap !== undefined ? entry.snap : entry.picks[(BAYER[((y & 7) << 3) | (x & 7)] * tile / 64) | 0];
        }
        if (content && content[i + 3] >= cut) ink = nearest(NOMINAL, content[i], content[i + 1], content[i + 2])[0];
        const o = p * 3, c = NOMINAL[ink];
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
      }
    }
    return out;
  }

  return { compose };
}
