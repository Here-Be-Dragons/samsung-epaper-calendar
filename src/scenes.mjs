/**
 * Full-bleed holiday scenes for the `poster` layout: one big illustration that replaces the calendar on a holiday, with only today's
 * agenda left on a plaque. Each scene is a function (ctx, W, H, SH) in src/scenes/, drawn in a design space 1440 wide on the decoration
 * layer (so the panel's dithering mixes its colors): it fills the whole W x H and composes its picture in the top SH (the rest is
 * ground under the plaque). The top ~480 px stay quiet for the greeting. Big flat shapes and black silhouettes are what six inks do best.
 *
 * You can replace any scene with your own picture: themes/<scene>/poster.png (see themes/README.md).
 */
import { halloween } from './scenes/halloween.mjs';
import { valentine } from './scenes/valentine.mjs';
import { shamrock } from './scenes/shamrock.mjs';
import { easter } from './scenes/easter.mjs';
import { patriotic } from './scenes/patriotic.mjs';
import { thanksgiving } from './scenes/thanksgiving.mjs';
import { christmas } from './scenes/christmas.mjs';
import { newyear } from './scenes/newyear.mjs';

export const POSTER_SCENES = { halloween, valentine, shamrock, easter, patriotic, thanksgiving, christmas, newyear };

/** The big greeting over each scene: its lines, one per row (the layout shrinks a line to fit), and the color it is filled with. */
export const POSTER_GREETINGS = {
  halloween: { lines: ['HAPPY', 'HALLOWEEN'], fill: '#ffff00' },
  valentine: { lines: ['HAPPY', "VALENTINE'S DAY"], fill: '#ffffff' },
  shamrock: { lines: ['HAPPY', "ST. PATRICK'S DAY"], fill: '#ffff00' },
  easter: { lines: ['HAPPY', 'EASTER'], fill: '#ffff00' },
  patriotic: { lines: ['HAPPY', '4TH OF JULY'], fill: '#ffffff' },
  thanksgiving: { lines: ['HAPPY', 'THANKSGIVING'], fill: '#ffff00' },
  christmas: { lines: ['MERRY', 'CHRISTMAS'], fill: '#ffff00' },
  newyear: { lines: ['HAPPY', 'NEW YEAR'], fill: '#ffff00' },
};

/** Draws the named scene on `ctx` for a w x h frame; the artwork is composed in the top `sceneH`. Returns false if there is no such scene. */
export function drawPosterScene(ctx, name, w, h, sceneH = h) {
  const scene = POSTER_SCENES[name];
  if (!scene) return false;
  const k = w / 1440;
  ctx.save(); ctx.scale(k, k);
  scene(ctx, 1440, h / k, sceneH / k);
  ctx.restore();
  return true;
}
